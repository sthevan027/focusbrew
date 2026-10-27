use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::activity_tracking::{self, client::ActivityClient, models::{ActivityReport, ConfigResponse, ConfigUpdate}};
use crate::config::{self, AppConfig};
use crate::github;
use crate::google_calendar;
use crate::google_sync::{self, SyncAction};
use crate::media;
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

// The SMTC calls block, so they run on a blocking thread, not the async runtime.
#[tauri::command]
pub async fn media_play() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(media::play).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn media_pause() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(media::pause).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn media_next() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(media::next).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn media_previous() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(media::previous).await.map_err(|e| e.to_string())?
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
    let (snapshot, result) = apply(&app, &shared, |state, now, _| state.tracker.edit_task(&id, &text, now));
    result.map(|_| snapshot)
}

#[tauri::command]
pub fn move_task(
    id: String,
    day: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    let (snapshot, result) = apply(&app, &shared, |state, now, _| state.tracker.move_task(&id, &day, now));
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
    let (linked, token) = {
        let state = shared.lock();
        let linked = state.tracker.tasks.iter().find(|t| t.id == id).and_then(|t| t.google_event_id.clone());
        (linked, state.google_access_token.clone())
    };
    if let (Some(event_id), Some(token)) = (linked, token) {
        tauri::async_runtime::spawn(async move {
            let _ = google_calendar::delete_event(&token, &event_id).await;
        });
    }
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
/// Fixed port for the OAuth redirect; it must match the redirect URI registered on the Google client.
const GOOGLE_OAUTH_PORT: u16 = 53682;
/// Create at https://console.cloud.google.com (OAuth client, type "Desktop app").
const GOOGLE_CLIENT_ID: &str = "10792334375-halgr8bommvuu24vlt51ljksdh1llo5s.apps.googleusercontent.com";

#[tauri::command]
pub async fn google_connect(app: AppHandle, shared: State<'_, Shared>) -> Result<StateSnapshot, String> {
    let redirect_uri = format!("http://127.0.0.1:{GOOGLE_OAUTH_PORT}/callback");
    let pair = google_calendar::generate_pkce();
    let url = google_calendar::authorize_url(&pair.challenge, &redirect_uri, GOOGLE_CLIENT_ID);
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())?;
    let code = tauri::async_runtime::spawn_blocking(move || google_calendar::listen_for_code(GOOGLE_OAUTH_PORT))
        .await
        .map_err(|e| e.to_string())??;
    let tokens = google_calendar::exchange_code(&code, &pair.verifier, &redirect_uri, GOOGLE_CLIENT_ID).await?;
    let refresh_token = tokens.refresh_token.ok_or_else(|| "Google não devolveu um refresh token".to_string())?;
    google_calendar::save_refresh_token(&refresh_token)?;

    let mut state = shared.lock();
    state.config.google_connected = true;
    state.google_access_token = Some(tokens.access_token);
    state.google_error = None;
    let _ = config::save(&state.config);
    let snapshot = StateSnapshot::from(&*state);
    sync_ui(&app, &state);
    Ok(snapshot)
}

#[tauri::command]
pub fn google_disconnect(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let _ = google_calendar::clear_refresh_token();
    let mut state = shared.lock();
    state.disconnect_google();
    let _ = config::save(&state.config);
    let snapshot = StateSnapshot::from(&*state);
    sync_ui(&app, &state);
    snapshot
}

