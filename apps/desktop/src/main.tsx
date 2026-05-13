import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { Clipboard, FileText, Inbox, Pencil, Plus, Search, Tags, Trash2, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { deriveEntities, deriveTimelineEvents, parseEvidence } from "@atlas/core";
import type { Evidence, Incident } from "@atlas/shared";
import { addEvidence, addTag, clearEvidenceParsers, createIncident, deleteEvidence, deleteIncident, deleteTag, loadAttachment, loadSnapshot, renameIncident, saveParserOutput, search, type SearchResult, type Snapshot } from "./api";
import "./styles.css";

const client = new QueryClient();
const useUi = create<{ selectedIncidentId: string | null; selectedEvidenceId: string | null; selectIncident: (id: string) => void; selectEvidence: (id: string | null) => void }>((set) => ({ selectedIncidentId: null, selectedEvidenceId: null, selectIncident: (id) => set({ selectedIncidentId: id, selectedEvidenceId: null }), selectEvidence: (id) => set({ selectedEvidenceId: id }) }));

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
  const evidence = await addEvidence({ incidentId: input.incidentId, kind: input.kind as Evidence["kind"], source: input.source, text: input.text, metadata: { fileName: input.file?.name }, attachmentName, attachmentMimeType: input.file?.type || null, attachmentBase64 });
  const outputs = await parseEvidence(evidence);
  for (const output of outputs) {
    const timeline = deriveTimelineEvents(evidence.incidentId, output);
    const entities = deriveEntities(evidence.incidentId, output);
    await saveParserOutput({ id: output.id, evidenceId: output.evidenceId, parserName: output.parserName, parserVersion: output.parserVersion, output: output.output, timelineEvents: timeline, entities });
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
  const selectedEvidenceId = useUi((state) => state.selectedEvidenceId);
  const selectIncident = useUi((state) => state.selectIncident);
  const selectEvidence = useUi((state) => state.selectEvidence);
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: loadSnapshot });
  const incidents = data?.incidents ?? [];
  const activeId = selectedIncidentId ?? incidents[0]?.id ?? null;
  const active = incidents.find((incident) => incident.id === activeId) ?? null;
  const evidence = (data?.evidence ?? []).filter((item) => item.incidentId === activeId);
  const timeline = (data?.timelineEvents ?? []).filter((item) => item.incidentId === activeId);
  const entities = (data?.entities ?? []).filter((item) => item.incidentId === activeId);
  const tags = (data?.tags ?? []).filter((item) => item.incidentId === activeId);
  const selectedEvidence = evidence.find((item) => item.id === selectedEvidenceId) ?? null;
  const [editingIncident, setEditingIncident] = useState<{ id: string; surface: "sidebar" | "header" } | null>(null);
  const createIncidentMutation = useMutation({ mutationFn: createIncident, onSuccess: (incident) => { selectIncident(incident.id); queryClient.invalidateQueries({ queryKey: ["snapshot"] }); } });
  const deleteIncidentMutation = useMutation({ mutationFn: deleteIncident, onSuccess: () => { useUi.setState({ selectedIncidentId: null, selectedEvidenceId: null }); queryClient.invalidateQueries({ queryKey: ["snapshot"] }); }, onError: (error) => console.error("Failed to delete incident:", error) });
  const renameIncidentMutation = useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => renameIncident(id, title), onSuccess: () => { setEditingIncident(null); queryClient.invalidateQueries({ queryKey: ["snapshot"] }); }, onError: (error) => console.error("Failed to rename incident:", error) });
  useEffect(() => {
    if (!incidentStatus && !confirmingIncidentId) return;
    const timeout = window.setTimeout(() => {
      setIncidentStatus(null);
      setConfirmingIncidentId(null);
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [incidentStatus, confirmingIncidentId]);
  async function deleteIncidentAfterConfirm(event: React.MouseEvent, incident: Incident) {
    event.stopPropagation();
    setIncidentStatus(null);
    if (confirmingIncidentId !== incident.id) {
      setConfirmingIncidentId(incident.id);
      setIncidentStatus(`Click confirm to delete ${incident.title}`);
      return;
    }
    try {
      await deleteIncidentMutation.mutateAsync(incident.id);
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
      <button className="primary" onClick={() => createIncidentMutation.mutate(`Incident ${incidents.length + 1}`)}><Plus size={16} /> Create incident</button>
      {incidentStatus ? <div className="sidebar-status">{incidentStatus}</div> : null}
      <div className="incident-list">{incidents.map((incident) => {
        const isEditing = editingIncident?.id === incident.id && editingIncident.surface === "sidebar";
        return <div key={incident.id} className={incident.id === activeId ? "incident active" : "incident"}>
          {isEditing ? <IncidentRenameInput initialTitle={incident.title} onSave={(title) => renameIncidentMutation.mutate({ id: incident.id, title })} onCancel={() => setEditingIncident(null)} /> : <button className="incident-select" onClick={() => selectIncident(incident.id)}>{incident.title}<span>{new Date(incident.createdAt).toLocaleString()}</span></button>}
          {!isEditing && <div className="incident-actions">
            <button className="icon-button" title="Rename incident" onClick={(event) => { event.stopPropagation(); setEditingIncident({ id: incident.id, surface: "sidebar" }); }}><Pencil size={14} /></button>
            <button className={confirmingIncidentId === incident.id ? "confirm-delete" : "icon-button danger"} title="Delete incident" onClick={(event) => void deleteIncidentAfterConfirm(event, incident)}>{confirmingIncidentId === incident.id ? "Confirm" : <Trash2 size={14} />}</button>
          </div>}
        </div>;
      })}</div>
    </aside>
    {active && data ? <><section className="center">{editingIncident?.id === active.id && editingIncident.surface === "header" ? <IncidentRenameInput className="header-rename" initialTitle={active.title} onSave={(title) => renameIncidentMutation.mutate({ id: active.id, title })} onCancel={() => setEditingIncident(null)} /> : <h1 onDoubleClick={() => setEditingIncident({ id: active.id, surface: "header" })} title="Double-click to rename">{active.title}</h1>}<EvidenceInbox incidentId={active.id} /><EvidenceStream evidence={evidence} selectedEvidenceId={selectedEvidenceId} onSelectEvidence={selectEvidence} parserOutputs={data?.parserOutputs ?? []} /></section><RightPanel incidentId={active.id} timeline={timeline} entities={entities} tags={tags} onSelectEvidence={selectEvidence} />{selectedEvidence ? <EvidenceDetail item={selectedEvidence} snapshot={data} onClose={() => selectEvidence(null)} /> : null}</> : <section className="empty"><Inbox size={40} /><h1>Create an incident workspace</h1><p>Paste logs, notes, screenshots, and files. Atlas keeps raw evidence immutable and derives structure beside it.</p></section>}
  </main>;
}

function IncidentRenameInput({ initialTitle, onSave, onCancel, className = "incident-rename" }: { initialTitle: string; onSave: (title: string) => void; onCancel: () => void; className?: string }) {
  const [value, setValue] = useState(initialTitle);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const didFocus = React.useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    didFocus.current = true;
  }, []);

  return <input ref={inputRef} className={className} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSave(value); } if (e.key === "Escape") onCancel(); }} onBlur={() => { if (!didFocus.current) return; if (value.trim() !== initialTitle.trim()) onSave(value); else onCancel(); }} />;
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

