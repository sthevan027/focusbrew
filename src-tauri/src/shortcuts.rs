//! The two global shortcuts, configurable: start/pause and open the panel.
//! Each one is registered on its own: one taken by another app must not
//! leave the other unregistered.

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

impl Action {
    fn slot(self) -> usize {
        match self {
            Action::Toggle => 0,
            Action::Panel => 1,
        }
    }
}

/// What is registered right now: [toggle, panel].
static ACTIVE: Mutex<[Option<Shortcut>; 2]> = Mutex::new([None, None]);

fn active() -> [Option<Shortcut>; 2] {
    *ACTIVE.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn parse(text: &str) -> Result<Shortcut, String> {
    text.trim().parse::<Shortcut>().map_err(|_| format!("atalho inválido: {text}"))
}

/// A shortcut can't be the one the other action already uses.
pub fn check_conflict(new: Shortcut, other: Option<Shortcut>) -> Result<(), String> {
    if other == Some(new) {
        return Err("os dois atalhos não podem ser iguais".into());
    }
    Ok(())
}

pub fn action_for(shortcut: &Shortcut) -> Option<Action> {
    let [toggle, panel] = active();
    if toggle == Some(*shortcut) {
        Some(Action::Toggle)
    } else if panel == Some(*shortcut) {
        Some(Action::Panel)
    } else {
        None
    }
}

/// Puts `text` on `action`. Refuses an invalid shortcut, the other action's
/// one, or one another app holds — then the action keeps its old shortcut.
pub fn set(app: &AppHandle, action: Action, text: &str) -> Result<(), String> {
    let new = parse(text)?;
    let current = active();
    let (mine, other) = (current[action.slot()], current[1 - action.slot()]);
    check_conflict(new, other)?;
    if mine == Some(new) {
        return Ok(());
    }
    let gs = app.global_shortcut();
    if let Some(old) = mine {
        let _ = gs.unregister(old);
    }
    match gs.register(new) {
        Ok(()) => {
            ACTIVE.lock().unwrap_or_else(|e| e.into_inner())[action.slot()] = Some(new);
            Ok(())
        }
        Err(_) => {
            if let Some(old) = mine {
                let _ = gs.register(old);
            }
            Err(format!("{} já é usado por outro programa — escolha outra combinação", pretty(text)))
        }
    }
}

/// "CommandOrControl+Alt+KeyK" -> "Ctrl+Alt+K", for messages.
pub fn pretty(text: &str) -> String {
    text.trim()
        .split('+')
        .map(|part| match part {
            "CommandOrControl" | "CmdOrCtrl" | "Control" => "Ctrl".to_string(),
            "Super" => "Win".to_string(),
            p => p
                .strip_prefix("Key")
                .or_else(|| p.strip_prefix("Digit"))
                .filter(|rest| rest.len() == 1)
                .unwrap_or(p)
                .to_string(),
        })
        .collect::<Vec<_>>()
        .join("+")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_shortcuts_parse() {
        assert!(parse("CommandOrControl+Shift+Space").is_ok());
        assert!(parse("CommandOrControl+Shift+Alt+Space").is_ok());
        assert!(parse(" Alt+F9 ").is_ok());
        assert!(parse("Ctrl+Shift+KeyK").is_ok());
    }

    #[test]
    fn garbage_is_refused() {
        assert!(parse("").is_err());
        assert!(parse("Ctrl+Banana").is_err());
        assert!(parse("Ctrl++").is_err());
    }

    #[test]
    fn the_other_actions_shortcut_is_refused() {
        let a = parse("Alt+F9").unwrap();
        let err = check_conflict(parse("alt+f9").unwrap(), Some(a)).unwrap_err();
        assert!(err.contains("iguais"), "{err}");
        assert!(check_conflict(parse("Alt+F10").unwrap(), Some(a)).is_ok());
        assert!(check_conflict(a, None).is_ok());
    }

    #[test]
    fn messages_name_the_keys_like_the_keyboard() {
        assert_eq!(pretty("CommandOrControl+Alt+Space"), "Ctrl+Alt+Space");
        assert_eq!(pretty("CommandOrControl+Alt+KeyK"), "Ctrl+Alt+K");
        assert_eq!(pretty("Alt+Digit1"), "Alt+1");
    }
}
