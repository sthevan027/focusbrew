use super::PlatformAdapter;
use winreg::enums::*;
use winreg::RegKey;

pub struct WindowsAdapter;

impl PlatformAdapter for WindowsAdapter {
    fn set_dark_theme(&self, dark: bool) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
            .map_err(|e| e.to_string())?;
        let value: u32 = if dark { 0 } else { 1 };
        key.set_value("AppsUseLightTheme", &value)
            .map_err(|e| e.to_string())?;
        key.set_value("SystemUsesLightTheme", &value)
            .map_err(|e| e.to_string())?;
        broadcast_setting_change();
        Ok(())
    }

    fn set_dnd(&self, enabled: bool) -> Result<(), String> {
        // Windows has no public API for Focus Assist / Quiet Hours. This flips
        // the same registry blob the Focus Assist tray flyout writes to.
        // It is unofficial and may not work on every Windows build — if it
        // fails, focus mode still works (theme + app blocking), this is just
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

fn broadcast_setting_change() {
    use std::ffi::CString;
    use windows_sys::Win32::Foundation::{LPARAM, WPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutA, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };
    if let Ok(param) = CString::new("ImmersiveColorSet") {
        unsafe {
            let mut result: usize = 0;
            SendMessageTimeoutA(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                0 as WPARAM,
                param.as_ptr() as LPARAM,
                SMTO_ABORTIFHUNG,
                2000,
                &mut result as *mut usize,
            );
        }
    }
}
