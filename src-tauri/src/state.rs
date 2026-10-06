use std::collections::HashMap;

use serde::Serialize;

use crate::alerts::Alerts;
use crate::config::AppConfig;
use crate::github::{GithubEvent, GithubItem, TokenSource};
use crate::tracker::activity::Session;
use crate::tracker::tasks::{self, Task};
use crate::tracker::timer::TimerView;
use crate::tracker::{activity, now_ms, today_key, Tracker};

pub struct AppState {
    pub config: AppConfig,
    /// Heads-up, daily goal and idle reminder bookkeeping.
    pub alerts: Alerts,
    /// A configured shortcut that couldn't be registered (another app has it).
    pub shortcut_warning: Option<String>,
    /// The tasks, the running block and the per-day log.
    pub tracker: Tracker,
    /// When the 1 s loop last ran, to notice the computer sleeping.
    pub last_tick_ms: i64,
    pub github_items: Vec<GithubItem>,
    pub github_error: Option<String>,
    /// Real GitHub contribution calendar ("YYYY-MM-DD" -> count), fetched
    /// alongside PRs/issues. Kept for stage 2 (GitHub inside the day).
    pub github_days: HashMap<String, u32>,
    /// What you did on GitHub lately (pushes, PRs, issues, reviews).
    pub github_events: Vec<GithubEvent>,
    /// Where the last successful GitHub token came from (gh CLI or a saved PAT).
    pub github_source: Option<TokenSource>,
}

impl AppState {
    pub fn load() -> Self {
        let mut list = tasks::load();
        tasks::fill_missing_days(&mut list, &today_key());
        Self {
            config: crate::config::load(),
            alerts: Alerts::default(),
            shortcut_warning: None,
            tracker: Tracker::new(list, activity::load()),
            last_tick_ms: now_ms(),
            github_items: Vec::new(),
            github_error: None,
            github_days: HashMap::new(),
            github_events: Vec::new(),
            github_source: None,
        }
    }

    /// Writes the tasks and the activity log to disk.
    pub fn save_tracker(&self) {
        let _ = tasks::save(&self.tracker.tasks);
        let _ = activity::save(&self.tracker.log);
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
        events: Result<Vec<GithubEvent>, String>,
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
        // Same for the activity feed: the summary just keeps the last one.
        if let Ok(events) = events {
            self.github_events = events;
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

/// How many days of block history the panel gets (its grid shows 5 weeks).
pub const SNAPSHOT_SESSION_DAYS: i64 = 42;

/// Snapshot sent to the frontend after every state change.
#[derive(Debug, Clone, Serialize)]
pub struct StateSnapshot {
    pub tasks: Vec<Task>,
    pub timer: TimerView,
    pub focus_secs_by_day: HashMap<String, u32>,
    /// Blocks of the last `SNAPSHOT_SESSION_DAYS` days.
    pub sessions: Vec<Session>,
    /// The backend's local date, so both sides agree on when the day turns.
    pub today: String,
    pub config: AppConfig,
    pub github_items: Vec<GithubItem>,
    pub github_error: Option<String>,
    pub github_days: HashMap<String, u32>,
    pub github_events: Vec<GithubEvent>,
    pub github_source: Option<TokenSource>,
    pub shortcut_warning: Option<String>,
}

fn days_before(day: &str, n: i64) -> String {
    chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d")
        .map(|d| (d - chrono::Duration::days(n)).format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

impl From<&AppState> for StateSnapshot {
    fn from(state: &AppState) -> Self {
        let today = today_key();
        Self {
            tasks: state.tracker.tasks.clone(),
            timer: state.tracker.timer.view(now_ms()),
            focus_secs_by_day: state.tracker.log.focus_secs_by_day.clone(),
            sessions: state.tracker.log.sessions_since(&days_before(&today, SNAPSHOT_SESSION_DAYS)),
            today,
            config: state.config.clone(),
            github_items: state.github_items.clone(),
            github_error: state.github_error.clone(),
            github_days: state.github_days.clone(),
            github_events: state.github_events.clone(),
            github_source: state.github_source,
            shortcut_warning: state.shortcut_warning.clone(),
        }
    }
}

#[cfg(test)]
impl AppState {
    /// An in-memory state that never touches the user's settings or data files.
    fn for_test() -> Self {
        Self {
            config: AppConfig::default(),
            alerts: Alerts::default(),
            shortcut_warning: None,
            tracker: Tracker::new(Vec::new(), activity::ActivityLog::default()),
            last_tick_ms: 0,
            github_items: Vec::new(),
            github_error: None,
            github_days: HashMap::new(),
            github_events: Vec::new(),
            github_source: None,
        }
    }
}

#[cfg(test)]
mod snapshot_tests {
    use super::*;

    #[test]
    fn days_before_counts_back_across_months() {
        assert_eq!(days_before("2026-10-05", 42), "2026-08-24");
        assert_eq!(days_before("2026-03-01", 1), "2026-02-28");
        assert_eq!(days_before("garbage", 1), "");
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
            state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![item(1), item(2)]), Ok(days(5)), Ok(vec![]));
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
        let applied = state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![item(1)]), Ok(days(5)), Ok(vec![]));
        assert!(!applied);
        assert!(state.github_items.is_empty());
        assert!(state.github_days.is_empty());
        assert_eq!(state.github_source, None);
    }

    #[test]
    fn a_refresh_for_another_account_is_discarded() {
        let mut state = connected("someone-else");
        let applied = state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![item(1)]), Ok(days(5)), Ok(vec![]));
        assert!(!applied);
        assert!(state.github_items.is_empty());
    }

    #[test]
    fn a_failed_search_keeps_the_last_list_and_shows_the_error() {
        let mut state = connected("me");
        state.github_items = vec![item(1)];
        let applied =
            state.apply_github_refresh("me", TokenSource::Gh, Err("HTTP 502".into()), Ok(days(3)), Ok(vec![]));
        assert!(applied);
        assert_eq!(state.github_items.len(), 1, "last good list stays");
        assert_eq!(state.github_error.as_deref(), Some("HTTP 502"));
    }

    #[test]
    fn a_failed_calendar_keeps_the_last_heatmap() {
        let mut state = connected("me");
        state.github_days = days(9);
        state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![item(1)]), Err("boom".into()), Ok(vec![]));
        assert_eq!(state.github_days, days(9));
        assert_eq!(state.github_items.len(), 1);
        assert_eq!(state.github_error, None, "calendar errors stay silent");
    }

    #[test]
    fn events_are_stored_and_a_failed_feed_keeps_the_last_ones() {
        let event = GithubEvent {
            day: "2026-10-05".into(),
            kind: "push".into(),
            repo: "me/repo".into(),
            number: None,
            title: None,
            count: 2,
            at: String::new(),
        };
        let mut state = connected("me");
        state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![]), Ok(days(1)), Ok(vec![event.clone()]));
        assert_eq!(state.github_events, vec![event.clone()]);
        state.apply_github_refresh("me", TokenSource::Gh, Ok(vec![]), Ok(days(1)), Err("HTTP 500".into()));
        assert_eq!(state.github_events, vec![event]);
        assert_eq!(state.github_error, None, "the feed is best-effort");
    }

    #[test]
    fn a_later_good_refresh_clears_the_error() {
        let mut state = connected("me");
        state.github_error = Some("old".into());
        state.apply_github_refresh("me", TokenSource::Manual, Ok(vec![]), Ok(days(1)), Ok(vec![]));
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
