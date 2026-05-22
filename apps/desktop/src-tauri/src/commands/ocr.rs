use std::process::Command;
use crate::state::AppState;

#[tauri::command]
pub fn run_ocr(state: tauri::State<AppState>, evidence_id: String) -> Result<String, String> {
    let conn = crate::db::open(&state.db_path)?;
    let path = conn
        .query_row(
            "SELECT path FROM attachments WHERE evidence_id = ?1 LIMIT 1",
            rusqlite::params![evidence_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| error.to_string())?;
    let output = Command::new("tesseract")
        .arg(&path)
        .arg("stdout")
        .output()
        .map_err(|_| "Local OCR requires the `tesseract` command to be installed.".to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn has_ocr() -> bool {
    Command::new("tesseract").arg("--version").output().is_ok()
}
