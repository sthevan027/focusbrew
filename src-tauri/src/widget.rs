use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

#[cfg(not(windows))]
use tauri::{PhysicalPosition, PhysicalSize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::config::{AppConfig, WidgetEdge};
use crate::tracker::timer::TimerStatus;

const FALLBACK_MONITOR_WIDTH: u32 = 1280;
const FALLBACK_MONITOR_HEIGHT: u32 = 720;

/// The window never changes size while you use it: resizing a WebView makes
/// it skip ~100 ms of frames. It is always as big as the open panel, lets the
/// mouse pass through, and only catches it inside the visible shape's area.
pub const OPEN_SIZE: (f64, f64) = (560.0, 300.0);
/// Parked: the area over the flat bar that reacts to the mouse (the bar is 6 px).
pub const IDLE_ZONE: (f64, f64) = (140.0, 14.0);
/// A block is running or paused: the box with the progress line around it.
pub const RUNNING_ZONE: (f64, f64) = (320.0, 44.0);

/// How often the cursor is checked while the mouse passes through.
const HOVER_POLL: Duration = Duration::from_millis(30);

type Bounds = (i32, i32, i32, i32);

/// Whether the panel is open. Set by the front-end (`set_widget_expanded`);
/// while open the whole window takes the mouse.
static EXPANDED: AtomicBool = AtomicBool::new(false);
/// Physical (x, y, width, height) placed last; repeats are skipped.
static LAST_BOUNDS: Mutex<Option<Bounds>> = Mutex::new(None);
/// Physical area that catches the mouse while closed; `None` when hidden.
static ZONE: Mutex<Option<Bounds>> = Mutex::new(None);
/// Whether the window currently lets the mouse pass through.
static PASS_THROUGH: AtomicBool = AtomicBool::new(true);

pub fn set_expanded(expanded: bool) {
    EXPANDED.store(expanded, Ordering::Relaxed);
}

/// Creates the floating widget window: transparent, always on top, no
/// decorations, mouse passing through. Starts hidden; the first `apply`
/// places and shows it.
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("widget").is_some() {
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("index.html".into()))
        .title("focusbrew")
        .inner_size(OPEN_SIZE.0, OPEN_SIZE.1)
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
    window.set_ignore_cursor_events(true)?;
    PASS_THROUGH.store(true, Ordering::Relaxed);
    Ok(())
}

/// Pins the window to the chosen screen edge of the chosen monitor and
/// records the mouse area for `zone`. Must run on the main thread (`sync_ui`
/// posts it there).
pub fn apply(
    app: &AppHandle,
    window_layout: Layout,
    zone: Layout,
    monitor_name: Option<&str>,
    edge: WidgetEdge,
) {
    let Some(window) = app.get_webview_window("widget") else {
        return;
    };
    if !window_layout.visible {
        *LAST_BOUNDS.lock().unwrap() = None;
        *ZONE.lock().unwrap() = None;
        let _ = window.hide();
        return;
    }
    // The chosen monitor if it's still plugged in, otherwise the primary one.
    let chosen = monitor_name.and_then(|name| {
        window
            .available_monitors()
            .ok()?
            .into_iter()
            .find(|m| m.name().map(String::as_str) == Some(name))
    });
    let monitor = chosen.or_else(|| window.primary_monitor().ok().flatten());
    let place = |layout: &Layout| {
        let area = match &monitor {
            Some(monitor) => {
                let pos = monitor.position();
                let size = monitor.size();
                MonitorArea {
                    x: pos.x,
                    y: pos.y,
                    width: size.width,
                    height: size.height,
                    scale: monitor.scale_factor(),
                }
            }
            None => MonitorArea {
                x: 0,
                y: 0,
                width: FALLBACK_MONITOR_WIDTH,
                height: FALLBACK_MONITOR_HEIGHT,
                scale: 1.0,
            },
        };
        physical_bounds(area, layout, edge)
    };
    *ZONE.lock().unwrap() = Some(place(&zone));
    let bounds = place(&window_layout);
    let visible = window.is_visible().unwrap_or(false);
    {
        let mut last = LAST_BOUNDS.lock().unwrap();
        if visible && *last == Some(bounds) {
            return;
        }
        *last = Some(bounds);
    }
    set_bounds(&window, bounds);
    // `show` activates the window; only do it when it was hidden, or it
    // would steal focus from whatever the user is typing in.
    if !visible {
        let _ = window.show();
    }
}

