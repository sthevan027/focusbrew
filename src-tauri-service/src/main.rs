mod windows_service;

use focusbrew_tracker::{app, collector};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

fn main() {
    // Started by the Service Control Manager: report to it and return when it stops us.
    // From a console the dispatcher refuses (error 1063), so fall through and run in the foreground.
    if windows_service::dispatch().is_ok() {
        return;
    }

    let runtime = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("focusbrew-tracker: cannot start runtime: {e}");
            std::process::exit(1);
        }
    };
    runtime.block_on(async {
        let state = match app::open_state() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("focusbrew-tracker: {e}");
                std::process::exit(1);
            }
        };
        if let Err(e) = app::start_http(state.clone()).await {
            eprintln!("focusbrew-tracker: {e}");
            std::process::exit(1);
        }
        collector::run(state, Arc::new(AtomicBool::new(false))).await;
    });
}
