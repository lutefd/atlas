import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
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
import type { Evidence, Incident } from "@atlas/shared";
import {
	addTag,
	clearEvidenceParsers,
	createIncident,
	createManualTimelineEvent,
	deleteIncident,
	deleteManualTimelineEvent,
	deleteTag,
	exportIncidentToDirectory,
	hasOcr,
	importIncident,
	loadAttachment,
	loadSnapshot,
	renameIncident,
	revealPath,
	saveMarkdownDocument,
	search,
	selectExportDirectory,
	selectImportDirectory,
	updateManualTimelineEvent,
	type SearchResult,
	type Snapshot,
} from "../api";
import { EvidenceDetail } from "../features/evidence/EvidenceDetail";
import { EvidenceInbox } from "../features/evidence/EvidenceInbox";
import { EvidenceStream } from "../features/evidence/EvidenceStream";
import {
	replayEvidenceParsers,
	runOcrForEvidence,
} from "../features/evidence/evidence-ingestion";
import {
	buildIncidentMarkdown,
	buildSlackIncidentMessage,
	incidentExportName,
} from "../features/incidents/incident-export";
import { sanitizeFtsQuery } from "../lib/search";
import { useUi } from "./ui-store";

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

export function Workspace() {
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

