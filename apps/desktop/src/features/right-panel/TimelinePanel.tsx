import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import type { Evidence } from "@atlas/shared";
import {
	createManualTimelineEvent,
	deleteManualTimelineEvent,
	updateManualTimelineEvent,
} from "../../api";
import type { Snapshot } from "../../api";

const quickEvents = [
	{
		title: "Detected",
		description: "Incident detected and investigation started.",
	},
	{
		title: "Mitigation started",
		description: "Mitigation work started.",
	},
	{
		title: "Monitoring",
		description: "Mitigation is in place and the incident is being monitored.",
	},
	{
		title: "Resolved",
		description: "Incident resolved.",
	},
];

export function TimelinePanel({
	incidentId,
	timeline,
	evidence,
	onSelectEvidence,
}: {
	incidentId: string;
	timeline: Snapshot["timelineEvents"];
	evidence: Evidence[];
	onSelectEvidence: (id: string) => void;
}) {
	const queryClient = useQueryClient();
	const [manualEvent, setManualEvent] = useState({
		timestamp: new Date().toISOString().slice(0, 16),
		title: "",
		description: "",
		sourceEvidenceId: "",
	});
	const [editingEventId, setEditingEventId] = useState<string | null>(null);
	const [isEventModalOpen, setIsEventModalOpen] = useState(false);

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
	const quickEventMutation = useMutation({
		mutationFn: (event: (typeof quickEvents)[number]) =>
			createManualTimelineEvent({
				incidentId,
				timestamp: new Date().toISOString(),
				title: event.title,
				description: event.description,
				sourceEvidenceId: null,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});

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

	return (
		<section className="panel timeline-panel">
			<div className="panel-heading">
				<h2>Timeline</h2>
				<button onClick={openNewEventModal}>Add event</button>
			</div>
			<div className="quick-events">
				{quickEvents.map((event) => (
					<button
						disabled={quickEventMutation.isPending}
						key={event.title}
						onClick={() => quickEventMutation.mutate(event)}
					>
						{event.title}
					</button>
				))}
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
						No timeline events yet. Atlas only adds derived events when parsers
						find incident signals such as timestamps, deploys, errors, timeouts,
						or 5xx statuses.
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
									disabled={!manualEvent.title.trim() || !manualEvent.timestamp}
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
	);
}
