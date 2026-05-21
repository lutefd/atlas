import { invoke } from "@tauri-apps/api/core";
import type {
	Entity,
	Evidence,
	Incident,
	ParsedOutput,
	TimelineEvent,
} from "@atlas/shared";

export type IncidentDto = {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
};
export type EvidenceDto = {
	id: string;
	incident_id: string;
	kind: Evidence["kind"];
	source: string;
	content_text: string | null;
	content_hash: string;
	created_at: string;
	metadata_json: string;
	attachment_id: string | null;
};
export type TimelineEventDto = {
	id: string;
	incident_id: string;
	timestamp: string;
	title: string;
	description: string;
	confidence: number;
	source_evidence_id: string | null;
	source_parser_output_id: string | null;
	created_at: string;
};
export type EntityDto = {
	id: string;
	incident_id: string;
	entity_type: string;
	name: string;
	confidence: number;
	source_evidence_id: string | null;
	source_parser_output_id: string | null;
	created_at: string;
};
export type TagDto = {
	id: string;
	incident_id: string;
	name: string;
	created_at: string;
};
export type ParserOutputDto = {
	id: string;
	evidence_id: string;
	parser_name: string;
	parser_version: string;
	output_json: string;
	created_at: string;
};
export type JobDto = {
	id: string;
	kind: string;
	status: string;
	payload_json: string;
	error_text: string | null;
	created_at: string;
	updated_at: string;
};

export type ParserOutputRecord = {
	id: string;
	evidenceId: string;
	parserName: string;
	parserVersion: string;
	output: ParsedOutput;
	createdAt: string;
};
export type Tag = {
	id: string;
	incidentId: string;
	name: string;
	createdAt: string;
};
export type Job = {
	id: string;
	kind: string;
	status: string;
	payload: Record<string, unknown>;
	errorText: string | null;
	createdAt: string;
	updatedAt: string;
};
export type AttachmentData = {
	name: string;
	mimeType: string;
	base64: string;
	path: string;
};
export type SearchResult = {
	kind:
		| "evidence"
		| "timeline"
		| "entity"
		| "attachment"
		| "parser_output"
		| string;
	refId: string;
	title: string;
	snippet: string;
};

export type SnapshotDto = {
	incidents: IncidentDto[];
	evidence: EvidenceDto[];
	timeline_events: TimelineEventDto[];
	entities: EntityDto[];
	tags: TagDto[];
	parser_outputs: ParserOutputDto[];
	jobs: JobDto[];
};
export type Snapshot = {
	incidents: Incident[];
	evidence: Evidence[];
	timelineEvents: TimelineEvent[];
	entities: Entity[];
	tags: Tag[];
	parserOutputs: ParserOutputRecord[];
	jobs: Job[];
};

function parseMetadata(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed
			: {};
	} catch {
		return {};
	}
}

function parseOutput(value: string): ParsedOutput {
	try {
		const parsed = JSON.parse(value) as Partial<ParsedOutput>;
		return {
			entities: parsed.entities ?? [],
			timestamps: parsed.timestamps ?? [],
			events: parsed.events ?? [],
			metrics: parsed.metrics ?? [],
			references: parsed.references ?? [],
		};
	} catch {
		return {
			entities: [],
			timestamps: [],
			events: [],
			metrics: [],
			references: [],
		};
	}
}

