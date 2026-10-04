mod activity;
mod commands;
mod config;
mod detector;
mod focus;
mod github;
mod platform;
mod state;
mod tasks;
mod timer;
mod widget;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{image::Image, AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

use state::{Activity, AppState, StateSnapshot};
use timer::TimerPhase;

const FOCUS_HOTKEY: &str = "CommandOrControl+Shift+Space";

const ICON_IDLE: &[u8] = include_bytes!("../icons/tray/idle.png");
const ICON_WORKING: &[u8] = include_bytes!("../icons/tray/working.png");
const ICON_FOCUS: &[u8] = include_bytes!("../icons/tray/focus.png");
const ICON_COFFEE: &[u8] = include_bytes!("../icons/tray/coffee.png");

pub struct Shared(pub Mutex<AppState>);

fn decode_icon(bytes: &[u8]) -> Image<'static> {
    let img = image::load_from_memory(bytes)
        .expect("bundled tray icons must decode")
        .into_rgba8();
    let (width, height) = img.dimensions();
    Image::new_owned(img.into_raw(), width, height)
}

fn icon_for(state: &AppState) -> Image<'static> {
    let bytes = if state.timer.phase == TimerPhase::Break {
        ICON_COFFEE
    } else if state.focus_mode {
        ICON_FOCUS
    } else if state.activity == Activity::Working {
        ICON_WORKING
    } else {
        ICON_IDLE
    };
    decode_icon(bytes)
}

fn tooltip_for(state: &AppState) -> String {
    match (state.timer.phase, state.focus_mode, state.activity) {
        (TimerPhase::Break, ..) => "focusbrew — pausa do café ☕".into(),
        (_, true, _) => "focusbrew — modo foco ativo".into(),
        (_, _, Activity::Working) => "focusbrew — detectei você trabalhando".into(),
        _ => "focusbrew — sem atividade detectada".into(),
    }
}

/// Applies the latest state to the tray icon/tooltip and notifies the
/// frontend window. Called after every state mutation.
pub fn sync_ui(app: &AppHandle, state: &AppState) {
    // Tray setters block until the main thread runs them, and callers hold
    // the state mutex here — while the main thread itself locks that mutex
    // (sync commands, tray menu, hotkey). Waiting would deadlock the UI, so
    // the update is posted to the main thread instead of awaited.
    //
    // The tooltip maps 1:1 to the tray icon, so it doubles as the "did the
    // tray change" key — this runs every poll tick and the icon rarely moves.
    static LAST_TOOLTIP: Mutex<String> = Mutex::new(String::new());
    let tooltip = tooltip_for(state);
    let mut last = LAST_TOOLTIP.lock().unwrap();
    if *last != tooltip {
        *last = tooltip.clone();
        let icon = icon_for(state);
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(tray) = handle.tray_by_id("main-tray") {
                let _ = tray.set_icon(Some(icon));
                let _ = tray.set_tooltip(Some(tooltip));
            }
        });
    }
    drop(last);
    let snapshot = StateSnapshot::from(state);
    let _ = app.emit("state-changed", snapshot);
}

/// Recomputes whether focus mode should be active given the current
/// activity/timer/config, applying the platform side-effects only on change.
pub fn reconcile_focus(app: &AppHandle, state: &mut AppState) {
    // App-blocking pauses during the coffee break or a manual pause — you
    // can use blocked apps on your break.
    let should_block = state.activity == Activity::Working
        && state.config.focus_auto_enable
        && state.timer.phase != TimerPhase::Break
        && !state.timer.paused;
    state.focus_mode = should_block;

    // DND stays on for the whole session (focus AND break) — it only flips
    // off once the session actually ends, instead of toggling every
    // pomodoro cycle.
    let should_stay_immersed = state.timer.phase != TimerPhase::Off
        || (state.activity == Activity::Working && state.config.focus_auto_enable);

    if should_stay_immersed != state.immersed {
        state.immersed = should_stay_immersed;
        if should_stay_immersed {
            focus::enable(app, &state.config);
        } else {
            focus::disable(app, &state.config);
        }
    }

    // Blocked apps are killed by the background loop, using the process list
    // it already refreshed and with the state mutex released — scanning every
    // process here held the lock (and, from commands, the main thread) for
    // the whole scan.
}

/// Apps to kill right now, if focus mode is blocking any.
fn apps_to_block(state: &AppState) -> Vec<String> {
    if state.focus_mode && state.config.block_apps_enabled {
        state.config.blocked_apps.clone()
    } else {
        Vec::new()
    }
}

/// Records whatever time is left running in the current phase (if any) and
/// stops the timer. Used for every way a session can end early — the
/// "Parar" button, the hotkey toggle, and the app quitting mid-session —
/// so early stops keep their time instead of losing it silently.
pub(crate) fn stop_and_record(state: &mut AppState) {
    let kind = match state.timer.phase {
        TimerPhase::Focus => Some(activity::SessionKind::Focus),
        TimerPhase::Break => Some(activity::SessionKind::Break),
        TimerPhase::Off => None,
    };
    if let Some(kind) = kind {
        let elapsed = state.timer.elapsed_secs(&state.config.timer);
        activity::record_block(&mut state.focus_log, kind, elapsed);
    }
    state.timer.stop();
}

