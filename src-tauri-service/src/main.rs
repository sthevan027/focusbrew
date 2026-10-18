// Release builds have no console window: the tracker is started at logon by the HKCU Run entry
// (see install-autostart.ps1) and must stay invisible. Dev builds keep the console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use focusbrew_tracker::{app, collector, log};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn main() {
    let runtime = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(runtime) => runtime,
        Err(e) => {
            log::write(&format!("cannot start runtime: {e}"));
            std::process::exit(1);
        }
    };

    runtime.block_on(async {
        let state = match app::open_state() {
            Ok(state) => state,
            Err(e) => {
                log::write(&e);
                std::process::exit(1);
            }
        };
        // Also how a second instance is refused: the port is already bound.
        if let Err(e) = app::start_http(state.clone()).await {
            log::write(&e);
            std::process::exit(1);
        }

        // Ctrl+C in a dev console still flushes the open segment before exiting.
        let stop = Arc::new(AtomicBool::new(false));
        let on_ctrl_c = stop.clone();
        tokio::spawn(async move {
            if tokio::signal::ctrl_c().await.is_ok() {
                on_ctrl_c.store(true, Ordering::Relaxed);
            }
        });

        collector::run(state, stop).await;
    });
}
