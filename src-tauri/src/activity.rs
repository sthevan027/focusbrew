use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Duration as ChronoDuration, Local};
use serde::{Deserialize, Serialize};

use crate::config::data_dir;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionKind {
    Focus,
    Break,
}

/// One focus or break block that was recorded — either finished naturally
/// or stopped early — powers the "resumo de hoje" on the dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub kind: SessionKind,
    pub started_at: DateTime<Local>,
    pub ended_at: DateTime<Local>,
    pub duration_secs: u32,
}

/// Keep the session list from growing forever — a personal local log, not
/// meant to be a full history browser.
const MAX_SESSIONS: usize = 200;

/// Tracks completed focus blocks per day ("YYYY-MM-DD" -> count, used for
/// the streak heatmap), the recent session list, and how long each
/// monitored app has been seen running today.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ActivityLog {
    pub days: HashMap<String, u32>,
    #[serde(default)]
    pub sessions: Vec<SessionRecord>,
    /// App name -> seconds seen running today. Reset whenever the day
    /// rolls over (see `record_app_tick`) — this is "today's mix", not a
    /// full history.
    #[serde(default)]
    pub app_seconds_today: HashMap<String, u32>,
    #[serde(default)]
    pub app_seconds_day: String,
}

fn log_path() -> PathBuf {
    data_dir().join("activity.json")
}

pub fn load() -> ActivityLog {
    match fs::read_to_string(log_path()) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => ActivityLog::default(),
    }
}

pub fn save(log: &ActivityLog) -> std::io::Result<()> {
    let raw = serde_json::to_string_pretty(log)?;
    fs::write(log_path(), raw)
}

fn today_key() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// Mutates the in-memory log for a finished block — streak day + session
/// record — without touching disk. Split out from `record_block` so the
/// logic is unit-testable without writing to the real activity log file.
fn apply_block(log: &mut ActivityLog, kind: SessionKind, elapsed_secs: u32) {
    if kind == SessionKind::Focus {
        *log.days.entry(today_key()).or_insert(0) += 1;
    }
    let ended_at = Local::now();
    let started_at = ended_at - ChronoDuration::seconds(elapsed_secs as i64);
    log.sessions.push(SessionRecord { kind, started_at, ended_at, duration_secs: elapsed_secs });
    if log.sessions.len() > MAX_SESSIONS {
        let excess = log.sessions.len() - MAX_SESSIONS;
        log.sessions.drain(0..excess);
    }
}

/// Records a focus or break block that just ended, whatever the reason —
/// timer hit zero on its own, the user stopped it early, or the app exited
/// mid-session. `elapsed_secs` is the real time spent, not the configured
/// block length, so early stops keep whatever was actually done instead of
/// losing it. No-op for a block with no elapsed time (e.g. stopped the
/// instant it started).
pub fn record_block(log: &mut ActivityLog, kind: SessionKind, elapsed_secs: u32) {
    if elapsed_secs == 0 {
        return;
    }
    apply_block(log, kind, elapsed_secs);
    let _ = save(log);
}

/// Adds `elapsed_secs` to each currently-running monitored app's "today"
/// total, resetting the whole bucket when the day changes.
pub fn record_app_tick(log: &mut ActivityLog, running_apps: &[String], elapsed_secs: u32) {
    let today = today_key();
    if log.app_seconds_day != today {
        log.app_seconds_day = today;
        log.app_seconds_today.clear();
    }
    for app in running_apps {
        *log.app_seconds_today.entry(app.clone()).or_insert(0) += elapsed_secs;
    }
    if !running_apps.is_empty() {
        let _ = save(log);
    }
}

/// Consecutive days (ending today or yesterday) with at least one completed
/// focus block. Today not having one yet doesn't break the streak.
pub fn current_streak(log: &ActivityLog) -> u32 {
    let mut day = Local::now().date_naive();
    if !log.days.contains_key(&day.format("%Y-%m-%d").to_string()) {
        match day.pred_opt() {
            Some(d) => day = d,
            None => return 0,
        }
    }

    let mut streak = 0u32;
    loop {
        let key = day.format("%Y-%m-%d").to_string();
        match log.days.get(&key) {
            Some(count) if *count > 0 => {
                streak += 1;
                match day.pred_opt() {
                    Some(d) => day = d,
                    None => break,
                }
            }
            _ => break,
        }
    }
    streak
}

#[cfg(test)]
mod tests {
    use super::*;

    // Exercises `apply_block` directly (never `record_block`/`save`) so
    // these tests can't overwrite the real `activity.json` on this machine.

    #[test]
    fn early_stop_still_records_the_time_actually_spent() {
        let mut log = ActivityLog::default();
        apply_block(&mut log, SessionKind::Focus, 12 * 60); // stopped at 12 of 50 min
        assert_eq!(log.sessions.len(), 1);
        assert_eq!(log.sessions[0].duration_secs, 12 * 60);
        assert_eq!(log.sessions[0].kind, SessionKind::Focus);
    }

    #[test]
    fn focus_block_counts_toward_todays_streak_even_if_stopped_early() {
        let mut log = ActivityLog::default();
        apply_block(&mut log, SessionKind::Focus, 5 * 60);
        assert_eq!(log.days.get(&today_key()), Some(&1));
    }

    #[test]
    fn break_block_does_not_count_toward_the_streak() {
        let mut log = ActivityLog::default();
        apply_block(&mut log, SessionKind::Break, 5 * 60);
        assert_eq!(log.days.get(&today_key()), None);
        assert_eq!(log.sessions.len(), 1);
    }

    #[test]
    fn record_block_is_a_noop_for_zero_elapsed_time() {
        let mut log = ActivityLog::default();
        record_block(&mut log, SessionKind::Focus, 0);
        assert!(log.sessions.is_empty());
        assert!(log.days.is_empty());
    }

    #[test]
    fn multiple_early_stops_same_day_accumulate_in_days_and_sessions() {
        let mut log = ActivityLog::default();
        apply_block(&mut log, SessionKind::Focus, 10 * 60);
        apply_block(&mut log, SessionKind::Focus, 8 * 60);
        assert_eq!(log.sessions.len(), 2);
        assert_eq!(log.days.get(&today_key()), Some(&2));
    }

    #[test]
    fn session_list_caps_at_max_sessions() {
        let mut log = ActivityLog::default();
        for _ in 0..(MAX_SESSIONS + 5) {
            apply_block(&mut log, SessionKind::Break, 60);
        }
        assert_eq!(log.sessions.len(), MAX_SESSIONS);
    }

    #[test]
    fn streak_counts_consecutive_days_ending_today() {
        let mut log = ActivityLog::default();
        let today = Local::now().date_naive();
        log.days.insert(today.format("%Y-%m-%d").to_string(), 1);
        log.days.insert(
            (today - ChronoDuration::days(1)).format("%Y-%m-%d").to_string(),
            1,
        );
        log.days.insert(
            (today - ChronoDuration::days(2)).format("%Y-%m-%d").to_string(),
            1,
        );
        assert_eq!(current_streak(&log), 3);
    }
}
