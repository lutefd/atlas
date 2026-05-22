use crate::db;
use crate::state::AppState;
use rusqlite::params;

#[tauri::command]
pub fn add_tag(state: tauri::State<AppState>, incident_id: String, name: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    db::open(&state.db_path)?
        .execute(
            "INSERT OR IGNORE INTO tags VALUES (?1, ?2, ?3, ?4)",
            params![db::id(), incident_id, name.trim(), db::now()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_tag(state: tauri::State<AppState>, tag_id: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = db::open(&state.db_path)?;
    conn.execute(
        "DELETE FROM evidence_tags WHERE tag_id = ?1",
        params![tag_id],
    )
    .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", params![tag_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}
