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

/// One completed (naturally finished, not stopped early) focus or break
/// block — powers the "resumo de hoje" on the dashboard.
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

/// Records that a focus or break block just completed naturally (timer hit
/// zero on its own). Manual/early stops don't count — same rule that
/// already applied to the streak counter.
pub fn record_completed_block(log: &mut ActivityLog, kind: SessionKind, duration_secs: u32) {
    if kind == SessionKind::Focus {
        *log.days.entry(today_key()).or_insert(0) += 1;
    }
    let ended_at = Local::now();
    let started_at = ended_at - ChronoDuration::seconds(duration_secs as i64);
    log.sessions.push(SessionRecord { kind, started_at, ended_at, duration_secs });
    if log.sessions.len() > MAX_SESSIONS {
        let excess = log.sessions.len() - MAX_SESSIONS;
        log.sessions.drain(0..excess);
    }
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
