import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Incident } from "@atlas/shared";
import { updateIncidentOps } from "../../api";

const statuses = ["investigating", "mitigating", "monitoring", "resolved"];
const severities = ["unknown", "sev1", "sev2", "sev3", "sev4"];

export function OnCallDashboard({ incident }: { incident: Incident }) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState({
		status: incident.status,
		severity: incident.severity,
		impact: incident.impact,
		mitigation: incident.mitigation,
		pendingActions: incident.pendingActions,
	});
	const [statusText, setStatusText] = useState<string | null>(null);
	const isDirty =
		draft.status !== incident.status ||
		draft.severity !== incident.severity ||
		draft.impact !== incident.impact ||
		draft.mitigation !== incident.mitigation ||
		draft.pendingActions !== incident.pendingActions;

	useEffect(() => {
		setDraft({
			status: incident.status,
			severity: incident.severity,
			impact: incident.impact,
			mitigation: incident.mitigation,
			pendingActions: incident.pendingActions,
		});
	}, [incident]);

	const mutation = useMutation({
		mutationFn: () =>
			updateIncidentOps({
				incidentId: incident.id,
				...draft,
			}),
		onSuccess: () => {
			setStatusText("On-call snapshot saved");
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
		onError: (error) => {
			setStatusText(error instanceof Error ? error.message : String(error));
		},
	});

	return (
		<section className="on-call-dashboard">
			<div className="dashboard-heading">
				<div>
					<span>On-call snapshot</span>
					<h2>{incident.status.replace("-", " ")}</h2>
				</div>
				<div className="dashboard-badges">
					<strong>{incident.severity.toUpperCase()}</strong>
					<span>
						Updated {new Date(incident.updatedAt).toLocaleTimeString()}
					</span>
				</div>
			</div>
			<div className="dashboard-grid">
				<label>
					Status
					<select
						value={draft.status}
						onChange={(event) =>
							setDraft((value) => ({ ...value, status: event.target.value }))
						}
					>
						{statuses.map((status) => (
							<option value={status} key={status}>
								{status}
							</option>
						))}
					</select>
				</label>
				<label>
					Severity
					<select
						value={draft.severity}
						onChange={(event) =>
							setDraft((value) => ({ ...value, severity: event.target.value }))
						}
					>
						{severities.map((severity) => (
							<option value={severity} key={severity}>
								{severity.toUpperCase()}
							</option>
						))}
					</select>
				</label>
			</div>
			<label>
				Impact
				<textarea
					value={draft.impact}
					placeholder="Who or what is affected? Include customer-visible symptoms."
					onChange={(event) =>
						setDraft((value) => ({ ...value, impact: event.target.value }))
					}
				/>
			</label>
			<label>
				Mitigation
				<textarea
					value={draft.mitigation}
					placeholder="Current mitigation, rollback, workaround, or monitoring state."
					onChange={(event) =>
						setDraft((value) => ({ ...value, mitigation: event.target.value }))
					}
				/>
			</label>
			<label>
				Pending actions
				<textarea
					value={draft.pendingActions}
					placeholder="Next checks, owners, comms, follow-ups, or handoff notes."
					onChange={(event) =>
						setDraft((value) => ({
							...value,
							pendingActions: event.target.value,
						}))
					}
				/>
			</label>
			<div className="dashboard-actions">
				<button
					disabled={!isDirty || mutation.isPending}
					onClick={() => mutation.mutate()}
				>
					{mutation.isPending ? "Saving..." : "Save snapshot"}
				</button>
				{statusText ? <span>{statusText}</span> : null}
			</div>
		</section>
	);
}