/// While the panel is closed the window lets the mouse through, except when
/// the cursor is over the visible shape — then the page gets the hover.
pub fn spawn_hover_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(HOVER_POLL).await;
            let zone = *ZONE.lock().unwrap();
            let pass_through = match zone {
                None => true,
                Some(_) if EXPANDED.load(Ordering::Relaxed) => false,
                Some(zone) => match cursor_position(&app) {
                    Some((x, y)) => !contains(zone, x, y),
                    None => true,
                },
            };
            if PASS_THROUGH.swap(pass_through, Ordering::Relaxed) != pass_through {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Some(window) = handle.get_webview_window("widget") {
                        let _ = window.set_ignore_cursor_events(pass_through);
                    }
                });
            }
        }
    });
}

#[cfg(windows)]
fn cursor_position(_app: &AppHandle) -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut point = POINT::default();
    // SAFETY: GetCursorPos only writes the POINT we own.
    unsafe { GetCursorPos(&mut point) }.ok()?;
    Some((point.x, point.y))
}

#[cfg(not(windows))]
fn cursor_position(app: &AppHandle) -> Option<(i32, i32)> {
    let pos = app.cursor_position().ok()?;
    Some((pos.x.round() as i32, pos.y.round() as i32))
}

/// Size and position in a single native call: separate `set_size` and
/// `set_position` calls show one frame with the new size at the old spot.
#[cfg(windows)]
fn set_bounds(window: &WebviewWindow, (x, y, w, h): Bounds) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
    };
    if let Ok(hwnd) = window.hwnd() {
        // SAFETY: a valid window handle owned by this process, used on the main thread.
        unsafe {
            let _ = SetWindowPos(hwnd, None, x, y, w, h, SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER);
        }
    }
}

#[cfg(not(windows))]
fn set_bounds(window: &WebviewWindow, (x, y, w, h): Bounds) {
    let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// A monitor in physical px.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

/// Where a layout goes on a monitor, in physical px: glued to `edge` —
/// centered on the top edge, or centered in height on the left/right edge.
pub fn physical_bounds(area: MonitorArea, layout: &Layout, edge: WidgetEdge) -> Bounds {
    let s = if area.scale > 0.0 { area.scale } else { 1.0 };
    let w = (layout.width * s).round() as i32;
    let h = (layout.height * s).round() as i32;
    let centered_x = area.x + (area.width as i32 - w).div_euclid(2);
    let centered_y = area.y + (area.height as i32 - h).div_euclid(2);
    match edge {
        WidgetEdge::Top => (centered_x, area.y, w, h),
        WidgetEdge::Left => (area.x, centered_y, w, h),
        WidgetEdge::Right => (area.x + area.width as i32 - w, centered_y, w, h),
    }
}

/// A monitor the widget can sit on, as the settings list it.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MonitorChoice {
    /// What `AppConfig::monitor` stores.
    pub name: String,
    /// "Monitor 2 — 2560×1440 (principal)".
    pub label: String,
}

pub fn monitors(app: &AppHandle) -> Vec<MonitorChoice> {
    let Some(window) = app.get_webview_window("widget") else {
        return Vec::new();
    };
    let primary = window.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .filter_map(|(i, m)| {
            let name = m.name()?.clone();
            let size = m.size();
            let main = if primary.as_deref() == Some(name.as_str()) { " (principal)" } else { "" };
            Some(MonitorChoice { label: format!("Monitor {} — {}×{}{main}", i + 1, size.width, size.height), name })
        })
        .collect()
}

