use serde::{Deserialize, Serialize};

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
    pub timer: TimerState,
    pub tasks: Vec<Task>,
    pub github_items: Vec<GithubItem>,
    pub github_error: Option<String>,
}

impl AppState {
    pub fn load() -> Self {
        Self {
            config: crate::config::load(),
            activity: Activity::Idle,
            focus_mode: false,
            timer: TimerState::default(),
            tasks: crate::tasks::load(),
            github_items: Vec::new(),
            github_error: None,
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
        }
    }
}
