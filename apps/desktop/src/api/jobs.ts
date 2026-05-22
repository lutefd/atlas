import { invoke } from "@tauri-apps/api/core";

export async function createJob(input: {
	id: string;
	kind: string;
	status: string;
	payload: Record<string, unknown>;
}) {
	await invoke("create_job", {
		input: {
			id: input.id,
			kind: input.kind,
			status: input.status,
			payload_json: JSON.stringify(input.payload),
		},
	});
}

export async function updateJob(input: {
	id: string;
	status: string;
	errorText?: string | null;
}) {
	await invoke("update_job", {
		input: {
			id: input.id,
			status: input.status,
			error_text: input.errorText ?? null,
		},
	});
}
