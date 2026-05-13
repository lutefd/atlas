import type { Evidence, ParsedEntity, ParsedEvent, ParsedOutput, ParsedReference, ParsedTimestamp } from "@atlas/shared";

export type EvidenceInput = Pick<Evidence, "id" | "kind" | "source" | "contentText" | "metadata">;

export interface EvidenceParser {
  name: string;
  version: string;
  canParse(input: EvidenceInput): boolean;
  parse(input: EvidenceInput): Promise<ParsedOutput>;
}

const emptyOutput = (): ParsedOutput => ({ entities: [], timestamps: [], events: [], metrics: [], references: [] });

const isoTimestamp = /\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const unixTimestamp = /\b1[6-9]\d{8}(?:\.\d{3})?\b/g;
const logTimestamp = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/g;
const signalWords = /\b(deployed|deploy|rollback|rolled back|error|exception|timeout|5\d\d|latency|OOMKilled|CrashLoopBackOff|failed|panic)\b/i;
const servicePatterns = [/\bservice=([a-z0-9][a-z0-9._-]+)/gi, /\bapp=([a-z0-9][a-z0-9._-]+)/gi, /\[([a-z][a-z0-9-]{2,})\]/gi];
const httpPattern = /\b([1-5]\d\d)\b/g;
const deployPattern = /\b(?:deploy(?:ed|ment)?|release|version)[:=\s]+([a-z0-9._/-]+)\b/gi;

function parseTimestamp(raw: string): string | null {
  const normalized = raw.includes(" ") && /^\d{4}-/.test(raw) ? raw.replace(" ", "T") : raw;
  const date = /^\d{10}(?:\.\d{3})?$/.test(raw) ? new Date(Number(raw) * 1000) : new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function collectTimestamps(text: string): ParsedTimestamp[] {
  return [isoTimestamp, unixTimestamp, logTimestamp].flatMap((pattern) => {
    pattern.lastIndex = 0;
    return Array.from(text.matchAll(pattern)).flatMap((match) => {
      const raw = match[0];
      const value = parseTimestamp(raw);
      if (!value) return [];
      return [{ value, raw, confidence: 0.9, offsetStart: match.index ?? 0, offsetEnd: (match.index ?? 0) + raw.length }];
    });
  });
}

function collectEntities(text: string): ParsedEntity[] {
  const entities: ParsedEntity[] = [];
  for (const pattern of servicePatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      entities.push({ type: "service", value: match[1], confidence: 0.75, sourceText: match[0] });
    }
  }
  httpPattern.lastIndex = 0;
  for (const match of text.matchAll(httpPattern)) {
    entities.push({ type: "http_status", value: match[1], confidence: 0.65, sourceText: match[0] });
  }
  return entities;
}

function collectReferences(text: string): ParsedReference[] {
  deployPattern.lastIndex = 0;
  return Array.from(text.matchAll(deployPattern)).map((match) => ({ kind: "deploy", value: match[1], sourceText: match[0] }));
}

function collectEvents(text: string, timestamps: ParsedTimestamp[]): ParsedEvent[] {
  return text.split(/\r?\n/).flatMap((line) => {
    if (!signalWords.test(line)) return [];
    const timestamp = timestamps.find((candidate) => line.includes(candidate.raw));
    return [{
      timestamp: timestamp?.value ?? null,
      title: line.replace(/^\s+|\s+$/g, "").slice(0, 96),
      description: line.trim(),
      confidence: timestamp ? 0.8 : 0.55,
      sourceText: line
    }];
  });
}

export const genericLogParser: EvidenceParser = {
  name: "generic-log-parser",
  version: "0.1.0",
  canParse: (input) => Boolean(input.contentText),
  async parse(input) {
    if (!input.contentText) return emptyOutput();
    const timestamps = collectTimestamps(input.contentText);
    return {
      entities: collectEntities(input.contentText),
      timestamps,
      events: collectEvents(input.contentText, timestamps),
      metrics: [],
      references: collectReferences(input.contentText)
    };
  }
};

export const parsers = [genericLogParser];
