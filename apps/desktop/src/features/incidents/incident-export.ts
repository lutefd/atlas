import type { Incident } from "@atlas/shared";
import { loadAttachment, type AttachmentData, type Snapshot } from "../../api";
import { formatDateTime } from "../../lib/datetime";

export function escapeMarkdown(value: string) {
	return value.replace(/([\\`*_{}[\]()#+.!|-])/g, "\\$1");
}

export function fenced(value: string) {
	return `\n\`\`\`\n${value.replace(/\`\`\`/g, "` ` `")}\n\`\`\`\n`;
}

export function incidentExportName(incident: Incident, suffix: string) {
	const safeTitle = incident.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 80);
	return `${safeTitle || "incident"}-${suffix}.md`;
}

export async function buildIncidentMarkdown(input: {
	incident: Incident;
	snapshot: Snapshot;
	includeAttachments: boolean;
}) {
	const { incident, snapshot, includeAttachments } = input;
	const evidence = snapshot.evidence.filter(
		(item) => item.incidentId === incident.id,
	);
	const notes = evidence.filter((item) => item.kind === "note");
	const timeline = snapshot.timelineEvents.filter(
		(item) => item.incidentId === incident.id,
	);
	const entities = snapshot.entities.filter(
		(item) => item.incidentId === incident.id,
	);
	const tags = snapshot.tags.filter((item) => item.incidentId === incident.id);
	const attachments = new Map<string, AttachmentData>();
	if (includeAttachments) {
		for (const item of evidence) {
			if (!item.attachmentId) continue;
			const attachment = await loadAttachment(item.id);
			if (attachment) attachments.set(item.id, attachment);
		}
	}

	const lines = [
		`# ${incident.title}`,
		"",
		`- Created: ${formatDateTime(incident.createdAt)}`,
		`- Updated: ${formatDateTime(incident.updatedAt)}`,
		`- Evidence: ${evidence.length}`,
		`- Timeline events: ${timeline.length}`,
		`- Entities: ${entities.length}`,
		...(tags.length
			? [`- Tags: ${tags.map((tag) => escapeMarkdown(tag.name)).join(", ")}`]
			: []),
		"",
		"## Timeline",
		"",
		...(timeline.length
			? timeline.flatMap((event) => [
					`### ${formatDateTime(event.timestamp)} - ${event.title}`,
					"",
					...(event.sourceEvidenceId
						? [`- Source evidence: ${event.sourceEvidenceId}`]
						: []),
					"",
					event.description,
					"",
				])
			: ["No timeline events recorded.", ""]),
		"## Entities",
		"",
		...(entities.length
			? entities.map((entity) => `- ${entity.type}: ${entity.name}`)
			: ["No entities recorded."]),
		"",
		"## Notes",
		"",
		...(notes.length
			? notes.flatMap((note) => [
					`### ${note.source}`,
					"",
					note.contentText ? fenced(note.contentText) : "No note text.",
				])
			: ["No notes recorded.", ""]),
		"",
		"## Evidence",
		"",
	];

	for (const item of evidence) {
		const attachment = attachments.get(item.id);
		lines.push(
			`### ${item.kind} from ${item.source}`,
			"",
			`- Created: ${formatDateTime(item.createdAt)}`,
			`- Content hash: ${item.contentHash}`,
		);
		if (attachment) {
			lines.push(
				`- Attachment: ${attachment.name} (${attachment.mimeType})`,
				`- Attachment path: ${attachment.path}`,
			);
		}
		lines.push(
			"",
			item.contentText ? fenced(item.contentText) : "No text content.",
		);
		if (attachment?.mimeType.startsWith("image/")) {
			lines.push(
				`![${attachment.name}](data:${attachment.mimeType};base64,${attachment.base64})`,
				"",
			);
		} else if (attachment) {
			lines.push("Attachment base64:", fenced(attachment.base64));
		}
	}
	return lines.join("\n");
}

export function buildSlackIncidentMessage(input: {
	incident: Incident;
	snapshot: Snapshot;
}) {
	const { incident, snapshot } = input;
	const evidence = snapshot.evidence.filter(
		(item) => item.incidentId === incident.id,
	);
	const timeline = snapshot.timelineEvents.filter(
		(item) => item.incidentId === incident.id,
	);
	const entities = snapshot.entities.filter(
		(item) => item.incidentId === incident.id,
	);
	const tags = snapshot.tags.filter((item) => item.incidentId === incident.id);
	const topTimeline = timeline.slice(0, 6);
	const topEntities = entities.slice(0, 12);
	return [
		`*Incident:* ${incident.title}`,
		`*Updated:* ${formatDateTime(incident.updatedAt)}`,
		tags.length ? `*Tags:* ${tags.map((tag) => tag.name).join(", ")}` : null,
		`*Summary:* ${timeline.length} timeline events, ${evidence.length} evidence items, ${entities.length} entities.`,
		"",
		"*Timeline*",
		...(topTimeline.length
			? topTimeline.map(
					(event) =>
						`- ${formatDateTime(event.timestamp)} - ${event.title}: ${event.description}`,
				)
			: ["- No timeline events recorded."]),
		...(timeline.length > topTimeline.length
			? [`- +${timeline.length - topTimeline.length} more events in Atlas.`]
			: []),
		"",
		"*Key entities*",
		...(topEntities.length
			? [
					topEntities
						.map((entity) => `${entity.type}: ${entity.name}`)
						.join(", "),
				]
			: ["None recorded."]),
	]
		.filter(Boolean)
		.join("\n");
}
