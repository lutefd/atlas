import { z } from "zod";

export const evidenceKinds = ["text", "note", "file", "screenshot"] as const;

export const evidenceSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  kind: z.enum(evidenceKinds),
  source: z.string(),
  contentText: z.string().nullable(),
  contentHash: z.string(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  attachmentId: z.string().nullable()
});

export type EvidenceKind = (typeof evidenceKinds)[number];
export type Evidence = z.infer<typeof evidenceSchema>;

export type Incident = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ParsedEntity = {
  type: string;
  value: string;
  confidence: number;
  sourceText: string;
};

export type ParsedTimestamp = {
  value: string;
  raw: string;
  confidence: number;
  offsetStart: number;
  offsetEnd: number;
};

export type ParsedEvent = {
  timestamp: string | null;
  title: string;
  description: string;
  confidence: number;
  sourceText: string;
};

export type ParsedMetric = {
  name: string;
  value: number;
  unit: string | null;
  sourceText: string;
};

export type ParsedReference = {
  kind: string;
  value: string;
  sourceText: string;
};

export type ParsedOutput = {
  entities: ParsedEntity[];
  timestamps: ParsedTimestamp[];
  events: ParsedEvent[];
  metrics: ParsedMetric[];
  references: ParsedReference[];
};

export type TimelineEvent = {
  id: string;
  incidentId: string;
  timestamp: string;
  title: string;
  description: string;
  confidence: number;
  sourceEvidenceId: string | null;
  sourceParserOutputId: string | null;
  createdAt: string;
};

export type Entity = {
  id: string;
  incidentId: string;
  type: string;
  name: string;
  confidence: number;
  sourceEvidenceId: string | null;
  sourceParserOutputId: string | null;
  createdAt: string;
};
