use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityRecord {
    pub id: Option<i64>,
    pub app_name: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub is_idle: bool,
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
