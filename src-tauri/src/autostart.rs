//! "Iniciar com o Windows": a value under the user's Run key pointing at
//! this executable. No admin rights needed; Windows-only.

#[cfg(windows)]
mod imp {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::ERROR_FILE_NOT_FOUND;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteKeyValueW, RegGetValueW, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_SZ, RRF_RT_REG_SZ,
    };

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const VALUE: &str = "focusbrew";

    /// `"C:\path\focusbrew.exe"`, quoted so a path with spaces still runs.
    fn command() -> Result<String, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        Ok(format!("\"{}\"", exe.display()))
    }

    pub fn set(enabled: bool) -> Result<(), String> {
        let key_path = HSTRING::from(RUN_KEY);
        let name = HSTRING::from(VALUE);
        if !enabled {
            // SAFETY: plain registry call with owned wide strings.
            let status = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, &key_path, &name) };
            return if status.is_ok() || status == ERROR_FILE_NOT_FOUND {
                Ok(())
            } else {
                Err(format!("não deu pra desligar a inicialização ({status:?})"))
            };
        }
        let data: Vec<u16> = command()?.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes: Vec<u8> = data.iter().flat_map(|c| c.to_le_bytes()).collect();
        let mut key = HKEY::default();
        // SAFETY: the key handle is closed below; all buffers outlive the calls.
        unsafe {
            RegOpenKeyExW(HKEY_CURRENT_USER, &key_path, None, KEY_SET_VALUE, &mut key)
                .ok()
                .map_err(|e| e.to_string())?;
            let result = RegSetValueExW(key, &name, None, REG_SZ, Some(&bytes)).ok();
            let _ = RegCloseKey(key);
            result.map_err(|e| format!("não deu pra ligar a inicialização ({e})"))
        }
    }

    pub fn is_enabled() -> bool {
        let key_path = HSTRING::from(RUN_KEY);
        let name = HSTRING::from(VALUE);
        // SAFETY: only asks whether the value exists (no buffer).
        unsafe {
            RegGetValueW(HKEY_CURRENT_USER, &key_path, PCWSTR(name.as_ptr()), RRF_RT_REG_SZ, None, None, None)
                .is_ok()
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn set(_enabled: bool) -> Result<(), String> {
        Err("iniciar com o sistema só funciona no Windows por enquanto".into())
    }

    pub fn is_enabled() -> bool {
        false
    }
}

pub use imp::{is_enabled, set};
