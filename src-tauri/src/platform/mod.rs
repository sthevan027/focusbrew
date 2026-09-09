#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;

/// Platform-specific hooks used by focus mode. Every method is best-effort:
/// failures are logged by the caller and never crash the app, since these
/// touch OS internals that vary across versions/distros.
pub trait PlatformAdapter {
    /// Toggles the OS "Do Not Disturb" / Focus Assist equivalent.
    fn set_dnd(&self, enabled: bool) -> Result<(), String>;
}

#[cfg(target_os = "windows")]
pub fn adapter() -> impl PlatformAdapter {
    windows::WindowsAdapter
}

#[cfg(target_os = "linux")]
pub fn adapter() -> impl PlatformAdapter {
    linux::LinuxAdapter
}

#[cfg(target_os = "macos")]
pub fn adapter() -> impl PlatformAdapter {
    macos::MacAdapter
}

/// The OS accent color as "#rrggbb", used as the widget's progress ring
/// default. Best-effort: `None` when unsupported or unavailable, and the
/// frontend falls back to a fixed color.
#[cfg(target_os = "windows")]
pub fn accent_color() -> Option<String> {
    windows::accent_color()
}

#[cfg(target_os = "linux")]
pub fn accent_color() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
pub fn accent_color() -> Option<String> {
    None
}
