use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

/// Collapsed pill: just the status icon + timer, hugging the top-center of the
/// screen (like a macOS notch widget). Expanded: adds quick controls.
pub const COLLAPSED_SIZE: (f64, f64) = (260.0, 46.0);
pub const EXPANDED_SIZE: (f64, f64) = (440.0, 300.0);
const TOP_MARGIN: f64 = 6.0;
const FALLBACK_MONITOR_WIDTH: f64 = 1280.0;

fn monitor_logical_width(app: &AppHandle) -> f64 {
    let window = match app.get_webview_window("widget") {
        Some(w) => w,
        None => return FALLBACK_MONITOR_WIDTH,
    };
    match window.primary_monitor() {
        Ok(Some(monitor)) => monitor.size().width as f64 / monitor.scale_factor(),
        _ => FALLBACK_MONITOR_WIDTH,
    }
}

fn centered_x(app: &AppHandle, width: f64) -> f64 {
    ((monitor_logical_width(app) - width) / 2.0).max(0.0)
}

/// Creates the floating widget window, pinned top-center, collapsed by default.
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("widget").is_some() {
        return Ok(());
    }

    let (w, h) = COLLAPSED_SIZE;
    // Centered against a fallback width first; corrected right after via
    // `set_expanded` once the window (and its monitor handle) exists.
    let x = (FALLBACK_MONITOR_WIDTH - w) / 2.0;

    WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("index.html".into()))
        .title("focusbrew")
        .inner_size(w, h)
        .position(x, TOP_MARGIN)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(true)
        .focused(false)
        .build()?;

    set_expanded(app, false);
    Ok(())
}

/// Resizes the widget between its collapsed pill and expanded panel, keeping
/// it centered horizontally and pinned to the top of the screen.
pub fn set_expanded(app: &AppHandle, expanded: bool) {
    let Some(window) = app.get_webview_window("widget") else {
        return;
    };
    let (w, h) = if expanded { EXPANDED_SIZE } else { COLLAPSED_SIZE };
    let x = centered_x(app, w);
    let _ = window.set_size(LogicalSize::new(w, h));
    let _ = window.set_position(LogicalPosition::new(x, TOP_MARGIN));
}

pub fn toggle_visible(app: &AppHandle) {
    let Some(window) = app.get_webview_window("widget") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(true);
    if visible {
        let _ = window.hide();
    } else {
        let _ = window.show();
    }
}
