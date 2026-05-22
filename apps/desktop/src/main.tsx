import {
	QueryClient,
	QueryClientProvider,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import {
	Clipboard,
	Download,
	FileText,
	Inbox,
	Pencil,
	Plus,
	Search,
	Tags,
	Trash2,
	X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import {
	deriveEntities,
	deriveTimelineEvents,
	parseEvidence,
} from "@atlas/core";
import type { Evidence, Incident, ParsedOutput } from "@atlas/shared";
import {
	addEvidence,
	addTag,
	clearEvidenceParsers,
	createIncident,
	createJob,
	createManualTimelineEvent,
	deleteEvidence,
	deleteIncident,
	deleteManualTimelineEvent,
	deleteTag,
	exportIncidentToDirectory,
	hasOcr,
	importIncident,
	loadAttachment,
	loadSnapshot,
	openAttachment,
	renameIncident,
	revealPath,
	revealAttachment,
	runOcr,
	saveMarkdownDocument,
	saveParserOutput,
	search,
	selectExportDirectory,
	selectImportDirectory,
	updateJob,
	updateManualTimelineEvent,
	type AttachmentData,
	type Job,
	type SearchResult,
	type Snapshot,
} from "./api";
import "./styles.css";

const client = new QueryClient();
const useUi = create<{
	selectedIncidentId: string | null;
	selectedEvidenceId: string | null;
	selectIncident: (id: string) => void;
	selectEvidence: (id: string | null) => void;
}>((set) => ({
	selectedIncidentId: null,
	selectedEvidenceId: null,
	selectIncident: (id) =>
		set({ selectedIncidentId: id, selectedEvidenceId: null }),
	selectEvidence: (id) => set({ selectedEvidenceId: id }),
}));

async function fileToBase64(file: File) {
	const buffer = await file.arrayBuffer();
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (let index = 0; index < bytes.length; index += 8192) {
		binary += String.fromCharCode(...bytes.slice(index, index + 8192));
	}
	return btoa(binary);
}

async function ingestEvidence(input: {
	incidentId: string;
	kind: string;
	source: string;
	text?: string;
	file?: File;
}) {
	let attachmentBase64: string | undefined;
	let attachmentName: string | undefined;
	if (input.file) {
		attachmentName = input.file.name;
		attachmentBase64 = await fileToBase64(input.file);
	}
	const evidence = await addEvidence({
		incidentId: input.incidentId,
		kind: input.kind as Evidence["kind"],
		source: input.source,
		text: input.text,
		metadata: { fileName: input.file?.name },
		attachmentName,
		attachmentMimeType: input.file?.type || null,
		attachmentBase64,
	});
	try {
		await runParsersForEvidence(evidence);
	} catch (caught) {
		console.error("Parser failed after evidence was saved:", caught);
	}
	if (input.file?.type.startsWith("image/") && (await hasOcr())) {
		try {
			await runOcrForEvidence(evidence);
		} catch (caught) {
			console.error("OCR failed after evidence was saved:", caught);
		}
	}
}

async function runParsersForEvidence(evidence: Evidence) {
	const jobId = crypto.randomUUID();
	await createJob({
		id: jobId,
		kind: "parser",
		status: "running",
		payload: { evidenceId: evidence.id, incidentId: evidence.incidentId },
	});
	try {
		const outputs = await parseEvidence(evidence);
		for (const output of outputs) {
			const timeline = deriveTimelineEvents(evidence.incidentId, output);
			const entities = deriveEntities(evidence.incidentId, output);
			await saveParserOutput({
				id: output.id,
				evidenceId: output.evidenceId,
				parserName: output.parserName,
				parserVersion: output.parserVersion,
				output: output.output,
				timelineEvents: timeline,
				entities,
			});
		}
		await updateJob({ id: jobId, status: "succeeded" });
	} catch (caught) {
		await updateJob({
			id: jobId,
			status: "failed",
			errorText: caught instanceof Error ? caught.message : String(caught),
		});
		throw caught;
	}
}

function getParserJob(evidenceId: string, jobs: Job[]) {
	return (
		jobs.find(
			(job) => job.kind === "parser" && job.payload.evidenceId === evidenceId,
		) ?? null
	);
}

function getParseStatus(evidence: Evidence, snapshot: Snapshot) {
	if (
		snapshot.parserOutputs.some((output) => output.evidenceId === evidence.id)
	)
		return "parsed";
	const job = getParserJob(evidence.id, snapshot.jobs);
	if (job?.status === "failed") return "failed";
	if (job?.status === "running") return "running";
	return "unparsed";
}

async function replayEvidenceParsers(evidence: Evidence) {
	await clearEvidenceParsers(evidence.id);
	await runParsersForEvidence(evidence);
}

async function runOcrForEvidence(evidence: Evidence) {
	const jobId = crypto.randomUUID();
	await createJob({
		id: jobId,
		kind: "ocr",
		status: "running",
		payload: { evidenceId: evidence.id, incidentId: evidence.incidentId },
	});
	try {
		const text = await runOcr(evidence.id);
		if (!text.trim()) throw new Error("OCR completed but found no text.");
		const ocrEvidence = { ...evidence, contentText: text };
		const outputs = await parseEvidence(ocrEvidence);
		const parsedOutput = outputs.reduce<ParsedOutput>(
			(combined, output) => ({
				entities: [...combined.entities, ...output.output.entities],
				timestamps: [...combined.timestamps, ...output.output.timestamps],
				events: [...combined.events, ...output.output.events],
				metrics: [...combined.metrics, ...output.output.metrics],
				references: [...combined.references, ...output.output.references],
			}),
			{
				entities: [],
				timestamps: [],
				events: [],
				metrics: [],
				references: [],
			},
		);
		const ocrOutput = {
			...parsedOutput,
			references: [
				{ kind: "ocr_text", value: text, sourceText: text },
				...parsedOutput.references,
			],
		};
		await saveParserOutput({
			id: crypto.randomUUID(),
			evidenceId: evidence.id,
			parserName: "local-ocr",
			parserVersion: "0.1.0",
			output: ocrOutput,
			timelineEvents: [],
			entities: [],
		});
		for (const output of outputs) {
			const timeline = deriveTimelineEvents(evidence.incidentId, output);
			const entities = deriveEntities(evidence.incidentId, output);
			await saveParserOutput({
				id: output.id,
				evidenceId: evidence.id,
				parserName: `${output.parserName}-ocr`,
				parserVersion: output.parserVersion,
				output: output.output,
				timelineEvents: timeline,
				entities,
			});
		}
		await updateJob({ id: jobId, status: "succeeded" });
	} catch (caught) {
		await updateJob({
			id: jobId,
			status: "failed",
			errorText: caught instanceof Error ? caught.message : String(caught),
		});
		throw caught;
	}
}

function base64ToBlob(base64: string, mimeType: string) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new Blob([bytes], { type: mimeType });
}

function formatDateTime(value: string) {
	return new Date(value).toLocaleString();
}

function escapeMarkdown(value: string) {
	return value.replace(/([\\`*_{}[\]()#+.!|-])/g, "\\$1");
}

function fenced(value: string) {
	return `\n\`\`\`\n${value.replace(/\`\`\`/g, "` ` `")}\n\`\`\`\n`;
}

function incidentExportName(incident: Incident, suffix: string) {
	const safeTitle = incident.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 80);
	return `${safeTitle || "incident"}-${suffix}.md`;
}

async function buildIncidentMarkdown(input: {
	incident: Incident;
	snapshot: Snapshot;
	includeAttachments: boolean;
}) {
	const { incident, snapshot, includeAttachments } = input;
	const evidence = snapshot.evidence.filter(
		(item) => item.incidentId === incident.id,
	);
	const notes = evidence.filter((item) => item.kind === "note");
	const timeline = snapshot.timelineEvents.filter(
		(item) => item.incidentId === incident.id,
	);
	const entities = snapshot.entities.filter(
		(item) => item.incidentId === incident.id,
	);
	const tags = snapshot.tags.filter((item) => item.incidentId === incident.id);
	const attachments = new Map<string, AttachmentData>();
	if (includeAttachments) {
		for (const item of evidence) {
			if (!item.attachmentId) continue;
			const attachment = await loadAttachment(item.id);
			if (attachment) attachments.set(item.id, attachment);
		}
	}

	const lines = [
		`# ${incident.title}`,
		"",
		`- Created: ${formatDateTime(incident.createdAt)}`,
		`- Updated: ${formatDateTime(incident.updatedAt)}`,
		`- Evidence: ${evidence.length}`,
		`- Timeline events: ${timeline.length}`,
		`- Entities: ${entities.length}`,
		...(tags.length
			? [`- Tags: ${tags.map((tag) => escapeMarkdown(tag.name)).join(", ")}`]
			: []),
		"",
		"## Timeline",
		"",
		...(timeline.length
			? timeline.flatMap((event) => [
					`### ${formatDateTime(event.timestamp)} - ${event.title}`,
					"",
					...(event.sourceEvidenceId
						? [`- Source evidence: ${event.sourceEvidenceId}`]
						: []),
					"",
					event.description,
					"",
				])
			: ["No timeline events recorded.", ""]),
		"## Entities",
		"",
		...(entities.length
			? entities.map((entity) => `- ${entity.type}: ${entity.name}`)
			: ["No entities recorded."]),
		"",
		"## Notes",
		"",
		...(notes.length
			? notes.flatMap((note) => [
					`### ${note.source}`,
					"",
					note.contentText ? fenced(note.contentText) : "No note text.",
				])
			: ["No notes recorded.", ""]),
		"",
		"## Evidence",
		"",
	];

	for (const item of evidence) {
		const attachment = attachments.get(item.id);
		lines.push(
			`### ${item.kind} from ${item.source}`,
			"",
			`- Created: ${formatDateTime(item.createdAt)}`,
			`- Content hash: ${item.contentHash}`,
		);
		if (attachment) {
			lines.push(
				`- Attachment: ${attachment.name} (${attachment.mimeType})`,
				`- Attachment path: ${attachment.path}`,
			);
		}
		lines.push(
			"",
			item.contentText ? fenced(item.contentText) : "No text content.",
		);
		if (attachment?.mimeType.startsWith("image/")) {
			lines.push(
				`![${attachment.name}](data:${attachment.mimeType};base64,${attachment.base64})`,
				"",
			);
		} else if (attachment) {
			lines.push("Attachment base64:", fenced(attachment.base64));
		}
	}
	return lines.join("\n");
}

function buildSlackIncidentMessage(input: {
	incident: Incident;
	snapshot: Snapshot;
}) {
	const { incident, snapshot } = input;
	const evidence = snapshot.evidence.filter(
		(item) => item.incidentId === incident.id,
	);
	const timeline = snapshot.timelineEvents.filter(
		(item) => item.incidentId === incident.id,
	);
	const entities = snapshot.entities.filter(
		(item) => item.incidentId === incident.id,
	);
	const tags = snapshot.tags.filter((item) => item.incidentId === incident.id);
	const topTimeline = timeline.slice(0, 6);
	const topEntities = entities.slice(0, 12);
	return [
		`*Incident:* ${incident.title}`,
		`*Updated:* ${formatDateTime(incident.updatedAt)}`,
		tags.length ? `*Tags:* ${tags.map((tag) => tag.name).join(", ")}` : null,
		`*Summary:* ${timeline.length} timeline events, ${evidence.length} evidence items, ${entities.length} entities.`,
		"",
		"*Timeline*",
		...(topTimeline.length
			? topTimeline.map(
					(event) =>
						`- ${formatDateTime(event.timestamp)} - ${event.title}: ${event.description}`,
				)
			: ["- No timeline events recorded."]),
		...(timeline.length > topTimeline.length
			? [`- +${timeline.length - topTimeline.length} more events in Atlas.`]
			: []),
		"",
		"*Key entities*",
		...(topEntities.length
			? [
					topEntities
						.map((entity) => `${entity.type}: ${entity.name}`)
						.join(", "),
				]
			: ["None recorded."]),
	]
		.filter(Boolean)
		.join("\n");
}

function AttachmentActions({
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

function App() {
	return (
		<QueryClientProvider client={client}>
			<Workspace />
		</QueryClientProvider>
	);
}

function Workspace() {
	const queryClient = useQueryClient();
	const [incidentStatus, setIncidentStatus] = useState<string | null>(null);
	const [replayStatus, setReplayStatus] = useState<string | null>(null);
	const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
	const exportMenuRef = useRef<HTMLDetailsElement | null>(null);
	const [confirmingIncidentId, setConfirmingIncidentId] = useState<
		string | null
	>(null);
	const selectedIncidentId = useUi((state) => state.selectedIncidentId);
	const selectedEvidenceId = useUi((state) => state.selectedEvidenceId);
	const selectIncident = useUi((state) => state.selectIncident);
	const selectEvidence = useUi((state) => state.selectEvidence);
	const { data } = useQuery({ queryKey: ["snapshot"], queryFn: loadSnapshot });
	const incidents = data?.incidents ?? [];
	const activeId = selectedIncidentId ?? incidents[0]?.id ?? null;
	const active = incidents.find((incident) => incident.id === activeId) ?? null;
	const evidence = (data?.evidence ?? []).filter(
		(item) => item.incidentId === activeId,
	);
	const timeline = (data?.timelineEvents ?? []).filter(
		(item) => item.incidentId === activeId,
	);
	const entities = (data?.entities ?? []).filter(
		(item) => item.incidentId === activeId,
	);
	const tags = (data?.tags ?? []).filter(
		(item) => item.incidentId === activeId,
	);
	const selectedEvidence =
		evidence.find((item) => item.id === selectedEvidenceId) ?? null;
	const [editingIncident, setEditingIncident] = useState<{
		id: string;
		surface: "sidebar" | "header";
	} | null>(null);
	const createIncidentMutation = useMutation({
		mutationFn: createIncident,
		onSuccess: (incident) => {
			selectIncident(incident.id);
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});
	const deleteIncidentMutation = useMutation({
		mutationFn: deleteIncident,
		onSuccess: () => {
			useUi.setState({ selectedIncidentId: null, selectedEvidenceId: null });
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
		onError: (error) => console.error("Failed to delete incident:", error),
	});
	const renameIncidentMutation = useMutation({
		mutationFn: ({ id, title }: { id: string; title: string }) =>
			renameIncident(id, title),
		onSuccess: () => {
			setEditingIncident(null);
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
		onError: (error) => console.error("Failed to rename incident:", error),
	});
	useEffect(() => {
		if (!incidentStatus && !confirmingIncidentId) return;
		const timeout = window.setTimeout(() => {
			setIncidentStatus(null);
			setConfirmingIncidentId(null);
		}, 4000);
		return () => window.clearTimeout(timeout);
	}, [incidentStatus, confirmingIncidentId]);
	useEffect(() => {
		if (!isExportMenuOpen) return;
		function closeMenu(event: PointerEvent) {
			if (exportMenuRef.current?.contains(event.target as Node)) return;
			setIsExportMenuOpen(false);
		}
		window.addEventListener("pointerdown", closeMenu);
		return () => window.removeEventListener("pointerdown", closeMenu);
	}, [isExportMenuOpen]);
	useEffect(() => {
		if (!replayStatus || replayStatus === "running") return;
		const timeout = window.setTimeout(() => setReplayStatus(null), 4000);
		return () => window.clearTimeout(timeout);
	}, [replayStatus]);
	async function deleteIncidentAfterConfirm(
		event: React.MouseEvent,
		incident: Incident,
	) {
		event.stopPropagation();
		setIncidentStatus(null);
		if (confirmingIncidentId !== incident.id) {
			setConfirmingIncidentId(incident.id);
			setIncidentStatus(`Click confirm to delete ${incident.title}`);
			return;
		}
		try {
			await deleteIncidentMutation.mutateAsync(incident.id);
			setConfirmingIncidentId(null);
			setIncidentStatus("Incident deleted");
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			setIncidentStatus(message);
		}
	}
	async function replayIncidentParsers() {
		if (!activeId || replayStatus === "running") return;
		const canOcrImages = await hasOcr();
		let replayedCount = 0;
		setReplayStatus("running");
		try {
			for (const item of evidence) {
				if (item.contentText) {
					await replayEvidenceParsers(item);
					replayedCount += 1;
					continue;
				}
				if (!item.attachmentId || !canOcrImages) continue;
				const attachment = await loadAttachment(item.id);
				if (!attachment?.mimeType.startsWith("image/")) continue;
				await clearEvidenceParsers(item.id);
				await runOcrForEvidence(item);
				replayedCount += 1;
			}
			await queryClient.invalidateQueries({ queryKey: ["snapshot"] });
			setReplayStatus(`complete:${replayedCount}`);
		} catch (caught) {
			console.error("Incident parser replay failed:", caught);
			setReplayStatus("failed");
		}
	}
	async function exportActiveIncident() {
		if (!activeId) return;
		try {
			const destination = await selectExportDirectory();
			if (!destination) return;
			const path = await exportIncidentToDirectory(activeId, destination);
			setIncidentStatus(`Exported to ${path}`);
			await revealPath(path);
		} catch (caught) {
			setIncidentStatus(
				caught instanceof Error ? caught.message : String(caught),
			);
		}
	}
	async function exportActiveIncidentDocument() {
		if (!active || !data) return;
		try {
			setIncidentStatus("Building Markdown export...");
			const markdown = await buildIncidentMarkdown({
				incident: active,
				snapshot: data,
				includeAttachments: true,
			});
			const path = await saveMarkdownDocument(
				incidentExportName(active, "document"),
				markdown,
			);
			if (!path) {
				setIncidentStatus(null);
				return;
			}
			setIncidentStatus(`Markdown document exported to ${path}`);
			await revealPath(path);
		} catch (caught) {
			setIncidentStatus(
				caught instanceof Error ? caught.message : String(caught),
			);
		}
	}
	async function copyActiveIncidentSlackMessage() {
		if (!active || !data) return;
		try {
			await navigator.clipboard.writeText(
				buildSlackIncidentMessage({ incident: active, snapshot: data }),
			);
			setIncidentStatus("Slack incident message copied");
		} catch (caught) {
			setIncidentStatus(
				caught instanceof Error ? caught.message : String(caught),
			);
		}
	}
	async function importIncidentFromPath() {
		try {
			const importPath = await selectImportDirectory();
			if (!importPath) return;
			await importIncident(importPath);
			setIncidentStatus("Incident imported");
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		} catch (caught) {
			setIncidentStatus(
				caught instanceof Error ? caught.message : String(caught),
			);
		}
	}

	return (
		<main className="shell">
			<aside className="sidebar">
				<div className="brand">Atlas</div>
				<button
					className="primary"
					onClick={() =>
						createIncidentMutation.mutate(`Incident ${incidents.length + 1}`)
					}
				>
					<Plus size={16} /> Create incident
				</button>
				<div className="import-box">
					<button onClick={() => void importIncidentFromPath()}>Import</button>
				</div>
				{incidentStatus ? (
					<div className="sidebar-status">{incidentStatus}</div>
				) : null}
				<div className="incident-list">
					{incidents.map((incident) => {
						const isEditing =
							editingIncident?.id === incident.id &&
							editingIncident.surface === "sidebar";
						return (
							<div
								key={incident.id}
								className={
									incident.id === activeId ? "incident active" : "incident"
								}
							>
								{isEditing ? (
									<IncidentRenameInput
										initialTitle={incident.title}
										onSave={(title) =>
											renameIncidentMutation.mutate({ id: incident.id, title })
										}
										onCancel={() => setEditingIncident(null)}
									/>
								) : (
									<button
										className="incident-select"
										onClick={() => selectIncident(incident.id)}
									>
										{incident.title}
										<span>{new Date(incident.createdAt).toLocaleString()}</span>
									</button>
								)}
								{!isEditing && (
									<div className="incident-actions">
										<button
											className="icon-button"
											title="Rename incident"
											onClick={(event) => {
												event.stopPropagation();
												setEditingIncident({
													id: incident.id,
													surface: "sidebar",
												});
											}}
										>
											<Pencil size={14} />
										</button>
										<button
											className={
												confirmingIncidentId === incident.id
													? "confirm-delete"
													: "icon-button danger"
											}
											title="Delete incident"
											onClick={(event) =>
												void deleteIncidentAfterConfirm(event, incident)
											}
										>
											{confirmingIncidentId === incident.id ? (
												"Confirm"
											) : (
												<Trash2 size={14} />
											)}
										</button>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</aside>
			{active && data ? (
				<>
					<section className="center">
						<div className="incident-header">
							{editingIncident?.id === active.id &&
							editingIncident.surface === "header" ? (
								<IncidentRenameInput
									className="header-rename"
									initialTitle={active.title}
									onSave={(title) =>
										renameIncidentMutation.mutate({ id: active.id, title })
									}
									onCancel={() => setEditingIncident(null)}
								/>
							) : (
								<h1
									onDoubleClick={() =>
										setEditingIncident({ id: active.id, surface: "header" })
									}
									title="Double-click to rename"
								>
									{active.title}
								</h1>
							)}
							<div className="header-actions">
								<details
									className="export-menu"
									open={isExportMenuOpen}
									ref={exportMenuRef}
									onToggle={(event) =>
										setIsExportMenuOpen(event.currentTarget.open)
									}
								>
									<summary>Export</summary>
									<div>
										<button
											onClick={() => {
												setIsExportMenuOpen(false);
												void exportActiveIncident();
											}}
										>
											<FileText size={14} />
											Raw incident folder
										</button>
										<button
											title="Download a detailed Markdown document with embedded attachment data"
											onClick={() => {
												setIsExportMenuOpen(false);
												void exportActiveIncidentDocument();
											}}
										>
											<Download size={14} /> Markdown document
										</button>
										<button
											title="Copy a concise incident update for a Slack thread"
											onClick={() => {
												setIsExportMenuOpen(false);
												void copyActiveIncidentSlackMessage();
											}}
										>
											<Clipboard size={14} /> Slack message
										</button>
									</div>
								</details>
								<button
									className="secondary"
									disabled={
										replayStatus === "running" ||
										evidence.every((item) => !item.contentText)
									}
									onClick={() => void replayIncidentParsers()}
								>
									{replayStatus === "running"
										? "Replaying..."
										: "Replay parsers"}
								</button>
							</div>
						</div>
						{replayStatus && replayStatus !== "running" ? (
							<p
								className={
									replayStatus === "failed" ? "error" : "replay-status"
								}
							>
								{replayStatus === "failed"
									? "Parser replay failed. Raw evidence was preserved."
									: `Parser replay complete for ${replayStatus.split(":")[1]} evidence item(s).`}
							</p>
						) : null}
						<EvidenceInbox incidentId={active.id} />
						<EvidenceStream
							evidence={evidence}
							selectedEvidenceId={selectedEvidenceId}
							onSelectEvidence={selectEvidence}
							snapshot={data}
						/>
					</section>
					<RightPanel
						incidentId={active.id}
						timeline={timeline}
						entities={entities}
						tags={tags}
						evidence={evidence}
						onSelectEvidence={selectEvidence}
					/>
					{selectedEvidence ? (
						<EvidenceDetail
							item={selectedEvidence}
							snapshot={data}
							onClose={() => selectEvidence(null)}
						/>
					) : null}
				</>
			) : (
				<section className="empty">
					<Inbox size={40} />
					<h1>Create an incident workspace</h1>
					<p>
						Paste logs, notes, screenshots, and files. Atlas keeps raw evidence
						immutable and derives structure beside it.
					</p>
				</section>
			)}
		</main>
	);
}

function IncidentRenameInput({
	initialTitle,
	onSave,
	onCancel,
	className = "incident-rename",
}: {
	initialTitle: string;
	onSave: (title: string) => void;
	onCancel: () => void;
	className?: string;
}) {
	const [value, setValue] = useState(initialTitle);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const didFocus = React.useRef(false);

	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.focus();
		el.select();
		didFocus.current = true;
	}, []);

	return (
		<input
			ref={inputRef}
			className={className}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					onSave(value);
				}
				if (e.key === "Escape") onCancel();
			}}
			onBlur={() => {
				if (!didFocus.current) return;
				if (value.trim() !== initialTitle.trim()) onSave(value);
				else onCancel();
			}}
		/>
	);
}

function EvidenceInbox({ incidentId }: { incidentId: string }) {
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
	function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
		const files = Array.from(event.clipboardData.files);
		const itemFiles = Array.from(event.clipboardData.items).flatMap((item) => {
			if (!item.type.startsWith("image/")) return [];
			const file = item.getAsFile();
			return file ? [file] : [];
		});
		const imageFiles = [...files, ...itemFiles].filter((file) =>
			file.type.startsWith("image/"),
		);
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

function EvidenceStream({
	evidence,
	selectedEvidenceId,
	onSelectEvidence,
	snapshot,
}: {
	evidence: Evidence[];
	selectedEvidenceId: string | null;
	onSelectEvidence: (id: string) => void;
	snapshot: Snapshot;
}) {
	const statuses = evidence.map((item) => getParseStatus(item, snapshot));
	const parsed = statuses.filter((status) => status === "parsed").length;
	const failed = statuses.filter((status) => status === "failed").length;
	const running = statuses.filter((status) => status === "running").length;
	return (
		<section className="evidence-section">
			<div className="section-heading">
				<h2>Evidence</h2>
				<span>
					{evidence.length} total · {parsed} parsed ·{" "}
					{evidence.length - parsed - failed - running} unparsed
					{failed ? ` · ${failed} failed` : ""}
					{running ? ` · ${running} running` : ""}
				</span>
			</div>
			<div className="stream">
				{evidence.map((item) => (
					<EvidenceCard
						item={item}
						key={item.id}
						isSelected={item.id === selectedEvidenceId}
						onSelect={() => onSelectEvidence(item.id)}
						parseStatus={getParseStatus(item, snapshot)}
					/>
				))}
			</div>
		</section>
	);
}

function EvidenceCard({
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
				item.contentText || attachment?.name || "",
			);
			setStatus(item.contentText ? "Text copied" : "Attachment name copied");
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
			<pre>
				{item.contentText ||
					(item.attachmentId ? "Attachment stored locally" : "")}
			</pre>
			{status ? <div className="copy-status">{status}</div> : null}
			<code>{item.contentHash.slice(0, 16)}</code>
		</article>
	);
}

function EvidenceDetail({
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
				<pre>
					{item.contentText ||
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

function sanitizeFtsQuery(value: string) {
	return value
		.trim()
		.split(/\s+/)
		.map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
		.filter(Boolean)
		.join(" ");
}

function RightPanel({
	incidentId,
	timeline,
	entities,
	tags,
	evidence,
	onSelectEvidence,
}: {
	incidentId: string;
	timeline: Snapshot["timelineEvents"];
	entities: Snapshot["entities"];
	tags: Snapshot["tags"];
	evidence: Evidence[];
	onSelectEvidence: (id: string) => void;
}) {
	const queryClient = useQueryClient();
	const [tag, setTag] = useState("");
	const [query, setQuery] = useState("");
	const [searchFilter, setSearchFilter] = useState("all");
	const [manualEvent, setManualEvent] = useState({
		timestamp: new Date().toISOString().slice(0, 16),
		title: "",
		description: "",
		sourceEvidenceId: "",
	});
	const [editingEventId, setEditingEventId] = useState<string | null>(null);
	const [isEventModalOpen, setIsEventModalOpen] = useState(false);
	const safeQuery = sanitizeFtsQuery(query);
	const { data: results = [], error: searchError } = useQuery<SearchResult[]>({
		queryKey: ["search", incidentId, safeQuery],
		queryFn: () =>
			safeQuery ? search(incidentId, safeQuery) : Promise.resolve([]),
		enabled: Boolean(safeQuery),
	});
	const filteredResults =
		searchFilter === "all"
			? results
			: results.filter((result) => result.kind === searchFilter);
	const addTagMutation = useMutation({
		mutationFn: () => addTag(incidentId, tag),
		onSuccess: () => {
			setTag("");
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});
	const deleteTagMutation = useMutation({
		mutationFn: deleteTag,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});
	const saveManualEventMutation = useMutation({
		mutationFn: async () => {
			const input = {
				timestamp: new Date(manualEvent.timestamp).toISOString(),
				title: manualEvent.title,
				description: manualEvent.description,
				sourceEvidenceId: manualEvent.sourceEvidenceId || null,
			};
			if (editingEventId)
				await updateManualTimelineEvent({ id: editingEventId, ...input });
			else await createManualTimelineEvent({ incidentId, ...input });
		},
		onSuccess: () => {
			closeEventModal();
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});
	const deleteManualEventMutation = useMutation({
		mutationFn: deleteManualTimelineEvent,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});
	const groupedEntities = useMemo(() => entities.slice(0, 20), [entities]);
	function openNewEventModal() {
		setEditingEventId(null);
		setManualEvent({
			timestamp: new Date().toISOString().slice(0, 16),
			title: "",
			description: "",
			sourceEvidenceId: "",
		});
		setIsEventModalOpen(true);
	}
	function editManualEvent(event: Snapshot["timelineEvents"][number]) {
		setEditingEventId(event.id);
		setManualEvent({
			timestamp: new Date(event.timestamp).toISOString().slice(0, 16),
			title: event.title,
			description: event.description,
			sourceEvidenceId: event.sourceEvidenceId ?? "",
		});
		setIsEventModalOpen(true);
	}
	function closeEventModal() {
		setIsEventModalOpen(false);
		setEditingEventId(null);
		setManualEvent({
			timestamp: new Date().toISOString().slice(0, 16),
			title: "",
			description: "",
			sourceEvidenceId: "",
		});
	}
	function openSearchResult(result: SearchResult) {
		if (
			result.kind === "evidence" ||
			result.kind === "attachment" ||
			result.kind === "parser_output"
		)
			onSelectEvidence(result.refId);
		if (result.kind === "timeline")
			onSelectEvidence(
				timeline.find((event) => event.id === result.refId)?.sourceEvidenceId ??
					"",
			);
		if (result.kind === "entity")
			onSelectEvidence(
				entities.find((entity) => entity.id === result.refId)
					?.sourceEvidenceId ?? "",
			);
	}
	return (
		<aside className="right">
			<section className="panel">
				<div className="panel-heading">
					<h2>
						<Search size={16} /> Search
					</h2>
					{query ? <button onClick={() => setQuery("")}>Clear</button> : null}
				</div>
				<input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search evidence, events, entities, files"
				/>
				<div className="search-filters">
					{[
						"all",
						"evidence",
						"timeline",
						"entity",
						"attachment",
						"parser_output",
					].map((filter) => (
						<button
							className={searchFilter === filter ? "active" : ""}
							key={filter}
							onClick={() => setSearchFilter(filter)}
						>
							{filter}
						</button>
					))}
				</div>
				{query.trim() && !safeQuery ? (
					<p className="muted">Use letters or numbers to search.</p>
				) : null}
				{searchError ? (
					<p className="error">Search failed: {String(searchError)}</p>
				) : null}
				{safeQuery && results.length === 0 && !searchError ? (
					<p className="muted">No results.</p>
				) : null}
				{safeQuery && results.length > 0 && filteredResults.length === 0 ? (
					<p className="muted">No {searchFilter} results.</p>
				) : null}
				{filteredResults.map((result) => (
					<button
						className="result"
						key={`${result.kind}-${result.refId}`}
						onClick={() => openSearchResult(result)}
					>
						<strong>
							{result.kind}: {result.title}
						</strong>
						<span dangerouslySetInnerHTML={{ __html: result.snippet }} />
					</button>
				))}
			</section>
			<section className="panel timeline-panel">
				<div className="panel-heading">
					<h2>Timeline</h2>
					<button onClick={openNewEventModal}>Add event</button>
				</div>
				<div className="timeline-list">
					{timeline.length ? (
						timeline.map((event) => (
							<div
								className={
									event.sourceParserOutputId ? "event derived" : "event manual"
								}
								key={event.id}
							>
								<button
									onClick={() =>
										event.sourceEvidenceId &&
										onSelectEvidence(event.sourceEvidenceId)
									}
								>
									<time>{new Date(event.timestamp).toLocaleString()}</time>
									<strong>{event.title}</strong>
									<span>
										{event.sourceParserOutputId
											? `${Math.round(event.confidence * 100)}% · derived · source ${event.sourceEvidenceId?.slice(0, 8)}`
											: `manual${event.sourceEvidenceId ? ` · source ${event.sourceEvidenceId.slice(0, 8)}` : ""}`}
									</span>
								</button>
								{!event.sourceParserOutputId ? (
									<div className="event-actions">
										<button onClick={() => editManualEvent(event)}>Edit</button>
										<button
											onClick={() => deleteManualEventMutation.mutate(event.id)}
										>
											Delete
										</button>
									</div>
								) : null}
							</div>
						))
					) : (
						<p className="muted">
							No timeline events yet. Atlas only adds derived events when
							parsers find incident signals such as timestamps, deploys, errors,
							timeouts, or 5xx statuses.
						</p>
					)}
				</div>
				{isEventModalOpen ? (
					<div className="modal-backdrop" onClick={closeEventModal}>
						<div className="modal" onClick={(event) => event.stopPropagation()}>
							<div className="modal-header">
								<h2>{editingEventId ? "Edit event" : "Add event"}</h2>
								<button className="icon-button" onClick={closeEventModal}>
									<X size={14} />
								</button>
							</div>
							<div className="manual-event-form">
								<input
									type="datetime-local"
									value={manualEvent.timestamp}
									onChange={(event) =>
										setManualEvent((value) => ({
											...value,
											timestamp: event.target.value,
										}))
									}
								/>
								<input
									value={manualEvent.title}
									onChange={(event) =>
										setManualEvent((value) => ({
											...value,
											title: event.target.value,
										}))
									}
									placeholder="Manual event title"
								/>
								<textarea
									value={manualEvent.description}
									onChange={(event) =>
										setManualEvent((value) => ({
											...value,
											description: event.target.value,
										}))
									}
									placeholder="What happened?"
								/>
								<select
									value={manualEvent.sourceEvidenceId}
									onChange={(event) =>
										setManualEvent((value) => ({
											...value,
											sourceEvidenceId: event.target.value,
										}))
									}
								>
									<option value="">No source evidence</option>
									{evidence.map((item) => (
										<option value={item.id} key={item.id}>
											{item.source} · {item.kind}
										</option>
									))}
								</select>
								<div className="manual-event-actions">
									<button
										onClick={() => saveManualEventMutation.mutate()}
										disabled={
											!manualEvent.title.trim() || !manualEvent.timestamp
										}
									>
										{editingEventId ? "Update event" : "Add event"}
									</button>
									<button onClick={closeEventModal}>Cancel</button>
								</div>
							</div>
						</div>
					</div>
				) : null}
			</section>
			<section className="panel">
				<h2>Entities</h2>
				{groupedEntities.length ? (
					groupedEntities.map((entity) =>
						entity.sourceEvidenceId ? (
							<button
								className="pill entity-link"
								key={entity.id}
								title="Open source evidence"
								onClick={() => onSelectEvidence(entity.sourceEvidenceId!)}
							>
								{entity.type}: {entity.name}
							</button>
						) : (
							<span className="pill" key={entity.id}>
								{entity.type}: {entity.name}
							</span>
						),
					)
				) : (
					<p className="muted">
						No entities found yet. Try evidence with service names, HTTP
						statuses, deploy refs, or Kubernetes signals.
					</p>
				)}
			</section>
			<section className="panel">
				<h2>
					<Tags size={16} /> Tags
				</h2>
				<div className="tag-input">
					<input
						value={tag}
						onChange={(event) => setTag(event.target.value)}
						placeholder="Add tag"
					/>
					<button
						onClick={() => addTagMutation.mutate()}
						disabled={!tag.trim()}
					>
						Add
					</button>
				</div>
				{tags.length ? (
					tags.map((item) => (
						<span className="pill tag-pill" key={item.id}>
							{item.name}
							<button
								title={`Remove ${item.name}`}
								onClick={() => deleteTagMutation.mutate(item.id)}
							>
								×
							</button>
						</span>
					))
				) : (
					<p className="muted">No tags yet.</p>
				)}
			</section>
		</aside>
	);
}

createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
