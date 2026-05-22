import { invoke } from "@tauri-apps/api/core";
import { SearchResult } from "./dto";

export async function search(incidentId: string, query: string) {
	return invoke<SearchResult[]>("search", { incidentId, query });
}
