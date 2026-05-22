import { invoke } from "@tauri-apps/api/core";

export async function runOcr(evidenceId: string) {
	return invoke<string>("run_ocr", { evidenceId });
}

export async function hasOcr() {
	return invoke<boolean>("has_ocr");
}
