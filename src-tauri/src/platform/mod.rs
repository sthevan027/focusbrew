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
    /// Switches the OS-wide theme. `true` = dark, `false` = light.
    fn set_dark_theme(&self, dark: bool) -> Result<(), String>;
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
