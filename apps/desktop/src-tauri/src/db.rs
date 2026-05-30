use rusqlite::{params, Connection};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn open(path: &PathBuf) -> Result<Connection, String> {
    Connection::open(path).map_err(|error| error.to_string())
}

pub fn remove_dir_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn write_json(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    fs::write(
        path,
        serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

pub fn read_json(path: &Path) -> Result<serde_json::Value, String> {
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

pub fn json_string(value: &serde_json::Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(|field| field.as_str())
        .map(str::to_string)
        .ok_or_else(|| format!("Missing {key}"))
}

pub fn json_optional_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|field| field.as_str())
        .map(str::to_string)
}

pub fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'investigating', severity TEXT NOT NULL DEFAULT 'unknown', impact TEXT NOT NULL DEFAULT '', mitigation TEXT NOT NULL DEFAULT '', pending_actions TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        ALTER TABLE incidents ADD COLUMN status TEXT NOT NULL DEFAULT 'investigating';
        ALTER TABLE incidents ADD COLUMN severity TEXT NOT NULL DEFAULT 'unknown';
        ALTER TABLE incidents ADD COLUMN impact TEXT NOT NULL DEFAULT '';
        ALTER TABLE incidents ADD COLUMN mitigation TEXT NOT NULL DEFAULT '';
        ALTER TABLE incidents ADD COLUMN pending_actions TEXT NOT NULL DEFAULT '';
        CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, evidence_id TEXT, path TEXT NOT NULL, mime_type TEXT, size_bytes INTEGER, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, content_text TEXT, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', attachment_id TEXT, FOREIGN KEY (incident_id) REFERENCES incidents(id));
        CREATE TABLE IF NOT EXISTS parser_outputs (id TEXT PRIMARY KEY, evidence_id TEXT NOT NULL, parser_name TEXT NOT NULL, parser_version TEXT NOT NULL, output_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (evidence_id) REFERENCES evidence(id));
        CREATE TABLE IF NOT EXISTS timeline_events (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, timestamp TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, confidence REAL NOT NULL, source_evidence_id TEXT, source_parser_output_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY (incident_id) REFERENCES incidents(id));
        CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, confidence REAL NOT NULL, source_evidence_id TEXT, source_parser_output_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY (incident_id) REFERENCES incidents(id));
        CREATE TABLE IF NOT EXISTS relations (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, source_entity_id TEXT NOT NULL, target_entity_id TEXT NOT NULL, type TEXT NOT NULL, confidence REAL NOT NULL, source_evidence_id TEXT, derived_by TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(incident_id, name));
        CREATE TABLE IF NOT EXISTS evidence_tags (evidence_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(evidence_id, tag_id));
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        ALTER TABLE jobs ADD COLUMN error_text TEXT;
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(kind, ref_id UNINDEXED, incident_id UNINDEXED, title, body);
    "#).or_else(|error| if error.to_string().contains("duplicate column name") { Ok(()) } else { Err(error) }).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn rebuild_search_index(conn: &Connection, incident_id: &str) -> Result<(), String> {
    let mut evidence_stmt = conn.prepare("SELECT id, source, content_text, metadata_json, attachment_id FROM evidence WHERE incident_id = ?1").map_err(|error| error.to_string())?;
    let evidence_rows = evidence_stmt
        .query_map(params![incident_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for (id, source, content_text, metadata_json, attachment_id) in evidence_rows {
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('evidence', ?1, ?2, ?3, ?4)", params![id, incident_id, source, format!("{}\n{}", content_text.unwrap_or_default(), metadata_json)]).map_err(|error| error.to_string())?;
        if attachment_id.is_some() {
            conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('attachment', ?1, ?2, ?3, ?4)", params![id, incident_id, source, metadata_json]).map_err(|error| error.to_string())?;
        }
    }

    let mut timeline_stmt = conn
        .prepare("SELECT id, title, description FROM timeline_events WHERE incident_id = ?1")
        .map_err(|error| error.to_string())?;
    let timeline_rows = timeline_stmt
        .query_map(params![incident_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for (id, title, description) in timeline_rows {
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('timeline', ?1, ?2, ?3, ?4)", params![id, incident_id, title, description]).map_err(|error| error.to_string())?;
    }

    let mut entity_stmt = conn
        .prepare("SELECT id, type, name FROM entities WHERE incident_id = ?1")
        .map_err(|error| error.to_string())?;
    let entity_rows = entity_stmt
        .query_map(params![incident_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for (id, entity_type, name) in entity_rows {
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('entity', ?1, ?2, ?3, ?4)", params![id, incident_id, name, entity_type]).map_err(|error| error.to_string())?;
    }

    let mut parser_stmt = conn.prepare("SELECT evidence_id, parser_name, output_json FROM parser_outputs WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1)").map_err(|error| error.to_string())?;
    let parser_rows = parser_stmt
        .query_map(params![incident_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for (evidence_id, parser_name, output_json) in parser_rows {
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('parser_output', ?1, ?2, ?3, ?4)", params![evidence_id, incident_id, parser_name, output_json]).map_err(|error| error.to_string())?;
    }

    Ok(())
}
