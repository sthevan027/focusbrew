use crate::api::AppState;
use crate::detector;
use crate::models::ActivityRecord;
use crate::recorder::Recorder;
use chrono::Utc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const CLEANUP_EVERY: Duration = Duration::from_secs(60 * 60);
/// Longest span that can be lost if the process dies mid-segment.
const CHECKPOINT_EVERY: Duration = Duration::from_secs(60);

/// Samples the foreground app once a second until `stop` is set, then flushes the open segment.
pub async fn run(state: AppState, stop: Arc<AtomicBool>) {
    let mut recorder = Recorder::default();
    let mut ticker = tokio::time::interval(Duration::from_secs(1));
    let mut last_cleanup = Instant::now();
    let mut last_checkpoint = Instant::now();

    while !stop.load(Ordering::Relaxed) {
        ticker.tick().await;

        let threshold = state.config.lock().await.idle_threshold_minutes;
        let observed = detector::detect_active_app(threshold).ok();
        let obs = observed.as_ref().map(|a| (a.app_name.as_str(), a.is_idle));

        if let Some(record) = recorder.observe(obs, Utc::now()) {
            write(&state, &record).await;
        }

        if last_checkpoint.elapsed() >= CHECKPOINT_EVERY {
            if let Some(record) = recorder.checkpoint(Utc::now()) {
                write(&state, &record).await;
            }
            last_checkpoint = Instant::now();
        }

        if last_cleanup.elapsed() >= CLEANUP_EVERY {
            let retention = state.config.lock().await.retention_days;
            if let Err(e) = state.storage.lock().await.cleanup_old_records(retention) {
                eprintln!("focusbrew-tracker: retention cleanup failed: {e}");
            }
            last_cleanup = Instant::now();
        }
    }

    if let Some(record) = recorder.finish(Utc::now()) {
        write(&state, &record).await;
    }
}

async fn write(state: &AppState, record: &ActivityRecord) {
    if let Err(e) = state.storage.lock().await.write_activity(record) {
        eprintln!("focusbrew-tracker: {e}");
    }
}
