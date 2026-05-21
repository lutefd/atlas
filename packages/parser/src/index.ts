import type {
	Evidence,
	ParsedEntity,
	ParsedEvent,
	ParsedMetric,
	ParsedOutput,
	ParsedReference,
	ParsedTimestamp,
} from "@atlas/shared";

export type EvidenceInput = Pick<
	Evidence,
	"id" | "kind" | "source" | "contentText" | "metadata"
>;

export interface EvidenceParser {
	name: string;
	version: string;
	canParse(input: EvidenceInput): boolean;
	parse(input: EvidenceInput): Promise<ParsedOutput>;
}

const emptyOutput = (): ParsedOutput => ({
	entities: [],
	timestamps: [],
	events: [],
	metrics: [],
	references: [],
});

const isoTimestamp =
	/\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const unixTimestamp = /\b1[6-9]\d{8}(?:\.\d{3})?\b/g;
const rfcTimestamp =
	/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT\b/g;
const logTimestamp =
	/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/g;
const signalWords =
	/\b(deployed|deploy|deployment|rollback|rolled back|error|exception|timeout|timed out|5\d\d|4\d\d|latency|slow|OOMKilled|CrashLoopBackOff|failed|failure|panic|restart|restarted|unavailable)\b/i;
const servicePatterns = [
	/\bservice=([a-z0-9][a-z0-9._-]+)/gi,
	/\bapp=([a-z0-9][a-z0-9._-]+)/gi,
	/\b(?:service|app|component)[:\s]+([a-z0-9][a-z0-9._-]+)/gi,
	/\[([a-z][a-z0-9-]{2,})\]/gi,
];
const httpPattern = /\b([1-5]\d\d)\b/g;
const httpRequestPattern =
	/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+((?:https?:\/\/[^\s]+|\/[^\s?#]+)(?:[^\s]*)?)/gi;
const latencyPattern =
	/\b(?:latency|duration|took|in)[:=\s]+(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds)\b/gi;
const deployPattern =
	/\b(?:deploy(?:ed|ment)?|release|version|image|tag)[:=\s]+([a-z0-9._/@:-]+)\b/gi;
const shaPattern = /\b(?:commit|sha)[:=\s]+([a-f0-9]{7,40})\b/gi;
const semverPattern = /\bv?\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?\b/gi;
const kubernetesPatterns = [
	{
		type: "kubernetes_pod",
		pattern:
			/\bpod[\/=:\s]+([a-z0-9]([-a-z0-9]*[a-z0-9])?(?:-[a-f0-9]{8,10})?(?:-[a-z0-9]{5})?)\b/gi,
	},
	{
		type: "kubernetes_namespace",
		pattern: /\b(?:namespace|ns)[\/=:\s]+([a-z0-9]([-a-z0-9]*[a-z0-9])?)\b/gi,
	},
	{
		type: "kubernetes_deployment",
		pattern:
			/\b(?:deployment|deploy)[\/=:\s]+([a-z0-9]([-a-z0-9]*[a-z0-9])?)\b/gi,
	},
	{
		type: "kubernetes_node",
		pattern: /\bnode[\/=:\s]+([a-z0-9][a-z0-9.-]+)\b/gi,
	},
	{
		type: "kubernetes_reason",
		pattern:
			/\b(CrashLoopBackOff|OOMKilled|ImagePullBackOff|Evicted|Error|Completed)\b/g,
	},
];
const slackUserPattern = /(?:^|\s)(?:@([a-z0-9._-]+)|<@([A-Z0-9]+)>)/gi;
const slackChannelPattern =
	/(?:^|\s)(?:#([a-z0-9._-]+)|<#([A-Z0-9]+)\|([^>]+)>)/gi;

function parseTimestamp(raw: string): string | null {
	const withYear =
		/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}$/.test(
			raw,
		)
			? `${new Date().getUTCFullYear()} ${raw}`
			: raw;
	const normalized =
		withYear.includes(" ") && /^\d{4}-/.test(withYear)
			? withYear.replace(" ", "T")
			: withYear;
	const date = /^\d{10}(?:\.\d{3})?$/.test(raw)
		? new Date(Number(raw) * 1000)
		: new Date(normalized);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function collectTimestamps(text: string): ParsedTimestamp[] {
	return [isoTimestamp, unixTimestamp, rfcTimestamp, logTimestamp].flatMap(
		(pattern) => {
			pattern.lastIndex = 0;
			return Array.from(text.matchAll(pattern)).flatMap((match) => {
				const raw = match[0];
				const value = parseTimestamp(raw);
				if (!value) return [];
				return [
					{
						value,
						raw,
						confidence: 0.9,
						offsetStart: match.index ?? 0,
						offsetEnd: (match.index ?? 0) + raw.length,
					},
				];
			});
		},
	);
}

function collectEntities(text: string): ParsedEntity[] {
	const entities: ParsedEntity[] = [];
	for (const pattern of servicePatterns) {
		pattern.lastIndex = 0;
		for (const match of text.matchAll(pattern)) {
			entities.push({
				type: "service",
				value: match[1],
				confidence: 0.75,
				sourceText: match[0],
			});
		}
	}
	httpPattern.lastIndex = 0;
	for (const match of text.matchAll(httpPattern)) {
		entities.push({
			type: "http_status",
			value: match[1],
			confidence: 0.65,
			sourceText: match[0],
		});
	}
	httpRequestPattern.lastIndex = 0;
	for (const match of text.matchAll(httpRequestPattern)) {
		entities.push({
			type: "http_method",
			value: match[1].toUpperCase(),
			confidence: 0.75,
			sourceText: match[0],
		});
		entities.push({
			type: "http_endpoint",
			value: match[2],
			confidence: 0.78,
			sourceText: match[0],
		});
	}
	for (const { type, pattern } of kubernetesPatterns) {
		pattern.lastIndex = 0;
		for (const match of text.matchAll(pattern))
			entities.push({
				type,
				value: match[1],
				confidence: 0.78,
				sourceText: match[0],
			});
	}
	slackUserPattern.lastIndex = 0;
	for (const match of text.matchAll(slackUserPattern))
		entities.push({
			type: "slack_user",
			value: match[1] ?? match[2],
			confidence: 0.68,
			sourceText: match[0],
		});
	slackChannelPattern.lastIndex = 0;
	for (const match of text.matchAll(slackChannelPattern))
		entities.push({
			type: "slack_channel",
			value: match[1] ?? match[3] ?? match[2],
			confidence: 0.7,
			sourceText: match[0],
		});
	return dedupeEntities(entities);
}

function collectReferences(text: string): ParsedReference[] {
	const references: ParsedReference[] = [];
	deployPattern.lastIndex = 0;
	references.push(
		...Array.from(text.matchAll(deployPattern)).map((match) => ({
			kind: "deploy",
			value: match[1],
			sourceText: match[0],
		})),
	);
	shaPattern.lastIndex = 0;
	references.push(
		...Array.from(text.matchAll(shaPattern)).map((match) => ({
			kind: "sha",
			value: match[1],
			sourceText: match[0],
		})),
	);
	semverPattern.lastIndex = 0;
	references.push(
		...Array.from(text.matchAll(semverPattern)).map((match) => ({
			kind: "version",
			value: match[0],
			sourceText: match[0],
		})),
	);
	return references;
}

function collectMetrics(text: string): ParsedMetric[] {
	latencyPattern.lastIndex = 0;
	return Array.from(text.matchAll(latencyPattern)).map((match) => ({
		name: "latency",
		value: Number(match[1]),
		unit: match[2],
		sourceText: match[0],
	}));
}

function dedupeEntities(entities: ParsedEntity[]): ParsedEntity[] {
	const seen = new Set<string>();
	return entities.filter((entity) => {
		const key = `${entity.type}:${entity.value.toLowerCase()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function collectEvents(
	text: string,
	timestamps: ParsedTimestamp[],
): ParsedEvent[] {
	return text.split(/\r?\n/).flatMap((line) => {
		if (!signalWords.test(line)) return [];
		const timestamp = timestamps.find((candidate) =>
			line.includes(candidate.raw),
		);
		return [
			{
				timestamp: timestamp?.value ?? null,
				title: line.replace(/^\s+|\s+$/g, "").slice(0, 96),
				description: line.trim(),
				confidence: timestamp ? 0.8 : 0.55,
				sourceText: line,
			},
		];
	});
}

export const genericLogParser: EvidenceParser = {
	name: "generic-log-parser",
	version: "0.1.0",
	canParse: (input) => Boolean(input.contentText),
	async parse(input) {
		if (!input.contentText) return emptyOutput();
		const timestamps = collectTimestamps(input.contentText);
		return {
			entities: collectEntities(input.contentText),
			timestamps,
			events: collectEvents(input.contentText, timestamps),
			metrics: collectMetrics(input.contentText),
			references: collectReferences(input.contentText),
		};
	},
};

export const parsers = [genericLogParser];
