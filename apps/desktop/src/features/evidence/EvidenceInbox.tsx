import { useMutation, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { useState, ClipboardEvent } from "react";
import { ingestEvidence } from "./evidence-ingestion";

export function EvidenceInbox({ incidentId }: { incidentId: string }) {
	const queryClient = useQueryClient();
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: (payload: {
			kind: string;
			source: string;
			text?: string;
			file?: File;
		}) => ingestEvidence({ incidentId, ...payload }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});
	async function addText(kind = "text") {
		if (!text.trim()) return;
		setError(null);
		setStatus("Saving evidence...");
		try {
			await mutation.mutateAsync({
				kind,
				source: kind === "note" ? "quick note" : "paste",
				text,
			});
			setText("");
			setStatus("Evidence saved. Parser run recorded.");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
		}
	}
	async function addFile(file: File, source: string) {
		setError(null);
		setStatus(
			file.type.startsWith("image/")
				? "Saving screenshot and checking local OCR..."
				: "Saving attachment...",
		);
		try {
			const textContent = file.type.startsWith("text/")
				? await file.text()
				: undefined;
			await mutation.mutateAsync({
				kind: file.type.startsWith("image/") ? "screenshot" : "file",
				source,
				file,
				text: textContent,
			});
			setStatus(
				file.type.startsWith("image/")
					? "Screenshot saved. OCR/parsers recorded if available."
					: textContent
						? "Attachment saved. Parser run recorded."
						: "Attachment saved.",
			);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
		}
	}
	function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
		const files = Array.from(event.clipboardData.files);
		const itemFiles = Array.from(event.clipboardData.items).flatMap((item) => {
			if (!item.type.startsWith("image/")) return [];
			const file = item.getAsFile();
			return file ? [file] : [];
		});
		const imageFiles = [...files, ...itemFiles]
			.filter((file) => file.type.startsWith("image/"))
			.filter((file, index, allFiles) => {
				const signature = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
				return (
					allFiles.findIndex(
						(candidate) =>
							`${candidate.name}:${candidate.type}:${candidate.size}:${candidate.lastModified}` ===
							signature,
					) === index
				);
			});
		if (imageFiles.length === 0) return;
		event.preventDefault();
		imageFiles.forEach((file, index) => {
			const namedFile = new File(
				[file],
				file.name || `clipboard-image-${Date.now()}-${index}.png`,
				{ type: file.type || "image/png" },
			);
			void addFile(namedFile, "clipboard");
		});
	}
	return (
		<div
			className="inbox"
			onPasteCapture={handlePaste}
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault();
				Array.from(event.dataTransfer.files).forEach(
					(file) => void addFile(file, "drop"),
				);
			}}
		>
			<div className="drop-label">Paste / drop anything here</div>
			<CodeMirror
				value={text}
				height="180px"
				placeholder="Paste logs, Slack snippets, commands, notes, or incident observations..."
				onChange={setText}
			/>
			<div className="actions">
				<button onClick={() => addText("text")}>Save evidence</button>
				<button onClick={() => addText("note")}>Save quick note</button>
				<span>
					{mutation.isPending
						? (status ?? "Ingesting and parsing...")
						: (status ?? "Deterministic parsers run after save")}
				</span>
			</div>
			{error ? <div className="error">{error}</div> : null}
		</div>
	);
}
