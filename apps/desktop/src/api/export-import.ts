import { invoke } from "@tauri-apps/api/core";

export async function exportIncident(incidentId: string) {
	return invoke<string>("export_incident", { incidentId });
}

export async function exportIncidentToDirectory(
	incidentId: string,
	destination: string,
) {
	return invoke<string>("export_incident_to_directory", {
		incidentId,
		destination,
	});
}

export async function importIncident(exportPath: string) {
	await invoke("import_incident", { exportPath });
}

export async function selectExportDirectory() {
	return invoke<string | null>("select_export_directory");
}

export async function selectImportDirectory() {
	return invoke<string | null>("select_import_directory");
}

export async function saveMarkdownDocument(
	defaultName: string,
	markdown: string,
) {
	return invoke<string | null>("save_markdown_document", {
		defaultName,
		markdown,
	});
}

export async function revealPath(path: string) {
	await invoke("reveal_path", { path });
}
