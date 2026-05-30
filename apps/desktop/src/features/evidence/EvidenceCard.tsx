import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, FileText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Evidence } from "@atlas/shared";
import { deleteEvidence, loadAttachment } from "../../api";
import { base64ToBlob } from "../../lib/clipboard";
import { AttachmentActions } from "./AttachmentActions";

export function EvidenceCard({
	item,
	isSelected,
	onSelect,
	parseStatus,
}: {
	item: Evidence;
	isSelected: boolean;
	onSelect: () => void;
	parseStatus: string;
}) {
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<string | null>(null);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const { data: attachment } = useQuery({
		queryKey: ["attachment", item.id],
		queryFn: () => loadAttachment(item.id),
		enabled: Boolean(item.attachmentId),
	});
	const deleteEvidenceMutation = useMutation({
		mutationFn: () => deleteEvidence(item.id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
			queryClient.removeQueries({ queryKey: ["attachment", item.id] });
		},
		onError: (error) => console.error("Failed to delete evidence:", error),
	});
	const attachmentUrl = attachment
		? `data:${attachment.mimeType};base64,${attachment.base64}`
		: null;
	const isImageAttachment = Boolean(
		attachmentUrl && attachment?.mimeType.startsWith("image/"),
	);
	const evidenceUrl =
		item.kind === "url" && item.contentText ? item.contentText : null;
	useEffect(() => {
		if (!status && !isConfirmingDelete) return;
		const timeout = window.setTimeout(() => {
			setStatus(null);
			setIsConfirmingDelete(false);
		}, 4000);
		return () => window.clearTimeout(timeout);
	}, [status, isConfirmingDelete]);
	async function copyEvidence() {
		setStatus(null);
		try {
			if (attachment && isImageAttachment) {
				await navigator.clipboard.write([
					new ClipboardItem({
						[attachment.mimeType]: base64ToBlob(
							attachment.base64,
							attachment.mimeType,
						),
					}),
				]);
				setStatus("Image copied");
				return;
			}
			await navigator.clipboard.writeText(
				evidenceUrl || item.contentText || attachment?.name || "",
			);
			setStatus(
				evidenceUrl
					? "URL copied"
					: item.contentText
						? "Text copied"
						: "Attachment name copied",
			);
		} catch (caught) {
			setStatus(caught instanceof Error ? caught.message : "Copy failed");
		}
	}
	async function deleteEvidenceAfterConfirm(event: React.MouseEvent) {
		event.stopPropagation();
		if (!isConfirmingDelete) {
			setIsConfirmingDelete(true);
			setStatus("Click confirm to delete this evidence");
			return;
		}
		try {
			await deleteEvidenceMutation.mutateAsync();
			setStatus("Evidence deleted");
		} catch (caught) {
			setStatus(caught instanceof Error ? caught.message : String(caught));
		}
	}
	return (
		<article
			className={isSelected ? "card selected" : "card"}
			onClick={onSelect}
		>
			<div className="card-header">
				<div className="card-meta">
					<FileText size={14} />
					{item.kind} · {item.source} ·{" "}
					{new Date(item.createdAt).toLocaleString()}
					<span className={`parse-badge ${parseStatus}`}>{parseStatus}</span>
					{item.attachmentId ? <span className="parse-badge">file</span> : null}
				</div>
				<div className="card-actions">
					<button
						className="icon-button"
						title="Copy evidence"
						onClick={(event) => {
							event.stopPropagation();
							void copyEvidence();
						}}
					>
						<Clipboard size={14} />
					</button>
					<button
						className={
							isConfirmingDelete ? "confirm-delete" : "icon-button danger"
						}
						title="Delete evidence"
						onClick={(event) => void deleteEvidenceAfterConfirm(event)}
					>
						{isConfirmingDelete ? "Confirm" : <Trash2 size={14} />}
					</button>
				</div>
			</div>
			{attachmentUrl && attachment && isImageAttachment ? (
				<img
					className="attachment-preview"
					src={attachmentUrl}
					alt={attachment.name}
				/>
			) : null}
			{attachment ? (
				<AttachmentActions
					evidenceId={item.id}
					attachment={attachment}
					onStatus={setStatus}
				/>
			) : item.attachmentId ? (
				<p className="muted">
					Attachment is stored locally but could not be loaded.
				</p>
			) : null}
			{attachmentUrl && attachment && !isImageAttachment ? (
				<a
					className="attachment-link"
					href={attachmentUrl}
					download={attachment.name}
				>
					{attachment.name}
				</a>
			) : null}
			{evidenceUrl ? (
				<a
					className="evidence-url"
					href={evidenceUrl}
					target="_blank"
					rel="noreferrer"
					onClick={(event) => event.stopPropagation()}
				>
					{evidenceUrl}
				</a>
			) : null}
			<pre>
				{(evidenceUrl ? "" : item.contentText) ||
					(item.attachmentId ? "Attachment stored locally" : "")}
			</pre>
			{status ? <div className="copy-status">{status}</div> : null}
			<code>{item.contentHash.slice(0, 16)}</code>
		</article>
	);
}