export function toIncident(row: IncidentDto): Incident {
	return {
		id: row.id,
		title: row.title,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function toEvidence(row: EvidenceDto): Evidence {
	return {
		id: row.id,
		incidentId: row.incident_id,
		kind: row.kind,
		source: row.source,
		contentText: row.content_text,
		contentHash: row.content_hash,
		createdAt: row.created_at,
		metadata: parseMetadata(row.metadata_json),
		attachmentId: row.attachment_id,
	};
}

export function toTimelineEvent(row: TimelineEventDto): TimelineEvent {
	return {
		id: row.id,
		incidentId: row.incident_id,
		timestamp: row.timestamp,
		title: row.title,
		description: row.description,
		confidence: row.confidence,
		sourceEvidenceId: row.source_evidence_id,
		sourceParserOutputId: row.source_parser_output_id,
		createdAt: row.created_at,
	};
}

export function toEntity(row: EntityDto): Entity {
	return {
		id: row.id,
		incidentId: row.incident_id,
		type: row.entity_type,
		name: row.name,
		confidence: row.confidence,
		sourceEvidenceId: row.source_evidence_id,
		sourceParserOutputId: row.source_parser_output_id,
		createdAt: row.created_at,
	};
}

export async function loadSnapshot(): Promise<Snapshot> {
	const dto = await invoke<SnapshotDto>("load_snapshot");
	return {
		incidents: dto.incidents.map(toIncident),
		evidence: dto.evidence.map(toEvidence),
		timelineEvents: dto.timeline_events.map(toTimelineEvent),
		entities: dto.entities.map(toEntity),
		tags: dto.tags.map((tag) => ({
			id: tag.id,
			incidentId: tag.incident_id,
			name: tag.name,
			createdAt: tag.created_at,
		})),
		parserOutputs: dto.parser_outputs.map((output) => ({
			id: output.id,
			evidenceId: output.evidence_id,
			parserName: output.parser_name,
			parserVersion: output.parser_version,
			output: parseOutput(output.output_json),
			createdAt: output.created_at,
		})),
		jobs: dto.jobs.map((job) => ({
			id: job.id,
			kind: job.kind,
			status: job.status,
			payload: parseMetadata(job.payload_json),
			errorText: job.error_text,
			createdAt: job.created_at,
			updatedAt: job.updated_at,
		})),
	};
}

export async function createIncident(title: string): Promise<Incident> {
	return toIncident(await invoke<IncidentDto>("create_incident", { title }));
}

export async function createManualTimelineEvent(input: {
	incidentId: string;
	timestamp: string;
	title: string;
	description: string;
	sourceEvidenceId?: string | null;
}): Promise<TimelineEvent> {
	return toTimelineEvent(
		await invoke<TimelineEventDto>("create_manual_timeline_event", {
			input: {
				incident_id: input.incidentId,
				timestamp: input.timestamp,
				title: input.title,
				description: input.description,
				source_evidence_id: input.sourceEvidenceId ?? null,
			},
		}),
	);
}

export async function updateManualTimelineEvent(input: {
	id: string;
	timestamp: string;
	title: string;
	description: string;
	sourceEvidenceId?: string | null;
}) {
	await invoke("update_manual_timeline_event", {
		input: {
			id: input.id,
			timestamp: input.timestamp,
			title: input.title,
			description: input.description,
			source_evidence_id: input.sourceEvidenceId ?? null,
		},
	});
}

export async function deleteManualTimelineEvent(eventId: string) {
	await invoke("delete_manual_timeline_event", { eventId });
}

export async function renameIncident(
	incidentId: string,
	title: string,
): Promise<Incident> {
	return toIncident(
		await invoke<IncidentDto>("rename_incident", { incidentId, title }),
	);
}

export async function addEvidence(input: {
	incidentId: string;
	kind: Evidence["kind"];
	source: string;
	text?: string;
	metadata?: Record<string, unknown>;
	attachmentName?: string;
	attachmentMimeType?: string | null;
	attachmentBase64?: string;
}): Promise<Evidence> {
	return toEvidence(
		await invoke<EvidenceDto>("add_evidence", {
			input: {
				incident_id: input.incidentId,
				kind: input.kind,
				source: input.source,
				content_text: input.text ?? null,
				metadata_json: JSON.stringify(input.metadata ?? {}),
				attachment_name: input.attachmentName,
				attachment_mime_type: input.attachmentMimeType ?? null,
				attachment_base64: input.attachmentBase64,
			},
		}),
	);
}

export async function saveParserOutput(input: {
	id: string;
	evidenceId: string;
	parserName: string;
	parserVersion: string;
	output: ParsedOutput;
	timelineEvents: TimelineEvent[];
	entities: Entity[];
}) {
	await invoke("save_parser_output", {
		input: {
			id: input.id,
			evidence_id: input.evidenceId,
			parser_name: input.parserName,
			parser_version: input.parserVersion,
			output_json: JSON.stringify(input.output),
			timeline_events_json: JSON.stringify(
				input.timelineEvents.map((event) => ({
					id: event.id,
					incident_id: event.incidentId,
					timestamp: event.timestamp,
					title: event.title,
					description: event.description,
					confidence: event.confidence,
					source_evidence_id: event.sourceEvidenceId,
					source_parser_output_id: event.sourceParserOutputId,
				})),
			),
			entities_json: JSON.stringify(
				input.entities.map((entity) => ({
					id: entity.id,
					incident_id: entity.incidentId,
					entity_type: entity.type,
					name: entity.name,
					confidence: entity.confidence,
					source_evidence_id: entity.sourceEvidenceId,
					source_parser_output_id: entity.sourceParserOutputId,
				})),
			),
		},
	});
}

export async function createJob(input: {
	id: string;
	kind: string;
	status: string;
	payload: Record<string, unknown>;
}) {
	await invoke("create_job", {
		input: {
			id: input.id,
			kind: input.kind,
			status: input.status,
			payload_json: JSON.stringify(input.payload),
		},
	});
}

export async function updateJob(input: {
	id: string;
	status: string;
	errorText?: string | null;
}) {
	await invoke("update_job", {
		input: {
			id: input.id,
			status: input.status,
			error_text: input.errorText ?? null,
		},
	});
}

export async function clearEvidenceParsers(evidenceId: string) {
	await invoke("clear_evidence_parsers", { evidenceId });
}
export async function deleteIncident(incidentId: string) {
	await invoke("delete_incident", { incidentId });
}
export async function exportIncident(incidentId: string) {
	return invoke<string>("export_incident", { incidentId });
}
export async function importIncident(exportPath: string) {
	await invoke("import_incident", { exportPath });
}
export async function deleteEvidence(evidenceId: string) {
	await invoke("delete_evidence", { evidenceId });
}
export async function addTag(incidentId: string, name: string) {
	await invoke("add_tag", { incidentId, name });
}
export async function deleteTag(tagId: string) {
	await invoke("delete_tag", { tagId });
}
export async function search(incidentId: string, query: string) {
	return invoke<SearchResult[]>("search", { incidentId, query });
}
export async function loadAttachment(
	evidenceId: string,
): Promise<AttachmentData | null> {
	const attachment = await invoke<{
		name: string;
		mime_type: string;
		base64: string;
		path: string;
	} | null>("load_attachment", { evidenceId });
	return attachment
		? {
				name: attachment.name,
				mimeType: attachment.mime_type,
				base64: attachment.base64,
				path: attachment.path,
			}
		: null;
}

export async function openAttachment(evidenceId: string) {
	await invoke("open_attachment", { evidenceId });
}
export async function revealAttachment(evidenceId: string) {
	await invoke("reveal_attachment", { evidenceId });
}

export async function runOcr(evidenceId: string) {
	return invoke<string>("run_ocr", { evidenceId });
}

export async function hasOcr() {
	return invoke<boolean>("has_ocr");
}
