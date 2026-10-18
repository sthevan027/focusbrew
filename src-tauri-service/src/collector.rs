use crate::api::AppState;
use crate::detector;
use crate::log;
use crate::models::ActivityRecord;
use crate::recorder::Recorder;
use chrono::Utc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const CLEANUP_EVERY: Duration = Duration::from_secs(60 * 60);
/// Longest span that can be lost if the process dies mid-segment.
const CHECKPOINT_EVERY: Duration = Duration::from_secs(60);

/// Remembers whether the detector was failing so a persistent failure is logged once,
/// not once a second. A collector that silently sees nothing is the failure this prevents.
#[derive(Default)]
pub struct ErrorGate {
    last: Option<String>,
}

impl ErrorGate {
    /// Returns a line to log when the detector's health changes, `None` otherwise.
    pub fn report(&mut self, outcome: Result<(), &str>) -> Option<String> {
        match (outcome, &self.last) {
            (Err(e), Some(previous)) if previous == e => None,
            (Err(e), _) => {
                self.last = Some(e.to_string());
                Some(format!("detector error: {e}"))
            }
            (Ok(()), Some(_)) => {
                self.last = None;
                Some("detector recovered".to_string())
            }
            (Ok(()), None) => None,
        }
    }
}

/// Samples the foreground app once a second until `stop` is set, then flushes the open segment.
pub async fn run(state: AppState, stop: Arc<AtomicBool>) {
    let mut recorder = Recorder::default();
    let mut gate = ErrorGate::default();
    let mut ticker = tokio::time::interval(Duration::from_secs(1));
    let mut last_cleanup = Instant::now();
    let mut last_checkpoint = Instant::now();

    while !stop.load(Ordering::Relaxed) {
        ticker.tick().await;

        let threshold = state.config.lock().await.idle_threshold_minutes;
        let detected = detector::detect_active_app(threshold);
        if let Some(line) = gate.report(detected.as_ref().map(|_| ()).map_err(String::as_str)) {
            log::write(&line);
        }
        let observed = detected.ok();
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
                log::write(&format!("retention cleanup failed: {e}"));
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
        log::write(&e);
    }
}
