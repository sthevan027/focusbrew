use focusbrew_tracker::{app, collector};
use std::ffi::OsString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use windows_service::service::{
    ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::{define_windows_service, service_dispatcher};

pub const SERVICE_NAME: &str = "FocusbrewActivityTracker";

define_windows_service!(ffi_service_main, service_main);

/// Hands this process to the Service Control Manager. Returns an error without blocking
/// when the process was not started by the SCM (run from a console).
pub fn dispatch() -> windows_service::Result<()> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)
}

fn service_main(_args: Vec<OsString>) {
    if let Err(e) = run_service() {
        eprintln!("focusbrew-tracker: service failed: {e}");
    }
}

fn run_service() -> windows_service::Result<()> {
    let stop = Arc::new(AtomicBool::new(false));
    let handler_stop = stop.clone();
    let status = service_control_handler::register(SERVICE_NAME, move |control| match control {
        ServiceControl::Stop | ServiceControl::Shutdown => {
            handler_stop.store(true, Ordering::Relaxed);
            ServiceControlHandlerResult::NoError
        }
        ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
        _ => ServiceControlHandlerResult::NotImplemented,
    })?;

    let report = |state: ServiceState, accepts: ServiceControlAccept| {
        status.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: state,
            controls_accepted: accepts,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })
    };
    report(ServiceState::Running, ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN)?;

    match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(runtime) => runtime.block_on(async {
            match app::open_state() {
                Ok(state) => {
                    if let Err(e) = app::start_http(state.clone()).await {
                        eprintln!("focusbrew-tracker: {e}");
                        return;
                    }
                    collector::run(state, stop).await;
                }
                Err(e) => eprintln!("focusbrew-tracker: {e}"),
            }
        }),
        Err(e) => eprintln!("focusbrew-tracker: cannot start runtime: {e}"),
    }

    report(ServiceState::Stopped, ServiceControlAccept::empty())?;
    Ok(())
}