/// One Google sync cycle, for today only: renews the token, then reconciles
/// today's tasks with today's events. The caller records any error.
pub(crate) async fn refresh_google_now(app: &AppHandle) -> Result<(), String> {
    let refresh = google_calendar::load_refresh_token().ok_or_else(|| "sem refresh token salvo".to_string())?;
    let token = google_calendar::refresh_access_token(&refresh, GOOGLE_CLIENT_ID).await?.access_token;
    {
        let shared = app.state::<Shared>();
        let mut state = shared.lock();
        if !state.config.google_connected {
            return Ok(());
        }
        state.google_access_token = Some(token.clone());
    }

    let today = today_key();
    let planned: Vec<tasks::Task> = {
        let shared = app.state::<Shared>();
        let state = shared.lock();
        state.tracker.tasks.iter().filter(|t| google_sync::in_scope(t, &today)).cloned().collect()
    };
    let remote_events = google_calendar::fetch_day_events(&token, &today).await?;

    for task in &planned {
        let remote = task.google_event_id.as_ref().and_then(|id| remote_events.iter().find(|e| &e.id == id));
        match google_sync::decide(task, remote) {
            SyncAction::CreateRemote => {
                let start_ms = now_ms();
                let end_ms = start_ms + i64::from(task.minutes) * 60_000;
                let title = google_sync::event_title_for(task);
                if let Ok(event_id) = google_calendar::create_event(&token, &title, start_ms, end_ms).await {
                    update_task(app, &task.id, |t| t.google_event_id = Some(event_id));
                }
            }
            SyncAction::PushTitle(title) => {
                if let Some(event_id) = &task.google_event_id {
                    let _ = google_calendar::patch_event_title(&token, event_id, &title).await;
                }
            }
            SyncAction::PullTitle(title) => {
                let remote_done = remote.map_or(task.done, |r| google_calendar::strip_done_prefix(&r.title).1);
                pull_remote(app, &task.id, title, remote_done);
            }
            SyncAction::MarkLocalDone(title) => pull_remote(app, &task.id, title, true),
            SyncAction::MarkLocalOpen(title) => pull_remote(app, &task.id, title, false),
            SyncAction::DeleteLocal => {
                // Missing from today's list is not the same as deleted: a task moved
                // to another day keeps its event there, so only Google's own answer removes it.
                let Some(event_id) = &task.google_event_id else { continue };
                if matches!(google_calendar::event_is_gone(&token, event_id).await, Ok(true)) {
                    let shared = app.state::<Shared>();
                    let mut state = shared.lock();
                    state.tracker.remove_task(&task.id, now_ms(), &today);
                    state.save_tracker();
                }
            }
            SyncAction::Noop => {}
        }
    }

    let shared = app.state::<Shared>();
    let mut state = shared.lock();
    state.google_last_sync_ms = now_ms();
    state.google_error = None;
    sync_ui(app, &state);
    Ok(())
}

fn update_task(app: &AppHandle, id: &str, change: impl FnOnce(&mut tasks::Task)) {
    let shared = app.state::<Shared>();
    let mut state = shared.lock();
    if let Some(task) = state.tracker.tasks.iter_mut().find(|t| t.id == id) {
        change(task);
    }
    state.save_tracker();
}

/// Takes the title and state Google won the conflict with.
fn pull_remote(app: &AppHandle, id: &str, title: String, done: bool) {
    update_task(app, id, |t| {
        t.title = title;
        t.updated_at = now_ms();
    });
    set_done(app, id, done);
}

/// Same as ticking the task in the UI, so a task finished on Google stops its timer too.
fn set_done(app: &AppHandle, id: &str, done: bool) {
    let shared = app.state::<Shared>();
    let needs_toggle = {
        let mut state = shared.lock();
        let needs_toggle = state.tracker.tasks.iter().any(|t| t.id == id && t.done != done);
        if needs_toggle {
            state.tracker.toggle_task(id, now_ms(), &today_key());
            state.save_tracker();
        }
        needs_toggle
    };
    if needs_toggle {
        push_title_to_google(app, id);
    }
}

/// Sends the task's current title (with the ✓ when done) to its Google event
/// right away, instead of waiting for the next sync cycle.
fn push_title_to_google(app: &AppHandle, id: &str) {
    let app = app.clone();
    let id = id.to_string();
    tauri::async_runtime::spawn(async move {
        let (event_id, title) = {
            let shared = app.state::<Shared>();
            let state = shared.lock();
            let Some(task) = state.tracker.tasks.iter().find(|t| t.id == id) else { return };
            let Some(event_id) = task.google_event_id.clone() else { return };
            (event_id, google_sync::event_title_for(task))
        };
        let shared = app.state::<Shared>();
        let Ok(token) = google_access_token(&shared).await else { return };
        let _ = google_calendar::patch_event_title(&token, &event_id, &title).await;
    });
}

/// The token for Google calls: this session's, or a fresh one from the saved
/// refresh token (a restarted app has the connection but no token yet).
async fn google_access_token(shared: &Shared) -> Result<String, String> {
    let cached = shared.lock().google_access_token.clone();
    if let Some(token) = cached {
        return Ok(token);
    }
    let refresh = google_calendar::load_refresh_token().ok_or_else(|| "conta Google não conectada".to_string())?;
    let tokens = google_calendar::refresh_access_token(&refresh, GOOGLE_CLIENT_ID).await?;
    shared.lock().google_access_token = Some(tokens.access_token.clone());
    Ok(tokens.access_token)
}

