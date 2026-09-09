use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::activity::{ActivityLog, SessionRecord};
use crate::config::AppConfig;
use crate::github::GithubItem;
use crate::tasks::Task;
use crate::timer::TimerState;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Activity {
    Idle,
    Working,
}

pub struct AppState {
    pub config: AppConfig,
    pub activity: Activity,
    pub focus_mode: bool,
    /// Whether the session's DND is active. Stays on through the coffee
    /// break — only `focus_mode` (app blocking) pauses.
    pub immersed: bool,
    pub timer: TimerState,
    pub tasks: Vec<Task>,
    pub github_items: Vec<GithubItem>,
    pub github_error: Option<String>,
    pub focus_log: ActivityLog,
    /// Real GitHub contribution calendar ("YYYY-MM-DD" -> count), fetched
    /// alongside PRs/issues. Drives the widget's streak heatmap when a
    /// token is connected; falls back to `focus_log` otherwise.
    pub github_days: HashMap<String, u32>,
}

impl AppState {
    pub fn load() -> Self {
        Self {
            config: crate::config::load(),
            activity: Activity::Idle,
            focus_mode: false,
            immersed: false,
            timer: TimerState::default(),
            tasks: crate::tasks::load(),
            github_items: Vec::new(),
            github_error: None,
            focus_log: crate::activity::load(),
            github_days: HashMap::new(),
        }
    }
}

/// Snapshot sent to the frontend after every state change.
#[derive(Debug, Clone, Serialize)]
pub struct StateSnapshot {
    pub activity: Activity,
    pub focus_mode: bool,
    pub timer: TimerState,
    pub tasks: Vec<Task>,
    pub github_items: Vec<GithubItem>,
    pub github_error: Option<String>,
    pub config: AppConfig,
    pub focus_days: HashMap<String, u32>,
    pub streak: u32,
    pub github_days: HashMap<String, u32>,
    pub sessions: Vec<SessionRecord>,
    pub app_seconds_today: HashMap<String, u32>,
    pub uptime_secs: u64,
}

impl From<&AppState> for StateSnapshot {
    fn from(state: &AppState) -> Self {
        Self {
            activity: state.activity,
            focus_mode: state.focus_mode,
            timer: state.timer.clone(),
            tasks: state.tasks.clone(),
            github_items: state.github_items.clone(),
            github_error: state.github_error.clone(),
            config: state.config.clone(),
            focus_days: state.focus_log.days.clone(),
            streak: crate::activity::current_streak(&state.focus_log),
            github_days: state.github_days.clone(),
            sessions: state.focus_log.sessions.clone(),
            app_seconds_today: state.focus_log.app_seconds_today.clone(),
            uptime_secs: sysinfo::System::uptime(),
        }
    }
}
