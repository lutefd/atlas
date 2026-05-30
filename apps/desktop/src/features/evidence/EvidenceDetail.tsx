import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import type { Evidence } from "@atlas/shared";
import { loadAttachment, type Snapshot } from "../../api";
import { AttachmentActions } from "./AttachmentActions";
import { replayEvidenceParsers, runOcrForEvidence } from "./evidence-ingestion";

export function EvidenceDetail({
	item,
	snapshot,
	onClose,
}: {
	item: Evidence;
	snapshot: Snapshot;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [isReplaying, setIsReplaying] = useState(false);
	const [isRunningOcr, setIsRunningOcr] = useState(false);
	const [attachmentStatus, setAttachmentStatus] = useState<string | null>(null);
	const parserOutputs = snapshot.parserOutputs.filter(
		(output) => output.evidenceId === item.id,
	);
	const timeline = snapshot.timelineEvents.filter(
		(event) => event.sourceEvidenceId === item.id,
	);
	const entities = snapshot.entities.filter(
		(entity) => entity.sourceEvidenceId === item.id,
	);
	const { data: attachment } = useQuery({
		queryKey: ["attachment", item.id],
		queryFn: () => loadAttachment(item.id),
		enabled: Boolean(item.attachmentId),
	});
	const attachmentUrl = attachment
		? `data:${attachment.mimeType};base64,${attachment.base64}`
		: null;
	const evidenceUrl =
		item.kind === "url" && item.contentText ? item.contentText : null;
	const canReplay = Boolean(item.contentText);
	const canOcr = Boolean(attachment?.mimeType.startsWith("image/"));
	async function handleReplay() {
		if (!canReplay || isReplaying) return;
		setIsReplaying(true);
		try {
			await replayEvidenceParsers(item);
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		} catch (caught) {
			console.error("Replay failed:", caught);
		} finally {
			setIsReplaying(false);
		}
	}
	async function handleOcr() {
		if (!canOcr || isRunningOcr) return;
		setIsRunningOcr(true);
		setAttachmentStatus("Running local OCR...");
		try {
			await runOcrForEvidence(item);
			setAttachmentStatus("OCR complete");
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		} catch (caught) {
			setAttachmentStatus(
				caught instanceof Error ? caught.message : String(caught),
			);
		} finally {
			setIsRunningOcr(false);
		}
	}
	return (
		<aside className="detail-drawer">
			<div className="detail-header">
				<div>
					<h2>Evidence detail</h2>
					<strong>
						{item.kind} from {item.source}
					</strong>
				</div>
				<div className="detail-actions">
					{canOcr && (
						<button
							className="ocr-button"
							disabled={isRunningOcr}
							onClick={() => void handleOcr()}
						>
							{isRunningOcr ? "OCR..." : "Run OCR"}
						</button>
					)}
					{canReplay && (
						<button
							className="icon-button"
							title="Re-run parser"
							disabled={isReplaying}
							onClick={() => void handleReplay()}
						>
							{isReplaying ? "..." : "↻"}
						</button>
					)}
					<button
						className="icon-button"
						title="Close detail"
						onClick={onClose}
					>
						<X size={14} />
					</button>
				</div>
			</div>
			{attachmentUrl && attachment?.mimeType.startsWith("image/") ? (
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
					onStatus={setAttachmentStatus}
				/>
			) : item.attachmentId ? (
				<p className="muted">Attachment is missing or failed to load.</p>
			) : null}
			{attachmentStatus ? (
				<div
					className={
						attachmentStatus.startsWith("Running")
							? "ocr-status running"
							: "copy-status"
					}
				>
					{attachmentStatus.startsWith("Running") ? <span /> : null}
					{attachmentStatus}
				</div>
			) : null}
			{attachmentUrl &&
			attachment &&
			!attachment.mimeType.startsWith("image/") ? (
				<a
					className="attachment-link"
					href={attachmentUrl}
					download={attachment.name}
				>
					{attachment.name}
				</a>
			) : null}
			<section>
				<h3>Raw evidence</h3>
				{evidenceUrl ? (
					<a
						className="evidence-url"
						href={evidenceUrl}
						target="_blank"
						rel="noreferrer"
					>
						{evidenceUrl}
					</a>
				) : null}
				<pre>
					{(evidenceUrl ? "" : item.contentText) ||
						(item.attachmentId ? "Attachment stored locally" : "")}
				</pre>
			</section>
			<section>
				<h3>Parser outputs</h3>
				{parserOutputs.length ? (
					parserOutputs.map((output) => (
						<details key={output.id} open>
							<summary>
								{output.parserName} v{output.parserVersion} ·{" "}
								{new Date(output.createdAt).toLocaleString()}
							</summary>
							<pre>{JSON.stringify(output.output, null, 2)}</pre>
						</details>
					))
				) : (
					<p className="muted">No parser output for this evidence.</p>
				)}
			</section>
			<section>
				<h3>Derived timeline</h3>
				{timeline.length ? (
					timeline.map((event) => (
						<div className="detail-row" key={event.id}>
							<strong>{event.title}</strong>
							<span>
								{new Date(event.timestamp).toLocaleString()} ·{" "}
								{Math.round(event.confidence * 100)}%
							</span>
						</div>
					))
				) : (
					<p className="muted">
						No timeline events derived from this evidence.
					</p>
				)}
			</section>
			<section>
				<h3>Derived entities</h3>
				{entities.length ? (
					entities.map((entity) => (
						<span className="pill" key={entity.id}>
							{entity.type}: {entity.name}
						</span>
					))
				) : (
					<p className="muted">No entities derived from this evidence.</p>
				)}
			</section>
			<section>
				<h3>Metadata</h3>
				<pre>
					{JSON.stringify(
						{
							id: item.id,
							contentHash: item.contentHash,
							createdAt: item.createdAt,
							metadata: item.metadata,
						},
						null,
						2,
					)}
				</pre>
			</section>
		</aside>
	);
}
