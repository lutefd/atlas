mod commands;
mod db;
mod models;
mod state;

use std::fs;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            fs::create_dir_all(app_dir.join("attachments"))?;
            let db_path = app_dir.join("app.sqlite");
            db::migrate(&db::open(&db_path).map_err(|error| Box::<dyn std::error::Error>::from(error))?)
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(state::AppState {
                db_path,
                attachments_dir: app_dir.join("attachments"),
                lock: std::sync::Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_incident,
            commands::rename_incident,
            commands::add_evidence,
            commands::save_parser_output,
            commands::create_job,
            commands::update_job,
            commands::create_manual_timeline_event,
            commands::update_manual_timeline_event,
            commands::delete_manual_timeline_event,
            commands::add_tag,
            commands::delete_tag,
            commands::clear_evidence_parsers,
            commands::delete_evidence,
            commands::delete_incident,
            commands::load_snapshot,
            commands::search,
            commands::load_attachment,
            commands::open_attachment,
            commands::reveal_attachment,
            commands::run_ocr,
            commands::has_ocr,
            commands::export_incident,
            commands::export_incident_to_directory,
            commands::import_incident,
            commands::select_export_directory,
            commands::select_import_directory,
            commands::save_markdown_document,
            commands::reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("failed to run atlas");
}