#[tauri::command]
pub async fn google_list_day_events(
    day: String,
    shared: State<'_, Shared>,
) -> Result<Vec<google_calendar::CalendarEvent>, String> {
    let token = google_access_token(&shared).await?;
    google_calendar::fetch_day_events(&token, &day).await
}

#[tauri::command]
pub fn google_import_event(
    event: google_calendar::CalendarEvent,
    day: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    apply(&app, &shared, |state, now, _| {
        google_calendar::import_event(&mut state.tracker.tasks, &event, &day, now);
    })
    .0
}

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

/// Opens a note (`None` = new) where the settings say. Async on purpose: on
/// Windows, building a window from a synchronous command deadlocks.
#[tauri::command]
pub async fn open_note(id: Option<String>, app: AppHandle, shared: State<'_, Shared>) -> Result<(), String> {
    let (placement, visible) = {
        let state = shared.lock();
        (state.config.note_placement, state.config.widget_visible)
    };
    note_window::open(&app, id, note_window::wants_window(placement, visible));
    Ok(())
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

// ---- Activity Tracking: reads and settings come from the tracker service on 127.0.0.1 ----

const ACTIVITY_PORT: u16 = 8765;

#[derive(serde::Serialize)]
pub struct ActivityReportDto {
    pub apps: Vec<ActivityReport>,
    pub idle_seconds: u32,
}

fn parse_instant(raw: &str) -> Result<chrono::DateTime<chrono::Utc>, String> {
    chrono::DateTime::parse_from_rfc3339(raw)
        .map(|d| d.with_timezone(&chrono::Utc))
        .map_err(|_| format!("invalid date: {raw}"))
}

/// Every call to the service goes through here: with Activity Tracking off
/// nothing is sent to 127.0.0.1.
fn ensure_activity_enabled(config: &AppConfig) -> Result<(), String> {
    if config.activity_tracking_enabled {
        Ok(())
    } else {
        Err("Activity Tracking está desligado nas Configurações".to_string())
    }
}

fn activity_enabled(shared: &Shared) -> Result<(), String> {
    ensure_activity_enabled(&shared.lock().config)
}

/// Active time per app in `[from, to)`. Missing bounds default to today (local) through tomorrow.
#[tauri::command]
pub async fn get_activity_report(
    from: Option<String>,
    to: Option<String>,
    shared: State<'_, Shared>,
) -> Result<ActivityReportDto, String> {
    activity_enabled(&shared)?;
    let client = ActivityClient::new(ACTIVITY_PORT);
    let from = match from {
        Some(raw) => parse_instant(&raw)?,
        None => activity_tracking::local_midnight(chrono::Local::now().date_naive()),
    };
    let to = match to {
        Some(raw) => parse_instant(&raw)?,
        None => chrono::Utc::now() + chrono::Duration::days(1),
    };
    let res = client.get_activities(from, to).await?;
    Ok(ActivityReportDto { apps: res.data, idle_seconds: res.idle_seconds })
}

#[tauri::command]
pub async fn get_activity_config(shared: State<'_, Shared>) -> Result<ConfigResponse, String> {
    activity_enabled(&shared)?;
    ActivityClient::new(ACTIVITY_PORT).get_config().await
}

/// Either value may be omitted; the service clamps idle to 1–60 and retention to 30–365.
#[tauri::command]
pub async fn update_activity_config(
    idle_threshold_minutes: Option<u32>,
    retention_days: Option<u32>,
    shared: State<'_, Shared>,
) -> Result<ConfigResponse, String> {
    activity_enabled(&shared)?;
    let update = ConfigUpdate { idle_threshold_minutes, retention_days };
    ActivityClient::new(ACTIVITY_PORT).set_config(update).await
}

#[tauri::command]
pub async fn get_activity_service_status(shared: State<'_, Shared>) -> Result<bool, String> {
    activity_enabled(&shared)?;
    Ok(ActivityClient::new(ACTIVITY_PORT).health().await)
}

#[cfg(test)]
mod activity_flag_tests {
    use super::*;

    #[test]
    fn the_service_is_not_called_while_activity_tracking_is_off() {
        let mut config = AppConfig::default();
        assert!(ensure_activity_enabled(&config).is_err());
        config.activity_tracking_enabled = true;
        assert!(ensure_activity_enabled(&config).is_ok());
    }
}
