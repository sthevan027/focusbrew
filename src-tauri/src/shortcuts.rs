//! The two global shortcuts, configurable: start/pause and open the panel.

use std::sync::Mutex;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Pause/resume, or start the first task of today.
    Toggle,
    /// Open/close the panel, pinned.
    Panel,
}

/// The shortcuts registered right now: (toggle, panel).
static ACTIVE: Mutex<Option<(Shortcut, Shortcut)>> = Mutex::new(None);

/// Both texts as shortcuts; they must be valid and different.
pub fn parse_pair(toggle: &str, panel: &str) -> Result<(Shortcut, Shortcut), String> {
    let parse = |text: &str| {
        text.parse::<Shortcut>()
            .map_err(|_| format!("atalho inválido: {text}"))
    };
    let (t, p) = (parse(toggle)?, parse(panel)?);
    if t == p {
        return Err("os dois atalhos não podem ser iguais".into());
    }
    Ok((t, p))
}

pub fn action_for(shortcut: &Shortcut) -> Option<Action> {
    let (toggle, panel) = (*ACTIVE.lock().unwrap_or_else(|e| e.into_inner()))?;
    if *shortcut == toggle {
        Some(Action::Toggle)
    } else if *shortcut == panel {
        Some(Action::Panel)
    } else {
        None
    }
}

/// Swaps the registered shortcuts. If the new ones can't be registered
/// (another app holds one, say), the previous ones are put back.
pub fn apply(app: &AppHandle, toggle: &str, panel: &str) -> Result<(), String> {
    let (t, p) = parse_pair(toggle, panel)?;
    let gs = app.global_shortcut();
    let previous = *ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
    if previous == Some((t, p)) {
        return Ok(());
    }
    if let Some((a, b)) = previous {
        let _ = gs.unregister(a);
        let _ = gs.unregister(b);
    }
    match gs.register(t).and_then(|_| gs.register(p)) {
        Ok(()) => {
            *ACTIVE.lock().unwrap_or_else(|e| e.into_inner()) = Some((t, p));
            Ok(())
        }
        Err(e) => {
            let _ = gs.unregister(t);
            let _ = gs.unregister(p);
            if let Some((a, b)) = previous {
                let _ = gs.register(a);
                let _ = gs.register(b);
            }
            Err(format!("não deu pra usar esse atalho — outro app pode estar usando ({e})"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_and_different_shortcuts_parse() {
        assert!(parse_pair("CommandOrControl+Shift+Space", "CommandOrControl+Alt+Space").is_ok());
        assert!(parse_pair("Alt+F9", "Ctrl+Shift+KeyK").is_ok());
    }

    #[test]
    fn garbage_is_refused() {
        assert!(parse_pair("", "Alt+F9").is_err());
        assert!(parse_pair("Ctrl+Banana", "Alt+F9").is_err());
        assert!(parse_pair("Alt+F9", "Ctrl++").is_err());
    }

    #[test]
    fn the_same_shortcut_twice_is_refused() {
        let err = parse_pair("Alt+F9", "alt+f9").unwrap_err();
        assert!(err.contains("iguais"), "{err}");
    }
}
