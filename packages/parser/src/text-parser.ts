import type { ParsedOutput } from "@atlas/shared";
import type { EvidenceInput, EvidenceParser } from "./types";
import {
	collectEntities,
	collectEvents,
	collectMetrics,
	collectReferences,
	collectTimestamps,
} from "./collectors";

const emptyOutput = (): ParsedOutput => ({
	entities: [],
	timestamps: [],
	events: [],
	metrics: [],
	references: [],
});

export const genericLogParser: EvidenceParser = {
	name: "generic-log-parser",
	version: "0.1.0",
	canParse: (input) => Boolean(input.contentText),
	async parse(input: EvidenceInput) {
		if (!input.contentText) return emptyOutput();
		const timestamps = collectTimestamps(input.contentText);
		return {
			entities: collectEntities(input.contentText),
			timestamps,
			events: collectEvents(input.contentText, timestamps),
			metrics: collectMetrics(input.contentText),
			references: collectReferences(input.contentText),
		};
	},
};
