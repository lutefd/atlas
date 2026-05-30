use crate::db;
use crate::models::*;
use crate::state::AppState;
use rusqlite::params;

#[tauri::command]
pub fn create_incident(state: tauri::State<AppState>, title: String) -> Result<Incident, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = db::open(&state.db_path)?;
    let incident = Incident {
        id: db::id(),
        title,
        status: "investigating".into(),
        severity: "unknown".into(),
        impact: String::new(),
        mitigation: String::new(),
        pending_actions: String::new(),
        created_at: db::now(),
        updated_at: db::now(),
    };
    conn.execute(
        "INSERT INTO incidents (id, title, status, severity, impact, mitigation, pending_actions, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            incident.id,
            incident.title,
            incident.status,
            incident.severity,
            incident.impact,
            incident.mitigation,
            incident.pending_actions,
            incident.created_at,
            incident.updated_at
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(incident)
}

#[tauri::command]
pub fn rename_incident(
    state: tauri::State<AppState>,
    incident_id: String,
    title: String,
) -> Result<Incident, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = db::open(&state.db_path)?;
    let updated_at = db::now();
    conn.execute(
        "UPDATE incidents SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title.trim(), &updated_at, &incident_id],
    )
    .map_err(|error| error.to_string())?;
    conn.query_row(
        "SELECT id, title, status, severity, impact, mitigation, pending_actions, created_at, updated_at FROM incidents WHERE id = ?1",
        params![&incident_id],
        |row| {
            Ok(Incident {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                severity: row.get(3)?,
                impact: row.get(4)?,
                mitigation: row.get(5)?,
                pending_actions: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_incident_ops(
    state: tauri::State<AppState>,
    input: UpdateIncidentOpsInput,
) -> Result<Incident, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = db::open(&state.db_path)?;
    let updated_at = db::now();
    conn.execute(
        "UPDATE incidents SET status = ?1, severity = ?2, impact = ?3, mitigation = ?4, pending_actions = ?5, updated_at = ?6 WHERE id = ?7",
        params![input.status, input.severity, input.impact, input.mitigation, input.pending_actions, &updated_at, input.incident_id],
    )
    .map_err(|error| error.to_string())?;
    conn.query_row(
        "SELECT id, title, status, severity, impact, mitigation, pending_actions, created_at, updated_at FROM incidents WHERE id = ?1",
        params![input.incident_id],
        |row| {
            Ok(Incident {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                severity: row.get(3)?,
                impact: row.get(4)?,
                mitigation: row.get(5)?,
                pending_actions: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_incident(state: tauri::State<AppState>, incident_id: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut conn = db::open(&state.db_path)?;
    let exists = conn
        .query_row(
            "SELECT 1 FROM incidents WHERE id = ?1",
            params![incident_id],
            |_| Ok(()),
        )
        .is_ok();
    if !exists {
        return Ok(());
    }
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM search_index WHERE incident_id = ?1",
        params![incident_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM evidence_tags WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1)", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM attachments WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1)", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM parser_outputs WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1)", params![incident_id]).map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM relations WHERE incident_id = ?1",
        params![incident_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM timeline_events WHERE incident_id = ?1",
        params![incident_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM entities WHERE incident_id = ?1",
        params![incident_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM tags WHERE incident_id = ?1",
        params![incident_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM evidence WHERE incident_id = ?1",
        params![incident_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM incidents WHERE id = ?1", params![incident_id])
        .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    db::remove_dir_if_exists(&state.attachments_dir.join(incident_id))?;
    Ok(())
}