function EvidenceStream({ evidence, selectedEvidenceId, onSelectEvidence, parserOutputs }: { evidence: Evidence[]; selectedEvidenceId: string | null; onSelectEvidence: (id: string) => void; parserOutputs: Snapshot["parserOutputs"] }) {
  return <section className="evidence-section"><h2>Evidence</h2><div className="stream">{evidence.map((item) => <EvidenceCard item={item} key={item.id} isSelected={item.id === selectedEvidenceId} onSelect={() => onSelectEvidence(item.id)} isParsed={parserOutputs.some((output) => output.evidenceId === item.id)} />)}</div></section>;
}

function EvidenceCard({ item, isSelected, onSelect, isParsed }: { item: Evidence; isSelected: boolean; onSelect: () => void; isParsed: boolean }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { data: attachment } = useQuery({ queryKey: ["attachment", item.id], queryFn: () => loadAttachment(item.id), enabled: Boolean(item.attachmentId) });
  const deleteEvidenceMutation = useMutation({ mutationFn: () => deleteEvidence(item.id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["snapshot"] }); queryClient.removeQueries({ queryKey: ["attachment", item.id] }); }, onError: (error) => console.error("Failed to delete evidence:", error) });
  const attachmentUrl = attachment ? `data:${attachment.mimeType};base64,${attachment.base64}` : null;
  const isImageAttachment = Boolean(attachmentUrl && attachment?.mimeType.startsWith("image/"));
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
        await navigator.clipboard.write([new ClipboardItem({ [attachment.mimeType]: base64ToBlob(attachment.base64, attachment.mimeType) })]);
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
      await deleteEvidenceMutation.mutateAsync();
      setStatus("Evidence deleted");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }
  return <article className={isSelected ? "card selected" : "card"} onClick={onSelect}>
    <div className="card-header"><div className="card-meta"><FileText size={14} />{item.kind} · {item.source} · {new Date(item.createdAt).toLocaleString()}<span className={isParsed ? "parse-dot parsed" : "parse-dot"} title={isParsed ? "Parsed" : "Unparsed"} /></div><div className="card-actions"><button className="icon-button" title="Copy evidence" onClick={(event) => { event.stopPropagation(); void copyEvidence(); }}><Clipboard size={14} /></button><button className={isConfirmingDelete ? "confirm-delete" : "icon-button danger"} title="Delete evidence" onClick={(event) => void deleteEvidenceAfterConfirm(event)}>{isConfirmingDelete ? "Confirm" : <Trash2 size={14} />}</button></div></div>
    {attachmentUrl && attachment && isImageAttachment ? <img className="attachment-preview" src={attachmentUrl} alt={attachment.name} /> : null}
    {attachmentUrl && attachment && !isImageAttachment ? <a className="attachment-link" href={attachmentUrl} download={attachment.name}>{attachment.name}</a> : null}
    <pre>{item.contentText || (item.attachmentId ? "Attachment stored locally" : "")}</pre>
    {status ? <div className="copy-status">{status}</div> : null}
    <code>{item.contentHash.slice(0, 16)}</code>
  </article>;
}