/// Starts a focus session if the timer is off, stops it otherwise. Bound to
/// the global hotkey and to the tray/widget "toggle" controls.
pub fn toggle_focus_session(app: &AppHandle) {
    let shared = app.state::<Shared>();
    let mut state = shared.0.lock().unwrap();

    if state.timer.phase == TimerPhase::Off {
        let timer_config = state.config.timer.clone();
        state.timer.start_focus(&timer_config);
        focus::notify(app, "Foco iniciado", "Sessão de foco começou pelo atalho.");
    } else {
        stop_and_record(&mut state);
        focus::notify(app, "Foco parado", "Sessão de foco encerrada pelo atalho.");
    }

    reconcile_focus(app, &mut state);
    sync_ui(app, &state);
}

fn spawn_background_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut sys = sysinfo::System::new();
        loop {
            let poll_secs = {
                let shared = app.state::<Shared>();
                let state = shared.0.lock().unwrap();
                state.config.poll_interval_secs.max(1)
            };
            tokio::time::sleep(Duration::from_secs(poll_secs)).await;

            // Only process names are used (detection + blocking), so skip
            // the per-process CPU/memory/disk reads `refresh_processes` does.
            sys.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::All,
                true,
                sysinfo::ProcessRefreshKind::new(),
            );

            let shared = app.state::<Shared>();
            let mut state = shared.0.lock().unwrap();

            let seen_apps = detector::monitored_processes_seen(
                &sys,
                &state.config.monitored_processes,
            );
            state.activity = if seen_apps.is_empty() {
                Activity::Idle
            } else {
                Activity::Working
            };
            activity::record_app_tick(&mut state.focus_log, &seen_apps, poll_secs as u32);

            let was_focus = state.timer.phase == TimerPhase::Focus;
            let was_break = state.timer.phase == TimerPhase::Break;
            let timer_config = state.config.timer.clone();
            let flipped = state.timer.tick(poll_secs as u32, &timer_config);
            if flipped {
                if was_focus {
                    let duration = timer_config.focus_minutes * 60;
                    activity::record_block(&mut state.focus_log, activity::SessionKind::Focus, duration);
                } else if was_break {
                    let duration = timer_config.break_minutes * 60;
                    activity::record_block(&mut state.focus_log, activity::SessionKind::Break, duration);
                }
                let (title, body) = match state.timer.phase {
                    TimerPhase::Break => ("Hora do café ☕", "Bora dar um tempo — a pausa começou."),
                    TimerPhase::Focus => ("De volta ao foco", "Pausa terminada, hora de voltar."),
                    TimerPhase::Off => ("", ""),
                };
                if !title.is_empty() {
                    focus::notify(&app, title, body);
                }
            }

            reconcile_focus(&app, &mut state);
            sync_ui(&app, &state);
            let blocked = apps_to_block(&state);
            drop(state);

            detector::kill_blocked_processes(&sys, &blocked);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let global_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_focus_session(app);
            }
        })
        .with_shortcut(FOCUS_HOTKEY)
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
            commands::update_settings,
            commands::save_github_token,
            commands::github_gh_available,
            commands::connect_github_with_gh,
            commands::clear_github_token,
            commands::refresh_github,
            commands::import_github_item_as_task,
            commands::start_coffee_break,
            commands::stop_timer,
            commands::set_widget_expanded,
            commands::toggle_widget_visibility,
            commands::open_main_window,
            commands::toggle_focus_session,
            commands::get_accent_color,
            commands::toggle_pause_timer,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let menu = MenuBuilder::new(app)
                .text("open", "Abrir painel")
                .text("toggle_widget", "Mostrar/ocultar widget")
                .separator()
                .text("coffee_break", "Iniciar pausa-café ☕")
                .text("toggle_focus", "Iniciar/parar foco (Ctrl+Shift+Space)")
                .text("toggle_monitor", "Pausar/retomar detecção")
                .separator()
                .text("quit", "Sair")
                .build()?;

            TrayIconBuilder::with_id("main-tray")
                .icon(decode_icon(ICON_IDLE))
                .tooltip("focusbrew")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    "toggle_widget" => widget::toggle_visible(app),
                    "toggle_focus" => toggle_focus_session(app),
                    "coffee_break" => {
                        let shared = app.state::<Shared>();
                        let mut state = shared.0.lock().unwrap();
                        let timer_config = state.config.timer.clone();
                        state.timer.start_break(&timer_config);
                        reconcile_focus(app, &mut state);
                        sync_ui(app, &state);
                    }
                    "toggle_monitor" => {
                        let shared = app.state::<Shared>();
                        let mut state = shared.0.lock().unwrap();
                        state.config.focus_auto_enable = !state.config.focus_auto_enable;
                        let _ = config::save(&state.config);
                        reconcile_focus(app, &mut state);
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
            spawn_background_loop(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window just hides it — the app keeps living in the tray.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Flush whatever time is left in a running session before the
            // process actually goes away ("Sair" in the tray, or the OS
            // shutting the app down) — otherwise that time was silently lost.
            if let tauri::RunEvent::Exit = event {
                let shared = app_handle.state::<Shared>();
                let mut state = shared.0.lock().unwrap();
                stop_and_record(&mut state);
            }
        });
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
