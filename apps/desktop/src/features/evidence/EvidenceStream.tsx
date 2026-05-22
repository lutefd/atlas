import type { Evidence } from "@atlas/shared";
import type { Snapshot } from "../../api";
import { EvidenceCard } from "./EvidenceCard";
import { getParseStatus } from "./parser-jobs";

export function EvidenceStream({
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
