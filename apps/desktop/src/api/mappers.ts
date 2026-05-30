import { invoke } from "@tauri-apps/api/core";
import type {
	Entity,
	Evidence,
	Incident,
	ParsedOutput,
	TimelineEvent,
} from "@atlas/shared";
import {
	EntityDto,
	EvidenceDto,
	IncidentDto,
	SnapshotDto,
	TimelineEventDto,
	type Snapshot,
} from "./dto";

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
		status: row.status,
		severity: row.severity,
		impact: row.impact,
		mitigation: row.mitigation,
		pendingActions: row.pending_actions,
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
