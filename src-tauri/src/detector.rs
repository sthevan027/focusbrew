use sysinfo::System;

/// Returns true if any process whose name matches (case-insensitive) one of
/// `monitored` is currently running.
pub fn is_any_monitored_process_running(sys: &System, monitored: &[String]) -> bool {
    if monitored.is_empty() {
        return false;
    }
    let wanted: Vec<String> = monitored.iter().map(|p| p.to_lowercase()).collect();
    sys.processes().values().any(|process| {
        let name = process.name().to_string_lossy().to_lowercase();
        wanted.iter().any(|w| name == *w || name.starts_with(w.as_str()))
    })
}

/// Kills every running process whose name matches (case-insensitive) one of `blocked`.
/// Returns the names of the processes that were killed.
pub fn kill_blocked_processes(sys: &System, blocked: &[String]) -> Vec<String> {
    if blocked.is_empty() {
        return Vec::new();
    }
    let wanted: Vec<String> = blocked.iter().map(|p| p.to_lowercase()).collect();
    let mut killed = Vec::new();
    for process in sys.processes().values() {
        let name = process.name().to_string_lossy().to_lowercase();
        if wanted.iter().any(|w| name == *w || name.starts_with(w.as_str())) {
            if process.kill() {
                killed.push(name);
            }
        }
    }
    killed
}
