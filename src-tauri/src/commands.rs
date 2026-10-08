use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::{self, AppConfig};
use crate::github;
use crate::note_window;
use crate::notes::{self, Note, NotesShared};
use crate::state::{AppState, StateSnapshot};
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

/// The minutes typed into a task's time field (the tracker clamps to 5..=180).
#[tauri::command]
pub fn set_task_minutes(
    id: String,
    minutes: u32,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    let (snapshot, (finished, notify_on)) = apply(&app, &shared, |state, now, today| {
        (
            state.tracker.set_minutes(&id, minutes, now, today),
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
        "note" => shortcuts::Action::Note,
        _ => return Err(format!("atalho desconhecido: {which}")),
    };
    let text = text.trim().to_string();
    shortcuts::set(&app, action, &text)?;
    let mut state = shared.lock();
    match action {
        shortcuts::Action::Toggle => state.config.shortcut_toggle = text,
        shortcuts::Action::Panel => state.config.shortcut_panel = text,
        shortcuts::Action::Note => state.config.shortcut_note = text,
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
    config.shortcut_note = state.config.shortcut_note.clone();
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

#[tauri::command]
pub fn list_notes(notes: State<'_, NotesShared>) -> Vec<Note> {
    notes.lock().notes.clone()
}

#[tauri::command]
pub fn save_note(note: Note, app: AppHandle, notes: State<'_, NotesShared>) -> Result<(), String> {
    let mut store = notes.lock();
    store.upsert(note, now_ms())?;
    notes::save(&store).map_err(|e| e.to_string())?;
    drop(store);
    let _ = app.emit("notes-changed", ());
    Ok(())
}

/// Deleting a note also deletes the images no other note uses.
#[tauri::command]
pub fn delete_note(id: String, app: AppHandle, notes: State<'_, NotesShared>) -> Result<(), String> {
    let mut store = notes.lock();
    store.check_writable()?;
    store.remove(&id);
    notes::save(&store).map_err(|e| e.to_string())?;
    let in_use = store.images_in_use();
    let may_prune = store.may_prune();
    drop(store);
    if may_prune {
        notes::prune_images(&in_use);
    }
    let _ = app.emit("notes-changed", ());
    Ok(())
}

#[tauri::command]
pub fn save_note_image(data_base64: String, ext: String) -> Result<String, String> {
    let bytes = B64.decode(data_base64.trim()).map_err(|_| "imagem inválida".to_string())?;
    notes::store_image(&bytes, &ext)
}

/// A stored image as a `data:` URL, ready for an `<image>`/`<img>`.
#[tauri::command]
pub fn read_note_image(file: String) -> Result<String, String> {
    let bytes = notes::read_image(&file)?;
    Ok(format!("data:{};base64,{}", notes::mime_for(&file), B64.encode(bytes)))
}

#[derive(serde::Serialize)]
pub struct ImagePayload {
    pub ext: String,
    pub data_base64: String,
}

/// An image file dropped on the note (the path comes from the OS drag-and-drop).
#[tauri::command]
pub fn read_image_file(path: String) -> Result<ImagePayload, String> {
    let path = std::path::PathBuf::from(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|e| matches!(e.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif"))
        .ok_or_else(|| "formato de imagem não suportado".to_string())?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > 20 * 1024 * 1024 {
        return Err("arquivo grande demais".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(ImagePayload { ext, data_base64: B64.encode(bytes) })
}

/// Opens a note (`None` = new) where the settings say.
#[tauri::command]
pub fn open_note(id: Option<String>, app: AppHandle, shared: State<'_, Shared>) {
    let (placement, visible) = {
        let state = shared.lock();
        (state.config.note_placement, state.config.widget_visible)
    };
    note_window::open(&app, id, note_window::wants_window(placement, visible));
}

#[tauri::command]
pub fn close_note_window(app: AppHandle) {
    note_window::close_window(&app);
}

/// The front-end says the note is (or is no longer) open over the widget.
#[tauri::command]
pub fn set_note_overlay_open(open: bool) {
    note_window::set_overlay_open(open);
}
