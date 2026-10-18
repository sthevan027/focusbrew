use chrono::Local;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

/// The log starts over past this size; it only has to explain what went wrong recently.
pub const MAX_LOG_BYTES: u64 = 512 * 1024;

/// The tracker has no console in release builds, so errors go to
/// `<LOCALAPPDATA>\focusbrew\tracker.log` (and stderr for dev runs).
pub fn write(message: &str) {
    eprintln!("focusbrew-tracker: {message}");
    let path = crate::app::db_path().with_file_name("tracker.log");
    write_to(&path, message);
}

pub fn write_to(path: &Path, message: &str) {
    let too_large = std::fs::metadata(path).map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false);
    let mut options = OpenOptions::new();
    options.create(true);
    if too_large {
        options.write(true).truncate(true);
    } else {
        options.append(true);
    }
    if let Ok(mut file) = options.open(path) {
        let _ = writeln!(file, "{} {message}", Local::now().format("%Y-%m-%d %H:%M:%S"));
    }
}