function EvidenceDetail({ item, snapshot, onClose }: { item: Evidence; snapshot: Snapshot; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [isReplaying, setIsReplaying] = useState(false);
  const parserOutputs = snapshot.parserOutputs.filter((output) => output.evidenceId === item.id);
  const timeline = snapshot.timelineEvents.filter((event) => event.sourceEvidenceId === item.id);
  const entities = snapshot.entities.filter((entity) => entity.sourceEvidenceId === item.id);
  const { data: attachment } = useQuery({ queryKey: ["attachment", item.id], queryFn: () => loadAttachment(item.id), enabled: Boolean(item.attachmentId) });
  const attachmentUrl = attachment ? `data:${attachment.mimeType};base64,${attachment.base64}` : null;
  const canReplay = Boolean(item.contentText);
  async function handleReplay() {
    if (!canReplay || isReplaying) return;
    setIsReplaying(true);
    try {
      await clearEvidenceParsers(item.id);
      const outputs = await parseEvidence(item);
      for (const output of outputs) {
        const derivedTimeline = deriveTimelineEvents(item.incidentId, output);
        const derivedEntities = deriveEntities(item.incidentId, output);
        await saveParserOutput({ id: output.id, evidenceId: output.evidenceId, parserName: output.parserName, parserVersion: output.parserVersion, output: output.output, timelineEvents: derivedTimeline, entities: derivedEntities });
      }
      queryClient.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (caught) {
      console.error("Replay failed:", caught);
    } finally {
      setIsReplaying(false);
    }
  }
  return <aside className="detail-drawer">
    <div className="detail-header"><div><h2>Evidence detail</h2><strong>{item.kind} from {item.source}</strong></div><div className="detail-actions">{canReplay && <button className="icon-button" title="Re-run parser" disabled={isReplaying} onClick={() => void handleReplay()}>{isReplaying ? "..." : "↻"}</button>}<button className="icon-button" title="Close detail" onClick={onClose}><X size={14} /></button></div></div>
    {attachmentUrl && attachment?.mimeType.startsWith("image/") ? <img className="attachment-preview" src={attachmentUrl} alt={attachment.name} /> : null}
    {attachmentUrl && attachment && !attachment.mimeType.startsWith("image/") ? <a className="attachment-link" href={attachmentUrl} download={attachment.name}>{attachment.name}</a> : null}
    <section><h3>Raw evidence</h3><pre>{item.contentText || (item.attachmentId ? "Attachment stored locally" : "")}</pre></section>
    <section><h3>Parser outputs</h3>{parserOutputs.length ? parserOutputs.map((output) => <details key={output.id} open><summary>{output.parserName} v{output.parserVersion}</summary><pre>{JSON.stringify(output.output, null, 2)}</pre></details>) : <p className="muted">No parser output for this evidence.</p>}</section>
    <section><h3>Derived timeline</h3>{timeline.length ? timeline.map((event) => <div className="detail-row" key={event.id}><strong>{event.title}</strong><span>{new Date(event.timestamp).toLocaleString()} · {Math.round(event.confidence * 100)}%</span></div>) : <p className="muted">No timeline events derived from this evidence.</p>}</section>
    <section><h3>Derived entities</h3>{entities.length ? entities.map((entity) => <span className="pill" key={entity.id}>{entity.type}: {entity.name}</span>) : <p className="muted">No entities derived from this evidence.</p>}</section>
    <section><h3>Metadata</h3><pre>{JSON.stringify({ id: item.id, contentHash: item.contentHash, createdAt: item.createdAt, metadata: item.metadata }, null, 2)}</pre></section>
  </aside>;
}

function sanitizeFtsQuery(value: string) {
  return value.trim().split(/\s+/).map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, "")).filter(Boolean).join(" ");
}

