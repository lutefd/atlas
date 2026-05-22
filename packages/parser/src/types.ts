import type { Evidence, ParsedOutput } from "@atlas/shared";

export type EvidenceInput = Pick<
	Evidence,
	"id" | "kind" | "source" | "contentText" | "metadata"
>;

export interface EvidenceParser {
	name: string;
	version: string;
	canParse(input: EvidenceInput): boolean;
	parse(input: EvidenceInput): Promise<ParsedOutput>;
}
