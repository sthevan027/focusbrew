//! Commands behind the capture box. The decisions (which task a "tempo N"
//! applies to, what a commit writes, what is refused) are pure functions so
//! they are tested without an `AppHandle`; the commands only wire them to the
//! state, the notes store and the window. Task and note text is never logged.

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use super::{parse_capture, Parsed};
use crate::capture_window;
use crate::notes::{self, Note, NotesShared, MAX_TEXT_CHARS};
use crate::shortcuts;
use crate::state::StateSnapshot;
use crate::tracker::tasks::{self, Task, TaskSource, MAX_TITLE_CHARS};
use crate::tracker::{now_ms, today_key};
use crate::{notify_finished, Shared};

/// How many open tasks are offered when "tempo N" has no obvious target.
const MAX_PICKS: usize = 5;
/// Longest project tag kept, in characters.
const MAX_PROJECT_CHARS: usize = 60;

/// Which task a spoken "tempo N" changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "ids", rename_all = "snake_case")]
pub enum Target {
    /// The task with the timer, or the only one open today.
    One(String),
    /// Up to five open tasks, newest first, for the user to choose from.
    Pick(Vec<String>),
    /// There is nothing to change.
    None,
}

/// `open_today` is (task id, creation time in epoch ms) for every open task
/// of today (planned today or carried over); `timer_task` is the task of the
/// running or paused block.
pub fn resolve_minutes_target(open_today: &[(String, i64)], timer_task: Option<&str>) -> Target {
    if let Some(id) = timer_task {
        return Target::One(id.to_string());
    }
    match open_today {
        [] => Target::None,
        [(id, _)] => Target::One(id.clone()),
        many => {
            let mut sorted: Vec<&(String, i64)> = many.iter().collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));
            Target::Pick(sorted.into_iter().take(MAX_PICKS).map(|(id, _)| id.clone()).collect())
        }
    }
}

/// What the user confirms in the capture box.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CaptureItem {
    Task {
        title: String,
        project: Option<String>,
        minutes: Option<u32>,
        day: Option<String>,
    },
    Note {
        text: String,
    },
    SetMinutes {
        task_id: String,
        minutes: u32,
    },
}

/// Something to write, already validated and clamped.
#[derive(Debug)]
pub enum Plan {
    Task(Task),
    Note(Note),
    SetMinutes { task_id: String, minutes: u32 },
}

/// "\n\n— ditado, 31/10 12:40" in the offset of `now` (the caller's local time).
pub fn origin_line(now: DateTime<FixedOffset>) -> String {
    format!("\n\n— ditado, {}", now.format("%d/%m %H:%M"))
}

/// Refuses everything while capture is off, and blank or oversized text.
/// Nothing is written by a refused commit.
pub fn validate(enabled: bool, item: &CaptureItem) -> Result<(), String> {
    if !enabled {
        return Err("a caixa de captura está desligada".into());
    }
    match item {
        CaptureItem::Task { title, .. } => {
            if title.trim().is_empty() {
                return Err("o título não pode ficar vazio".into());
            }
            if title.trim().chars().count() > MAX_TITLE_CHARS {
                return Err(format!("título grande demais (máximo {MAX_TITLE_CHARS} caracteres)"));
            }
        }
        CaptureItem::Note { text } => {
            if text.trim().is_empty() {
                return Err("a nota não pode ficar vazia".into());
            }
            if text.chars().count() > MAX_TEXT_CHARS {
                return Err(format!("nota grande demais (máximo {MAX_TEXT_CHARS} caracteres)"));
            }
        }
        CaptureItem::SetMinutes { task_id, .. } => {
            if task_id.trim().is_empty() {
                return Err("tarefa não informada".into());
            }
        }
    }
    Ok(())
}

