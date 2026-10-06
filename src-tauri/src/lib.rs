mod alerts;
mod autostart;
mod commands;
mod config;
mod github;
mod shortcuts;
mod state;
mod tracker;
mod widget;

use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{image::Image, AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

use alerts::{Alert, Moment};
use chrono::Timelike;
use state::{AppState, StateSnapshot};
use tracker::timer::TimerStatus;
use tracker::{now_ms, today_key, Finished};


const TRAY_ICON: &[u8] = include_bytes!("../icons/tray/idle.png");

pub struct Shared(pub Mutex<AppState>);

impl Shared {
    /// The state behind the lock. A panic somewhere while it was held must
    /// not take every later command (and the save on exit) down with it.
    pub fn lock(&self) -> MutexGuard<'_, AppState> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn decode_icon(bytes: &[u8]) -> Image<'static> {
    let img = image::load_from_memory(bytes)
        .expect("bundled tray icons must decode")
        .into_rgba8();
    let (width, height) = img.dimensions();
    Image::new_owned(img.into_raw(), width, height)
}

/// The tray tooltip is limited (~127 chars on Windows); keep titles short.
fn short(text: &str) -> String {
    let cut: String = text.chars().take(80).collect();
    if text.chars().count() > 80 {
        format!("{cut}…")
    } else {
        cut
    }
}

fn tooltip_for(state: &AppState) -> String {
    let tracker = &state.tracker;
    let title = tracker
        .timer
        .task_id()
        .and_then(|id| tracker.tasks.iter().find(|t| t.id == id))
        .map(|t| short(&t.title));
    match (tracker.timer.status(), title) {
        (TimerStatus::Running, Some(t)) => format!("focusbrew — {t}"),
        (TimerStatus::Paused, Some(t)) => format!("focusbrew — {t} (pausado)"),
        _ => "focusbrew".to_string(),
    }
}

/// Applies the latest state to the tray tooltip and the widget window, and
/// notifies the front-end. Called after every state change.
pub fn sync_ui(app: &AppHandle, state: &AppState) {
    // Tray and window setters block until the main thread runs them, and
    // callers hold the state mutex here — while the main thread itself locks
    // that mutex (commands, tray menu, hotkey). Waiting would deadlock the UI,
    // so the update is posted to the main thread instead of awaited.
    static LAST_TOOLTIP: Mutex<String> = Mutex::new(String::new());
    let tooltip = tooltip_for(state);
    let tooltip_changed = {
        let mut last = LAST_TOOLTIP.lock().unwrap();
        let changed = *last != tooltip;
        if changed {
            *last = tooltip.clone();
        }
        changed
    };
    let window_layout = widget::window_layout(&state.config);
    let zone = widget::hot_zone(&state.config, state.tracker.timer.status());
    let monitor = state.config.monitor.clone();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if tooltip_changed {
            if let Some(tray) = handle.tray_by_id("main-tray") {
                let _ = tray.set_tooltip(Some(tooltip));
            }
        }
        widget::apply(&handle, window_layout, zone, monitor.as_deref());
    });
    let _ = app.emit("state-changed", StateSnapshot::from(state));
}

pub(crate) fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

pub(crate) fn notify_finished(app: &AppHandle, done: &Finished) {
    notify(app, "Bloco concluído", &format!("{} · {} min", done.title, done.secs / 60));
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The panel shortcut: the widget opens (pinned) or closes its panel, and
/// gets the keyboard so Esc and typing work right away.
fn panel_action(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("widget") {
        let _ = window.set_focus();
    }
    let _ = app.emit_to("widget", "toggle-panel", ());
}

fn alert_text(alert: &Alert) -> (String, String) {
    match alert {
        Alert::BeforeEnd { title, mins } => (
            format!("Falta{} {mins} min", if *mins > 1 { "m" } else { "" }),
            title.clone(),
        ),
        Alert::GoalReached { mins } => (
            "Meta do dia batida".to_string(),
            format!("{} de foco hoje", tracker_duration(*mins)),
        ),
        Alert::IdleReminder { mins } => (
            format!("Nada rodando há {mins} min"),
            "Que tal começar a próxima tarefa?".to_string(),
        ),
    }
}

/// "2h", "1h 30min", "45min".
fn tracker_duration(mins: u32) -> String {
    match (mins / 60, mins % 60) {
        (0, m) => format!("{m}min"),
        (h, 0) => format!("{h}h"),
        (h, m) => format!("{h}h {m}min"),
    }
}

/// What the alerts look at, taken from the state at one tick.
fn check_alerts(state: &mut AppState, now: i64, today: &str) -> Vec<Alert> {
    let tracker = &state.tracker;
    let block = tracker.timer.task_id().map(|id| {
        let title = tracker.tasks.iter().find(|t| t.id == id).map(|t| t.title.clone()).unwrap_or_default();
        (id.to_string(), tracker.timer.planned_secs(), tracker.timer.remaining_secs(now), title)
    });
    let recorded = tracker.log.focus_secs_by_day.get(today).copied().unwrap_or(0);
    let moment = Moment {
        now_ms: now,
        today,
        hour: chrono::Local::now().hour(),
        status: tracker.timer.status(),
        block: block.as_ref().map(|(id, planned, left, title)| (id.as_str(), *planned, *left, title.as_str())),
        focus_today_secs: recorded.saturating_add(tracker.timer.elapsed_secs(now)),
        has_tasks_today: tracker.tasks.iter().any(|t| !t.done && t.day.as_str() <= today),
    };
    state.alerts.check(&state.config, &moment)
}

/// Pause/resume the active block, or start the first open task of today.
fn hotkey_action(app: &AppHandle) {
    let shared = app.state::<Shared>();
    let mut state = shared.lock();
    let (now, today) = (now_ms(), today_key());
    if state.tracker.timer.status() != TimerStatus::Idle {
        state.tracker.toggle_pause(now);
    } else if let Some(id) = state.tracker.first_open_task(&today) {
        let _ = state.tracker.start_task(&id, now, &today);
    } else {
        return;
    }
    state.save_tracker();
    sync_ui(app, &state);
}

/// Once a second: ends the block when its deadline passes and notices the
/// computer sleeping (see `Tracker::tick`).
fn spawn_tick_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let now = now_ms();
            let today = today_key();
            let mut to_notify: Option<Finished> = None;
            let alerts;
            {
                let shared = app.state::<Shared>();
                let mut state = shared.lock();
                let last = state.last_tick_ms;
                state.last_tick_ms = now;
                let before = state.tracker.timer.clone();
                let finished = state.tracker.tick(now, last, &today);
                if finished.is_some() {
                    state.save_tracker();
                    if state.config.notify_on_finish {
                        to_notify = finished.clone();
                    }
                }
                if finished.is_some() || state.tracker.timer != before {
                    sync_ui(&app, &state);
                }
                alerts = check_alerts(&mut state, now, &today);
            }
            if let Some(done) = to_notify {
                notify_finished(&app, &done);
            }
            for alert in &alerts {
                let (title, body) = alert_text(alert);
                notify(&app, &title, &body);
            }
        }
    });
}

