use base64::Engine;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::Manager;

struct AppState { db_path: PathBuf, attachments_dir: PathBuf, lock: Mutex<()> }

#[derive(Serialize)]
struct Incident { id: String, title: String, created_at: String, updated_at: String }

#[derive(Serialize)]
struct Evidence { id: String, incident_id: String, kind: String, source: String, content_text: Option<String>, content_hash: String, created_at: String, metadata_json: String, attachment_id: Option<String> }

#[derive(Serialize)]
struct AttachmentData { name: String, mime_type: String, base64: String }

#[derive(Serialize)]
struct TimelineEvent { id: String, incident_id: String, timestamp: String, title: String, description: String, confidence: f64, source_evidence_id: Option<String>, source_parser_output_id: Option<String>, created_at: String }

#[derive(Serialize)]
struct Entity { id: String, incident_id: String, entity_type: String, name: String, confidence: f64, source_evidence_id: Option<String>, source_parser_output_id: Option<String>, created_at: String }

#[derive(Serialize)]
struct Tag { id: String, incident_id: String, name: String, created_at: String }

#[derive(Serialize)]
struct ParserOutput { id: String, evidence_id: String, parser_name: String, parser_version: String, output_json: String, created_at: String }

#[derive(Serialize)]
struct Snapshot { incidents: Vec<Incident>, evidence: Vec<Evidence>, timeline_events: Vec<TimelineEvent>, entities: Vec<Entity>, tags: Vec<Tag>, parser_outputs: Vec<ParserOutput> }

#[derive(Deserialize)]
struct CreateEvidenceInput { incident_id: String, kind: String, source: String, content_text: Option<String>, metadata_json: Option<String>, attachment_name: Option<String>, attachment_mime_type: Option<String>, attachment_base64: Option<String> }

#[derive(Deserialize)]
struct ParserOutputInput { id: String, evidence_id: String, parser_name: String, parser_version: String, output_json: String, timeline_events_json: String, entities_json: String }

#[derive(Deserialize)]
struct DerivedTimelineInput { id: String, incident_id: String, timestamp: String, title: String, description: String, confidence: f64, source_evidence_id: String, source_parser_output_id: String }

#[derive(Deserialize)]
struct DerivedEntityInput { id: String, incident_id: String, entity_type: String, name: String, confidence: f64, source_evidence_id: String, source_parser_output_id: String }

fn now() -> String { chrono::Utc::now().to_rfc3339() }
fn id() -> String { uuid::Uuid::new_v4().to_string() }

fn open(path: &PathBuf) -> Result<Connection, String> { Connection::open(path).map_err(|error| error.to_string()) }

fn remove_dir_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, evidence_id TEXT, path TEXT NOT NULL, mime_type TEXT, size_bytes INTEGER, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, content_text TEXT, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', attachment_id TEXT, FOREIGN KEY (incident_id) REFERENCES incidents(id));
        CREATE TABLE IF NOT EXISTS parser_outputs (id TEXT PRIMARY KEY, evidence_id TEXT NOT NULL, parser_name TEXT NOT NULL, parser_version TEXT NOT NULL, output_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (evidence_id) REFERENCES evidence(id));
        CREATE TABLE IF NOT EXISTS timeline_events (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, timestamp TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, confidence REAL NOT NULL, source_evidence_id TEXT, source_parser_output_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY (incident_id) REFERENCES incidents(id));
        CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, confidence REAL NOT NULL, source_evidence_id TEXT, source_parser_output_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY (incident_id) REFERENCES incidents(id));
        CREATE TABLE IF NOT EXISTS relations (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, source_entity_id TEXT NOT NULL, target_entity_id TEXT NOT NULL, type TEXT NOT NULL, confidence REAL NOT NULL, source_evidence_id TEXT, derived_by TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(incident_id, name));
        CREATE TABLE IF NOT EXISTS evidence_tags (evidence_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(evidence_id, tag_id));
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(kind, ref_id UNINDEXED, incident_id UNINDEXED, title, body);
    "#).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_incident(state: tauri::State<AppState>, title: String) -> Result<Incident, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = open(&state.db_path)?;
    let incident = Incident { id: id(), title, created_at: now(), updated_at: now() };
    conn.execute("INSERT INTO incidents VALUES (?1, ?2, ?3, ?4)", params![incident.id, incident.title, incident.created_at, incident.updated_at]).map_err(|error| error.to_string())?;
    Ok(incident)
}

