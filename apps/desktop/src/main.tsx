import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { Clipboard, FileText, Inbox, Plus, Search, Tags, Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { deriveEntities, deriveTimelineEvents, parseEvidence } from "@atlas/core";
import type { Evidence, Incident } from "@atlas/shared";
import "./styles.css";

type IncidentRow = Incident & { created_at?: string };
type EvidenceRow = Partial<Evidence> & {
  id: string;
  incident_id?: string;
  content_text?: string | null;
  content_hash?: string;
  created_at?: string;
  metadata_json?: string;
  attachment_id?: string | null;
};

type Snapshot = {
  incidents: IncidentRow[];
  evidence: EvidenceRow[];
  timeline_events: Array<{ id: string; incident_id: string; timestamp: string; title: string; description: string; confidence: number; source_evidence_id: string | null }>;
  entities: Array<{ id: string; incident_id: string; entity_type: string; name: string; confidence: number; source_evidence_id: string | null }>;
  tags: Array<{ id: string; incident_id: string; name: string }>;
};

type SearchResult = { kind: string; refId: string; title: string; snippet: string };
type AttachmentData = { name: string; mime_type: string; base64: string };

const client = new QueryClient();
const useUi = create<{ selectedIncidentId: string | null; selectIncident: (id: string) => void }>((set) => ({ selectedIncidentId: null, selectIncident: (id) => set({ selectedIncidentId: id }) }));

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toCamelEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    incidentId: row.incidentId ?? row.incident_id ?? "",
    kind: row.kind ?? "text",
    source: row.source ?? "unknown",
    contentText: row.contentText ?? row.content_text ?? null,
    contentHash: row.contentHash ?? row.content_hash ?? "",
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
    metadata: parseMetadata(row.metadata ?? row.metadata_json),
    attachmentId: row.attachmentId ?? row.attachment_id ?? null
  };
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.slice(index, index + 8192));
  }
  return btoa(binary);
}

