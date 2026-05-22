use crate::db;
use crate::state::AppState;
use rusqlite::params;
use std::{fs, path::PathBuf, process::Command};

fn export_incident_into(
    state: tauri::State<AppState>,
    incident_id: String,
    export_dir: PathBuf,
) -> Result<String, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let conn = db::open(&state.db_path)?;
    db::remove_dir_if_exists(&export_dir)?;
    fs::create_dir_all(export_dir.join("attachments")).map_err(|error| error.to_string())?;

    let incident = conn.query_row("SELECT id,title,created_at,updated_at FROM incidents WHERE id = ?1", params![&incident_id], |row| Ok(serde_json::json!({ "id": row.get::<_, String>(0)?, "title": row.get::<_, String>(1)?, "created_at": row.get::<_, String>(2)?, "updated_at": row.get::<_, String>(3)? }))).map_err(|error| error.to_string())?;
    db::write_json(&export_dir.join("incident.json"), &incident)?;

    let evidence = conn.prepare("SELECT id,incident_id,kind,source,content_text,content_hash,created_at,metadata_json,attachment_id FROM evidence WHERE incident_id = ?1 ORDER BY created_at ASC").map_err(|e| e.to_string())?.query_map(params![&incident_id], |row| Ok(serde_json::json!({ "id": row.get::<_, String>(0)?, "incident_id": row.get::<_, String>(1)?, "kind": row.get::<_, String>(2)?, "source": row.get::<_, String>(3)?, "content_text": row.get::<_, Option<String>>(4)?, "content_hash": row.get::<_, String>(5)?, "created_at": row.get::<_, String>(6)?, "metadata_json": row.get::<_, String>(7)?, "attachment_id": row.get::<_, Option<String>>(8)? }))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    db::write_json(
        &export_dir.join("evidence.json"),
        &serde_json::Value::Array(evidence),
    )?;

    let timeline = conn.prepare("SELECT id,incident_id,timestamp,title,description,confidence,source_evidence_id,source_parser_output_id,created_at FROM timeline_events WHERE incident_id = ?1 ORDER BY timestamp ASC").map_err(|e| e.to_string())?.query_map(params![&incident_id], |row| Ok(serde_json::json!({ "id": row.get::<_, String>(0)?, "incident_id": row.get::<_, String>(1)?, "timestamp": row.get::<_, String>(2)?, "title": row.get::<_, String>(3)?, "description": row.get::<_, String>(4)?, "confidence": row.get::<_, f64>(5)?, "source_evidence_id": row.get::<_, Option<String>>(6)?, "source_parser_output_id": row.get::<_, Option<String>>(7)?, "created_at": row.get::<_, String>(8)? }))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    db::write_json(
        &export_dir.join("timeline.json"),
        &serde_json::Value::Array(timeline),
    )?;

    let entities = conn.prepare("SELECT id,incident_id,type,name,confidence,source_evidence_id,source_parser_output_id,created_at FROM entities WHERE incident_id = ?1 ORDER BY created_at ASC").map_err(|e| e.to_string())?.query_map(params![&incident_id], |row| Ok(serde_json::json!({ "id": row.get::<_, String>(0)?, "incident_id": row.get::<_, String>(1)?, "type": row.get::<_, String>(2)?, "name": row.get::<_, String>(3)?, "confidence": row.get::<_, f64>(4)?, "source_evidence_id": row.get::<_, Option<String>>(5)?, "source_parser_output_id": row.get::<_, Option<String>>(6)?, "created_at": row.get::<_, String>(7)? }))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    db::write_json(
        &export_dir.join("entities.json"),
        &serde_json::Value::Array(entities),
    )?;

    let tags = conn.prepare("SELECT id,incident_id,name,created_at FROM tags WHERE incident_id = ?1 ORDER BY name ASC").map_err(|e| e.to_string())?.query_map(params![&incident_id], |row| Ok(serde_json::json!({ "id": row.get::<_, String>(0)?, "incident_id": row.get::<_, String>(1)?, "name": row.get::<_, String>(2)?, "created_at": row.get::<_, String>(3)? }))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    db::write_json(
        &export_dir.join("tags.json"),
        &serde_json::Value::Array(tags),
    )?;

    let parser_outputs = conn.prepare("SELECT id,evidence_id,parser_name,parser_version,output_json,created_at FROM parser_outputs WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1) ORDER BY created_at ASC").map_err(|e| e.to_string())?.query_map(params![&incident_id], |row| Ok(serde_json::json!({ "id": row.get::<_, String>(0)?, "evidence_id": row.get::<_, String>(1)?, "parser_name": row.get::<_, String>(2)?, "parser_version": row.get::<_, String>(3)?, "output_json": row.get::<_, String>(4)?, "created_at": row.get::<_, String>(5)? }))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    db::write_json(
        &export_dir.join("parser_outputs.json"),
        &serde_json::Value::Array(parser_outputs),
    )?;

    let attachments = conn.prepare("SELECT id,evidence_id,path,mime_type,size_bytes,created_at FROM attachments WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?1)").map_err(|e| e.to_string())?.query_map(params![&incident_id], |row| {
        let path: String = row.get(2)?;
        let file_name = PathBuf::from(&path).file_name().and_then(|value| value.to_str()).unwrap_or("attachment").to_string();
        Ok((path, file_name.clone(), serde_json::json!({ "id": row.get::<_, String>(0)?, "evidence_id": row.get::<_, String>(1)?, "file_name": file_name, "mime_type": row.get::<_, Option<String>>(3)?, "size_bytes": row.get::<_, i64>(4)?, "created_at": row.get::<_, String>(5)? })))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let mut attachment_json = Vec::new();
    for (source_path, file_name, value) in attachments {
        fs::copy(&source_path, export_dir.join("attachments").join(file_name))
            .map_err(|error| error.to_string())?;
        attachment_json.push(value);
    }
    db::write_json(
        &export_dir.join("attachments.json"),
        &serde_json::Value::Array(attachment_json),
    )?;
    Ok(export_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_incident(state: tauri::State<AppState>, incident_id: String) -> Result<String, String> {
    let export_dir = state
        .db_path
        .parent()
        .ok_or_else(|| "Missing app data directory".to_string())?
        .join("exports")
        .join(&incident_id);
    export_incident_into(state, incident_id, export_dir)
}

#[tauri::command]
pub fn select_export_directory() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Choose export destination")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn select_import_directory() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Choose incident export folder")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_incident_to_directory(
    state: tauri::State<AppState>,
    incident_id: String,
    destination: String,
) -> Result<String, String> {
    let export_dir = PathBuf::from(destination).join(&incident_id);
    export_incident_into(state, incident_id, export_dir)
}

#[tauri::command]
pub fn save_markdown_document(
    default_name: String,
    markdown: String,
) -> Result<Option<String>, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("Save incident document")
        .set_file_name(&default_name)
        .add_filter("Markdown", &["md"])
        .save_file()
    else {
        return Ok(None);
    };
    fs::write(&path, markdown).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let target = PathBuf::from(path);
        let dir = if target.is_dir() {
            target
        } else {
            target
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."))
                .to_path_buf()
        };
        Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub fn import_incident(state: tauri::State<AppState>, export_path: String) -> Result<(), String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let export_dir = PathBuf::from(export_path);
    let incident = db::read_json(&export_dir.join("incident.json"))?;
    let incident_id = db::json_string(&incident, "id")?;
    let mut conn = db::open(&state.db_path)?;
    let exists = conn
        .query_row(
            "SELECT 1 FROM incidents WHERE id = ?1",
            params![&incident_id],
            |_| Ok(()),
        )
        .is_ok();
    if exists {
        return Err(format!("Incident {incident_id} already exists"));
    }

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO incidents VALUES (?1, ?2, ?3, ?4)",
        params![
            incident_id,
            db::json_string(&incident, "title")?,
            db::json_string(&incident, "created_at")?,
            db::json_string(&incident, "updated_at")?
        ],
    )
    .map_err(|error| error.to_string())?;

    for row in db::read_json(&export_dir.join("evidence.json"))?
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        tx.execute(
            "INSERT INTO evidence VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                db::json_string(&row, "id")?,
                db::json_string(&row, "incident_id")?,
                db::json_string(&row, "kind")?,
                db::json_string(&row, "source")?,
                db::json_optional_string(&row, "content_text"),
                db::json_string(&row, "content_hash")?,
                db::json_string(&row, "created_at")?,
                db::json_string(&row, "metadata_json")?,
                db::json_optional_string(&row, "attachment_id")
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    for row in db::read_json(&export_dir.join("parser_outputs.json"))?
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        tx.execute(
            "INSERT INTO parser_outputs VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                db::json_string(&row, "id")?,
                db::json_string(&row, "evidence_id")?,
                db::json_string(&row, "parser_name")?,
                db::json_string(&row, "parser_version")?,
                db::json_string(&row, "output_json")?,
                db::json_string(&row, "created_at")?
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    for row in db::read_json(&export_dir.join("timeline.json"))?
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        tx.execute(
            "INSERT INTO timeline_events VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                db::json_string(&row, "id")?,
                db::json_string(&row, "incident_id")?,
                db::json_string(&row, "timestamp")?,
                db::json_string(&row, "title")?,
                db::json_string(&row, "description")?,
                row.get("confidence")
                    .and_then(|value| value.as_f64())
                    .unwrap_or(1.0),
                db::json_optional_string(&row, "source_evidence_id"),
                db::json_optional_string(&row, "source_parser_output_id"),
                db::json_string(&row, "created_at")?
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    for row in db::read_json(&export_dir.join("entities.json"))?
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        tx.execute(
            "INSERT INTO entities VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                db::json_string(&row, "id")?,
                db::json_string(&row, "incident_id")?,
                db::json_string(&row, "type")?,
                db::json_string(&row, "name")?,
                row.get("confidence")
                    .and_then(|value| value.as_f64())
                    .unwrap_or(1.0),
                db::json_optional_string(&row, "source_evidence_id"),
                db::json_optional_string(&row, "source_parser_output_id"),
                db::json_string(&row, "created_at")?
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    for row in db::read_json(&export_dir.join("tags.json"))?
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        tx.execute(
            "INSERT OR IGNORE INTO tags VALUES (?1, ?2, ?3, ?4)",
            params![
                db::json_string(&row, "id")?,
                db::json_string(&row, "incident_id")?,
                db::json_string(&row, "name")?,
                db::json_string(&row, "created_at")?
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    for row in db::read_json(&export_dir.join("attachments.json"))?
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        let evidence_id = db::json_string(&row, "evidence_id")?;
        let file_name = db::json_string(&row, "file_name")?;
        let target_dir = state.attachments_dir.join(&incident_id).join(&evidence_id);
        fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
        let target_path = target_dir.join(&file_name);
        fs::copy(
            export_dir.join("attachments").join(&file_name),
            &target_path,
        )
        .map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT INTO attachments VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                db::json_string(&row, "id")?,
                evidence_id,
                target_path.to_string_lossy(),
                db::json_optional_string(&row, "mime_type"),
                row.get("size_bytes")
                    .and_then(|value| value.as_i64())
                    .unwrap_or(0),
                db::json_string(&row, "created_at")?
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    db::rebuild_search_index(&tx, &incident_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}
