import {
	openAttachment,
	revealAttachment,
	type AttachmentData,
} from "../../api";

export function AttachmentActions({
	evidenceId,
	attachment,
	onStatus,
}: {
	evidenceId: string;
	attachment: AttachmentData;
	onStatus: (value: string) => void;
}) {
	async function copyPath() {
		await navigator.clipboard.writeText(attachment.path);
		onStatus("Attachment path copied");
	}
	async function openStoredAttachment() {
		await openAttachment(evidenceId);
		onStatus("Attachment opened");
	}
	async function revealStoredAttachment() {
		await revealAttachment(evidenceId);
		onStatus("Attachment revealed in Finder");
	}
	return (
		<div className="attachment-actions">
			<button
				onClick={(event) => {
					event.stopPropagation();
					void openStoredAttachment();
				}}
			>
				Open attachment
			</button>
			<button
				onClick={(event) => {
					event.stopPropagation();
					void revealStoredAttachment();
				}}
			>
				Reveal in Finder
			</button>
			<button
				onClick={(event) => {
					event.stopPropagation();
					void copyPath();
				}}
			>
				Copy path
			</button>
		</div>
	);
}
