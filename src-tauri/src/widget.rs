use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::config::AppConfig;
use crate::tracker::timer::TimerStatus;

const FALLBACK_MONITOR_WIDTH: f64 = 1280.0;

/// Whether the panel is open. Set by the front-end (`set_widget_expanded`)
/// when the mouse hovers the widget; read when sizing the window.
static EXPANDED: AtomicBool = AtomicBool::new(false);

pub fn set_expanded(expanded: bool) {
    EXPANDED.store(expanded, Ordering::Relaxed);
}

pub fn is_expanded() -> bool {
    EXPANDED.load(Ordering::Relaxed)
}

/// Creates the floating widget window: transparent, always on top, no
/// decorations. Starts hidden; the first `apply` sizes, places and shows it.
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("widget").is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("index.html".into()))
        .title("focusbrew")
        .inner_size(IDLE_SIZE.0, IDLE_SIZE.1)
        .position(0.0, 0.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()?;
    Ok(())
}

/// Sizes the window and pins it to the very top of the primary monitor,
/// centered. Must run on the main thread (`sync_ui` posts it there).
pub fn apply(app: &AppHandle, layout: Layout) {
    let Some(window) = app.get_webview_window("widget") else {
        return;
    };
    if !layout.visible {
        let _ = window.hide();
        return;
    }
    let (origin_x, origin_y, width) = match window.primary_monitor() {
        Ok(Some(monitor)) => {
            let pos = monitor.position();
            logical_monitor(pos.x, pos.y, monitor.size().width, monitor.scale_factor())
        }
        _ => (0.0, 0.0, FALLBACK_MONITOR_WIDTH),
    };
    let _ = window.set_size(LogicalSize::new(layout.width, layout.height));
    let _ = window.set_position(LogicalPosition::new(
        top_center_x(origin_x, width, layout.width),
        origin_y,
    ));
    // `show` activates the window; only do it when it was hidden, or every
    // resize would steal focus from whatever the user is typing in.
    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
    }
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
