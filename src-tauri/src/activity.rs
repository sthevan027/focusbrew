use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use chrono::Local;
use serde::{Deserialize, Serialize};

use crate::config::data_dir;

/// Tracks completed focus blocks per day ("YYYY-MM-DD" -> count), used to
/// render the streak heatmap in the widget.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ActivityLog {
    pub days: HashMap<String, u32>,
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

/// Records that a focus block just completed naturally (timer flipped from
/// Focus into a break). Manual/early stops don't count.
pub fn record_completed_block(log: &mut ActivityLog) {
    *log.days.entry(today_key()).or_insert(0) += 1;
    let _ = save(log);
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
