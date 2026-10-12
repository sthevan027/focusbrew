//! Decide, pra cada tarefa, o que fazer com o lado do Google. Pura, sem rede,
//! pra ser testável: `commands::refresh_google_now` aplica a `SyncAction`.

use crate::google_calendar::{self, CalendarEvent, Winner};
use crate::tracker::tasks::{Task, TaskSource};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncAction {
    CreateRemote,
    PushTitle(String),
    PullTitle(String),
    MarkLocalDone,
    MarkLocalOpen,
    DeleteLocal,
    Noop,
}

/// The sync only reads one day's events, so only tasks planned for `today`
/// can be checked against them (anything else would look "deleted on Google").
pub fn in_scope(task: &Task, today: &str) -> bool {
    task.day == today
}

pub fn decide(task: &Task, remote: Option<&CalendarEvent>) -> SyncAction {
    if task.source == TaskSource::Github {
        return SyncAction::Noop;
    }
    let Some(remote) = remote else {
        return if task.google_event_id.is_some() {
            SyncAction::DeleteLocal
        } else {
            SyncAction::CreateRemote
        };
    };

    let local_title = if task.done { google_calendar::done_title(&task.title) } else { task.title.clone() };
    let (remote_plain_title, remote_done) = google_calendar::strip_done_prefix(&remote.title);

    if local_title == remote.title && task.done == remote_done {
        return SyncAction::Noop;
    }

    match google_calendar::newer_wins(task.updated_at, remote.updated_ms) {
        Winner::Local => SyncAction::PushTitle(local_title),
        Winner::Remote if remote_done != task.done => {
            if remote_done {
                SyncAction::MarkLocalDone
            } else {
                SyncAction::MarkLocalOpen
            }
        }
        Winner::Remote => SyncAction::PullTitle(remote_plain_title),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::google_calendar::CalendarEvent;
    use crate::tracker::tasks::{Task, TaskSource};

    fn task(title: &str, done: bool, updated_at: i64, google_event_id: Option<&str>) -> Task {
        Task {
            id: "1".into(), title: title.into(), note: None, minutes: 25, done,
            created_at: String::new(), source: TaskSource::Manual, spent_secs: 0,
            day: "2026-10-12".into(), done_at: None, project: None, url: None,
            google_event_id: google_event_id.map(str::to_string), updated_at,
        }
    }

    fn remote(title: &str, updated_ms: i64) -> CalendarEvent {
        CalendarEvent { id: "evt".into(), title: title.into(), start_ms: 0, end_ms: 0, updated_ms }
    }

    #[test]
    fn a_manual_task_with_no_remote_yet_must_be_created() {
        let t = task("Nova tarefa", false, 100, None);
        assert_eq!(decide(&t, None), SyncAction::CreateRemote);
    }

    #[test]
    fn a_task_already_linked_with_no_matching_remote_was_deleted_on_google() {
        let t = task("Tarefa", false, 100, Some("evt"));
        assert_eq!(decide(&t, None), SyncAction::DeleteLocal);
    }

    #[test]
    fn marking_done_locally_after_the_remote_edit_pushes_the_checkmark() {
        let t = task("Tarefa", true, 200, Some("evt"));
        let r = remote("Tarefa", 100);
        assert_eq!(decide(&t, Some(&r)), SyncAction::PushTitle("✓ Tarefa".to_string()));
    }

    #[test]
    fn a_checkmark_added_remotely_after_the_local_edit_marks_the_task_done_locally() {
        let t = task("Tarefa", false, 100, Some("evt"));
        let r = remote("✓ Tarefa", 200);
        assert_eq!(decide(&t, Some(&r)), SyncAction::MarkLocalDone);
    }

    #[test]
    fn removing_the_checkmark_remotely_after_the_local_edit_reopens_the_task_locally() {
        let t = task("Tarefa", true, 100, Some("evt"));
        let r = remote("Tarefa", 200);
        assert_eq!(decide(&t, Some(&r)), SyncAction::MarkLocalOpen);
    }

    #[test]
    fn a_newer_local_title_edit_pushes_to_the_remote() {
        let t = task("Título novo", false, 200, Some("evt"));
        let r = remote("Título velho", 100);
        assert_eq!(decide(&t, Some(&r)), SyncAction::PushTitle("Título novo".to_string()));
    }

    #[test]
    fn a_newer_remote_title_edit_pulls_into_the_local_task() {
        let t = task("Título velho", false, 100, Some("evt"));
        let r = remote("Título novo", 200);
        assert_eq!(decide(&t, Some(&r)), SyncAction::PullTitle("Título novo".to_string()));
    }

    #[test]
    fn matching_titles_and_done_state_need_no_action() {
        let t = task("Tarefa", false, 100, Some("evt"));
        let r = remote("Tarefa", 50);
        assert_eq!(decide(&t, Some(&r)), SyncAction::Noop);
    }

    #[test]
    fn a_github_task_is_never_pushed_to_google() {
        let mut t = task("PR #5", false, 100, None);
        t.source = TaskSource::Github;
        assert_eq!(decide(&t, None), SyncAction::Noop);
    }

    #[test]
    fn only_tasks_planned_for_today_are_in_scope() {
        let t = task("Tarefa", false, 100, Some("evt"));
        assert!(in_scope(&t, "2026-10-12"));
        assert!(!in_scope(&t, "2026-10-13"));
    }
}
