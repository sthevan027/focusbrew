use tauri::{AppHandle, State};

use crate::config::{self, AppConfig};
use crate::github;
use crate::state::StateSnapshot;
use crate::tasks::{self, TaskSource};
use crate::widget;
use crate::{reconcile_focus, stop_and_record, sync_ui, Shared};

#[tauri::command]
pub fn get_state(shared: State<'_, Shared>) -> StateSnapshot {
    let state = shared.0.lock().unwrap();
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub fn add_task(title: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    state.tasks.push(tasks::new_task(title, TaskSource::Manual));
    let _ = tasks::save(&state.tasks);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub fn toggle_task(id: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    if let Some(task) = state.tasks.iter_mut().find(|t| t.id == id) {
        task.done = !task.done;
    }
    let _ = tasks::save(&state.tasks);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub fn remove_task(id: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    state.tasks.retain(|t| t.id != id);
    let _ = tasks::save(&state.tasks);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub fn update_settings(
    new_config: AppConfig,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    state.config = new_config;
    let _ = config::save(&state.config);
    reconcile_focus(&app, &mut state);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub async fn save_github_token(token: String, shared: State<'_, Shared>) -> Result<String, String> {
    let login = github::whoami(&token).await?;
    github::save_token(&token)?;
    let mut state = shared.0.lock().unwrap();
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
    let mut state = shared.0.lock().unwrap();
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
    let mut state = shared.0.lock().unwrap();
    state.config.github_login = None;
    // Without this the next refresh would quietly reconnect through gh.
    state.config.github_use_gh = false;
    state.github_source = None;
    state.github_items.clear();
    state.github_days.clear();
    let _ = config::save(&state.config);
    Ok(())
}

#[tauri::command]
pub async fn refresh_github(app: AppHandle, shared: State<'_, Shared>) -> Result<StateSnapshot, String> {
    let (use_gh, login) = {
        let state = shared.0.lock().unwrap();
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
    let (token, source) = github::pick_token(use_gh, gh, github::load_token()).ok_or(
        "sem token do GitHub — rode `gh auth login` num terminal ou cole um token na aba GitHub",
    )?;

    let result = github::fetch_involved(&token, &login).await;
    // Best-effort: a broken contribution calendar fetch shouldn't blank out
    // the PR/issue list, so its error isn't surfaced to `github_error`.
    let contributions = github::fetch_contribution_calendar(&token, &login).await;

    let mut state = shared.0.lock().unwrap();
    state.github_source = Some(source);
    match result {
        Ok(items) => {
            state.github_items = items;
            state.github_error = None;
        }
        Err(e) => {
            state.github_error = Some(e);
        }
    }
    if let Ok(days) = contributions {
        state.github_days = days;
    }
    sync_ui(&app, &state);
    Ok(StateSnapshot::from(&*state))
}

#[tauri::command]
pub fn import_github_item_as_task(
    title: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    state.tasks.push(tasks::new_task(title, TaskSource::Github));
    let _ = tasks::save(&state.tasks);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub fn start_coffee_break(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    let timer_config = state.config.timer.clone();
    state.timer.start_break(&timer_config);
    reconcile_focus(&app, &mut state);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub fn stop_timer(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    stop_and_record(&mut state);
    reconcile_focus(&app, &mut state);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub fn toggle_pause_timer(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    let paused = !state.timer.paused;
    state.timer.set_paused(paused);
    reconcile_focus(&app, &mut state);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

#[tauri::command]
pub fn set_widget_expanded(expanded: bool, app: AppHandle) {
    widget::set_expanded(&app, expanded);
}

#[tauri::command]
pub fn toggle_widget_visibility(app: AppHandle) {
    widget::toggle_visible(&app);
}

#[tauri::command]
pub fn open_main_window(app: AppHandle) {
    crate::show_main_window(&app);
}

#[tauri::command]
pub fn toggle_focus_session(app: AppHandle) {
    crate::toggle_focus_session(&app);
}

#[tauri::command]
pub fn get_accent_color() -> Option<String> {
    crate::platform::accent_color()
}