#[tauri::command]
fn rename_incident(state: tauri::State<AppState>, incident_id: String, title: String) -> Result<Incident, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = open(&state.db_path)?;
    let updated_at = now();
    conn.execute("UPDATE incidents SET title = ?1, updated_at = ?2 WHERE id = ?3", params![title.trim(), &updated_at, &incident_id]).map_err(|error| error.to_string())?;
    conn.query_row("SELECT id, title, created_at, updated_at FROM incidents WHERE id = ?1", params![&incident_id], |row| Ok(Incident { id: row.get(0)?, title: row.get(1)?, created_at: row.get(2)?, updated_at: row.get(3)? })).map_err(|error| error.to_string())
}

#[tauri::command]
fn add_evidence(state: tauri::State<AppState>, input: CreateEvidenceInput) -> Result<Evidence, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = open(&state.db_path)?;
    let evidence_id = id();
    let bytes = input.content_text.clone().unwrap_or_default().into_bytes();
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let mut attachment_id = None;
    if let (Some(name), Some(encoded)) = (input.attachment_name, input.attachment_base64) {
        let decoded = base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|error| error.to_string())?;
        let aid = id();
        let dir = state.attachments_dir.join(&input.incident_id).join(&evidence_id);
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let path = dir.join(name);
        fs::write(&path, &decoded).map_err(|error| error.to_string())?;
        conn.execute("INSERT INTO attachments VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![aid, evidence_id, path.to_string_lossy(), input.attachment_mime_type, decoded.len() as i64, now()]).map_err(|error| error.to_string())?;
        attachment_id = Some(aid);
    }
    let evidence = Evidence { id: evidence_id, incident_id: input.incident_id, kind: input.kind, source: input.source, content_text: input.content_text, content_hash: hash, created_at: now(), metadata_json: input.metadata_json.unwrap_or_else(|| "{}".into()), attachment_id };
    conn.execute("INSERT INTO evidence VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)", params![evidence.id, evidence.incident_id, evidence.kind, evidence.source, evidence.content_text, evidence.content_hash, evidence.created_at, evidence.metadata_json, evidence.attachment_id]).map_err(|error| error.to_string())?;
    conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('evidence', ?1, ?2, ?3, ?4)", params![evidence.id, evidence.incident_id, evidence.source, evidence.content_text]).map_err(|error| error.to_string())?;
    Ok(evidence)
}

