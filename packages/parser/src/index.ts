export type { EvidenceInput, EvidenceParser } from "./types";
export { genericLogParser } from "./text-parser";
import { genericLogParser } from "./text-parser";

export const parsers = [genericLogParser];
