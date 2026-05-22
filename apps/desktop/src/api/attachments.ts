import { invoke } from "@tauri-apps/api/core";
import { AttachmentData } from "./dto";

export async function loadAttachment(
	evidenceId: string,
): Promise<AttachmentData | null> {
	const attachment = await invoke<{
		name: string;
		mime_type: string;
		base64: string;
		path: string;
	} | null>("load_attachment", { evidenceId });
	return attachment
		? {
				name: attachment.name,
				mimeType: attachment.mime_type,
				base64: attachment.base64,
				path: attachment.path,
			}
		: null;
}

export async function openAttachment(evidenceId: string) {
	await invoke("open_attachment", { evidenceId });
}

export async function revealAttachment(evidenceId: string) {
	await invoke("reveal_attachment", { evidenceId });
}
