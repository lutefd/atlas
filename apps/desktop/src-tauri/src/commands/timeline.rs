use crate::db;
use crate::models::*;
use crate::state::AppState;
use rusqlite::params;

#[tauri::command]
pub fn create_manual_timeline_event(
    state: tauri::State<AppState>,
    input: ManualTimelineInput,
) -> Result<TimelineEvent, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = db::open(&state.db_path)?;
    let event = TimelineEvent {
        id: db::id(),
        incident_id: input.incident_id,
        timestamp: input.timestamp,
        title: input.title.trim().to_string(),
        description: input.description.trim().to_string(),
        confidence: 1.0,
        source_evidence_id: input.source_evidence_id,
        source_parser_output_id: None,
        created_at: db::now(),
    };
    conn.execute(
        "INSERT INTO timeline_events VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)",
        params![
            event.id,
            event.incident_id,
            event.timestamp,
            event.title,
            event.description,
            event.confidence,
            event.source_evidence_id,
            event.created_at
        ],
    )
    .map_err(|error| error.to_string())?;
    conn.execute("INSERT INTO search_index(kind, ref_id, incident_id, title, body) VALUES ('timeline', ?1, ?2, ?3, ?4)", params![event.id, event.incident_id, event.title, event.description]).map_err(|error| error.to_string())?;
    Ok(event)
}

#[tauri::command]
pub fn update_manual_timeline_event(
    state: tauri::State<AppState>,
    input: UpdateTimelineInput,
) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut conn = db::open(&state.db_path)?;
    let incident_id = conn.query_row("SELECT incident_id FROM timeline_events WHERE id = ?1 AND source_parser_output_id IS NULL", params![input.id], |row| row.get::<_, String>(0)).map_err(|error| error.to_string())?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute("UPDATE timeline_events SET timestamp = ?1, title = ?2, description = ?3, source_evidence_id = ?4 WHERE id = ?5 AND source_parser_output_id IS NULL", params![input.timestamp, input.title.trim(), input.description.trim(), input.source_evidence_id, input.id]).map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM search_index WHERE incident_id = ?1",
        params![&incident_id],
    )
    .map_err(|error| error.to_string())?;
    db::rebuild_search_index(&tx, &incident_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_manual_timeline_event(
    state: tauri::State<AppState>,
    event_id: String,
) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut conn = db::open(&state.db_path)?;
    let incident_id = conn.query_row("SELECT incident_id FROM timeline_events WHERE id = ?1 AND source_parser_output_id IS NULL", params![event_id], |row| row.get::<_, String>(0)).map_err(|error| error.to_string())?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM timeline_events WHERE id = ?1 AND source_parser_output_id IS NULL",
        params![event_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM search_index WHERE incident_id = ?1",
        params![&incident_id],
    )
    .map_err(|error| error.to_string())?;
    db::rebuild_search_index(&tx, &incident_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}
