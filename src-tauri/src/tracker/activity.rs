//! Seconds of focus per day — what the Activity grid shows.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::data_dir;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ActivityLog {
    /// "AAAA-MM-DD" (local date of the day the block *ended*) -> seconds.
    /// The fields the 0.1.x file had (`days`, `sessions`, `app_seconds_*`) are
    /// ignored on load and dropped on the next save.
    #[serde(default)]
    pub focus_secs_by_day: HashMap<String, u32>,
}

impl ActivityLog {
    pub fn add_focus_secs(&mut self, day: &str, secs: u32) {
        if secs == 0 {
            return;
        }
        let total = self.focus_secs_by_day.entry(day.to_string()).or_insert(0);
        *total = total.saturating_add(secs);
    }
}

fn log_path() -> PathBuf {
    data_dir().join("activity.json")
}

pub fn parse(raw: &str) -> ActivityLog {
    serde_json::from_str(raw).unwrap_or_default()
}

pub fn load() -> ActivityLog {
    match fs::read_to_string(log_path()) {
        Ok(raw) => parse(&raw),
        Err(_) => ActivityLog::default(),
    }
}

pub fn save(log: &ActivityLog) -> std::io::Result<()> {
    let raw = serde_json::to_string_pretty(log)?;
    fs::write(log_path(), raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seconds_add_up_within_a_day() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("2026-10-05", 600);
        log.add_focus_secs("2026-10-05", 300);
        log.add_focus_secs("2026-10-06", 60);
        assert_eq!(log.focus_secs_by_day["2026-10-05"], 900);
        assert_eq!(log.focus_secs_by_day["2026-10-06"], 60);
    }

    #[test]
    fn zero_seconds_leave_no_entry() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("2026-10-05", 0);
        assert!(log.focus_secs_by_day.is_empty());
    }

    #[test]
    fn the_sum_never_overflows() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("d", u32::MAX);
        log.add_focus_secs("d", 10);
        assert_eq!(log.focus_secs_by_day["d"], u32::MAX);
    }

    // The 0.1.x file has `days`, `sessions` and `app_seconds_*`; none of it is
    // read any more, and loading it must not fail.
    #[test]
    fn an_old_activity_file_loads_as_empty() {
        let raw = r#"{"days":{"2026-09-09":3},"sessions":[],
                      "app_seconds_today":{"Code.exe":120},"app_seconds_day":"2026-09-09"}"#;
        assert!(parse(raw).focus_secs_by_day.is_empty());
    }

    // Review focus: corrupted / empty files must not panic.
    #[test]
    fn empty_or_corrupted_files_become_an_empty_log() {
        assert!(parse("").focus_secs_by_day.is_empty());
        assert!(parse("garbage").focus_secs_by_day.is_empty());
        assert!(parse("[1,2,3]").focus_secs_by_day.is_empty());
    }

    #[test]
    fn a_saved_log_reads_back_the_same() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("2026-10-05", 1500);
        let raw = serde_json::to_string(&log).unwrap();
        assert_eq!(parse(&raw).focus_secs_by_day["2026-10-05"], 1500);
    }
}
