//! Seconds of focus per day — what the Activity grid shows — and the list of
//! blocks worked, which the day summary is built from.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::data_dir;

/// How long the block history is kept.
pub const KEEP_DAYS: i64 = 400;

/// One block of work that ended. Title and project are copied when it ends,
/// so renaming or removing the task later doesn't rewrite history.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub task_id: String,
    pub title: String,
    #[serde(default)]
    pub project: Option<String>,
    /// Local date the block ended on, "AAAA-MM-DD".
    pub day: String,
    pub ended_ms: i64,
    pub secs: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ActivityLog {
    /// "AAAA-MM-DD" (local date of the day the block *ended*) -> seconds.
    /// The 0.1.x fields (`days`, `app_seconds_*`, and the old `sessions`
    /// shape) don't parse as this struct and the file starts empty.
    #[serde(default)]
    pub focus_secs_by_day: HashMap<String, u32>,
    #[serde(default)]
    pub sessions: Vec<Session>,
}

impl ActivityLog {
    pub fn add_focus_secs(&mut self, day: &str, secs: u32) {
        if secs == 0 {
            return;
        }
        let total = self.focus_secs_by_day.entry(day.to_string()).or_insert(0);
        *total = total.saturating_add(secs);
    }

    /// Drops blocks that ended more than `KEEP_DAYS` days before `today`.
    pub fn prune_sessions(&mut self, today: &str) {
        let Ok(today) = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d") else {
            return;
        };
        let first_kept = (today - chrono::Duration::days(KEEP_DAYS)).format("%Y-%m-%d").to_string();
        self.sessions.retain(|s| s.day >= first_kept);
    }

    /// Blocks that ended on `first_day` or later.
    pub fn sessions_since(&self, first_day: &str) -> Vec<Session> {
        self.sessions.iter().filter(|s| s.day.as_str() >= first_day).cloned().collect()
    }
}

/// Seconds worked on one project (`None` = no project) over a few spans.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProjectTotal {
    pub project: Option<String>,
    pub today: u32,
    /// Today and the 6 days before.
    pub week: u32,
    /// Today and the 29 days before.
    pub month: u32,
    pub total: u32,
}

fn day_minus(today: &str, days: i64) -> String {
    chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .map(|d| (d - chrono::Duration::days(days)).format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// Per project, most time overall first; "no project" last.
pub fn project_totals(sessions: &[Session], today: &str) -> Vec<ProjectTotal> {
    let week_start = day_minus(today, 6);
    let month_start = day_minus(today, 29);
    let mut totals: Vec<ProjectTotal> = Vec::new();
    for s in sessions {
        let index = match totals.iter().position(|t| t.project == s.project) {
            Some(i) => i,
            None => {
                totals.push(ProjectTotal { project: s.project.clone(), today: 0, week: 0, month: 0, total: 0 });
                totals.len() - 1
            }
        };
        let t = &mut totals[index];
        t.total = t.total.saturating_add(s.secs);
        if s.day >= month_start {
            t.month = t.month.saturating_add(s.secs);
        }
        if s.day >= week_start {
            t.week = t.week.saturating_add(s.secs);
        }
        if s.day == today {
            t.today = t.today.saturating_add(s.secs);
        }
    }
    totals.sort_by(|a, b| a.project.is_none().cmp(&b.project.is_none()).then(b.total.cmp(&a.total)));
    totals
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

    fn session(day: &str, secs: u32) -> Session {
        Session {
            task_id: "a".into(),
            title: "A".into(),
            project: None,
            day: day.into(),
            ended_ms: 0,
            secs,
        }
    }

    #[test]
    fn a_0_2_file_has_no_sessions_and_keeps_its_totals() {
        let log = parse(r#"{"focus_secs_by_day":{"2026-10-05":600}}"#);
        assert!(log.sessions.is_empty());
        assert_eq!(log.focus_secs_by_day["2026-10-05"], 600);
    }

    #[test]
    fn sessions_older_than_400_days_are_dropped() {
        let mut log = ActivityLog::default();
        log.sessions = vec![session("2025-09-01", 60), session("2025-09-02", 60), session("2026-10-05", 60)];
        log.prune_sessions("2026-10-06");
        // 2026-10-06 minus 400 days = 2025-09-01: that day is the first kept
        let days: Vec<_> = log.sessions.iter().map(|s| s.day.as_str()).collect();
        assert_eq!(days, vec!["2025-09-01", "2025-09-02", "2026-10-05"]);
        log.prune_sessions("2026-10-07");
        assert_eq!(log.sessions.len(), 2);
    }

    #[test]
    fn sessions_since_keeps_only_recent_days() {
        let mut log = ActivityLog::default();
        log.sessions = vec![session("2026-08-01", 60), session("2026-09-01", 60), session("2026-10-05", 60)];
        let recent = log.sessions_since("2026-09-01");
        assert_eq!(recent.len(), 2);
    }

    fn on(project: Option<&str>, day: &str, secs: u32) -> Session {
        Session { project: project.map(str::to_string), ..session(day, secs) }
    }

    #[test]
    fn project_totals_add_up_today_7_and_30_days_and_everything() {
        let sessions = vec![
            on(Some("virex"), "2026-10-05", 600),
            on(Some("virex"), "2026-09-29", 300), // 7th day back counts in the week
            on(Some("virex"), "2026-09-28", 100), // 8 days back: month only
            on(Some("virex"), "2026-09-05", 50),  // 31 days back: total only
            on(None, "2026-10-05", 60),
            on(Some("focusbrew"), "2026-10-04", 5000),
        ];
        let totals = project_totals(&sessions, "2026-10-05");
        let rows: Vec<_> = totals
            .iter()
            .map(|t| (t.project.as_deref(), t.today, t.week, t.month, t.total))
            .collect();
        assert_eq!(
            rows,
            vec![
                (Some("focusbrew"), 0, 5000, 5000, 5000),
                (Some("virex"), 600, 900, 1000, 1050),
                (None, 60, 60, 60, 60),
            ]
        );
    }

    #[test]
    fn no_sessions_no_projects() {
        assert!(project_totals(&[], "2026-10-05").is_empty());
    }

    #[test]
    fn a_saved_log_reads_back_the_same() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("2026-10-05", 1500);
        let raw = serde_json::to_string(&log).unwrap();
        assert_eq!(parse(&raw).focus_secs_by_day["2026-10-05"], 1500);
    }
}
