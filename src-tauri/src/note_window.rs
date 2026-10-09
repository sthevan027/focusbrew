//! The quick note's own window, and the bookkeeping that tells the shortcut
//! whether a note is already open (in that window or over the widget).

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::config::NotePlacement;

/// The whole note (bar + sheet), in logical px.
pub const NOTE_SIZE: (f64, f64) = (560.0, 380.0);

/// Whether the note is open over the widget (set by the front-end).
static OVERLAY_OPEN: AtomicBool = AtomicBool::new(false);

pub fn set_overlay_open(open: bool) {
    OVERLAY_OPEN.store(open, Ordering::Relaxed);
}

/// Whether a note is open over the widget (the widget takes its whole window then).
pub fn overlay_open() -> bool {
    OVERLAY_OPEN.load(Ordering::Relaxed)
}

fn window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("note").and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

pub fn is_open(app: &AppHandle) -> bool {
    window_visible(app) || OVERLAY_OPEN.load(Ordering::Relaxed)
}

/// A hidden widget has no panel to hang the note from: it gets a window.
pub fn wants_window(placement: NotePlacement, widget_visible: bool) -> bool {
    placement == NotePlacement::Window || !widget_visible
}

/// Centers the window on the monitor the mouse is on.
fn center_on_cursor_monitor(app: &AppHandle, window: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) else { return };
    let (pos, area) = (monitor.position(), monitor.size());
    let x = pos.x + (area.width as i32 - size.width as i32) / 2;
    let y = pos.y + (area.height as i32 - size.height as i32) / 2;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Opens a note (`None` = a new one) in its window or over the widget.
pub fn open(app: &AppHandle, id: Option<String>, in_window: bool) {
    if !in_window {
        if let Some(widget) = app.get_webview_window("widget") {
            let _ = widget.set_focus();
        }
        let _ = app.emit_to("widget", "open-note", id);
        return;
    }
    if let Some(window) = app.get_webview_window("note") {
        if !window.is_visible().unwrap_or(false) {
            center_on_cursor_monitor(app, &window);
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = app.emit_to("note", "open-note", id);
        return;
    }
    let query = id.as_deref().unwrap_or("new");
    let url = WebviewUrl::App(format!("index.html?note={query}").into());
    if let Ok(window) = WebviewWindowBuilder::new(app, "note", url)
        .title("focusbrew — Nota")
        .inner_size(NOTE_SIZE.0, NOTE_SIZE.1)
        .resizable(false)
        .maximizable(false)
        .build()
    {
        center_on_cursor_monitor(app, &window);
        let _ = window.set_focus();
    }
}

/// The shortcut with a note already open: bring it to the front and blink.
pub fn focus_and_flash(app: &AppHandle) {
    if window_visible(app) {
        if let Some(window) = app.get_webview_window("note") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        let _ = app.emit_to("note", "note-flash", ());
    } else {
        if let Some(widget) = app.get_webview_window("widget") {
            let _ = widget.set_focus();
        }
        let _ = app.emit_to("widget", "note-flash", ());
    }
}

pub fn close_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("note") {
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::NotePlacement;

    #[test]
    fn a_note_opens_in_a_window_when_asked_or_when_the_widget_is_hidden() {
        assert!(!wants_window(NotePlacement::Overlay, true));
        assert!(wants_window(NotePlacement::Overlay, false));
        assert!(wants_window(NotePlacement::Window, true));
        assert!(wants_window(NotePlacement::Window, false));
    }
}
