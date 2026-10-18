use crate::api::{build_router, AppState};
use crate::models::{clamp_idle_threshold, clamp_retention_days, Config};
use crate::storage::Storage;
use std::path::PathBuf;

pub const PORT: u16 = 8765;

/// `%ProgramData%\focusbrew\activity.db`. The service runs as LocalService, so the per-user
/// APPDATA would point into that account's profile; ProgramData is shared and stable.
pub fn db_path() -> PathBuf {
    let base = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("focusbrew");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("activity.db")
}

fn load_config(storage: &Storage) -> Config {
    let mut config = Config::default();
    if let Some(v) = storage.get_config("idle_threshold_minutes").ok().and_then(|s| s.parse().ok()) {
        config.idle_threshold_minutes = clamp_idle_threshold(v);
    }
    if let Some(v) = storage.get_config("retention_days").ok().and_then(|s| s.parse().ok()) {
        config.retention_days = clamp_retention_days(v);
    }
    config
}

/// Opens the database, restores saved settings and applies the retention policy once.
pub fn open_state() -> Result<AppState, String> {
    let storage = Storage::new(&db_path().to_string_lossy())?;
    let config = load_config(&storage);
    if let Err(e) = storage.cleanup_old_records(config.retention_days) {
        eprintln!("focusbrew-tracker: retention cleanup failed: {e}");
    }
    Ok(AppState::new(storage, config))
}

/// Serves the HTTP API on 127.0.0.1 in the background. Fails if the port is taken.
pub async fn start_http(state: AppState) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", PORT))
        .await
        .map_err(|e| format!("cannot bind 127.0.0.1:{PORT}: {e}"))?;
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, build_router(state)).await {
            eprintln!("focusbrew-tracker: HTTP server stopped: {e}");
        }
    });
    Ok(())
}