/// Turns a confirmed item into the thing to write. `today` is "AAAA-MM-DD",
/// `now` the local clock, `note_id` the id for a new note.
pub fn plan_commit(
    item: &CaptureItem,
    enabled: bool,
    default_minutes: u32,
    today: &str,
    now: DateTime<FixedOffset>,
    note_id: String,
) -> Result<Plan, String> {
    validate(enabled, item)?;
    match item {
        CaptureItem::Task { title, project, minutes, day } => {
            let minutes = tasks::clamp_minutes(minutes.unwrap_or(default_minutes));
            let day = day.as_deref().filter(|d| tasks::is_valid_day(d)).unwrap_or(today);
            let mut task = tasks::new_task(title, TaskSource::Manual, minutes, day)
                .ok_or_else(|| "o título não pode ficar vazio".to_string())?;
            task.project = project
                .as_deref()
                .map(|p| p.trim().chars().take(MAX_PROJECT_CHARS).collect::<String>())
                .filter(|p| !p.is_empty());
            Ok(Plan::Task(task))
        }
        CaptureItem::Note { text } => {
            let text = format!("{}{}", text.trim_end(), origin_line(now));
            // The origin line is part of the note: refuse rather than let the
            // store cut it (or the end of the text) off silently.
            if text.chars().count() > MAX_TEXT_CHARS {
                return Err(format!("nota grande demais (máximo {MAX_TEXT_CHARS} caracteres)"));
            }
            let stamp = now.timestamp_millis();
            Ok(Plan::Note(Note { id: note_id, created_ms: stamp, updated_ms: stamp, text, objects: Vec::new() }))
        }
        CaptureItem::SetMinutes { task_id, minutes } => Ok(Plan::SetMinutes {
            task_id: task_id.trim().to_string(),
            minutes: tasks::clamp_minutes(*minutes),
        }),
    }
}

/// What the capture box shows before the user confirms. No side effects.
#[derive(Serialize)]
pub struct CapturePreview {
    pub parsed: Parsed,
    pub target: Target,
}

/// Parses for the preview with the minutes already limited like the commit
/// does, so the box shows what will really be stored.
fn preview_parsed(text: &str, today: &str) -> Parsed {
    match parse_capture(text, today) {
        Parsed::Task { title, project, minutes, day } => {
            Parsed::Task { title, project, minutes: minutes.map(tasks::clamp_minutes), day }
        }
        Parsed::SetMinutes { minutes } => Parsed::SetMinutes { minutes: tasks::clamp_minutes(minutes) },
        other => other,
    }
}

#[tauri::command]
pub fn capture_preview(text: String, shared: State<'_, Shared>) -> CapturePreview {
    let today = today_key();
    let parsed = preview_parsed(&text, &today);
    let state = shared.lock();
    let open_today: Vec<(String, i64)> = state
        .tracker
        .tasks
        .iter()
        .filter(|t| !t.done && t.day.as_str() <= today.as_str())
        .map(|t| {
            let created = DateTime::parse_from_rfc3339(&t.created_at)
                .map(|d| d.timestamp_millis())
                .unwrap_or(t.updated_at);
            (t.id.clone(), created)
        })
        .collect();
    let target = resolve_minutes_target(&open_today, state.tracker.timer.task_id());
    CapturePreview { parsed, target }
}

#[tauri::command]
pub fn capture_commit(
    item: CaptureItem,
    app: AppHandle,
    shared: State<'_, Shared>,
    notes_shared: State<'_, NotesShared>,
) -> Result<StateSnapshot, String> {
    let now = chrono::Local::now().fixed_offset();
    let note_id = uuid::Uuid::new_v4().to_string();

    if matches!(item, CaptureItem::Note { .. }) {
        let plan = {
            let state = shared.lock();
            plan_commit(&item, state.config.capture_enabled, state.config.default_minutes, &today_key(), now, note_id)?
        };
        let Plan::Note(note) = plan else { return Err("captura inválida".into()) };
        let mut store = notes_shared.lock();
        store.upsert(note, now_ms())?;
        notes::save(&store).map_err(|e| e.to_string())?;
        drop(store);
        let _ = app.emit("notes-changed", ());
        return Ok(StateSnapshot::from(&*shared.lock()));
    }

    let (snapshot, result) = crate::commands::apply(&app, &shared, |state, now_ms, today| {
        if state.tasks_blocked.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("não consegui ler as tarefas; nada será gravado para não perder as existentes".to_string());
        }
        let plan = plan_commit(&item, state.config.capture_enabled, state.config.default_minutes, today, now, note_id)?;
        match plan {
            Plan::Task(task) => {
                state.tracker.tasks.push(task);
                Ok((None, false))
            }
            Plan::SetMinutes { task_id, minutes } => {
                if !state.tracker.tasks.iter().any(|t| t.id == task_id) {
                    return Err("tarefa não encontrada".to_string());
                }
                let finished = state.tracker.set_minutes(&task_id, minutes, now_ms, today);
                Ok((finished, state.config.notify_on_finish))
            }
            Plan::Note(_) => Err("captura inválida".to_string()),
        }
    });
    let (finished, notify_on) = result?;
    if notify_on {
        if let Some(done) = finished {
            notify_finished(&app, &done);
        }
    }
    Ok(snapshot)
}