function RightPanel({ incidentId, timeline, entities, tags, onSelectEvidence }: { incidentId: string; timeline: Snapshot["timelineEvents"]; entities: Snapshot["entities"]; tags: Snapshot["tags"]; onSelectEvidence: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const safeQuery = sanitizeFtsQuery(query);
  const { data: results = [], error: searchError } = useQuery<SearchResult[]>({ queryKey: ["search", incidentId, safeQuery], queryFn: () => safeQuery ? search(incidentId, safeQuery) : Promise.resolve([]), enabled: Boolean(safeQuery) });
  const addTagMutation = useMutation({ mutationFn: () => addTag(incidentId, tag), onSuccess: () => { setTag(""); queryClient.invalidateQueries({ queryKey: ["snapshot"] }); } });
  const deleteTagMutation = useMutation({ mutationFn: deleteTag, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["snapshot"] }); } });
  const groupedEntities = useMemo(() => entities.slice(0, 20), [entities]);
  function openSearchResult(result: SearchResult) {
    if (result.kind === "evidence") onSelectEvidence(result.refId);
    if (result.kind === "timeline") onSelectEvidence(timeline.find((event) => event.id === result.refId)?.sourceEvidenceId ?? "");
    if (result.kind === "entity") onSelectEvidence(entities.find((entity) => entity.id === result.refId)?.sourceEvidenceId ?? "");
  }
  return <aside className="right">
    <section className="panel"><h2><Search size={16} /> Search</h2><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search evidence, events, entities" />{query.trim() && !safeQuery ? <p className="muted">Use letters or numbers to search.</p> : null}{searchError ? <p className="error">Search failed: {String(searchError)}</p> : null}{safeQuery && results.length === 0 && !searchError ? <p className="muted">No results.</p> : null}{results.map((result) => <button className="result" key={`${result.kind}-${result.refId}`} onClick={() => openSearchResult(result)}><strong>{result.kind}: {result.title}</strong><span dangerouslySetInnerHTML={{ __html: result.snippet }} /></button>)}</section>
    <section className="panel timeline-panel"><h2>Timeline</h2><div className="timeline-list">{timeline.length ? timeline.map((event) => <button className="event" key={event.id} onClick={() => event.sourceEvidenceId && onSelectEvidence(event.sourceEvidenceId)}><time>{new Date(event.timestamp).toLocaleString()}</time><strong>{event.title}</strong><span>{Math.round(event.confidence * 100)}% · source {event.sourceEvidenceId?.slice(0, 8)}</span></button>) : <p className="muted">No timeline events yet. Atlas only adds derived events when parsers find incident signals such as timestamps, deploys, errors, timeouts, or 5xx statuses.</p>}</div></section>
    <section className="panel"><h2>Entities</h2>{groupedEntities.length ? groupedEntities.map((entity) => entity.sourceEvidenceId ? <button className="pill entity-link" key={entity.id} title="Open source evidence" onClick={() => onSelectEvidence(entity.sourceEvidenceId!)}>{entity.type}: {entity.name}</button> : <span className="pill" key={entity.id}>{entity.type}: {entity.name}</span>) : <p className="muted">No entities found yet. Try evidence with service names, HTTP statuses, deploy refs, or Kubernetes signals.</p>}</section>
    <section className="panel"><h2><Tags size={16} /> Tags</h2><div className="tag-input"><input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Add tag" /><button onClick={() => addTagMutation.mutate()} disabled={!tag.trim()}>Add</button></div>{tags.length ? tags.map((item) => <span className="pill tag-pill" key={item.id}>{item.name}<button title={`Remove ${item.name}`} onClick={() => deleteTagMutation.mutate(item.id)}>×</button></span>) : <p className="muted">No tags yet.</p>}</section>
  </aside>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
