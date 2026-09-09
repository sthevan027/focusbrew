use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerConfig {
    pub focus_minutes: u32,
    pub break_minutes: u32,
    pub auto_start: bool,
}

impl Default for TimerConfig {
    fn default() -> Self {
        Self {
            focus_minutes: 50,
            break_minutes: 10,
            auto_start: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Process names (case-insensitive, without path) that count as "working with AI/code".
    pub monitored_processes: Vec<String>,
    /// Process names to kill while focus mode is active.
    pub blocked_apps: Vec<String>,
    /// Seconds between process scans.
    pub poll_interval_secs: u64,
    /// Automatically enter focus mode when a monitored process is detected.
    pub focus_auto_enable: bool,
    pub block_apps_enabled: bool,
    pub dnd_enabled: bool,
    pub timer: TimerConfig,
    /// GitHub login cached after the token is validated, used to build search queries.
    pub github_login: Option<String>,
    /// Color of the widget's progress ring, as "#rrggbb". `None` follows the
    /// OS accent color (best-effort, Windows only for now).
    pub ring_color: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            monitored_processes: vec![
                "Code.exe".into(),
                "code".into(),
                "claude".into(),
                "cursor".into(),
                "Cursor.exe".into(),
            ],
            blocked_apps: vec![],
            poll_interval_secs: 1,
            focus_auto_enable: true,
            block_apps_enabled: true,
            dnd_enabled: true,
            timer: TimerConfig::default(),
            github_login: None,
            ring_color: None,
        }
    }
}

fn config_path() -> PathBuf {
    let dirs = directories::ProjectDirs::from("com", "sthevandev", "focusbrew")
        .expect("could not resolve app data directory");
    let dir = dirs.config_dir();
    fs::create_dir_all(dir).ok();
    dir.join("settings.json")
}

pub fn load() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save(config: &AppConfig) -> std::io::Result<()> {
    let path = config_path();
    let raw = serde_json::to_string_pretty(config)?;
    fs::write(path, raw)
}

pub fn data_dir() -> PathBuf {
    let dirs = directories::ProjectDirs::from("com", "sthevandev", "focusbrew")
        .expect("could not resolve app data directory");
    let dir = dirs.data_dir().to_path_buf();
    fs::create_dir_all(&dir).ok();
    dir
}
