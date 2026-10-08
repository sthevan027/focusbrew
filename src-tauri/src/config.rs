use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::tracker::tasks::{clamp_minutes, DEFAULT_MINUTES};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// GitHub login cached after the token is validated, used to build search queries.
    pub github_login: Option<String>,
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
    /// The screen edge the widget is glued to.
    pub widget_edge: WidgetEdge,
    /// Name of the monitor the widget sits on; `None` or not found = primary.
    pub monitor: Option<String>,
    /// Heads-up this many minutes before a block ends (0 = off; 1, 2 or 5).
    pub notify_before_end_mins: u32,
    /// Nudge after this many minutes with no block running while there are
    /// tasks for today (0 = off; 15, 30 or 60). Only 08h–20h.
    pub idle_reminder_mins: u32,
    /// Minutes of focus to aim for each day (0 = no goal; at most 12 h).
    pub daily_goal_mins: u32,
    /// Pause/resume or start the first task.
    pub shortcut_toggle: String,
    /// Open/close the panel, pinned.
    pub shortcut_panel: String,
    /// Start focusbrew when Windows starts.
    pub launch_at_login: bool,
}

pub const DEFAULT_SHORTCUT_TOGGLE: &str = "CommandOrControl+Shift+Space";
pub const DEFAULT_SHORTCUT_PANEL: &str = "CommandOrControl+Shift+Alt+Space";
pub const BEFORE_END_CHOICES: [u32; 4] = [0, 1, 2, 5];
pub const IDLE_REMINDER_CHOICES: [u32; 4] = [0, 15, 30, 60];
pub const MAX_DAILY_GOAL_MINS: u32 = 12 * 60;

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

/// Which screen edge the widget is glued to.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WidgetEdge {
    /// Top of the screen, centered (the original placement).
    #[default]
    Top,
    /// Left edge, centered in height.
    Left,
    /// Right edge, centered in height.
    Right,
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
            github_login: None,
            github_use_gh: true,
            default_minutes: DEFAULT_MINUTES,
            notify_on_finish: true,
            notch_style: NotchStyle::default(),
            progress_line: true,
            rgb_line: false,
            accent_color: DEFAULT_ACCENT.to_string(),
            widget_scale: WidgetScale::default(),
            widget_visible: true,
            widget_edge: WidgetEdge::default(),
            monitor: None,
            notify_before_end_mins: 0,
            idle_reminder_mins: 0,
            daily_goal_mins: 0,
            shortcut_toggle: DEFAULT_SHORTCUT_TOGGLE.to_string(),
            shortcut_panel: DEFAULT_SHORTCUT_PANEL.to_string(),
            launch_at_login: false,
        }
    }
}

fn or_default(value: String, default: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() { default.to_string() } else { trimmed.to_string() }
}

impl AppConfig {
    /// Brings values into their allowed range (called on load and on every
    /// save from the settings window).
    pub fn normalized(mut self) -> Self {
        self.default_minutes = clamp_minutes(self.default_minutes);
        self.accent_color =
            normalize_hex(&self.accent_color).unwrap_or_else(|| DEFAULT_ACCENT.to_string());
        if !BEFORE_END_CHOICES.contains(&self.notify_before_end_mins) {
            self.notify_before_end_mins = 0;
        }
        if !IDLE_REMINDER_CHOICES.contains(&self.idle_reminder_mins) {
            self.idle_reminder_mins = 0;
        }
        self.daily_goal_mins = self.daily_goal_mins.min(MAX_DAILY_GOAL_MINS);
        self.shortcut_toggle = or_default(self.shortcut_toggle, DEFAULT_SHORTCUT_TOGGLE);
        self.shortcut_panel = or_default(self.shortcut_panel, DEFAULT_SHORTCUT_PANEL);
        self.monitor = self.monitor.map(|m| m.trim().to_string()).filter(|m| !m.is_empty());
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
    fn the_v0_3_settings_have_safe_defaults() {
        let c = AppConfig::default();
        assert_eq!(c.monitor, None);
        assert_eq!(c.notify_before_end_mins, 0);
        assert_eq!(c.idle_reminder_mins, 0);
        assert_eq!(c.daily_goal_mins, 0);
        assert_eq!(c.shortcut_toggle, "CommandOrControl+Shift+Space");
        assert_eq!(c.shortcut_panel, "CommandOrControl+Shift+Alt+Space");
        assert!(!c.launch_at_login);
        // a 0.2 file has none of them
        let old = parse(r##"{"accent_color":"#112233"}"##);
        assert_eq!(old.shortcut_toggle, "CommandOrControl+Shift+Space");
        assert_eq!(old.daily_goal_mins, 0);
    }

    #[test]
    fn alert_settings_snap_to_the_offered_choices() {
        let c = AppConfig {
            notify_before_end_mins: 3,
            idle_reminder_mins: 45,
            daily_goal_mins: 5000,
            ..AppConfig::default()
        }
        .normalized();
        assert_eq!(c.notify_before_end_mins, 0, "3 is not offered");
        assert_eq!(c.idle_reminder_mins, 0, "45 is not offered");
        assert_eq!(c.daily_goal_mins, 720, "at most 12 h");
        let ok = AppConfig { notify_before_end_mins: 5, idle_reminder_mins: 30, daily_goal_mins: 240, ..AppConfig::default() }
            .normalized();
        assert_eq!((ok.notify_before_end_mins, ok.idle_reminder_mins, ok.daily_goal_mins), (5, 30, 240));
    }

    #[test]
    fn blank_shortcuts_and_monitor_fall_back() {
        let c = AppConfig {
            shortcut_toggle: "  ".into(),
            shortcut_panel: String::new(),
            monitor: Some(" ".into()),
            ..AppConfig::default()
        }
        .normalized();
        assert_eq!(c.shortcut_toggle, DEFAULT_SHORTCUT_TOGGLE);
        assert_eq!(c.shortcut_panel, DEFAULT_SHORTCUT_PANEL);
        assert_eq!(c.monitor, None);
    }

    #[test]
    fn the_enums_are_written_in_lower_case() {
        assert_eq!(serde_json::to_string(&NotchStyle::Minimal).unwrap(), "\"minimal\"");
        assert_eq!(serde_json::to_string(&WidgetScale::Large).unwrap(), "\"large\"");
    }

    #[test]
    fn the_widget_defaults_to_the_top_edge() {
        assert_eq!(AppConfig::default().widget_edge, WidgetEdge::Top);
    }

    // Review focus: a file written before this setting existed.
    #[test]
    fn a_file_without_widget_edge_opens_on_the_top_and_keeps_the_rest() {
        let c = parse(r##"{"accent_color":"#112233","daily_goal_mins":90}"##);
        assert_eq!(c.widget_edge, WidgetEdge::Top);
        assert_eq!(c.accent_color, "#112233");
        assert_eq!(c.daily_goal_mins, 90);
    }

    #[test]
    fn the_edge_is_written_in_lower_case_and_read_back() {
        for (edge, text) in
            [(WidgetEdge::Top, "top"), (WidgetEdge::Left, "left"), (WidgetEdge::Right, "right")]
        {
            let raw = format!(r#"{{"widget_edge":"{text}"}}"#);
            assert_eq!(parse(&raw).widget_edge, edge);
            let json = serde_json::to_string(&AppConfig { widget_edge: edge, ..AppConfig::default() }).unwrap();
            assert!(json.contains(&format!("\"widget_edge\":\"{text}\"")), "{json}");
        }
    }
}
