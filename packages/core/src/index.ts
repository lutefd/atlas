import { parsers } from "@atlas/parser";
import type { Entity, Evidence, Incident, ParsedOutput, TimelineEvent } from "@atlas/shared";

export type ParserOutputRecord = {
  id: string;
  evidenceId: string;
  parserName: string;
  parserVersion: string;
  output: ParsedOutput;
  createdAt: string;
};

export type IncidentSnapshot = {
  incidents: Incident[];
  evidence: Evidence[];
  timelineEvents: TimelineEvent[];
  entities: Entity[];
};

export async function parseEvidence(evidence: Evidence): Promise<ParserOutputRecord[]> {
  const outputs: ParserOutputRecord[] = [];
  for (const parser of parsers) {
    if (!parser.canParse(evidence)) continue;
    outputs.push({
      id: crypto.randomUUID(),
      evidenceId: evidence.id,
      parserName: parser.name,
      parserVersion: parser.version,
      output: await parser.parse(evidence),
      createdAt: new Date().toISOString()
    });
  }
  return outputs;
}

export function deriveTimelineEvents(incidentId: string, parserOutput: ParserOutputRecord): TimelineEvent[] {
  return parserOutput.output.events.flatMap((event) => {
    if (!event.timestamp) return [];
    return [{
      id: crypto.randomUUID(),
      incidentId,
      timestamp: event.timestamp,
      title: event.title,
      description: event.description,
      confidence: event.confidence,
      sourceEvidenceId: parserOutput.evidenceId,
      sourceParserOutputId: parserOutput.id,
      createdAt: new Date().toISOString()
    }];
  });
}

export function deriveEntities(incidentId: string, parserOutput: ParserOutputRecord): Entity[] {
  const seen = new Set<string>();
  return parserOutput.output.entities.flatMap((entity) => {
    const key = `${entity.type}:${entity.value}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: crypto.randomUUID(),
      incidentId,
      type: entity.type,
      name: entity.value,
      confidence: entity.confidence,
      sourceEvidenceId: parserOutput.evidenceId,
      sourceParserOutputId: parserOutput.id,
      createdAt: new Date().toISOString()
    }];
  });
}
