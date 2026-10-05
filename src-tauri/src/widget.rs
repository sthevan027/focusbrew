use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::config::AppConfig;
use crate::tracker::timer::TimerStatus;

/// Collapsed pill: just the status icon + timer, hugging the top-center of the
/// screen (like a macOS notch widget). Expanded: adds quick controls.
pub const COLLAPSED_SIZE: (f64, f64) = (200.0, 80.0);
pub const EXPANDED_SIZE: (f64, f64) = (440.0, 300.0);
const TOP_MARGIN: f64 = 0.0;
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

/// Parked: a flat bar at the very top of the screen (the 14 px tall window
/// is the area that reacts to the mouse; the bar itself is 6 px).
pub const IDLE_SIZE: (f64, f64) = (140.0, 14.0);
/// A block is running or paused: the box with the progress line around it.
pub const RUNNING_SIZE: (f64, f64) = (320.0, 44.0);
/// The To Do + Activity panel.
pub const OPEN_SIZE: (f64, f64) = (470.0, 230.0);

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Layout {
    pub width: f64,
    pub height: f64,
    pub visible: bool,
}

/// Window size (logical px, already scaled) and visibility for a given state.
pub fn layout_for(config: &AppConfig, status: TimerStatus, expanded: bool) -> Layout {
    let (w, h) = if expanded {
        OPEN_SIZE
    } else if status == TimerStatus::Idle {
        IDLE_SIZE
    } else {
        RUNNING_SIZE
    };
    let scale = config.widget_scale.factor();
    Layout {
        width: (w * scale).round(),
        height: (h * scale).round(),
        visible: config.widget_visible,
    }
}

/// Left edge that centers a window of `window_width` on a monitor; the
/// monitor's own origin is added so a monitor at a negative x still works.
pub fn top_center_x(monitor_x: f64, monitor_width: f64, window_width: f64) -> f64 {
    monitor_x + ((monitor_width - window_width) / 2.0).floor()
}

/// A monitor's origin and width in logical pixels, from its physical values.
pub fn logical_monitor(x: i32, y: i32, width: u32, scale: f64) -> (f64, f64, f64) {
    let s = if scale > 0.0 { scale } else { 1.0 };
    (x as f64 / s, y as f64 / s, width as f64 / s)
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

#[cfg(test)]
mod layout_tests {
    use super::*;
    use crate::config::{AppConfig, WidgetScale};

    fn cfg(scale: WidgetScale) -> AppConfig {
        AppConfig { widget_scale: scale, ..AppConfig::default() }
    }

    #[test]
    fn medium_sizes_follow_the_state() {
        let c = cfg(WidgetScale::Medium);
        let at = |status, expanded| {
            let l = layout_for(&c, status, expanded);
            (l.width, l.height)
        };
        assert_eq!(at(TimerStatus::Idle, false), (140.0, 14.0));
        assert_eq!(at(TimerStatus::Running, false), (320.0, 44.0));
        assert_eq!(at(TimerStatus::Paused, false), (320.0, 44.0));
    }

    #[test]
    fn the_open_panel_wins_over_the_timer_state() {
        let c = cfg(WidgetScale::Medium);
        for status in [TimerStatus::Idle, TimerStatus::Running, TimerStatus::Paused] {
            let l = layout_for(&c, status, true);
            assert_eq!((l.width, l.height), (470.0, 230.0));
        }
    }

    #[test]
    fn small_and_large_scale_every_size() {
        let small = layout_for(&cfg(WidgetScale::Small), TimerStatus::Idle, false);
        assert_eq!((small.width, small.height), (119.0, 12.0));
        let small_run = layout_for(&cfg(WidgetScale::Small), TimerStatus::Running, false);
        assert_eq!((small_run.width, small_run.height), (272.0, 37.0));

        let large = layout_for(&cfg(WidgetScale::Large), TimerStatus::Running, true);
        assert_eq!((large.width, large.height), (588.0, 288.0));
    }

    #[test]
    fn visibility_follows_the_setting() {
        let hidden = AppConfig { widget_visible: false, ..AppConfig::default() };
        assert!(!layout_for(&hidden, TimerStatus::Idle, false).visible);
        assert!(layout_for(&AppConfig::default(), TimerStatus::Idle, false).visible);
    }

    #[test]
    fn the_window_is_centered_on_the_monitor() {
        assert_eq!(top_center_x(0.0, 1920.0, 320.0), 800.0);
        assert_eq!(top_center_x(0.0, 1366.0, 320.0), 523.0);
        // odd leftover pixel: never a half pixel
        assert_eq!(top_center_x(0.0, 1367.0, 320.0), 523.0);
    }

    // Review focus: a second monitor to the left of the main one has a
    // negative origin; the widget must follow the monitor, not (0, 0).
    #[test]
    fn a_monitor_with_a_negative_origin_keeps_the_widget_on_it() {
        assert_eq!(top_center_x(-1920.0, 1920.0, 320.0), -1120.0);
    }

    // Review focus: at 150 % the monitor is 2880 physical px = 1920 logical.
    #[test]
    fn physical_monitor_values_become_logical_ones() {
        assert_eq!(logical_monitor(0, 0, 2880, 1.5), (0.0, 0.0, 1920.0));
        assert_eq!(logical_monitor(-2880, 120, 2880, 1.5), (-1920.0, 80.0, 1920.0));
    }

    #[test]
    fn a_zero_or_negative_scale_factor_is_treated_as_one() {
        assert_eq!(logical_monitor(10, 20, 1000, 0.0), (10.0, 20.0, 1000.0));
        assert_eq!(logical_monitor(10, 20, 1000, -2.0), (10.0, 20.0, 1000.0));
    }
}
