use focusbrew_tracker::api::AppState;
use focusbrew_tracker::collector::{self, ErrorGate};
use focusbrew_tracker::models::Config;
use focusbrew_tracker::storage::Storage;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[tokio::test]
async fn run_returns_promptly_when_stop_is_already_set() {
    let state = AppState::new(Storage::open_memory().unwrap(), Config::default());
    let stop = Arc::new(AtomicBool::new(true));

    tokio::time::timeout(Duration::from_secs(2), collector::run(state, stop))
        .await
        .expect("collector should stop without waiting for a tick");
}

/// The real detector against the real desktop: this is the check that was missing when the
/// collector ran in Session 0 and recorded nothing while every other test stayed green.
/// Needs an interactive session with a foreground window, so it only runs on request:
///   cargo test --test test_collector -- --ignored
#[tokio::test]
#[ignore = "needs an interactive desktop session with a foreground window"]
async fn real_collection_writes_rows_for_the_foreground_app() {
    let state = AppState::new(Storage::open_memory().unwrap(), Config::default());
    let stop = Arc::new(AtomicBool::new(false));
    let stopper = stop.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(3)).await;
        stopper.store(true, Ordering::Relaxed);
    });

    collector::run(state.clone(), stop).await;

    let rows: i64 = state
        .storage
        .lock()
        .await
        .db
        .query_row("SELECT COUNT(*) FROM activities", [], |r| r.get(0))
        .unwrap();
    assert!(rows > 0, "no rows after 3 s: the detector sees no foreground window in this session");
}

#[test]
fn error_gate_reports_a_new_failure_once_then_stays_quiet() {
    let mut gate = ErrorGate::default();
    assert!(gate.report(Err("No foreground window found")).is_some());
    assert!(gate.report(Err("No foreground window found")).is_none());
    assert!(gate.report(Err("Process 4 not found")).is_some(), "a different error is news");
}

#[test]
fn error_gate_reports_recovery_once() {
    let mut gate = ErrorGate::default();
    gate.report(Err("No foreground window found"));
    assert!(gate.report(Ok(())).is_some());
    assert!(gate.report(Ok(())).is_none());
}

#[test]
fn error_gate_is_silent_while_healthy() {
    assert!(ErrorGate::default().report(Ok(())).is_none());
}
