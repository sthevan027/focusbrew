use chrono::Utc;
use focusbrew_tracker::api::{build_router, AppState};
use focusbrew_tracker::detector;
use focusbrew_tracker::models::{clamp_idle_threshold, clamp_retention_days, Config};
use focusbrew_tracker::recorder::Recorder;
use focusbrew_tracker::storage::Storage;
use std::path::PathBuf;
use std::time::{Duration, Instant};

const PORT: u16 = 8765;
const CLEANUP_EVERY: Duration = Duration::from_secs(60 * 60);

/// `%ProgramData%\focusbrew\activity.db`. The service runs as LocalService, so the per-user
/// APPDATA would point into that account's profile; ProgramData is shared and stable.
fn db_path() -> PathBuf {
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

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let storage = match Storage::new(&db_path().to_string_lossy()) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("focusbrew-tracker: {e}");
            std::process::exit(1);
        }
    };
    let config = load_config(&storage);
    if let Err(e) = storage.cleanup_old_records(config.retention_days) {
        eprintln!("focusbrew-tracker: retention cleanup failed: {e}");
    }
    let state = AppState::new(storage, config);

    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("focusbrew-tracker: cannot bind 127.0.0.1:{PORT}: {e}");
            std::process::exit(1);
        }
    };
    let router = build_router(state.clone());
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("focusbrew-tracker: HTTP server stopped: {e}");
        }
    });

    let mut recorder = Recorder::default();
    let mut ticker = tokio::time::interval(Duration::from_secs(1));
    let mut last_cleanup = Instant::now();
    loop {
        ticker.tick().await;

        let threshold = state.config.lock().await.idle_threshold_minutes;
        let observed = detector::detect_active_app(threshold).ok();
        let obs = observed.as_ref().map(|a| (a.app_name.as_str(), a.is_idle));

        if let Some(record) = recorder.observe(obs, Utc::now()) {
            if let Err(e) = state.storage.lock().await.write_activity(&record) {
                eprintln!("focusbrew-tracker: {e}");
            }
        }

        if last_cleanup.elapsed() >= CLEANUP_EVERY {
            let retention = state.config.lock().await.retention_days;
            if let Err(e) = state.storage.lock().await.cleanup_old_records(retention) {
                eprintln!("focusbrew-tracker: retention cleanup failed: {e}");
            }
            last_cleanup = Instant::now();
        }
    }
}
