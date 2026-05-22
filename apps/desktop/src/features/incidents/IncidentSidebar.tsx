import { Pencil, Plus, Trash2 } from "lucide-react";
import React from "react";
import type { Incident } from "@atlas/shared";
import { IncidentRenameInput } from "./IncidentRenameInput";

export function IncidentSidebar({
	incidents,
	activeId,
	incidentStatus,
	confirmingIncidentId,
	editingIncident,
	onSelectIncident,
	onCreateIncident,
	onImport,
	onStartRename,
	onSaveRename,
	onCancelRename,
	onConfirmDelete,
}: {
	incidents: Incident[];
	activeId: string | null;
	incidentStatus: string | null;
	confirmingIncidentId: string | null;
	editingIncident: { id: string; surface: "sidebar" | "header" } | null;
	onSelectIncident: (id: string) => void;
	onCreateIncident: () => void;
	onImport: () => void;
	onStartRename: (id: string) => void;
	onSaveRename: (id: string, title: string) => void;
	onCancelRename: () => void;
	onConfirmDelete: (event: React.MouseEvent, incident: Incident) => void;
}) {
	return (
		<aside className="sidebar">
			<div className="brand">Atlas</div>
			<button className="primary" onClick={onCreateIncident}>
				<Plus size={16} /> Create incident
			</button>
			<div className="import-box">
				<button onClick={onImport}>Import</button>
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
									onSave={(title) => onSaveRename(incident.id, title)}
									onCancel={onCancelRename}
								/>
							) : (
								<button
									className="incident-select"
									onClick={() => onSelectIncident(incident.id)}
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
											onStartRename(incident.id);
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
										onClick={(event) => onConfirmDelete(event, incident)}
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
	);
}
