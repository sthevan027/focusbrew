use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::config::AppConfig;
use crate::platform::{self, PlatformAdapter};

pub fn enable(app: &AppHandle, config: &AppConfig) {
    notify(app, "Modo foco ativado", "Detectei que você está trabalhando — bloqueando distrações.");
    let adapter = platform::adapter();
    if config.theme_switch_enabled {
        if let Err(e) = adapter.set_dark_theme(true) {
            eprintln!("[focusbrew] failed to set dark theme: {e}");
        }
    }
    if config.dnd_enabled {
        if let Err(e) = adapter.set_dnd(true) {
            eprintln!("[focusbrew] failed to enable DND: {e}");
        }
    }
}

pub fn disable(app: &AppHandle, config: &AppConfig) {
    notify(app, "Modo foco desativado", "Bem-vindo de volta.");
    let adapter = platform::adapter();
    if config.theme_switch_enabled {
        if let Err(e) = adapter.set_dark_theme(false) {
            eprintln!("[focusbrew] failed to restore theme: {e}");
        }
    }
    if config.dnd_enabled {
        if let Err(e) = adapter.set_dnd(false) {
            eprintln!("[focusbrew] failed to disable DND: {e}");
        }
    }
}

pub fn notify(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}
