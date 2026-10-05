//! The countdown for the task that is running.
//!
//! Pure on purpose: no Tauri, no disk, and the clock is always passed in
//! (`now_ms`, milliseconds since the Unix epoch), so every rule below is a
//! plain unit test.

use serde::Serialize;

/// If more than this passes between two 1 s checks, the computer was asleep.
pub const SLEEP_GAP_MS: i64 = 90_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Timer {
    Idle,
    Running { task_id: String, planned_secs: u32, deadline_ms: i64 },
    Paused { task_id: String, planned_secs: u32, remaining_secs: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerStatus {
    Idle,
    Running,
    Paused,
}

/// What the front-end gets: it draws the countdown and the progress line
/// from `deadline_ms` / `remaining_secs`, it never counts time itself.
#[derive(Debug, Clone, Serialize)]
pub struct TimerView {
    pub status: TimerStatus,
    pub task_id: Option<String>,
    pub planned_secs: u32,
    pub remaining_secs: u32,
    pub deadline_ms: i64,
}

impl Timer {
    pub fn start(task_id: &str, planned_secs: u32, now_ms: i64) -> Self {
        Timer::Running {
            task_id: task_id.to_string(),
            planned_secs,
            deadline_ms: now_ms + planned_secs as i64 * 1000,
        }
    }

    pub fn status(&self) -> TimerStatus {
        match self {
            Timer::Idle => TimerStatus::Idle,
            Timer::Running { .. } => TimerStatus::Running,
            Timer::Paused { .. } => TimerStatus::Paused,
        }
    }

    pub fn task_id(&self) -> Option<&str> {
        match self {
            Timer::Idle => None,
            Timer::Running { task_id, .. } | Timer::Paused { task_id, .. } => Some(task_id),
        }
    }

    pub fn planned_secs(&self) -> u32 {
        match self {
            Timer::Idle => 0,
            Timer::Running { planned_secs, .. } | Timer::Paused { planned_secs, .. } => *planned_secs,
        }
    }

    /// Seconds left, rounded **up** so a fresh block shows its full length,
    /// and never more than planned (the system clock may go backwards).
    pub fn remaining_secs(&self, now_ms: i64) -> u32 {
        match self {
            Timer::Idle => 0,
            Timer::Paused { remaining_secs, .. } => *remaining_secs,
            Timer::Running { planned_secs, deadline_ms, .. } => {
                let left_ms = (deadline_ms - now_ms).max(0);
                let secs = ((left_ms + 999) / 1000) as u64;
                secs.min(*planned_secs as u64) as u32
            }
        }
    }

    /// Whole seconds worked in this block so far.
    pub fn elapsed_secs(&self, now_ms: i64) -> u32 {
        self.planned_secs().saturating_sub(self.remaining_secs(now_ms))
    }

    pub fn pause(&mut self, now_ms: i64) {
        if let Timer::Running { task_id, planned_secs, .. } = self.clone() {
            let remaining_secs = self.remaining_secs(now_ms);
            *self = Timer::Paused { task_id, planned_secs, remaining_secs };
        }
    }

    pub fn resume(&mut self, now_ms: i64) {
        if let Timer::Paused { task_id, planned_secs, remaining_secs } = self.clone() {
            *self = Timer::Running {
                task_id,
                planned_secs,
                deadline_ms: now_ms + remaining_secs as i64 * 1000,
            };
        }
    }

    /// Changes the planned length keeping the time already worked. Returns
    /// `true` when the new length is already used up — the block must end now
    /// (the timer is left untouched in that case).
    pub fn set_planned(&mut self, new_planned_secs: u32, now_ms: i64) -> bool {
        let remaining = new_planned_secs.saturating_sub(self.elapsed_secs(now_ms));
        if remaining == 0 {
            return !matches!(self, Timer::Idle);
        }
        match self {
            Timer::Idle => false,
            Timer::Running { planned_secs, deadline_ms, .. } => {
                *planned_secs = new_planned_secs;
                *deadline_ms = now_ms + remaining as i64 * 1000;
                false
            }
            Timer::Paused { planned_secs, remaining_secs, .. } => {
                *planned_secs = new_planned_secs;
                *remaining_secs = remaining;
                false
            }
        }
    }

    pub fn is_expired(&self, now_ms: i64) -> bool {
        matches!(self, Timer::Running { deadline_ms, .. } if now_ms >= *deadline_ms)
    }

    /// Pushes a running deadline later (the computer slept; that time is not work).
    pub fn shift_deadline(&mut self, by_ms: i64) {
        if let Timer::Running { deadline_ms, .. } = self {
            *deadline_ms += by_ms;
        }
    }

    pub fn view(&self, now_ms: i64) -> TimerView {
        TimerView {
            status: self.status(),
            task_id: self.task_id().map(str::to_string),
            planned_secs: self.planned_secs(),
            remaining_secs: self.remaining_secs(now_ms),
            deadline_ms: match self {
                Timer::Running { deadline_ms, .. } => *deadline_ms,
                _ => 0,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: i64 = 1_000_000;
    const MIN: i64 = 60_000;

    #[test]
    fn start_sets_the_deadline() {
        let t = Timer::start("a", 25 * 60, T0);
        assert_eq!(
            t,
            Timer::Running { task_id: "a".into(), planned_secs: 1500, deadline_ms: T0 + 1_500_000 }
        );
    }

    #[test]
    fn remaining_rounds_up_so_a_fresh_block_shows_the_full_length() {
        let t = Timer::start("a", 300, T0);
        assert_eq!(t.remaining_secs(T0), 300);
        assert_eq!(t.remaining_secs(T0 + 1), 300);
        assert_eq!(t.remaining_secs(T0 + 1001), 299);
    }

    #[test]
    fn elapsed_counts_whole_seconds() {
        let t = Timer::start("a", 25 * 60, T0);
        assert_eq!(t.elapsed_secs(T0 + 90_000), 90);
        assert_eq!(t.elapsed_secs(T0), 0);
    }

    // Review focus: the Windows clock can be set back (NTP, manual change).
    #[test]
    fn a_clock_that_goes_backwards_never_reports_more_than_planned() {
        let t = Timer::start("a", 300, T0);
        assert_eq!(t.remaining_secs(T0 - 10 * MIN), 300);
        assert_eq!(t.elapsed_secs(T0 - 10 * MIN), 0);
    }

    #[test]
    fn pause_freezes_and_resume_recomputes_the_deadline() {
        let mut t = Timer::start("a", 300, T0);
        t.pause(T0 + 100_000);
        assert_eq!(
            t,
            Timer::Paused { task_id: "a".into(), planned_secs: 300, remaining_secs: 200 }
        );
        // an hour passes while paused: nothing changes
        assert_eq!(t.remaining_secs(T0 + 60 * MIN), 200);
        t.resume(T0 + 60 * MIN);
        assert_eq!(
            t,
            Timer::Running { task_id: "a".into(), planned_secs: 300, deadline_ms: T0 + 60 * MIN + 200_000 }
        );
    }

    #[test]
    fn pause_and_resume_do_nothing_in_the_wrong_state() {
        let mut idle = Timer::Idle;
        idle.pause(T0);
        idle.resume(T0);
        assert_eq!(idle, Timer::Idle);

        let mut running = Timer::start("a", 300, T0);
        let before = running.clone();
        running.resume(T0 + 1000);
        assert_eq!(running, before);
    }

    #[test]
    fn set_planned_rebases_a_running_block() {
        let mut t = Timer::start("a", 25 * 60, T0);
        let now = T0 + 10 * MIN;
        assert!(!t.set_planned(45 * 60, now));
        assert_eq!(
            t,
            Timer::Running { task_id: "a".into(), planned_secs: 45 * 60, deadline_ms: now + 35 * MIN }
        );
        assert_eq!(t.elapsed_secs(now), 600);
    }

    #[test]
    fn set_planned_shorter_than_the_time_worked_ends_the_block() {
        let mut t = Timer::start("a", 25 * 60, T0);
        assert!(t.set_planned(5 * 60, T0 + 10 * MIN));
    }

    #[test]
    fn set_planned_works_while_paused() {
        let mut t = Timer::start("a", 25 * 60, T0);
        t.pause(T0 + 10 * MIN);
        assert!(!t.set_planned(30 * 60, T0 + 20 * MIN));
        assert_eq!(
            t,
            Timer::Paused { task_id: "a".into(), planned_secs: 30 * 60, remaining_secs: 20 * 60 }
        );
    }

    #[test]
    fn set_planned_on_idle_is_a_no_op() {
        let mut t = Timer::Idle;
        assert!(!t.set_planned(600, T0));
        assert_eq!(t, Timer::Idle);
    }

    #[test]
    fn expiry_includes_the_deadline_itself() {
        let t = Timer::start("a", 60, T0);
        assert!(!t.is_expired(T0 + 59_999));
        assert!(t.is_expired(T0 + 60_000));
    }

    #[test]
    fn a_paused_or_idle_timer_never_expires() {
        let mut t = Timer::start("a", 60, T0);
        t.pause(T0 + 1000);
        assert!(!t.is_expired(T0 + 100 * MIN));
        assert!(!Timer::Idle.is_expired(T0 + 100 * MIN));
    }

    #[test]
    fn shift_deadline_only_moves_a_running_timer() {
        let mut running = Timer::start("a", 60, T0);
        running.shift_deadline(5_000);
        assert_eq!(
            running,
            Timer::Running { task_id: "a".into(), planned_secs: 60, deadline_ms: T0 + 65_000 }
        );

        let mut paused = Timer::start("a", 60, T0);
        paused.pause(T0 + 10_000);
        let before = paused.clone();
        paused.shift_deadline(5_000);
        assert_eq!(paused, before);

        let mut idle = Timer::Idle;
        idle.shift_deadline(5_000);
        assert_eq!(idle, Timer::Idle);
    }

    #[test]
    fn the_view_reports_each_state() {
        let idle = Timer::Idle.view(T0);
        assert_eq!(idle.status, TimerStatus::Idle);
        assert_eq!(idle.task_id, None);
        assert_eq!((idle.planned_secs, idle.remaining_secs, idle.deadline_ms), (0, 0, 0));

        let running = Timer::start("a", 300, T0).view(T0 + 1001);
        assert_eq!(running.status, TimerStatus::Running);
        assert_eq!(running.task_id.as_deref(), Some("a"));
        assert_eq!((running.planned_secs, running.remaining_secs), (300, 299));
        assert_eq!(running.deadline_ms, T0 + 300_000);

        let mut p = Timer::start("a", 300, T0);
        p.pause(T0 + 100_000);
        let paused = p.view(T0 + 999_999);
        assert_eq!(paused.status, TimerStatus::Paused);
        assert_eq!((paused.remaining_secs, paused.deadline_ms), (200, 0));
    }
}
