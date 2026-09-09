use super::PlatformAdapter;
use winreg::enums::*;
use winreg::RegKey;

pub struct WindowsAdapter;

impl PlatformAdapter for WindowsAdapter {
    fn set_dnd(&self, enabled: bool) -> Result<(), String> {
        // Windows has no public API for Focus Assist / Quiet Hours. This flips
        // the same registry blob the Focus Assist tray flyout writes to.
        // It is unofficial and may not work on every Windows build — if it
        // fails, focus mode still works (app blocking), this is just
        // best-effort. Value 0 = off, 1 = priority only, 2 = alarms only.
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = "Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\Cache\\DefaultAccount\\Current\\windows.data.notifications.quiethourssettings\\Current";
        let key = hkcu.open_subkey_with_flags(path, KEY_READ | KEY_WRITE);
        let key = match key {
            Ok(k) => k,
            Err(e) => return Err(format!("Focus Assist registry key not found: {e}")),
        };
        let mut data: Vec<u8> = key.get_raw_value("Data").map_err(|e| e.to_string())?.bytes;
        // Byte 0x20 (32) is the community-documented offset for the current mode.
        const MODE_OFFSET: usize = 0x20;
        if data.len() <= MODE_OFFSET {
            return Err("unexpected Focus Assist data layout".into());
        }
        data[MODE_OFFSET] = if enabled { 2 } else { 0 };
        let reg_value = winreg::RegValue {
            bytes: data,
            vtype: REG_BINARY,
        };
        key.set_raw_value("Data", &reg_value)
            .map_err(|e| e.to_string())
    }
}

/// Reads `HKCU\Software\Microsoft\Windows\DWM\AccentColor`, a DWORD storing
/// the color as 0xAABBGGRR (i.e. R is the low byte).
pub fn accent_color() -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\DWM")
        .ok()?;
    let value: u32 = key.get_value("AccentColor").ok()?;
    let r = value & 0xFF;
    let g = (value >> 8) & 0xFF;
    let b = (value >> 16) & 0xFF;
    Some(format!("#{r:02x}{g:02x}{b:02x}"))
}
