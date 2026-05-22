use crate::db;
use crate::models::*;
use crate::state::AppState;
use base64::Engine;
use rusqlite::params;
use sha2::{Digest, Sha256};
use std::fs;

#[tauri::command]
pub fn add_evidence(
    state: tauri::State<AppState>,
    input: CreateEvidenceInput,
) -> Result<Evidence, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = db::open(&state.db_path)?;
    let evidence_id = db::id();
    let bytes = input.content_text.clone().unwrap_or_default().into_bytes();
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let mut attachment_id = None;
    if let (Some(name), Some(encoded)) = (input.attachment_name, input.attachment_base64) {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| error.to_string())?;
        let aid = db::id();
        let dir = state
            .attachments_dir
            .join(&input.incident_id)
            .join(&evidence_id);
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let path = dir.join(name);
        fs::write(&path, &decoded).map_err(|error| error.to_string())?;
        conn.execute(
            "INSERT INTO attachments VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                aid,
                evidence_id,
                path.to_string_lossy(),
                input.attachment_mime_type,
                decoded.len() as i64,
                db::now()
            ],
        )
        .map_err(|error| error.to_string())?;
        attachment_id = Some(aid);
    }
    let evidence = Evidence {
        id: evidence_id,
        incident_id: input.incident_id,
        kind: input.kind,
        source: input.source,
        content_text: input.content_text,
        content_hash: hash,
        created_at: db::now(),
        metadata_json: input.metadata_json.unwrap_or_else(|| "{}".into()),
        attachment_id,
    };
    conn.execute(
        "INSERT INTO evidence VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            evidence.id,
            evidence.incident_id,
            evidence.kind,
            evidence.source,
            evidence.content_text,
            evidence.content_hash,
            evidence.created_at,
            evidence.metadata_json,
            evidence.attachment_id
        ],
    )
    .map_err(|error| error.to_string())?;
    conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('evidence', ?1, ?2, ?3, ?4)", params![evidence.id, evidence.incident_id, evidence.source, format!("{}\n{}", evidence.content_text.clone().unwrap_or_default(), evidence.metadata_json)]).map_err(|error| error.to_string())?;
    if let Some(attachment_id) = &evidence.attachment_id {
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('attachment', ?1, ?2, ?3, ?4)", params![evidence.id, evidence.incident_id, attachment_id, evidence.metadata_json]).map_err(|error| error.to_string())?;
    }
    Ok(evidence)
}

#[tauri::command]
pub fn save_parser_output(
    state: tauri::State<AppState>,
    input: ParserOutputInput,
) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = db::open(&state.db_path)?;
    conn.execute(
        "INSERT INTO parser_outputs VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            input.id,
            input.evidence_id,
            input.parser_name,
            input.parser_version,
            input.output_json,
            db::now()
        ],
    )
    .map_err(|error| error.to_string())?;
    let incident_id = conn
        .query_row(
            "SELECT incident_id FROM evidence WHERE id = ?1",
            params![input.evidence_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| error.to_string())?;
    conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('parser_output', ?1, ?2, ?3, ?4)", params![input.evidence_id, incident_id, input.parser_name, input.output_json]).map_err(|error| error.to_string())?;
    let timeline: Vec<DerivedTimelineInput> =
        serde_json::from_str(&input.timeline_events_json).map_err(|error| error.to_string())?;
    for event in timeline {
        conn.execute(
            "INSERT INTO timeline_events VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                event.id,
                event.incident_id,
                event.timestamp,
                event.title,
                event.description,
                event.confidence,
                event.source_evidence_id,
                event.source_parser_output_id,
                db::now()
            ],
        )
        .map_err(|error| error.to_string())?;
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('timeline', ?1, ?2, ?3, ?4)", params![event.id, event.incident_id, event.title, event.description]).map_err(|error| error.to_string())?;
    }
    let entities: Vec<DerivedEntityInput> =
        serde_json::from_str(&input.entities_json).map_err(|error| error.to_string())?;
    for entity in entities {
        conn.execute(
            "INSERT INTO entities VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                entity.id,
                entity.incident_id,
                entity.entity_type,
                entity.name,
                entity.confidence,
                entity.source_evidence_id,
                entity.source_parser_output_id,
                db::now()
            ],
        )
        .map_err(|error| error.to_string())?;
        conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('entity', ?1, ?2, ?3, '')", params![entity.id, entity.incident_id, entity.name]).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_evidence_parsers(
    state: tauri::State<AppState>,
    evidence_id: String,
) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut conn = db::open(&state.db_path)?;
    let evidence_info = conn
        .query_row(
            "SELECT incident_id FROM evidence WHERE id = ?1",
            params![evidence_id],
            |row| row.get::<_, String>(0),
        )
        .ok();
    let Some(incident_id) = evidence_info else {
        return Ok(());
    };
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM search_index WHERE incident_id = ?1",
        params![&incident_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM timeline_events WHERE source_evidence_id = ?1 AND source_parser_output_id IS NOT NULL", params![&evidence_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM entities WHERE source_evidence_id = ?1 AND source_parser_output_id IS NOT NULL", params![&evidence_id]).map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM parser_outputs WHERE evidence_id = ?1",
        params![&evidence_id],
    )
    .map_err(|error| error.to_string())?;
    db::rebuild_search_index(&tx, &incident_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_evidence(state: tauri::State<AppState>, evidence_id: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut conn = db::open(&state.db_path)?;
    let evidence_info = conn
        .query_row(
            "SELECT incident_id FROM evidence WHERE id = ?1",
            params![evidence_id],
            |row| row.get::<_, String>(0),
        )
        .ok();
    let Some(incident_id) = evidence_info else {
        return Ok(());
    };
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM search_index WHERE incident_id = ?1",
        params![incident_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM timeline_events WHERE source_evidence_id = ?1",
        params![evidence_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM relations WHERE source_evidence_id = ?1",
        params![evidence_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM entities WHERE source_evidence_id = ?1",
        params![evidence_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM parser_outputs WHERE evidence_id = ?1",
        params![evidence_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM evidence_tags WHERE evidence_id = ?1",
        params![evidence_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM attachments WHERE evidence_id = ?1",
        params![evidence_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM evidence WHERE id = ?1", params![evidence_id])
        .map_err(|error| error.to_string())?;
    db::rebuild_search_index(&tx, &incident_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    db::remove_dir_if_exists(&state.attachments_dir.join(incident_id).join(evidence_id))?;
    Ok(())
}
