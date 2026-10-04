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
    /// Where the last successful GitHub token came from (gh CLI or a saved PAT).
    pub github_source: Option<crate::github::TokenSource>,
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
            github_source: None,
        }
    }
}

impl AppState {
    /// Stores a finished GitHub refresh. Returns `false` and changes nothing
    /// when the user disconnected (or switched account) while it was in
    /// flight, so a slow refresh can't bring the list back after
    /// "Desconectar".
    pub fn apply_github_refresh(
        &mut self,
        login: &str,
        source: crate::github::TokenSource,
        items: Result<Vec<crate::github::GithubItem>, String>,
        days: Result<HashMap<String, u32>, String>,
    ) -> bool {
        if self.config.github_login.as_deref() != Some(login) {
            return false;
        }
        self.github_source = Some(source);
        match items {
            Ok(items) => {
                self.github_items = items;
                self.github_error = None;
            }
            // Keep the last good list; just say why it's stale.
            Err(e) => self.github_error = Some(e),
        }
        // Best-effort: a broken contribution calendar shouldn't blank the
        // heatmap or surface as an error.
        if let Ok(days) = days {
            self.github_days = days;
        }
        true
    }

    /// Records why a refresh couldn't even start (no token), unless the
    /// user already disconnected.
    pub fn fail_github_refresh(&mut self, login: &str, message: String) -> bool {
        if self.config.github_login.as_deref() != Some(login) {
            return false;
        }
        self.github_error = Some(message);
        true
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
    pub github_source: Option<crate::github::TokenSource>,
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
            github_source: state.github_source,
            sessions: state.focus_log.sessions.clone(),
            app_seconds_today: state.focus_log.app_seconds_today.clone(),
            uptime_secs: sysinfo::System::uptime(),
        }
    }
}

#[cfg(test)]
impl AppState {
    /// An in-memory state that never touches the user's settings or data files.
    fn for_test() -> Self {
        Self {
            config: crate::config::AppConfig::default(),
            activity: Activity::Idle,
            focus_mode: false,
            immersed: false,
            timer: TimerState::default(),
            tasks: Vec::new(),
            github_items: Vec::new(),
            github_error: None,
            focus_log: crate::activity::ActivityLog::default(),
            github_days: HashMap::new(),
            github_source: None,
        }
    }
}

#[cfg(test)]
mod github_refresh_tests {
    use super::*;
    use crate::github::{GithubItem, TokenSource};

    fn item(number: u64) -> GithubItem {
        GithubItem {
            number,
            title: format!("PR {number}"),
            html_url: String::new(),
            repository: "me/repo".into(),
            is_pull_request: true,
            updated_at: String::new(),
        }
    }

    fn days(count: u32) -> HashMap<String, u32> {
        HashMap::from([("2026-10-04".to_string(), count)])
    }

    fn connected(login: &str) -> AppState {
        let mut state = AppState::for_test();
        state.config.github_login = Some(login.to_string());
        state
    }

    #[test]
    fn a_finished_refresh_fills_the_lists() {
        let mut state = connected("me");
        let applied =
            state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![item(1), item(2)]), Ok(days(5)));
        assert!(applied);
        assert_eq!(state.github_items.len(), 2);
        assert_eq!(state.github_days, days(5));
        assert_eq!(state.github_source, Some(TokenSource::Gh));
        assert_eq!(state.github_error, None);
    }

    // "Desconectar" while a refresh is in flight must not bring the list back.
    #[test]
    fn a_refresh_finishing_after_disconnect_is_discarded() {
        let mut state = AppState::for_test(); // github_login is None
        let applied = state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![item(1)]), Ok(days(5)));
        assert!(!applied);
        assert!(state.github_items.is_empty());
        assert!(state.github_days.is_empty());
        assert_eq!(state.github_source, None);
    }

    #[test]
    fn a_refresh_for_another_account_is_discarded() {
        let mut state = connected("someone-else");
        let applied = state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![item(1)]), Ok(days(5)));
        assert!(!applied);
        assert!(state.github_items.is_empty());
    }

    #[test]
    fn a_failed_search_keeps_the_last_list_and_shows_the_error() {
        let mut state = connected("me");
        state.github_items = vec![item(1)];
        let applied =
            state.apply_github_refresh("me", TokenSource::Gh, Err("HTTP 502".into()), Ok(days(3)));
        assert!(applied);
        assert_eq!(state.github_items.len(), 1, "last good list stays");
        assert_eq!(state.github_error.as_deref(), Some("HTTP 502"));
    }

    #[test]
    fn a_failed_calendar_keeps_the_last_heatmap() {
        let mut state = connected("me");
        state.github_days = days(9);
        state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![item(1)]), Err("boom".into()));
        assert_eq!(state.github_days, days(9));
        assert_eq!(state.github_items.len(), 1);
        assert_eq!(state.github_error, None, "calendar errors stay silent");
    }

    #[test]
    fn a_later_good_refresh_clears_the_error() {
        let mut state = connected("me");
        state.github_error = Some("old".into());
        state.apply_github_refresh("me", TokenSource::Manual, Ok(vec![]), Ok(days(1)));
        assert_eq!(state.github_error, None);
        assert_eq!(state.github_source, Some(TokenSource::Manual));
    }

    #[test]
    fn a_missing_token_is_reported_while_connected() {
        let mut state = connected("me");
        assert!(state.fail_github_refresh("me", "sem token".into()));
        assert_eq!(state.github_error.as_deref(), Some("sem token"));
    }

    #[test]
    fn a_missing_token_after_disconnect_is_not_reported() {
        let mut state = AppState::for_test();
        assert!(!state.fail_github_refresh("me", "sem token".into()));
        assert_eq!(state.github_error, None);
    }
}
