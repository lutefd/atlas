use crate::db;
use crate::models::*;
use crate::state::AppState;
use rusqlite::params;

#[tauri::command]
pub fn create_job(state: tauri::State<AppState>, input: CreateJobInput) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let created_at = db::now();
    db::open(&state.db_path)?.execute("INSERT INTO jobs (id, kind, status, payload_json, error_text, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)", params![input.id, input.kind, input.status, input.payload_json, created_at]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_job(state: tauri::State<AppState>, input: UpdateJobInput) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    db::open(&state.db_path)?
        .execute(
            "UPDATE jobs SET status = ?1, error_text = ?2, updated_at = ?3 WHERE id = ?4",
            params![input.status, input.error_text, db::now(), input.id],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