async function ingestEvidence(input: { incidentId: string; kind: string; source: string; text?: string; file?: File }) {
  let attachmentBase64: string | undefined;
  let attachmentName: string | undefined;
  if (input.file) {
    attachmentName = input.file.name;
    attachmentBase64 = await fileToBase64(input.file);
  }
  const evidence = toCamelEvidence(await invoke("add_evidence", { input: { incident_id: input.incidentId, kind: input.kind, source: input.source, content_text: input.text ?? null, metadata_json: JSON.stringify({ fileName: input.file?.name }), attachment_name: attachmentName, attachment_mime_type: input.file?.type || null, attachment_base64: attachmentBase64 } }));
  const outputs = await parseEvidence(evidence);
  for (const output of outputs) {
    const timeline = deriveTimelineEvents(evidence.incidentId, output);
    const entities = deriveEntities(evidence.incidentId, output);
    await invoke("save_parser_output", { input: { id: output.id, evidence_id: output.evidenceId, parser_name: output.parserName, parser_version: output.parserVersion, output_json: JSON.stringify(output.output), timeline_events_json: JSON.stringify(timeline.map((event) => ({ id: event.id, incident_id: event.incidentId, timestamp: event.timestamp, title: event.title, description: event.description, confidence: event.confidence, source_evidence_id: event.sourceEvidenceId, source_parser_output_id: event.sourceParserOutputId }))), entities_json: JSON.stringify(entities.map((entity) => ({ id: entity.id, incident_id: entity.incidentId, entity_type: entity.type, name: entity.name, confidence: entity.confidence, source_evidence_id: entity.sourceEvidenceId, source_parser_output_id: entity.sourceParserOutputId }))) } });
  }
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function App() {
  return <QueryClientProvider client={client}><Workspace /></QueryClientProvider>;
}

function Workspace() {
  const queryClient = useQueryClient();
  const [incidentStatus, setIncidentStatus] = useState<string | null>(null);
  const [confirmingIncidentId, setConfirmingIncidentId] = useState<string | null>(null);
  const selectedIncidentId = useUi((state) => state.selectedIncidentId);
  const selectIncident = useUi((state) => state.selectIncident);
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: () => invoke<Snapshot>("load_snapshot") });
  const incidents = data?.incidents ?? [];
  const activeId = selectedIncidentId ?? incidents[0]?.id ?? null;
  const active = incidents.find((incident) => incident.id === activeId) ?? null;
  const evidence = (data?.evidence ?? []).filter((item) => (item.incidentId ?? item.incident_id) === activeId);
  const timeline = (data?.timeline_events ?? []).filter((item) => item.incident_id === activeId);
  const entities = (data?.entities ?? []).filter((item) => item.incident_id === activeId);
  const tags = (data?.tags ?? []).filter((item) => item.incident_id === activeId);
  const createIncident = useMutation({ mutationFn: (title: string) => invoke<Incident>("create_incident", { title }), onSuccess: (incident) => { selectIncident(incident.id); queryClient.invalidateQueries({ queryKey: ["snapshot"] }); } });
  const deleteIncident = useMutation({ mutationFn: (incidentId: string) => invoke("delete_incident", { incidentId }), onSuccess: () => { useUi.setState({ selectedIncidentId: null }); queryClient.invalidateQueries({ queryKey: ["snapshot"] }); }, onError: (error) => console.error("Failed to delete incident:", error) });
  useEffect(() => {
    if (!incidentStatus && !confirmingIncidentId) return;
    const timeout = window.setTimeout(() => {
      setIncidentStatus(null);
      setConfirmingIncidentId(null);
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [incidentStatus, confirmingIncidentId]);
  async function deleteIncidentAfterConfirm(event: React.MouseEvent, incident: IncidentRow) {
    event.stopPropagation();
    setIncidentStatus(null);
    if (confirmingIncidentId !== incident.id) {
      setConfirmingIncidentId(incident.id);
      setIncidentStatus(`Click confirm to delete ${incident.title}`);
      return;
    }
    try {
      await deleteIncident.mutateAsync(incident.id);
      setConfirmingIncidentId(null);
      setIncidentStatus("Incident deleted");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setIncidentStatus(message);
    }
  }

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand">Atlas</div>
      <button className="primary" onClick={() => createIncident.mutate(`Incident ${incidents.length + 1}`)}><Plus size={16} /> Create incident</button>
      {incidentStatus ? <div className="sidebar-status">{incidentStatus}</div> : null}
      <div className="incident-list">{incidents.map((incident) => <div key={incident.id} className={incident.id === activeId ? "incident active" : "incident"}><button className="incident-select" onClick={() => selectIncident(incident.id)}>{incident.title}<span>{new Date(incident.createdAt ?? incident.created_at ?? new Date().toISOString()).toLocaleString()}</span></button><button className={confirmingIncidentId === incident.id ? "confirm-delete" : "icon-button danger"} title="Delete incident" onClick={(event) => void deleteIncidentAfterConfirm(event, incident)}>{confirmingIncidentId === incident.id ? "Confirm" : <Trash2 size={14} />}</button></div>)}</div>
    </aside>
    {active ? <><section className="center"><h1>{active.title}</h1><EvidenceInbox incidentId={active.id} /><EvidenceStream evidence={evidence.map(toCamelEvidence)} /></section><RightPanel incidentId={active.id} timeline={timeline} entities={entities} tags={tags} /></> : <section className="empty"><Inbox size={40} /><h1>Create an incident workspace</h1><p>Paste logs, notes, screenshots, and files. Atlas keeps raw evidence immutable and derives structure beside it.</p></section>}
  </main>;
}

function EvidenceInbox({ incidentId }: { incidentId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: (payload: { kind: string; source: string; text?: string; file?: File }) => ingestEvidence({ incidentId, ...payload }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["snapshot"] }); } });
  async function addText(kind = "text") {
    if (!text.trim()) return;
    setError(null);
    try {
      await mutation.mutateAsync({ kind, source: kind === "note" ? "quick note" : "paste", text });
      setText("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  async function addFile(file: File, source: string) {
    setError(null);
    try {
      const textContent = file.type.startsWith("text/") ? await file.text() : undefined;
      await mutation.mutateAsync({ kind: file.type.startsWith("image/") ? "screenshot" : "file", source, file, text: textContent });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files);
    const itemFiles = Array.from(event.clipboardData.items).flatMap((item) => {
      if (!item.type.startsWith("image/")) return [];
      const file = item.getAsFile();
      return file ? [file] : [];
    });
    const imageFiles = [...files, ...itemFiles].filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    imageFiles.forEach((file, index) => {
      const namedFile = new File([file], file.name || `clipboard-image-${Date.now()}-${index}.png`, { type: file.type || "image/png" });
      void addFile(namedFile, "clipboard");
    });
  }
  return <div className="inbox" onPasteCapture={handlePaste} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); Array.from(event.dataTransfer.files).forEach((file) => void addFile(file, "drop")); }}>
    <div className="drop-label">Paste / drop anything here</div>
    <CodeMirror value={text} height="180px" placeholder="Paste logs, Slack snippets, commands, notes, or incident observations..." onChange={setText} />
    <div className="actions"><button onClick={() => addText("text")}>Save evidence</button><button onClick={() => addText("note")}>Save quick note</button><span>{mutation.isPending ? "Ingesting and parsing..." : "Deterministic parsers run after save"}</span></div>
    {error ? <div className="error">{error}</div> : null}
  </div>;
}

function EvidenceStream({ evidence }: { evidence: Evidence[] }) {
  return <section className="evidence-section"><h2>Evidence</h2><div className="stream">{evidence.map((item) => <EvidenceCard item={item} key={item.id} />)}</div></section>;
}

