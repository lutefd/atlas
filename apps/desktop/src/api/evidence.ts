import { invoke } from "@tauri-apps/api/core";
import type {
	Entity,
	Evidence,
	ParsedOutput,
	TimelineEvent,
} from "@atlas/shared";
import { EvidenceDto } from "./dto";
import { toEvidence } from "./mappers";

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

export async function clearEvidenceParsers(evidenceId: string) {
	await invoke("clear_evidence_parsers", { evidenceId });
}

export async function deleteEvidence(evidenceId: string) {
	await invoke("delete_evidence", { evidenceId });
}
