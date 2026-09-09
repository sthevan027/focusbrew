use super::PlatformAdapter;
use std::process::Command;

pub struct MacAdapter;

/// Best-effort implementation via the Shortcuts CLI. Requires the user to
/// grant Automation permissions to focusbrew the first time it runs.
impl PlatformAdapter for MacAdapter {
    fn set_dnd(&self, enabled: bool) -> Result<(), String> {
        // macOS Focus modes are managed by the Shortcuts app since Monterey;
        // this calls a shortcut named "focusbrew-dnd-on"/"focusbrew-dnd-off"
        // that the user must create once (documented in the README).
        let shortcut = if enabled {
            "focusbrew-dnd-on"
        } else {
            "focusbrew-dnd-off"
        };
        Command::new("shortcuts")
            .args(["run", shortcut])
            .status()
            .map_err(|e| format!("shortcuts CLI not available: {e}"))
            .and_then(|status| {
                if status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "shortcut '{shortcut}' missing or failed — create it in the Shortcuts app"
                    ))
                }
            })
    }
}
