use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityReport {
    pub app_name: String,
    pub seconds: u32,
    pub sessions: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivitiesResponse {
    pub data: Vec<ActivityReport>,
    #[serde(default)]
    pub idle_seconds: u32,
}

/// The POST reply omits `service_port`, so it defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigResponse {
    pub idle_threshold_minutes: u32,
    pub retention_days: u32,
    #[serde(default = "default_port")]
    pub service_port: u16,
}

fn default_port() -> u16 {
    8765
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ConfigUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_threshold_minutes: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retention_days: Option<u32>,
}
