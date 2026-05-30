import type { Evidence, Incident } from "@atlas/shared";
import type { Snapshot } from "../../api";
import { EntitiesPanel } from "./EntitiesPanel";
import { SearchPanel } from "./SearchPanel";
import { TagsPanel } from "./TagsPanel";
import { TimelinePanel } from "./TimelinePanel";

export function RightPanel({
	incidentId,
	incident,
	timeline,
	entities,
	tags,
	evidence,
	onSelectEvidence,
}: {
	incidentId: string;
	incident: Incident;
	timeline: Snapshot["timelineEvents"];
	entities: Snapshot["entities"];
	tags: Snapshot["tags"];
	evidence: Evidence[];
	onSelectEvidence: (id: string) => void;
}) {
	return (
		<aside className="right">
			<SearchPanel
				incidentId={incidentId}
				timeline={timeline}
				entities={entities}
				onSelectEvidence={onSelectEvidence}
			/>
			<TimelinePanel
				incidentId={incidentId}
				incident={incident}
				timeline={timeline}
				evidence={evidence}
				onSelectEvidence={onSelectEvidence}
			/>
			<EntitiesPanel entities={entities} onSelectEvidence={onSelectEvidence} />
			<TagsPanel incidentId={incidentId} tags={tags} />
		</aside>
	);
}
