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
    /// Freezes the countdown without ending the session, so app-blocking
    /// pauses (like a break) but the phase/label/remaining time stay put.
    pub paused: bool,
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            phase: TimerPhase::Off,
            remaining_secs: 0,
            paused: false,
        }
    }
}

impl TimerState {
    pub fn start_focus(&mut self, config: &TimerConfig) {
        self.phase = TimerPhase::Focus;
        self.remaining_secs = config.focus_minutes * 60;
        self.paused = false;
    }

    pub fn start_break(&mut self, config: &TimerConfig) {
        self.phase = TimerPhase::Break;
        self.remaining_secs = config.break_minutes * 60;
        self.paused = false;
    }

    pub fn stop(&mut self) {
        self.phase = TimerPhase::Off;
        self.remaining_secs = 0;
        self.paused = false;
    }

    /// Real time spent in the current phase so far, for logging before
    /// `stop()` resets `remaining_secs` to 0. `Off` has nothing running.
    pub fn elapsed_secs(&self, config: &TimerConfig) -> u32 {
        let total = match self.phase {
            TimerPhase::Focus => config.focus_minutes * 60,
            TimerPhase::Break => config.break_minutes * 60,
            TimerPhase::Off => return 0,
        };
        total.saturating_sub(self.remaining_secs)
    }

    pub fn set_paused(&mut self, paused: bool) {
        if self.phase != TimerPhase::Off {
            self.paused = paused;
        }
    }

    /// Advances the timer by `elapsed_secs`. Returns true if the phase just
    /// flipped (focus -> break or break -> focus), so the caller can react
    /// (swap tray icon, notify, suspend/resume focus mode).
    pub fn tick(&mut self, elapsed_secs: u32, config: &TimerConfig) -> bool {
        if self.phase == TimerPhase::Off || self.paused {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> TimerConfig {
        TimerConfig { focus_minutes: 50, break_minutes: 10, auto_start: false }
    }

    #[test]
    fn elapsed_secs_is_zero_when_off() {
        let timer = TimerState::default();
        assert_eq!(timer.elapsed_secs(&config()), 0);
    }

    #[test]
    fn elapsed_secs_tracks_time_spent_mid_focus() {
        let mut timer = TimerState::default();
        timer.start_focus(&config());
        timer.tick(20 * 60, &config()); // 20 of 50 minutes gone
        assert_eq!(timer.elapsed_secs(&config()), 20 * 60);
    }

    #[test]
    fn elapsed_secs_tracks_time_spent_mid_break() {
        let mut timer = TimerState::default();
        timer.start_break(&config());
        timer.tick(4 * 60, &config()); // 4 of 10 minutes gone
        assert_eq!(timer.elapsed_secs(&config()), 4 * 60);
    }

    #[test]
    fn elapsed_secs_is_full_length_right_before_natural_completion() {
        let mut timer = TimerState::default();
        timer.start_focus(&config());
        // One tick short of the flip — everything but the final instant has
        // elapsed, mirroring what the background loop sees right before it
        // calls activity::record_block for a natural completion.
        timer.tick(50 * 60 - 1, &config());
        assert_eq!(timer.elapsed_secs(&config()), 50 * 60 - 1);
    }

    #[test]
    fn stop_resets_state_so_elapsed_is_zero_after() {
        let mut timer = TimerState::default();
        timer.start_focus(&config());
        timer.tick(30 * 60, &config());
        timer.stop();
        assert_eq!(timer.phase, TimerPhase::Off);
        assert_eq!(timer.elapsed_secs(&config()), 0);
    }
}