function EvidenceCard({ item }: { item: Evidence }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { data: attachment } = useQuery({ queryKey: ["attachment", item.id], queryFn: () => invoke<AttachmentData | null>("load_attachment", { evidenceId: item.id }), enabled: Boolean(item.attachmentId) });
  const deleteEvidence = useMutation({ mutationFn: () => invoke("delete_evidence", { evidenceId: item.id }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["snapshot"] }); queryClient.removeQueries({ queryKey: ["attachment", item.id] }); }, onError: (error) => console.error("Failed to delete evidence:", error) });
  const attachmentUrl = attachment ? `data:${attachment.mime_type};base64,${attachment.base64}` : null;
  const isImageAttachment = Boolean(attachmentUrl && attachment?.mime_type.startsWith("image/"));
  useEffect(() => {
    if (!status && !isConfirmingDelete) return;
    const timeout = window.setTimeout(() => {
      setStatus(null);
      setIsConfirmingDelete(false);
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [status, isConfirmingDelete]);
  async function copyEvidence() {
    setStatus(null);
    try {
      if (attachment && isImageAttachment) {
        await navigator.clipboard.write([new ClipboardItem({ [attachment.mime_type]: base64ToBlob(attachment.base64, attachment.mime_type) })]);
        setStatus("Image copied");
        return;
      }
      await navigator.clipboard.writeText(item.contentText || attachment?.name || "");
      setStatus(item.contentText ? "Text copied" : "Attachment name copied");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Copy failed");
    }
  }
  async function deleteEvidenceAfterConfirm(event: React.MouseEvent) {
    event.stopPropagation();
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      setStatus("Click confirm to delete this evidence");
      return;
    }
    try {
      await deleteEvidence.mutateAsync();
      setStatus("Evidence deleted");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }
  return <article className="card">
    <div className="card-header"><div className="card-meta"><FileText size={14} />{item.kind} · {item.source} · {new Date(item.createdAt).toLocaleString()}</div><div className="card-actions"><button className="icon-button" title="Copy evidence" onClick={copyEvidence}><Clipboard size={14} /></button><button className={isConfirmingDelete ? "confirm-delete" : "icon-button danger"} title="Delete evidence" onClick={(event) => void deleteEvidenceAfterConfirm(event)}>{isConfirmingDelete ? "Confirm" : <Trash2 size={14} />}</button></div></div>
    {attachmentUrl && attachment && isImageAttachment ? <img className="attachment-preview" src={attachmentUrl} alt={attachment.name} /> : null}
    {attachmentUrl && attachment && !isImageAttachment ? <a className="attachment-link" href={attachmentUrl} download={attachment.name}>{attachment.name}</a> : null}
    <pre>{item.contentText || (item.attachmentId ? "Attachment stored locally" : "")}</pre>
    {status ? <div className="copy-status">{status}</div> : null}
    <code>{item.contentHash.slice(0, 16)}</code>
  </article>;
}

function RightPanel({ incidentId, timeline, entities, tags }: { incidentId: string; timeline: Snapshot["timeline_events"]; entities: Snapshot["entities"]; tags: Snapshot["tags"] }) {
  const queryClient = useQueryClient();
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const { data: results = [] } = useQuery({ queryKey: ["search", incidentId, query], queryFn: () => query.trim() ? invoke<SearchResult[]>("search", { incidentId, query }) : Promise.resolve([]), enabled: Boolean(query.trim()) });
  const addTag = useMutation({ mutationFn: () => invoke("add_tag", { incidentId, name: tag }), onSuccess: () => { setTag(""); queryClient.invalidateQueries({ queryKey: ["snapshot"] }); } });
  const groupedEntities = useMemo(() => entities.slice(0, 20), [entities]);
  return <aside className="right">
    <section className="panel"><h2><Search size={16} /> Search</h2><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search evidence, events, entities" />{results.map((result) => <div className="result" key={`${result.kind}-${result.refId}`}><strong>{result.kind}: {result.title}</strong><span dangerouslySetInnerHTML={{ __html: result.snippet }} /></div>)}</section>
    <section className="panel"><h2>Timeline</h2>{timeline.map((event) => <div className="event" key={event.id}><time>{new Date(event.timestamp).toLocaleString()}</time><strong>{event.title}</strong><span>{Math.round(event.confidence * 100)}% · source {event.source_evidence_id?.slice(0, 8)}</span></div>)}</section>
    <section className="panel"><h2>Entities</h2>{groupedEntities.map((entity) => <span className="pill" key={entity.id}>{entity.entity_type}: {entity.name}</span>)}</section>
    <section className="panel"><h2><Tags size={16} /> Tags</h2><div className="tag-input"><input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Add tag" /><button onClick={() => addTag.mutate()}>Add</button></div>{tags.map((item) => <span className="pill" key={item.id}>{item.name}</span>)}</section>
  </aside>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
