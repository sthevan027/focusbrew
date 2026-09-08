use super::PlatformAdapter;
use std::process::Command;

pub struct LinuxAdapter;

/// Best-effort implementation: covers GNOME (the most common desktop) via
/// `gsettings`. Other desktop environments are not yet supported — this is
/// documented as an open contribution area in the README.
impl PlatformAdapter for LinuxAdapter {
    fn set_dark_theme(&self, dark: bool) -> Result<(), String> {
        let scheme = if dark { "prefer-dark" } else { "default" };
        run(
            "gsettings",
            &["set", "org.gnome.desktop.interface", "color-scheme", scheme],
        )
    }

    fn set_dnd(&self, enabled: bool) -> Result<(), String> {
        run(
            "gsettings",
            &[
                "set",
                "org.gnome.desktop.notifications",
                "show-banners",
                if enabled { "false" } else { "true" },
            ],
        )
    }
}

fn run(cmd: &str, args: &[&str]) -> Result<(), String> {
    Command::new(cmd)
        .args(args)
        .status()
        .map_err(|e| format!("{cmd} not available: {e}"))
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("{cmd} exited with {status}"))
            }
        })
}
