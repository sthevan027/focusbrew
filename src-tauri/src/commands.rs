use tauri::{AppHandle, Manager, State};

use crate::config::{self, AppConfig};
use crate::github;
use crate::state::{AppState, StateSnapshot};
use crate::tracker::activity::{self, ProjectTotal};
use crate::tracker::tasks::{self, TaskSource};
use crate::tracker::{now_ms, today_key};
use crate::widget;
use crate::{autostart, shortcuts};
use crate::{notify_finished, sync_ui, Shared};

#[tauri::command]
pub fn get_state(shared: State<'_, Shared>) -> StateSnapshot {
    let state = shared.lock();
    StateSnapshot::from(&*state)
}

/// Locks the state, runs `change`, saves tasks/log and publishes the result.
/// Every task and timer command has this shape.
fn apply<T>(
    app: &AppHandle,
    shared: &Shared,
    change: impl FnOnce(&mut AppState, i64, &str) -> T,
) -> (StateSnapshot, T) {
    let mut state = shared.lock();
    let result = change(&mut state, now_ms(), &today_key());
    state.save_tracker();
    sync_ui(app, &state);
    (StateSnapshot::from(&*state), result)
}

/// Adds a task to `day` (today when missing or not a real date).
#[tauri::command]
pub fn add_task(
    title: String,
    day: Option<String>,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    apply(&app, &shared, |state, _, today| {
        let minutes = state.config.default_minutes;
        let day = day.filter(|d| tasks::is_valid_day(d)).unwrap_or_else(|| today.to_string());
        let (title, project) = tasks::split_project(&title);
        if let Some(mut task) = tasks::new_task(&title, TaskSource::Manual, minutes, &day) {
            task.project = project;
            state.tracker.tasks.push(task);
        }
    })
    .0
}

/// Renames a task from "título #projeto" text.
#[tauri::command]
pub fn edit_task(
    id: String,
    text: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    let (snapshot, result) = apply(&app, &shared, |state, _, _| state.tracker.edit_task(&id, &text));
    result.map(|_| snapshot)
}

/// Time per project over the whole history (the settings' Projetos section).
#[tauri::command]
pub fn project_totals(shared: State<'_, Shared>) -> Vec<ProjectTotal> {
    let state = shared.lock();
    activity::project_totals(&state.tracker.log.sessions, &today_key())
}

#[tauri::command]
pub fn move_task(
    id: String,
    day: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    let (snapshot, result) = apply(&app, &shared, |state, _, _| state.tracker.move_task(&id, &day));
    result.map(|_| snapshot)
}

/// The ▲▼ arrows (`delta` is +5 or -5).
#[tauri::command]
pub fn nudge_task_minutes(
    id: String,
    delta: i32,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    let (snapshot, (finished, notify_on)) = apply(&app, &shared, |state, now, today| {
        (
            state.tracker.nudge_minutes(&id, delta, now, today),
            state.config.notify_on_finish,
        )
    });
    if notify_on {
        if let Some(done) = finished {
            notify_finished(&app, &done);
        }
    }
    snapshot
}

#[tauri::command]
pub fn toggle_task(id: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, now, today| state.tracker.toggle_task(&id, now, today)).0
}

#[tauri::command]
pub fn remove_task(id: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, now, today| state.tracker.remove_task(&id, now, today)).0
}


#[tauri::command]
pub fn reorder_tasks(ids: Vec<String>, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, _, _| tasks::reorder(&mut state.tracker.tasks, &ids)).0
}

#[tauri::command]
pub fn start_task(
    id: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    let (snapshot, result) =
        apply(&app, &shared, |state, now, today| state.tracker.start_task(&id, now, today));
    result.map(|_| snapshot)
}

#[tauri::command]
pub fn toggle_pause(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, now, _| state.tracker.toggle_pause(now)).0
}

#[tauri::command]
pub fn stop_timer(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, now, today| state.tracker.stop(now, today)).0
}

/// Changes one global shortcut (`which` is "toggle" or "panel"). An invalid
/// one, the other action's one, or one another app holds is refused and the
/// old one stays.
#[tauri::command]
pub fn set_shortcut(
    which: String,
    text: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    let action = match which.as_str() {
        "toggle" => shortcuts::Action::Toggle,
        "panel" => shortcuts::Action::Panel,
        _ => return Err(format!("atalho desconhecido: {which}")),
    };
    let text = text.trim().to_string();
    shortcuts::set(&app, action, &text)?;
    let mut state = shared.lock();
    match action {
        shortcuts::Action::Toggle => state.config.shortcut_toggle = text,
        shortcuts::Action::Panel => state.config.shortcut_panel = text,
    }
    state.shortcut_warning = None;
    let _ = config::save(&state.config);
    sync_ui(&app, &state);
    Ok(StateSnapshot::from(&*state))
}

