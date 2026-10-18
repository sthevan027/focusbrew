use focusbrew_tracker::api::AppState;
use focusbrew_tracker::collector;
use focusbrew_tracker::models::Config;
use focusbrew_tracker::storage::Storage;
use std::sync::atomic::AtomicBool;
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
