import { useMemo } from "react";
import type { Snapshot } from "../../api";

export function EntitiesPanel({
	entities,
	onSelectEvidence,
}: {
	entities: Snapshot["entities"];
	onSelectEvidence: (id: string) => void;
}) {
	const groupedEntities = useMemo(() => entities.slice(0, 20), [entities]);
	return (
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
	);
}
