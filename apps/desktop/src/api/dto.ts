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