/// Async on purpose: on Windows, building a window from a synchronous command deadlocks.
#[tauri::command]
pub async fn open_capture(app: AppHandle, shared: State<'_, Shared>) -> Result<(), String> {
    if !shared.lock().config.capture_enabled {
        return Err("a caixa de captura está desligada".into());
    }
    capture_window::open(&app);
    Ok(())
}

#[tauri::command]
pub fn close_capture_window(app: AppHandle) {
    capture_window::close(&app);
}

/// Turns capture on or off. Turning it on registers its shortcut first; if
/// that fails capture stays off, nothing is stored, and the reason goes back
/// to the UI. The other shortcuts are never touched.
#[tauri::command]
pub fn set_capture_enabled(
    enabled: bool,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    let snapshot = {
        let mut state = shared.lock();
        if enabled {
            let key = state.config.shortcut_capture.clone();
            shortcuts::set(&app, shortcuts::Action::Capture, &key)?;
        } else {
            shortcuts::clear(&app, shortcuts::Action::Capture);
        }
        state.config.capture_enabled = enabled;
        crate::logging::log_io("save settings", crate::config::save(&state.config));
        crate::sync_ui(&app, &state);
        StateSnapshot::from(&*state)
    };
    // Registering the shortcut above is safe with the `Shared` lock held because
    // synchronous commands run on the main thread. The window is closed only
    // after the lock is released.
    if !enabled {
        capture_window::close(&app);
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn preview_clamps_minutes_like_commit() {
        match preview_parsed("tempo 4", "2026-10-31") {
            Parsed::SetMinutes { minutes } => assert_eq!(minutes, 5),
            other => panic!("inesperado: {other:?}"),
        }
        match preview_parsed("tarefa x tempo 240", "2026-10-31") {
            Parsed::Task { minutes, .. } => assert_eq!(minutes, Some(180)),
            other => panic!("inesperado: {other:?}"),
        }
    }

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn open(list: &[(&str, i64)]) -> Vec<(String, i64)> {
        list.iter().map(|(id, t)| (id.to_string(), *t)).collect()
    }

    fn brasilia_1240() -> DateTime<FixedOffset> {
        FixedOffset::west_opt(3 * 3600).unwrap().with_ymd_and_hms(2026, 10, 31, 12, 40, 0).unwrap()
    }

    fn task_item(title: &str, minutes: Option<u32>) -> CaptureItem {
        CaptureItem::Task { title: title.into(), project: Some("focusbrew".into()), minutes, day: None }
    }

    fn plan(item: &CaptureItem, enabled: bool) -> Result<Plan, String> {
        plan_commit(item, enabled, 25, "2026-10-31", brasilia_1240(), "note-1".into())
    }

    #[test]
    fn target_prefers_running_timer() {
        let tasks = open(&[("a", 1), ("b", 2)]);
        assert_eq!(resolve_minutes_target(&tasks, Some("timer")), Target::One("timer".into()));
    }

    #[test]
    fn target_single_open_task() {
        assert_eq!(resolve_minutes_target(&open(&[("only", 5)]), None), Target::One("only".into()));
    }

    #[test]
    fn target_many_open_tasks_returns_five_newest_first() {
        let tasks = open(&[("t1", 10), ("t7", 70), ("t3", 30), ("t6", 60), ("t2", 20), ("t5", 50), ("t4", 40)]);
        assert_eq!(
            resolve_minutes_target(&tasks, None),
            Target::Pick(ids(&["t7", "t6", "t5", "t4", "t3"]))
        );
    }

    #[test]
    fn target_none_without_tasks() {
        assert_eq!(resolve_minutes_target(&[], None), Target::None);
    }

    #[test]
    fn commit_task_uses_default_minutes_when_not_spoken() {
        let Plan::Task(task) = plan(&task_item("revisar PR", None), true).unwrap() else { panic!("not a task") };
        assert_eq!(task.minutes, 25);
        assert_eq!(task.title, "revisar PR");
        assert_eq!(task.project.as_deref(), Some("focusbrew"));
        assert_eq!(task.day, "2026-10-31");
        let Plan::Task(spoken) = plan(&task_item("revisar PR", Some(40)), true).unwrap() else { panic!() };
        assert_eq!(spoken.minutes, 40);
    }

    #[test]
    fn commit_task_clamps_minutes_to_5_180() {
        let Plan::Task(low) = plan(&task_item("x", Some(1)), true).unwrap() else { panic!() };
        let Plan::Task(high) = plan(&task_item("x", Some(999)), true).unwrap() else { panic!() };
        assert_eq!((low.minutes, high.minutes), (5, 180));
        let item = CaptureItem::SetMinutes { task_id: "a".into(), minutes: 4 };
        assert!(matches!(plan(&item, true).unwrap(), Plan::SetMinutes { minutes: 5, .. }));
        let item = CaptureItem::SetMinutes { task_id: "a".into(), minutes: 4000 };
        assert!(matches!(plan(&item, true).unwrap(), Plan::SetMinutes { minutes: 180, .. }));
    }

    #[test]
    fn commit_task_day_must_be_a_real_date() {
        let item = CaptureItem::Task { title: "x".into(), project: None, minutes: None, day: Some("2026-02-31".into()) };
        let Plan::Task(task) = plan(&item, true).unwrap() else { panic!() };
        assert_eq!(task.day, "2026-10-31");
        let item = CaptureItem::Task { title: "x".into(), project: None, minutes: None, day: Some("2026-11-01".into()) };
        let Plan::Task(task) = plan(&item, true).unwrap() else { panic!() };
        assert_eq!(task.day, "2026-11-01");
    }

    #[test]
    fn commit_note_adds_origin_line() {
        let item = CaptureItem::Note { text: "ligar pro cliente".into() };
        let Plan::Note(note) = plan(&item, true).unwrap() else { panic!("not a note") };
        assert_eq!(note.text, "ligar pro cliente\n\n— ditado, 31/10 12:40");
        assert_eq!(note.id, "note-1");
    }

    #[test]
    fn commit_is_refused_when_capture_disabled() {
        let items = [
            task_item("revisar PR", None),
            CaptureItem::Note { text: "algo".into() },
            CaptureItem::SetMinutes { task_id: "a".into(), minutes: 30 },
        ];
        for item in &items {
            assert!(plan(item, false).is_err(), "{item:?}");
            assert!(plan(item, true).is_ok(), "{item:?}");
        }
    }

    #[test]
    fn commit_blank_or_oversized_text_writes_nothing() {
        let refused = [
            task_item("   ", None),
            task_item(&"a".repeat(MAX_TITLE_CHARS + 1), None),
            CaptureItem::Note { text: " \n ".into() },
            CaptureItem::Note { text: "a".repeat(MAX_TEXT_CHARS + 1) },
            // Fits alone, but not once the origin line is added.
            CaptureItem::Note { text: "a".repeat(MAX_TEXT_CHARS) },
        ];
        for item in &refused {
            assert!(plan(item, true).is_err(), "{item:?}");
        }
        assert!(plan(&task_item(&"a".repeat(MAX_TITLE_CHARS), None), true).is_ok());
        assert!(plan(&CaptureItem::Note { text: "a".repeat(MAX_TEXT_CHARS - 40) }, true).is_ok());
    }
}
