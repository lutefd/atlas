use crate::db;
use crate::models::*;
use crate::state::AppState;
use base64::Engine;
use rusqlite::params;
use std::{fs, path::PathBuf, process::Command};

#[tauri::command]
pub fn load_attachment(
    state: tauri::State<AppState>,
    evidence_id: String,
) -> Result<Option<AttachmentData>, String> {
    let conn = db::open(&state.db_path)?;
    let mut stmt = conn
        .prepare("SELECT path, mime_type FROM attachments WHERE evidence_id = ?1 LIMIT 1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![evidence_id])
        .map_err(|e| e.to_string())?;
    let Some(row) = rows.next().map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path: String = row.get(0).map_err(|e| e.to_string())?;
    let mime_type: Option<String> = row.get(1).map_err(|e| e.to_string())?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let name = PathBuf::from(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment")
        .to_string();
    let inferred = if name.ends_with(".png") {
        "image/png"
    } else if name.ends_with(".jpg") || name.ends_with(".jpeg") {
        "image/jpeg"
    } else if name.ends_with(".gif") {
        "image/gif"
    } else {
        "application/octet-stream"
    };
    Ok(Some(AttachmentData {
        name,
        mime_type: mime_type.unwrap_or_else(|| inferred.to_string()),
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        path,
    }))
}

#[tauri::command]
pub fn open_attachment(state: tauri::State<AppState>, evidence_id: String) -> Result<(), String> {
    let conn = db::open(&state.db_path)?;
    let path = conn
        .query_row(
            "SELECT path FROM attachments WHERE evidence_id = ?1 LIMIT 1",
            params![evidence_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| error.to_string())?;
    Command::new("open")
        .arg(&path)
        .status()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reveal_attachment(state: tauri::State<AppState>, evidence_id: String) -> Result<(), String> {
    let conn = db::open(&state.db_path)?;
    let path = conn
        .query_row(
            "SELECT path FROM attachments WHERE evidence_id = ?1 LIMIT 1",
            params![evidence_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| error.to_string())?;
    Command::new("open")
        .arg("-R")
        .arg(&path)
        .status()
        .map_err(|error| error.to_string())?;
    Ok(())
}
