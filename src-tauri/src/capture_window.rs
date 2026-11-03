//! The capture box's own window: small, centered on the monitor the mouse is
//! on, focused when it opens. Closing only hides it, so the next shortcut
//! press finds it and shows it again.

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::note_window::center_on_cursor_monitor;

/// The whole window, in logical px.
pub const CAPTURE_SIZE: (f64, f64) = (560.0, 200.0);

/// Shows the capture box (building it the first time). Must not be called
/// from the shortcut event thread: building a window there deadlocks on Windows.
pub fn open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        if !window.is_visible().unwrap_or(false) {
            center_on_cursor_monitor(app, &window);
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = app.emit_to("capture", "capture-open", ());
        return;
    }
    // Built hidden, placed, then shown, so it never flashes in the wrong spot.
    let url = WebviewUrl::App("index.html?capture=1".into());
    if let Ok(window) = WebviewWindowBuilder::new(app, "capture", url)
        .title("focusbrew — Captura")
        .inner_size(CAPTURE_SIZE.0, CAPTURE_SIZE.1)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
    {
        center_on_cursor_monitor(app, &window);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        let _ = window.hide();
    }
}
