//! File logging for the backend. Logs carry ids, counts and error messages only,
//! never the text of tasks or notes.

use std::io;
use std::path::Path;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::EnvFilter;

const LOG_FILES_KEPT: usize = 7;

/// Installs the global subscriber writing a daily file (7 kept) into `dir`.
/// Level comes from `FOCUSBREW_LOG`, default `info`. Keep the guard alive.
pub fn init_in(dir: &Path) -> Result<WorkerGuard, String> {
    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("focusbrew")
        .filename_suffix("log")
        .max_log_files(LOG_FILES_KEPT)
        .build(dir)
        .map_err(|e| e.to_string())?;
    let (writer, guard) = tracing_appender::non_blocking(appender);
    let filter = EnvFilter::try_from_env("FOCUSBREW_LOG").unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer)
        .with_ansi(false)
        .try_init()
        .map_err(|e| e.to_string())?;
    Ok(guard)
}

/// Logs into `<local data dir>/logs`. A failure becomes `None`: logging must never take the app down.
pub fn init() -> Option<WorkerGuard> {
    let dir = crate::config::local_data_dir().join("logs");
    std::fs::create_dir_all(&dir).ok()?;
    init_in(&dir).ok()
}

/// Logs the error of an I/O step (what failed + the error message); Ok is silent.
#[allow(dead_code)] // first caller arrives with the atomic-save work
pub fn log_io(what: &str, result: io::Result<()>) {
    if let Err(e) = result {
        tracing::error!(what, error = %e, "io failed");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_in_writes_a_line_to_a_file() {
        let dir = std::env::temp_dir().join(format!("focusbrew-log-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let guard = init_in(&dir).expect("init");
        tracing::info!("hello");
        drop(guard);
        let found = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| std::fs::read_to_string(e.path()).map_or(false, |s| s.contains("hello")));
        std::fs::remove_dir_all(&dir).ok();
        assert!(found);
    }

    #[test]
    fn log_io_ok_is_silent_and_err_does_not_panic() {
        log_io("ok", Ok(()));
        log_io("bad", Err(io::Error::new(io::ErrorKind::Other, "boom")));
    }
}
