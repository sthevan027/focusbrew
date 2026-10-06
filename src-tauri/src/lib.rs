mod commands;
mod config;
mod github;
mod state;
mod tracker;
mod widget;

use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{image::Image, AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

use state::{AppState, StateSnapshot};
use tracker::timer::TimerStatus;
use tracker::{now_ms, today_key, Finished};

const HOTKEY: &str = "CommandOrControl+Shift+Space";

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
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if tooltip_changed {
            if let Some(tray) = handle.tray_by_id("main-tray") {
                let _ = tray.set_tooltip(Some(tooltip));
            }
        }
        widget::apply(&handle, window_layout, zone);
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

/// Ctrl+Shift+Space: pause/resume the active block, or start the first open task.
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
            }
            if let Some(done) = to_notify {
                notify_finished(&app, &done);
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
    let global_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                hotkey_action(app);
            }
        })
        .with_shortcut(HOTKEY)
        .expect("invalid global shortcut definition")
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
                let state = shared.lock();
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