#[tauri::command]
pub fn set_launch_at_login(
    enabled: bool,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    autostart::set(enabled)?;
    let mut state = shared.lock();
    state.config.launch_at_login = enabled;
    let _ = config::save(&state.config);
    sync_ui(&app, &state);
    Ok(StateSnapshot::from(&*state))
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Vec<widget::MonitorChoice> {
    widget::monitors(&app)
}

#[tauri::command]
pub fn update_settings(
    new_config: AppConfig,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    let mut state = shared.lock();
    let mut config = new_config.normalized();
    // The GitHub login and the gh switch belong to the GitHub commands, and
    // shortcuts and start-with-Windows to their own (they can fail); a
    // settings form holding an older copy must not overwrite them.
    config.github_login = state.config.github_login.clone();
    config.github_use_gh = state.config.github_use_gh;
    config.shortcut_toggle = state.config.shortcut_toggle.clone();
    config.shortcut_panel = state.config.shortcut_panel.clone();
    config.launch_at_login = state.config.launch_at_login;
    state.config = config;
    let _ = config::save(&state.config);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub async fn save_github_token(token: String, shared: State<'_, Shared>) -> Result<String, String> {
    let login = github::whoami(&token).await?;
    github::save_token(&token)?;
    let mut state = shared.lock();
    state.config.github_login = Some(login.clone());
    // Pasting a token is an explicit choice: use it instead of gh's login.
    state.config.github_use_gh = false;
    let _ = config::save(&state.config);
    Ok(login)
}

/// Whether the GitHub CLI is installed and logged in — lets the screen offer
/// "Conectar com o GitHub CLI" only when it can work.
#[tauri::command]
pub async fn github_gh_available() -> bool {
    github::gh_token().await.is_some()
}

/// Connects using the GitHub CLI's login (`gh auth token`), no token to paste.
#[tauri::command]
pub async fn connect_github_with_gh(shared: State<'_, Shared>) -> Result<String, String> {
    let token = github::gh_token()
        .await
        .ok_or("GitHub CLI não encontrado ou sem login — rode `gh auth login` num terminal e tente de novo")?;
    let login = github::whoami(&token).await?;
    let mut state = shared.lock();
    state.config.github_login = Some(login.clone());
    state.config.github_use_gh = true;
    let _ = config::save(&state.config);
    Ok(login)
}

#[tauri::command]
pub fn clear_github_token(shared: State<'_, Shared>) -> Result<(), String> {
    // Only people who pasted a token have one in the keyring; for a gh login
    // there's nothing to delete, which is not an error.
    let _ = github::clear_token();
    let mut state = shared.lock();
    state.config.github_login = None;
    // Without this the next refresh would quietly reconnect through gh.
    state.config.github_use_gh = false;
    state.github_source = None;
    state.github_items.clear();
    state.github_days.clear();
    state.github_events.clear();
    let _ = config::save(&state.config);
    Ok(())
}

#[tauri::command]
pub async fn refresh_github(app: AppHandle) -> Result<StateSnapshot, String> {
    refresh_github_now(&app).await
}

/// Fetches PRs/issues and the contribution calendar and publishes them.
/// Shared by the "Atualizar" button and the background refresh loop.
pub(crate) async fn refresh_github_now(app: &AppHandle) -> Result<StateSnapshot, String> {
    let shared = app.state::<Shared>();
    let (use_gh, login) = {
        let state = shared.lock();
        let login = state
            .config
            .github_login
            .clone()
            .ok_or("GitHub não conectado — conecte na aba GitHub")?;
        (state.config.github_use_gh, login)
    };
    // Resolved on every refresh, so a re-login in gh is picked up without
    // reconnecting here.
    let gh = if use_gh { github::gh_token().await } else { None };
    let Some((token, source)) = github::pick_token(use_gh, gh, github::load_token()) else {
        let message = "sem token do GitHub — rode `gh auth login` num terminal ou cole um token na aba GitHub";
        let mut state = shared.lock();
        if state.fail_github_refresh(&login, message.into()) {
            sync_ui(app, &state);
        }
        return Err(message.into());
    };

    let items = github::fetch_involved(&token, &login).await;
    let days = github::fetch_contribution_calendar(&token, &login).await;
    let events = github::fetch_events(&token, &login).await;

    let mut state = shared.lock();
    if state.apply_github_refresh(&login, source, items, days, events) {
        sync_ui(app, &state);
    }
    Ok(StateSnapshot::from(&*state))
}

/// A PR/issue becomes a task on `day` (today when missing), linked to its
/// page, with the repository's name as the project.
#[tauri::command]
pub fn import_github_item_as_task(
    title: String,
    note: Option<String>,
    url: Option<String>,
    repository: Option<String>,
    day: Option<String>,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    apply(&app, &shared, |state, _, today| {
        let minutes = state.config.default_minutes;
        let day = day.filter(|d| tasks::is_valid_day(d)).unwrap_or_else(|| today.to_string());
        if let Some(mut task) = tasks::new_task(&title, TaskSource::Github, minutes, &day) {
            task.note = note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
            task.url = url.filter(|u| u.starts_with("https://github.com/"));
            task.project = repository.as_deref().and_then(tasks::project_from_repository);
            state.tracker.tasks.push(task);
        }
    })
    .0
}

/// The panel opened or closed. The window keeps its size; this only decides
/// whether it takes the mouse everywhere (open) or just over the shape.
#[tauri::command]
pub fn set_widget_expanded(expanded: bool) {
    widget::set_expanded(expanded);
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) {
    crate::show_main_window(&app);
}
