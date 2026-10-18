use crate::api::{build_router, AppState};
use crate::log;
use crate::models::{clamp_idle_threshold, clamp_retention_days, Config};
use crate::storage::Storage;
use std::ffi::OsString;
use std::path::PathBuf;

pub const DEFAULT_PORT: u16 = 8765;
/// Overrides the port, mainly so a second instance can run next to one that holds 8765.
pub const PORT_ENV: &str = "FOCUSBREW_TRACKER_PORT";

pub fn port_from(raw: Option<&str>) -> u16 {
    raw.and_then(|s| s.trim().parse::<u16>().ok())
        .filter(|port| *port != 0)
        .unwrap_or(DEFAULT_PORT)
}

pub fn port() -> u16 {
    port_from(std::env::var(PORT_ENV).ok().as_deref())
}

/// `<LOCALAPPDATA>\focusbrew\activity.db`. The tracker runs in the user's session, so the
/// per-user profile is both the right owner and private to that user by default.
pub fn db_path_in(local_app_data: Option<OsString>) -> PathBuf {
    local_app_data
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("focusbrew")
        .join("activity.db")
}

pub fn db_path() -> PathBuf {
    let path = db_path_in(std::env::var_os("LOCALAPPDATA"));
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    path
}

fn load_config(storage: &Storage) -> Config {
    let mut config = Config::default();
    if let Some(v) = storage.get_config("idle_threshold_minutes").ok().and_then(|s| s.parse().ok()) {
        config.idle_threshold_minutes = clamp_idle_threshold(v);
    }
    if let Some(v) = storage.get_config("retention_days").ok().and_then(|s| s.parse().ok()) {
        config.retention_days = clamp_retention_days(v);
    }
    config.service_port = port();
    config
}

/// Opens the database, restores saved settings and applies the retention policy once.
pub fn open_state() -> Result<AppState, String> {
    let storage = Storage::new(&db_path().to_string_lossy())?;
    let config = load_config(&storage);
    if let Err(e) = storage.cleanup_old_records(config.retention_days) {
        log::write(&format!("retention cleanup failed: {e}"));
    }
    Ok(AppState::new(storage, config))
}

/// Serves the HTTP API on 127.0.0.1 in the background. Fails if the port is taken, which is
/// also how a second tracker instance is refused.
pub async fn start_http(state: AppState) -> Result<(), String> {
    let port = port();
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("cannot bind 127.0.0.1:{port}: {e}"))?;
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, build_router(state)).await {
            log::write(&format!("HTTP server stopped: {e}"));
        }
    });
    Ok(())
}
