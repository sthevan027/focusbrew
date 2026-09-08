use tauri::{AppHandle, State};

use crate::config::{self, AppConfig};
use crate::github;
use crate::state::StateSnapshot;
use crate::tasks::{self, TaskSource};
use crate::{reconcile_focus, sync_ui, Shared};

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
    let _ = config::save(&state.config);
    Ok(login)
}

#[tauri::command]
pub fn clear_github_token(shared: State<'_, Shared>) -> Result<(), String> {
    github::clear_token()?;
    let mut state = shared.0.lock().unwrap();
    state.config.github_login = None;
    state.github_items.clear();
    let _ = config::save(&state.config);
    Ok(())
}

#[tauri::command]
pub async fn refresh_github(app: AppHandle, shared: State<'_, Shared>) -> Result<StateSnapshot, String> {
    let (token, login) = {
        let state = shared.0.lock().unwrap();
        let token = github::load_token().ok_or("nenhum token do GitHub configurado")?;
        let login = state
            .config
            .github_login
            .clone()
            .ok_or("token salvo mas login desconhecido — reconfigure em Settings")?;
        (token, login)
    };

    let result = github::fetch_involved(&token, &login).await;
    let mut state = shared.0.lock().unwrap();
    match result {
        Ok(items) => {
            state.github_items = items;
            state.github_error = None;
        }
        Err(e) => {
            state.github_error = Some(e);
        }
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
    state.timer.stop();
    reconcile_focus(&app, &mut state);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}
