import type {
	ParsedEntity,
	ParsedEvent,
	ParsedMetric,
	ParsedReference,
	ParsedTimestamp,
} from "@atlas/shared";
import {
	deployPattern,
	httpPattern,
	httpRequestPattern,
	isoTimestamp,
	kubernetesPatterns,
	labelPattern,
	latencyPattern,
	logTimestamp,
	rfcTimestamp,
	semverPattern,
	shaPattern,
	shortNumberPattern,
	signalWords,
	slackChannelPattern,
	slackUserPattern,
	servicePatterns,
	timeOnlyTimestamp,
	unixTimestamp,
} from "./patterns";
import { dedupeEntities, parseTimestamp } from "./normalize";

export function collectTimestamps(text: string): ParsedTimestamp[] {
	return [
		isoTimestamp,
		unixTimestamp,
		rfcTimestamp,
		logTimestamp,
		timeOnlyTimestamp,
	].flatMap((pattern) => {
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
	});
}

export function collectEntities(text: string): ParsedEntity[] {
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
	labelPattern.lastIndex = 0;
	for (const match of text.matchAll(labelPattern)) {
		entities.push({
			type: match[1],
			value: match[2],
			confidence: 0.72,
			sourceText: match[0],
		});
	}
	return dedupeEntities(entities);
}

export function collectReferences(text: string): ParsedReference[] {
	const references: ParsedReference[] = [];
	deployPattern.lastIndex = 0;
	references.push(
		...Array.from(text.matchAll(deployPattern)).map((match) => ({
			kind: "deploy" as const,
			value: match[1],
			sourceText: match[0],
		})),
	);
	shaPattern.lastIndex = 0;
	references.push(
		...Array.from(text.matchAll(shaPattern)).map((match) => ({
			kind: "sha" as const,
			value: match[1],
			sourceText: match[0],
		})),
	);
	semverPattern.lastIndex = 0;
	references.push(
		...Array.from(text.matchAll(semverPattern)).map((match) => ({
			kind: "version" as const,
			value: match[0],
			sourceText: match[0],
		})),
	);
	return references;
}

export function collectMetrics(text: string): ParsedMetric[] {
	const metrics: ParsedMetric[] = [];
	latencyPattern.lastIndex = 0;
	metrics.push(
		...Array.from(text.matchAll(latencyPattern)).map((match) => ({
			name: "latency",
			value: Number(match[1]),
			unit: match[2],
			sourceText: match[0],
		})),
	);
	shortNumberPattern.lastIndex = 0;
	metrics.push(
		...Array.from(text.matchAll(shortNumberPattern)).map((match) => ({
			name: "dashboard_value",
			value: Number(match[1]),
			unit: match[2],
			sourceText: match[0],
		})),
	);
	return metrics;
}

export function collectEvents(
	text: string,
	timestamps: ParsedTimestamp[],
): ParsedEvent[] {
	return text.split(/\r?\n/).flatMap((line, index) => {
		const isDashboardMetric = /^\s*[a-z][a-z0-9_.-]+\s*(?:—|-|:)/i.test(line);
		if (!signalWords.test(line) && !isDashboardMetric) return [];
		const timestamp =
			timestamps.find((candidate) => line.includes(candidate.raw)) ??
			timestamps[index] ??
			timestamps[0];
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
