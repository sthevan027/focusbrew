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
    /// Use the GitHub CLI's login (`gh auth token`) before the saved token.
    /// Turned off by "Desconectar" so gh doesn't silently reconnect.
    #[serde(default = "default_true")]
    pub github_use_gh: bool,
}

fn default_true() -> bool {
    true
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
            github_use_gh: true,
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

#[cfg(test)]
mod tests {
    use super::*;

    // A settings.json written before `github_use_gh` existed must still load
    // with the user's values — a missing field used to make `load()` fall
    // back to defaults for the whole file.
    #[test]
    fn settings_without_github_use_gh_keep_their_values() {
        let raw = r#"{
            "monitored_processes": ["Code.exe"],
            "blocked_apps": ["Discord.exe"],
            "poll_interval_secs": 3,
            "focus_auto_enable": false,
            "block_apps_enabled": true,
            "dnd_enabled": false,
            "timer": { "focus_minutes": 25, "break_minutes": 5, "auto_start": true },
            "github_login": "someone",
            "ring_color": null
        }"#;
        let config: AppConfig = serde_json::from_str(raw).expect("old settings must parse");
        assert_eq!(config.blocked_apps, vec!["Discord.exe".to_string()]);
        assert_eq!(config.poll_interval_secs, 3);
        assert_eq!(config.github_login.as_deref(), Some("someone"));
        assert!(config.github_use_gh, "gh login is on by default");
    }

    #[test]
    fn github_use_gh_defaults_to_true() {
        assert!(AppConfig::default().github_use_gh);
    }
}
