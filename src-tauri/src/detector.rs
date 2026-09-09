use sysinfo::System;

/// Returns the subset of `monitored` (original casing, as configured) that
/// currently has a matching process running — used to attribute "time open"
/// per app on the dashboard, not just a single working/idle boolean.
pub fn monitored_processes_seen(sys: &System, monitored: &[String]) -> Vec<String> {
    if monitored.is_empty() {
        return Vec::new();
    }
    let running: Vec<String> = sys
        .processes()
        .values()
        .map(|p| p.name().to_string_lossy().to_lowercase())
        .collect();
    monitored
        .iter()
        .filter(|wanted| {
            let w = wanted.to_lowercase();
            running.iter().any(|name| *name == w || name.starts_with(w.as_str()))
        })
        .cloned()
        .collect()
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
