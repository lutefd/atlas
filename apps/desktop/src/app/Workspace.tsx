import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, Download, FileText, Inbox } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { Incident } from "@atlas/shared";
import {
	clearEvidenceParsers,
	createIncident,
	deleteIncident,
	exportIncidentToDirectory,
	hasOcr,
	importIncident,
	loadAttachment,
	loadSnapshot,
	renameIncident,
	revealPath,
	saveMarkdownDocument,
	selectExportDirectory,
	selectImportDirectory,
} from "../api";
import { EvidenceDetail } from "../features/evidence/EvidenceDetail";
import { EvidenceInbox } from "../features/evidence/EvidenceInbox";
import { EvidenceStream } from "../features/evidence/EvidenceStream";
import {
	replayEvidenceParsers,
	runOcrForEvidence,
} from "../features/evidence/evidence-ingestion";
import { IncidentRenameInput } from "../features/incidents/IncidentRenameInput";
import { IncidentSidebar } from "../features/incidents/IncidentSidebar";
import { OnCallDashboard } from "../features/incidents/OnCallDashboard";
import {
	buildIncidentMarkdown,
	buildSlackIncidentMessage,
	incidentExportName,
} from "../features/incidents/incident-export";
import { RightPanel } from "../features/right-panel/RightPanel";
import { useUi } from "./ui-store";

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
			<IncidentSidebar
				incidents={incidents}
				activeId={activeId}
				incidentStatus={incidentStatus}
				confirmingIncidentId={confirmingIncidentId}
				editingIncident={editingIncident}
				onSelectIncident={selectIncident}
				onCreateIncident={() =>
					createIncidentMutation.mutate(`Incident ${incidents.length + 1}`)
				}
				onImport={() => void importIncidentFromPath()}
				onStartRename={(id) =>
					setEditingIncident({ id, surface: "sidebar" })
				}
				onSaveRename={(id, title) =>
					renameIncidentMutation.mutate({ id, title })
				}
				onCancelRename={() => setEditingIncident(null)}
				onConfirmDelete={deleteIncidentAfterConfirm}
			/>
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
							<OnCallDashboard incident={active} />
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
