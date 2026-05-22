import { invoke } from "@tauri-apps/api/core";
import type { TimelineEvent } from "@atlas/shared";
import { TimelineEventDto } from "./dto";
import { toTimelineEvent } from "./mappers";

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
