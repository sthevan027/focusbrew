use serde::{Deserialize, Serialize};

use crate::config::TimerConfig;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TimerPhase {
    Off,
    Focus,
    Break,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    pub phase: TimerPhase,
    pub remaining_secs: u32,
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            phase: TimerPhase::Off,
            remaining_secs: 0,
        }
    }
}

impl TimerState {
    pub fn start_focus(&mut self, config: &TimerConfig) {
        self.phase = TimerPhase::Focus;
        self.remaining_secs = config.focus_minutes * 60;
    }

    pub fn start_break(&mut self, config: &TimerConfig) {
        self.phase = TimerPhase::Break;
        self.remaining_secs = config.break_minutes * 60;
    }

    pub fn stop(&mut self) {
        self.phase = TimerPhase::Off;
        self.remaining_secs = 0;
    }

    /// Advances the timer by `elapsed_secs`. Returns true if the phase just
    /// flipped (focus -> break or break -> focus), so the caller can react
    /// (swap tray icon, notify, suspend/resume focus mode).
    pub fn tick(&mut self, elapsed_secs: u32, config: &TimerConfig) -> bool {
        if self.phase == TimerPhase::Off {
            return false;
        }
        if self.remaining_secs > elapsed_secs {
            self.remaining_secs -= elapsed_secs;
            return false;
        }
        match self.phase {
            TimerPhase::Focus => self.start_break(config),
            TimerPhase::Break => self.start_focus(config),
            TimerPhase::Off => {}
        }
        true
    }
}
