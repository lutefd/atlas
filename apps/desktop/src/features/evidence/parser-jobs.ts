import type { Evidence } from "@atlas/shared";
import type { Job, Snapshot } from "../../api";

export function getParserJob(evidenceId: string, jobs: Job[]) {
	return (
		jobs.find(
			(job) => job.kind === "parser" && job.payload.evidenceId === evidenceId,
		) ?? null
	);
}

export function getParseStatus(evidence: Evidence, snapshot: Snapshot) {
	if (
		snapshot.parserOutputs.some((output) => output.evidenceId === evidence.id)
	)
		return "parsed";
	const job = getParserJob(evidence.id, snapshot.jobs);
	if (job?.status === "failed") return "failed";
	if (job?.status === "running") return "running";
	return "unparsed";
}
