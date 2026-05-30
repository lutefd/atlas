use crate::db;
use crate::models::*;
use crate::state::AppState;
use rusqlite::params;
use serde_json;

#[tauri::command]
pub fn load_snapshot(state: tauri::State<AppState>) -> Result<Snapshot, String> {
    let conn = db::open(&state.db_path)?;
    let incidents = conn
        .prepare("SELECT id,title,status,severity,impact,mitigation,pending_actions,created_at,updated_at FROM incidents ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?
        .query_map([], |r| {
            Ok(Incident {
                id: r.get(0)?,
                title: r.get(1)?,
                status: r.get(2)?,
                severity: r.get(3)?,
                impact: r.get(4)?,
                mitigation: r.get(5)?,
                pending_actions: r.get(6)?,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let evidence = conn.prepare("SELECT id,incident_id,kind,source,content_text,content_hash,created_at,metadata_json,attachment_id FROM evidence ORDER BY created_at DESC").map_err(|e| e.to_string())?.query_map([], |r| Ok(Evidence { id: r.get(0)?, incident_id: r.get(1)?, kind: r.get(2)?, source: r.get(3)?, content_text: r.get(4)?, content_hash: r.get(5)?, created_at: r.get(6)?, metadata_json: r.get(7)?, attachment_id: r.get(8)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let timeline_events = conn.prepare("SELECT id,incident_id,timestamp,title,description,confidence,source_evidence_id,source_parser_output_id,created_at FROM timeline_events ORDER BY timestamp ASC").map_err(|e| e.to_string())?.query_map([], |r| Ok(TimelineEvent { id: r.get(0)?, incident_id: r.get(1)?, timestamp: r.get(2)?, title: r.get(3)?, description: r.get(4)?, confidence: r.get(5)?, source_evidence_id: r.get(6)?, source_parser_output_id: r.get(7)?, created_at: r.get(8)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let entities = conn.prepare("SELECT id,incident_id,type,name,confidence,source_evidence_id,source_parser_output_id,created_at FROM entities ORDER BY created_at DESC").map_err(|e| e.to_string())?.query_map([], |r| Ok(Entity { id: r.get(0)?, incident_id: r.get(1)?, entity_type: r.get(2)?, name: r.get(3)?, confidence: r.get(4)?, source_evidence_id: r.get(5)?, source_parser_output_id: r.get(6)?, created_at: r.get(7)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let tags = conn
        .prepare("SELECT id,incident_id,name,created_at FROM tags ORDER BY name ASC")
        .map_err(|e| e.to_string())?
        .query_map([], |r| {
            Ok(Tag {
                id: r.get(0)?,
                incident_id: r.get(1)?,
                name: r.get(2)?,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let parser_outputs = conn.prepare("SELECT id,evidence_id,parser_name,parser_version,output_json,created_at FROM parser_outputs ORDER BY created_at DESC").map_err(|e| e.to_string())?.query_map([], |r| Ok(ParserOutput { id: r.get(0)?, evidence_id: r.get(1)?, parser_name: r.get(2)?, parser_version: r.get(3)?, output_json: r.get(4)?, created_at: r.get(5)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let jobs = conn.prepare("SELECT id,kind,status,payload_json,error_text,created_at,updated_at FROM jobs ORDER BY created_at DESC").map_err(|e| e.to_string())?.query_map([], |r| Ok(Job { id: r.get(0)?, kind: r.get(1)?, status: r.get(2)?, payload_json: r.get(3)?, error_text: r.get(4)?, created_at: r.get(5)?, updated_at: r.get(6)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(Snapshot {
        incidents,
        evidence,
        timeline_events,
        entities,
        tags,
        parser_outputs,
        jobs,
    })
}

#[tauri::command]
pub fn search(
    state: tauri::State<AppState>,
    incident_id: String,
    query: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = db::open(&state.db_path)?;
    let mut stmt = conn.prepare("SELECT kind, ref_id, title, snippet(search_index, 4, '<mark>', '</mark>', '...', 12) FROM search_index WHERE incident_id = ?1 AND search_index MATCH ?2 LIMIT 30").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![incident_id, query], |r| Ok(serde_json::json!({ "kind": r.get::<_, String>(0)?, "refId": r.get::<_, String>(1)?, "title": r.get::<_, String>(2)?, "snippet": r.get::<_, String>(3)? }))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(rows)
}
