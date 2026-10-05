use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::tracker::tasks::{clamp_minutes, DEFAULT_MINUTES};

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
#[serde(default)]
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
    /// Minutes given to a new task.
    pub default_minutes: u32,
    /// Notification when a block runs to its end.
    pub notify_on_finish: bool,
    pub notch_style: NotchStyle,
    /// The line that fills around the widget while a block runs.
    pub progress_line: bool,
    /// Rainbow instead of the accent color on that line.
    pub rgb_line: bool,
    /// "#RRGGBB"; invalid values are replaced by `DEFAULT_ACCENT`.
    pub accent_color: String,
    pub widget_scale: WidgetScale,
    pub widget_visible: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotchStyle {
    /// Countdown on the left, task name on the right.
    #[default]
    Standard,
    /// Only the box and the progress line.
    Minimal,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WidgetScale {
    Small,
    #[default]
    Medium,
    Large,
}

impl WidgetScale {
    pub fn factor(self) -> f64 {
        match self {
            WidgetScale::Small => 0.85,
            WidgetScale::Medium => 1.0,
            WidgetScale::Large => 1.25,
        }
    }
}

pub const DEFAULT_ACCENT: &str = "#0A84FF";

/// "#rrggbb" in any case (and surrounding spaces) -> "#RRGGBB"; anything else -> `None`.
pub fn normalize_hex(raw: &str) -> Option<String> {
    let hex = raw.trim().strip_prefix('#')?;
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(format!("#{}", hex.to_ascii_uppercase()))
    } else {
        None
    }
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
            default_minutes: DEFAULT_MINUTES,
            notify_on_finish: true,
            notch_style: NotchStyle::default(),
            progress_line: true,
            rgb_line: false,
            accent_color: DEFAULT_ACCENT.to_string(),
            widget_scale: WidgetScale::default(),
            widget_visible: true,
        }
    }
}

impl AppConfig {
    /// Brings values into their allowed range (called on load and on every
    /// save from the settings window).
    pub fn normalized(mut self) -> Self {
        self.default_minutes = clamp_minutes(self.default_minutes);
        self.accent_color =
            normalize_hex(&self.accent_color).unwrap_or_else(|| DEFAULT_ACCENT.to_string());
        self
    }
}

/// Reads a settings file's text; anything unreadable becomes the defaults.
pub fn parse(raw: &str) -> AppConfig {
    serde_json::from_str::<AppConfig>(raw).unwrap_or_default().normalized()
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
        Ok(raw) => parse(&raw),
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

    #[test]
    fn the_new_settings_have_the_agreed_defaults() {
        let c = AppConfig::default();
        assert_eq!(c.default_minutes, 25);
        assert!(c.notify_on_finish);
        assert_eq!(c.notch_style, NotchStyle::Standard);
        assert!(c.progress_line);
        assert!(!c.rgb_line);
        assert_eq!(c.accent_color, "#0A84FF");
        assert_eq!(c.widget_scale, WidgetScale::Medium);
        assert!(c.widget_visible);
    }

    // The file focusbrew 0.1.x wrote: old fields only.
    #[test]
    fn a_0_1_settings_file_keeps_its_values_and_gets_the_new_defaults() {
        let raw = r##"{
            "monitored_processes": ["Code.exe"], "blocked_apps": ["Discord.exe"],
            "poll_interval_secs": 3, "focus_auto_enable": false,
            "block_apps_enabled": true, "dnd_enabled": false,
            "timer": { "focus_minutes": 25, "break_minutes": 5, "auto_start": true },
            "github_login": "someone", "ring_color": "#ff0000", "github_use_gh": false
        }"##;
        let c = parse(raw);
        assert_eq!(c.github_login.as_deref(), Some("someone"));
        assert!(!c.github_use_gh);
        assert_eq!(c.accent_color, "#0A84FF");
        assert_eq!(c.default_minutes, 25);
    }

    #[test]
    fn a_partial_file_fills_the_rest_with_defaults() {
        let c = parse(r##"{"accent_color":"#112233","rgb_line":true}"##);
        assert_eq!(c.accent_color, "#112233");
        assert!(c.rgb_line);
        assert_eq!(c.default_minutes, 25);
        assert!(c.progress_line);
    }

    // Review focus: truncated / empty / garbage settings must not panic.
    #[test]
    fn empty_or_corrupted_files_become_the_defaults() {
        for raw in ["", "garbage", "{", "[1,2]", "{\"default_minutes\":\"x\"}"] {
            let c = parse(raw);
            assert_eq!(c.accent_color, "#0A84FF", "input: {raw:?}");
            assert_eq!(c.default_minutes, 25, "input: {raw:?}");
        }
    }

    #[test]
    fn an_invalid_accent_falls_back_to_the_default() {
        for bad in ["red", "#12345", "#1234567", "#GGGGGG", "", "0A84FF", "#0A84F"] {
            let c = AppConfig { accent_color: bad.to_string(), ..AppConfig::default() }.normalized();
            assert_eq!(c.accent_color, "#0A84FF", "input: {bad:?}");
        }
    }

    #[test]
    fn a_valid_accent_is_written_in_upper_case() {
        let c = AppConfig { accent_color: " #ff9f0a ".to_string(), ..AppConfig::default() }.normalized();
        assert_eq!(c.accent_color, "#FF9F0A");
    }

    #[test]
    fn default_minutes_are_clamped() {
        let low = AppConfig { default_minutes: 0, ..AppConfig::default() }.normalized();
        let high = AppConfig { default_minutes: 5000, ..AppConfig::default() }.normalized();
        assert_eq!((low.default_minutes, high.default_minutes), (5, 180));
    }

    #[test]
    fn the_scales_are_small_medium_large() {
        assert_eq!(WidgetScale::Small.factor(), 0.85);
        assert_eq!(WidgetScale::Medium.factor(), 1.0);
        assert_eq!(WidgetScale::Large.factor(), 1.25);
    }

    #[test]
    fn the_enums_are_written_in_lower_case() {
        assert_eq!(serde_json::to_string(&NotchStyle::Minimal).unwrap(), "\"minimal\"");
        assert_eq!(serde_json::to_string(&WidgetScale::Large).unwrap(), "\"large\"");
    }
}