#[tauri::command]
fn save_parser_output(state: tauri::State<AppState>, input: ParserOutputInput) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = open(&state.db_path)?;
    conn.execute("INSERT INTO parser_outputs VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![input.id, input.evidence_id, input.parser_name, input.parser_version, input.output_json, now()]).map_err(|error| error.to_string())?;
    let timeline: Vec<DerivedTimelineInput> = serde_json::from_str(&input.timeline_events_json).map_err(|error| error.to_string())?;
    for event in timeline {
        conn.execute("INSERT INTO timeline_events VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)", params![event.id, event.incident_id, event.timestamp, event.title, event.description, event.confidence, event.source_evidence_id, event.source_parser_output_id, now()]).map_err(|error| error.to_string())?;
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('timeline', ?1, ?2, ?3, ?4)", params![event.id, event.incident_id, event.title, event.description]).map_err(|error| error.to_string())?;
    }
    let entities: Vec<DerivedEntityInput> = serde_json::from_str(&input.entities_json).map_err(|error| error.to_string())?;
    for entity in entities {
        conn.execute("INSERT INTO entities VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", params![entity.id, entity.incident_id, entity.entity_type, entity.name, entity.confidence, entity.source_evidence_id, entity.source_parser_output_id, now()]).map_err(|error| error.to_string())?;
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('entity', ?1, ?2, ?3, '')", params![entity.id, entity.incident_id, entity.name]).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn add_tag(state: tauri::State<AppState>, incident_id: String, name: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    open(&state.db_path)?.execute("INSERT OR IGNORE INTO tags VALUES (?1, ?2, ?3, ?4)", params![id(), incident_id, name.trim(), now()]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_tag(state: tauri::State<AppState>, tag_id: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = open(&state.db_path)?;
    conn.execute("DELETE FROM evidence_tags WHERE tag_id = ?1", params![tag_id]).map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", params![tag_id]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn clear_evidence_parsers(state: tauri::State<AppState>, evidence_id: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut conn = open(&state.db_path)?;
    let evidence_info = conn.query_row("SELECT incident_id FROM evidence WHERE id = ?1", params![evidence_id], |row| row.get::<_, String>(0)).ok();
    let Some(incident_id) = evidence_info else { return Ok(()); };
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM search_index WHERE incident_id = ?1", params![&incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM timeline_events WHERE source_evidence_id = ?1", params![&evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM entities WHERE source_evidence_id = ?1", params![&evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM parser_outputs WHERE evidence_id = ?1", params![&evidence_id]).map_err(|error| error.to_string())?;
    rebuild_search_index(&tx, &incident_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_evidence(state: tauri::State<AppState>, evidence_id: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut conn = open(&state.db_path)?;
    let evidence_info = conn.query_row("SELECT incident_id FROM evidence WHERE id = ?1", params![evidence_id], |row| row.get::<_, String>(0)).ok();
    let Some(incident_id) = evidence_info else { return Ok(()); };
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM search_index WHERE incident_id = ?1", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM timeline_events WHERE source_evidence_id = ?1", params![evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM relations WHERE source_evidence_id = ?1", params![evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM entities WHERE source_evidence_id = ?1", params![evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM parser_outputs WHERE evidence_id = ?1", params![evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM evidence_tags WHERE evidence_id = ?1", params![evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM attachments WHERE evidence_id = ?1", params![evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM evidence WHERE id = ?1", params![evidence_id]).map_err(|error| error.to_string())?;
    rebuild_search_index(&tx, &incident_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    remove_dir_if_exists(&state.attachments_dir.join(incident_id).join(evidence_id))?;
    Ok(())
}

#[tauri::command]
fn delete_incident(state: tauri::State<AppState>, incident_id: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut conn = open(&state.db_path)?;
    let exists = conn.query_row("SELECT 1 FROM incidents WHERE id = ?1", params![incident_id], |_| Ok(())).is_ok();
    if !exists { return Ok(()); }
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM search_index WHERE incident_id = ?1", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM evidence_tags WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1)", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM attachments WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1)", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM parser_outputs WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1)", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM relations WHERE incident_id = ?1", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM timeline_events WHERE incident_id = ?1", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM entities WHERE incident_id = ?1", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM tags WHERE incident_id = ?1", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM evidence WHERE incident_id = ?1", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM incidents WHERE id = ?1", params![incident_id]).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    remove_dir_if_exists(&state.attachments_dir.join(incident_id))?;
    Ok(())
}

fn rebuild_search_index(conn: &Connection, incident_id: &str) -> Result<(), String> {
    let mut evidence_stmt = conn.prepare("SELECT id, source, content_text FROM evidence WHERE incident_id = ?1").map_err(|error| error.to_string())?;
    let evidence_rows = evidence_stmt.query_map(params![incident_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?))).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    for (id, source, content_text) in evidence_rows {
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('evidence', ?1, ?2, ?3, ?4)", params![id, incident_id, source, content_text]).map_err(|error| error.to_string())?;
    }

    let mut timeline_stmt = conn.prepare("SELECT id, title, description FROM timeline_events WHERE incident_id = ?1").map_err(|error| error.to_string())?;
    let timeline_rows = timeline_stmt.query_map(params![incident_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    for (id, title, description) in timeline_rows {
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('timeline', ?1, ?2, ?3, ?4)", params![id, incident_id, title, description]).map_err(|error| error.to_string())?;
    }

    let mut entity_stmt = conn.prepare("SELECT id, name FROM entities WHERE incident_id = ?1").map_err(|error| error.to_string())?;
    let entity_rows = entity_stmt.query_map(params![incident_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    for (id, name) in entity_rows {
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('entity', ?1, ?2, ?3, '')", params![id, incident_id, name]).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn load_snapshot(state: tauri::State<AppState>) -> Result<Snapshot, String> {
    let conn = open(&state.db_path)?;
    let incidents = conn.prepare("SELECT id,title,created_at,updated_at FROM incidents ORDER BY created_at DESC").map_err(|e| e.to_string())?.query_map([], |r| Ok(Incident { id: r.get(0)?, title: r.get(1)?, created_at: r.get(2)?, updated_at: r.get(3)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let evidence = conn.prepare("SELECT id,incident_id,kind,source,content_text,content_hash,created_at,metadata_json,attachment_id FROM evidence ORDER BY created_at DESC").map_err(|e| e.to_string())?.query_map([], |r| Ok(Evidence { id: r.get(0)?, incident_id: r.get(1)?, kind: r.get(2)?, source: r.get(3)?, content_text: r.get(4)?, content_hash: r.get(5)?, created_at: r.get(6)?, metadata_json: r.get(7)?, attachment_id: r.get(8)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let timeline_events = conn.prepare("SELECT id,incident_id,timestamp,title,description,confidence,source_evidence_id,source_parser_output_id,created_at FROM timeline_events ORDER BY timestamp ASC").map_err(|e| e.to_string())?.query_map([], |r| Ok(TimelineEvent { id: r.get(0)?, incident_id: r.get(1)?, timestamp: r.get(2)?, title: r.get(3)?, description: r.get(4)?, confidence: r.get(5)?, source_evidence_id: r.get(6)?, source_parser_output_id: r.get(7)?, created_at: r.get(8)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let entities = conn.prepare("SELECT id,incident_id,type,name,confidence,source_evidence_id,source_parser_output_id,created_at FROM entities ORDER BY created_at DESC").map_err(|e| e.to_string())?.query_map([], |r| Ok(Entity { id: r.get(0)?, incident_id: r.get(1)?, entity_type: r.get(2)?, name: r.get(3)?, confidence: r.get(4)?, source_evidence_id: r.get(5)?, source_parser_output_id: r.get(6)?, created_at: r.get(7)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let tags = conn.prepare("SELECT id,incident_id,name,created_at FROM tags ORDER BY name ASC").map_err(|e| e.to_string())?.query_map([], |r| Ok(Tag { id: r.get(0)?, incident_id: r.get(1)?, name: r.get(2)?, created_at: r.get(3)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let parser_outputs = conn.prepare("SELECT id,evidence_id,parser_name,parser_version,output_json,created_at FROM parser_outputs ORDER BY created_at DESC").map_err(|e| e.to_string())?.query_map([], |r| Ok(ParserOutput { id: r.get(0)?, evidence_id: r.get(1)?, parser_name: r.get(2)?, parser_version: r.get(3)?, output_json: r.get(4)?, created_at: r.get(5)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(Snapshot { incidents, evidence, timeline_events, entities, tags, parser_outputs })
}

#[tauri::command]
fn search(state: tauri::State<AppState>, incident_id: String, query: String) -> Result<Vec<serde_json::Value>, String> {
    let conn = open(&state.db_path)?;
    let mut stmt = conn.prepare("SELECT kind, ref_id, title, snippet(search_index, 4, '<mark>', '</mark>', '...', 12) FROM search_index WHERE incident_id = ?1 AND search_index MATCH ?2 LIMIT 30").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![incident_id, query], |r| Ok(serde_json::json!({ "kind": r.get::<_, String>(0)?, "refId": r.get::<_, String>(1)?, "title": r.get::<_, String>(2)?, "snippet": r.get::<_, String>(3)? }))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
fn load_attachment(state: tauri::State<AppState>, evidence_id: String) -> Result<Option<AttachmentData>, String> {
    let conn = open(&state.db_path)?;
    let mut stmt = conn.prepare("SELECT path, mime_type FROM attachments WHERE evidence_id = ?1 LIMIT 1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![evidence_id]).map_err(|e| e.to_string())?;
    let Some(row) = rows.next().map_err(|e| e.to_string())? else { return Ok(None); };
    let path: String = row.get(0).map_err(|e| e.to_string())?;
    let mime_type: Option<String> = row.get(1).map_err(|e| e.to_string())?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let name = PathBuf::from(&path).file_name().and_then(|value| value.to_str()).unwrap_or("attachment").to_string();
    let inferred = if name.ends_with(".png") { "image/png" } else if name.ends_with(".jpg") || name.ends_with(".jpeg") { "image/jpeg" } else if name.ends_with(".gif") { "image/gif" } else { "application/octet-stream" };
    Ok(Some(AttachmentData { name, mime_type: mime_type.unwrap_or_else(|| inferred.to_string()), base64: base64::engine::general_purpose::STANDARD.encode(bytes) }))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
            fs::create_dir_all(app_dir.join("attachments"))?;
            let db_path = app_dir.join("app.sqlite");
            migrate(&open(&db_path).map_err(|error| Box::<dyn std::error::Error>::from(error))?).map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(AppState { db_path, attachments_dir: app_dir.join("attachments"), lock: Mutex::new(()) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![create_incident, rename_incident, add_evidence, save_parser_output, add_tag, delete_tag, clear_evidence_parsers, delete_evidence, delete_incident, load_snapshot, search, load_attachment])
        .run(tauri::generate_context!())
        .expect("failed to run atlas");
}
