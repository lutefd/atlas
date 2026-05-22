use std::{path::PathBuf, sync::Mutex};

pub struct AppState {
    pub db_path: PathBuf,
    pub attachments_dir: PathBuf,
    pub lock: Mutex<()>,
}
