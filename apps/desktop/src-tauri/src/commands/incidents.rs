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
        created_at: db::now(),
        updated_at: db::now(),
    };
    conn.execute(
        "INSERT INTO incidents VALUES (?1, ?2, ?3, ?4)",
        params![
            incident.id,
            incident.title,
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
        "SELECT id, title, created_at, updated_at FROM incidents WHERE id = ?1",
        params![&incident_id],
        |row| {
            Ok(Incident {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
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
