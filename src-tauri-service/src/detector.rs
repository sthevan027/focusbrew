use chrono::Utc;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

#[derive(Debug, Clone)]
pub struct ActiveApp {
    pub app_name: String,
    pub is_idle: bool,
    /// Milliseconds since the Unix epoch.
    pub timestamp: i64,
}

/// Reads the foreground app and whether the user has been idle for longer
/// than `idle_threshold_minutes`.
pub fn detect_active_app(idle_threshold_minutes: u32) -> Result<ActiveApp, String> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() {
        return Err("No foreground window found".to_string());
    }

    let mut process_id = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id as *mut u32)) };
    if process_id == 0 {
        return Err("Could not get process ID".to_string());
    }

    let app_name = process_name(process_id)?;
    let is_idle = is_idle(idle_threshold_minutes)?;

    Ok(ActiveApp {
        app_name,
        is_idle,
        timestamp: Utc::now().timestamp_millis(),
    })
}

/// Executable file name only (e.g. "Code.exe"); PROCESSENTRY32 never carries a path.
fn process_name(process_id: u32) -> Result<String, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }
        .map_err(|e| format!("Failed to create toolhelp snapshot: {e}"))?;

    let result = find_process_name(snapshot, process_id);
    unsafe { let _ = CloseHandle(snapshot); }
    result
}

fn find_process_name(
    snapshot: windows::Win32::Foundation::HANDLE,
    process_id: u32,
) -> Result<String, String> {
    let mut entry = PROCESSENTRY32 {
        dwSize: std::mem::size_of::<PROCESSENTRY32>() as u32,
        ..Default::default()
    };

    unsafe { Process32First(snapshot, &mut entry) }
        .map_err(|e| format!("Process32First failed: {e}"))?;

    loop {
        if entry.th32ProcessID == process_id {
            let bytes: Vec<u8> = entry
                .szExeFile
                .iter()
                .take_while(|&&b| b != 0)
                .map(|&b| b as u8)
                .collect();
            return Ok(String::from_utf8_lossy(&bytes).into_owned());
        }
        if unsafe { Process32Next(snapshot, &mut entry) }.is_err() {
            break;
        }
    }

    Err(format!("Process {process_id} not found"))
}

fn is_idle(threshold_minutes: u32) -> Result<bool, String> {
    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return Err("GetLastInputInfo failed".to_string());
    }

    // GetTickCount wraps every ~49.7 days; wrapping_sub keeps the difference right across the wrap.
    let idle_ms = unsafe { GetTickCount() }.wrapping_sub(info.dwTime) as i64;
    let threshold_ms = threshold_minutes as i64 * 60 * 1000;
    Ok(idle_ms > threshold_ms)
}
