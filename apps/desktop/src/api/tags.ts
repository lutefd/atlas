import { invoke } from "@tauri-apps/api/core";

export async function addTag(incidentId: string, name: string) {
	await invoke("add_tag", { incidentId, name });
}

export async function deleteTag(tagId: string) {
	await invoke("delete_tag", { tagId });
}
