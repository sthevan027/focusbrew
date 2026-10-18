use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityRecord {
    pub id: Option<i64>,
    pub app_name: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub is_idle: bool,
    /// True for a checkpoint piece that continues an earlier piece of the same session.
    #[serde(default)]
    pub continued: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub idle_threshold_minutes: u32,
    pub retention_days: u32,
    pub service_port: u16,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            idle_threshold_minutes: 10,
            retention_days: 90,
            service_port: 8765,
        }
    }
}

/// Idle threshold is clamped to the 1–60 minute range the UI offers.
pub fn clamp_idle_threshold(minutes: u32) -> u32 {
    minutes.clamp(1, 60)
}

/// Retention is clamped to 30–365 days; the UI offers 30, 90 and 180.
pub fn clamp_retention_days(days: u32) -> u32 {
    days.clamp(30, 365)
}