pub fn contains((x, y, w, h): Bounds, px: i32, py: i32) -> bool {
    px >= x && px < x + w && py >= y && py < y + h
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Layout {
    pub width: f64,
    pub height: f64,
    pub visible: bool,
}

fn scaled(config: &AppConfig, (w, h): (f64, f64)) -> Layout {
    let scale = config.widget_scale.factor();
    Layout {
        width: (w * scale).round(),
        height: (h * scale).round(),
        visible: config.widget_visible,
    }
}

/// The window: always the open panel's size (logical px, already scaled).
pub fn window_layout(config: &AppConfig) -> Layout {
    scaled(config, OPEN_SIZE)
}

/// The area that catches the mouse while the panel is closed. On the side
/// edges the parked bar stands up (14 wide, 140 tall).
pub fn hot_zone(config: &AppConfig, status: TimerStatus) -> Layout {
    let (w, h) = if status == TimerStatus::Idle { IDLE_ZONE } else { RUNNING_ZONE };
    let size = match (status, config.widget_edge) {
        (TimerStatus::Idle, WidgetEdge::Left | WidgetEdge::Right) => (h, w),
        _ => (w, h),
    };
    scaled(config, size)
}

#[cfg(test)]
mod layout_tests {
    use super::*;
    use crate::config::{AppConfig, WidgetEdge, WidgetScale};

    const EDGES: [WidgetEdge; 3] = [WidgetEdge::Top, WidgetEdge::Left, WidgetEdge::Right];

    fn cfg(scale: WidgetScale) -> AppConfig {
        AppConfig { widget_scale: scale, ..AppConfig::default() }
    }

    fn cfg_edge(edge: WidgetEdge) -> AppConfig {
        AppConfig { widget_edge: edge, ..AppConfig::default() }
    }

    fn size(l: Layout) -> (f64, f64) {
        (l.width, l.height)
    }

    fn area(x: i32, y: i32, width: u32, height: u32, scale: f64) -> MonitorArea {
        MonitorArea { x, y, width, height, scale }
    }

    fn inside(outer: Bounds, inner: Bounds) -> bool {
        inner.0 >= outer.0
            && inner.1 >= outer.1
            && inner.0 + inner.2 <= outer.0 + outer.2
            && inner.1 + inner.3 <= outer.1 + outer.3
    }

    #[test]
    fn the_window_is_always_the_panel_size() {
        assert_eq!(size(window_layout(&cfg(WidgetScale::Medium))), (560.0, 300.0));
        assert_eq!(size(window_layout(&cfg(WidgetScale::Small))), (476.0, 255.0));
        assert_eq!(size(window_layout(&cfg(WidgetScale::Large))), (700.0, 375.0));
    }

    #[test]
    fn the_mouse_zone_follows_the_state() {
        let c = cfg(WidgetScale::Medium);
        assert_eq!(size(hot_zone(&c, TimerStatus::Idle)), (140.0, 14.0));
        assert_eq!(size(hot_zone(&c, TimerStatus::Running)), (320.0, 44.0));
        assert_eq!(size(hot_zone(&c, TimerStatus::Paused)), (320.0, 44.0));
    }

    #[test]
    fn the_mouse_zone_follows_the_scale() {
        assert_eq!(size(hot_zone(&cfg(WidgetScale::Small), TimerStatus::Idle)), (119.0, 12.0));
        assert_eq!(size(hot_zone(&cfg(WidgetScale::Small), TimerStatus::Running)), (272.0, 37.0));
        assert_eq!(size(hot_zone(&cfg(WidgetScale::Large), TimerStatus::Running)), (400.0, 55.0));
    }

    #[test]
    fn the_parked_bar_stands_up_on_the_sides() {
        for edge in [WidgetEdge::Left, WidgetEdge::Right] {
            let c = cfg_edge(edge);
            assert_eq!(size(hot_zone(&c, TimerStatus::Idle)), (14.0, 140.0), "{edge:?}");
            assert_eq!(size(hot_zone(&c, TimerStatus::Running)), (320.0, 44.0), "{edge:?}");
            assert_eq!(size(hot_zone(&c, TimerStatus::Paused)), (320.0, 44.0), "{edge:?}");
        }
        assert_eq!(size(hot_zone(&cfg_edge(WidgetEdge::Top), TimerStatus::Idle)), (140.0, 14.0));
        let small = AppConfig { widget_edge: WidgetEdge::Left, widget_scale: WidgetScale::Small, ..AppConfig::default() };
        assert_eq!(size(hot_zone(&small, TimerStatus::Idle)), (12.0, 119.0));
    }

    #[test]
    fn visibility_follows_the_setting() {
        let hidden = AppConfig { widget_visible: false, ..AppConfig::default() };
        assert!(!window_layout(&hidden).visible);
        assert!(window_layout(&AppConfig::default()).visible);
    }

    #[test]
    fn the_zone_and_the_window_share_the_same_top_center() {
        let c = cfg(WidgetScale::Medium);
        let a = area(0, 0, 1920, 1080, 1.0);
        let window = physical_bounds(a, &window_layout(&c), WidgetEdge::Top);
        let zone = physical_bounds(a, &hot_zone(&c, TimerStatus::Running), WidgetEdge::Top);
        assert_eq!(window, (680, 0, 560, 300));
        assert_eq!(zone, (800, 0, 320, 44));
    }

    #[test]
    fn the_left_edge_is_glued_to_the_screen_and_centered_in_height() {
        let c = cfg_edge(WidgetEdge::Left);
        let a = area(0, 0, 1920, 1080, 1.0);
        assert_eq!(physical_bounds(a, &window_layout(&c), WidgetEdge::Left), (0, 390, 560, 300));
        assert_eq!(physical_bounds(a, &hot_zone(&c, TimerStatus::Running), WidgetEdge::Left), (0, 518, 320, 44));
        assert_eq!(physical_bounds(a, &hot_zone(&c, TimerStatus::Idle), WidgetEdge::Left), (0, 470, 14, 140));
    }

    #[test]
    fn the_right_edge_is_glued_to_the_screen_and_centered_in_height() {
        let c = cfg_edge(WidgetEdge::Right);
        let a = area(0, 0, 1920, 1080, 1.0);
        assert_eq!(physical_bounds(a, &window_layout(&c), WidgetEdge::Right), (1360, 390, 560, 300));
        assert_eq!(physical_bounds(a, &hot_zone(&c, TimerStatus::Running), WidgetEdge::Right), (1600, 518, 320, 44));
        assert_eq!(physical_bounds(a, &hot_zone(&c, TimerStatus::Idle), WidgetEdge::Right), (1906, 470, 14, 140));
    }

    #[test]
    fn contains_is_inclusive_left_top_exclusive_right_bottom() {
        let zone = (800, 0, 320, 44);
        assert!(contains(zone, 800, 0));
        assert!(contains(zone, 1119, 43));
        assert!(!contains(zone, 1120, 10));
        assert!(!contains(zone, 900, 44));
        assert!(!contains(zone, 799, 10));
    }

    #[test]
    fn the_window_is_centered_on_top_of_the_monitor() {
        let run = Layout { width: 320.0, height: 44.0, visible: true };
        assert_eq!(physical_bounds(area(0, 0, 1920, 1080, 1.0), &run, WidgetEdge::Top), (800, 0, 320, 44));
        // odd leftover pixel: never a half pixel
        assert_eq!(physical_bounds(area(0, 0, 1367, 1080, 1.0), &run, WidgetEdge::Top), (523, 0, 320, 44));
        assert_eq!(physical_bounds(area(0, 0, 1920, 1081, 1.0), &run, WidgetEdge::Left), (0, 518, 320, 44));
    }

    // Review focus: a second monitor to the left of the main one has a
    // negative origin; the widget must follow the monitor, not (0, 0).
    #[test]
    fn a_monitor_with_a_negative_origin_keeps_the_widget_on_it() {
        let open = Layout { width: 470.0, height: 230.0, visible: true };
        let a = area(-1920, 0, 1920, 1080, 1.0);
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Top), (-1195, 0, 470, 230));
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Left), (-1920, 425, 470, 230));
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Right), (-470, 425, 470, 230));
        let b = area(-2880, 120, 2880, 1620, 1.5);
        assert_eq!(physical_bounds(b, &open, WidgetEdge::Top), (-1793, 120, 705, 345));
        assert_eq!(physical_bounds(b, &open, WidgetEdge::Left), (-2880, 757, 705, 345));
        assert_eq!(physical_bounds(b, &open, WidgetEdge::Right), (-705, 757, 705, 345));
    }

    // Review focus: at 150 % sizes and position are all in physical px.
    #[test]
    fn a_scaled_monitor_gets_physical_sizes_on_every_edge() {
        let open = Layout { width: 470.0, height: 230.0, visible: true };
        let a = area(0, 0, 2880, 1620, 1.5);
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Top), (1087, 0, 705, 345));
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Left), (0, 637, 705, 345));
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Right), (2175, 637, 705, 345));
    }

    #[test]
    fn a_zero_or_negative_scale_factor_is_treated_as_one() {
        let run = Layout { width: 320.0, height: 44.0, visible: true };
        assert_eq!(physical_bounds(area(0, 0, 1000, 1000, 0.0), &run, WidgetEdge::Top), (340, 0, 320, 44));
        assert_eq!(physical_bounds(area(0, 0, 1000, 1000, -2.0), &run, WidgetEdge::Top), (340, 0, 320, 44));
        assert_eq!(physical_bounds(area(0, 0, 1000, 1000, 0.0), &run, WidgetEdge::Left), (0, 478, 320, 44));
    }

    // Review focus: changing the edge while the app runs must move the window
    // (`apply` skips a repeat of the same bounds).
    #[test]
    fn each_edge_places_the_window_somewhere_different() {
        let a = area(0, 0, 1920, 1080, 1.0);
        let l = window_layout(&AppConfig::default());
        let spots: Vec<Bounds> = EDGES.iter().map(|e| physical_bounds(a, &l, *e)).collect();
        assert_ne!(spots[0], spots[1]);
        assert_ne!(spots[0], spots[2]);
        assert_ne!(spots[1], spots[2]);
    }

    // Review focus: a zone that sticks out of the window can never be hovered.
    #[test]
    fn the_mouse_zone_is_always_inside_the_window() {
        let a = area(0, 0, 1920, 1080, 1.0);
        for edge in EDGES {
            for scale in [WidgetScale::Small, WidgetScale::Medium, WidgetScale::Large] {
                for status in [TimerStatus::Idle, TimerStatus::Running, TimerStatus::Paused] {
                    let c = AppConfig { widget_edge: edge, widget_scale: scale, ..AppConfig::default() };
                    let window = physical_bounds(a, &window_layout(&c), edge);
                    let zone = physical_bounds(a, &hot_zone(&c, status), edge);
                    assert!(inside(window, zone), "{edge:?} {scale:?}: zone {zone:?} outside window {window:?}");
                }
            }
        }
    }
}