/// How often the PR/issue list and the heatmap refresh on their own.
const GITHUB_REFRESH_EVERY: Duration = Duration::from_secs(5 * 60);

/// Keeps the GitHub data fresh without anyone opening the GitHub tab: once
/// shortly after launch, then every few minutes while connected.
fn spawn_github_refresh_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Let the windows come up first.
        tokio::time::sleep(Duration::from_secs(3)).await;
        loop {
            let connected = {
                let shared = app.state::<Shared>();
                let state = shared.lock();
                state.config.github_login.is_some()
            };
            if connected {
                // Failures land in `github_error`; nothing else to do here.
                let _ = commands::refresh_github_now(&app).await;
            }
            tokio::time::sleep(GITHUB_REFRESH_EVERY).await;
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The shortcuts themselves come from the settings and are registered in
    // `setup` (see `shortcuts::apply`); this only routes a press to its action.
    let global_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            match shortcuts::action_for(shortcut) {
                Some(shortcuts::Action::Toggle) => hotkey_action(app),
                Some(shortcuts::Action::Panel) => panel_action(app),
                None => {}
            }
        })
        .build();

    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(global_shortcut_plugin)
        .manage(Shared(Mutex::new(AppState::load())))
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::add_task,
            commands::toggle_task,
            commands::remove_task,
            commands::nudge_task_minutes,
            commands::move_task,
            commands::edit_task,
            commands::project_totals,
            commands::set_shortcut,
            commands::set_launch_at_login,
            commands::list_monitors,
            commands::reorder_tasks,
            commands::start_task,
            commands::toggle_pause,
            commands::stop_timer,
            commands::update_settings,
            commands::save_github_token,
            commands::github_gh_available,
            commands::connect_github_with_gh,
            commands::clear_github_token,
            commands::refresh_github,
            commands::import_github_item_as_task,
            commands::set_widget_expanded,
            commands::open_settings_window,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let menu = MenuBuilder::new(app)
                .text("open", "Abrir configurações")
                .text("toggle_widget", "Mostrar/ocultar widget")
                .text("pause", "Pausar/retomar")
                .separator()
                .text("quit", "Sair")
                .build()?;

            TrayIconBuilder::with_id("main-tray")
                .icon(decode_icon(TRAY_ICON))
                .tooltip("focusbrew")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    "toggle_widget" => {
                        let shared = app.state::<Shared>();
                        let mut state = shared.lock();
                        state.config.widget_visible = !state.config.widget_visible;
                        let _ = config::save(&state.config);
                        sync_ui(app, &state);
                    }
                    "pause" => {
                        let shared = app.state::<Shared>();
                        let mut state = shared.lock();
                        state.tracker.toggle_pause(now_ms());
                        sync_ui(app, &state);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            widget::create(app.handle())?;
            {
                let shared = handle.state::<Shared>();
                let mut state = shared.lock();
                // Each on its own: one taken by another app leaves the other
                // working, and the settings say which one needs changing.
                let wanted = [
                    (shortcuts::Action::Toggle, state.config.shortcut_toggle.clone()),
                    (shortcuts::Action::Panel, state.config.shortcut_panel.clone()),
                ];
                let problems: Vec<String> = wanted
                    .iter()
                    .filter_map(|(action, text)| shortcuts::set(&handle, *action, text).err())
                    .collect();
                state.shortcut_warning = (!problems.is_empty()).then(|| problems.join(" · "));
                // The Run key may have been removed by hand (or by another
                // machine's settings file): make it match the setting.
                if autostart::is_enabled() != state.config.launch_at_login {
                    let _ = autostart::set(state.config.launch_at_login);
                }
                sync_ui(&handle, &state);
            }
            spawn_tick_loop(handle.clone());
            widget::spawn_hover_loop(handle.clone());
            spawn_github_refresh_loop(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing a window just hides it — the app keeps living in the tray.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Keep the time of a block that is still running when the app
            // goes away ("Sair" in the tray, or the OS shutting it down).
            if let tauri::RunEvent::Exit = event {
                let shared = app_handle.state::<Shared>();
                let mut state = shared.lock();
                state.tracker.stop(now_ms(), &today_key());
                state.save_tracker();
            }
        });
}
