import { invoke } from "@tauri-apps/api/core";
import type { Incident } from "@atlas/shared";
import { toIncident } from "./mappers";

export async function createIncident(title: string): Promise<Incident> {
	return toIncident(await invoke<import("./dto").IncidentDto>("create_incident", { title }));
}

export async function renameIncident(
	incidentId: string,
	title: string,
): Promise<Incident> {
	return toIncident(
		await invoke<import("./dto").IncidentDto>("rename_incident", { incidentId, title }),
	);
}

export async function updateIncidentOps(input: {
	incidentId: string;
	status: string;
	severity: string;
	impact: string;
	mitigation: string;
	pendingActions: string;
}): Promise<Incident> {
	return toIncident(
		await invoke<import("./dto").IncidentDto>("update_incident_ops", input),
	);
}

export async function deleteIncident(incidentId: string) {
	await invoke("delete_incident", { incidentId });
}
