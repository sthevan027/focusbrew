//! When to nudge: a heads-up before a block ends, the daily goal reached,
//! and a reminder after a while with nothing running. Pure: the 1 s loop
//! feeds it the moment and turns what it returns into notifications.

use crate::config::AppConfig;
use crate::tracker::timer::TimerStatus;

/// Reminders only within working hours (local time).
pub const REMINDER_FROM_HOUR: u32 = 8;
pub const REMINDER_UNTIL_HOUR: u32 = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Alert {
    BeforeEnd { title: String, mins: u32 },
    GoalReached { mins: u32 },
    IdleReminder { mins: u32 },
}

/// What the loop knows at one tick.
pub struct Moment<'a> {
    pub now_ms: i64,
    pub today: &'a str,
    /// Local hour, 0–23.
    pub hour: u32,
    pub status: TimerStatus,
    /// The active block, if any: (task id, planned seconds, seconds left, title).
    pub block: Option<(&'a str, u32, u32, &'a str)>,
    /// Focus already recorded today plus what the running block has done.
    pub focus_today_secs: u32,
    /// Open tasks planned for today (or left over).
    pub has_tasks_today: bool,
}

#[derive(Debug, Default)]
pub struct Alerts {
    /// Block already warned about: (task id, planned seconds).
    warned: Option<(String, u32)>,
    goal_day: Option<String>,
    idle_since_ms: Option<i64>,
    last_reminder_ms: Option<i64>,
}

impl Alerts {
    pub fn check(&mut self, config: &AppConfig, m: &Moment) -> Vec<Alert> {
        let mut out = Vec::new();

        // Heads-up before the end, once per block.
        match m.block {
            Some((id, planned, left, title)) if m.status == TimerStatus::Running => {
                let mins = config.notify_before_end_mins;
                let key = (id.to_string(), planned);
                let threshold = mins * 60;
                if mins > 0 && left > 0 && left <= threshold && planned > threshold && self.warned.as_ref() != Some(&key) {
                    self.warned = Some(key);
                    out.push(Alert::BeforeEnd { title: title.to_string(), mins });
                }
            }
            None => self.warned = None,
            _ => {}
        }

        // Daily goal, once per day.
        let goal = config.daily_goal_mins;
        if goal > 0 && m.focus_today_secs >= goal * 60 && self.goal_day.as_deref() != Some(m.today) {
            self.goal_day = Some(m.today.to_string());
            out.push(Alert::GoalReached { mins: goal });
        }

        // Nothing running (a paused block forgotten counts too) for a while,
        // with tasks waiting. The count starts with working hours, so turning
        // the PC on at 7h doesn't nag at 8h00.
        let working_hours = (REMINDER_FROM_HOUR..REMINDER_UNTIL_HOUR).contains(&m.hour);
        if m.status == TimerStatus::Running || !working_hours {
            self.idle_since_ms = None;
        } else {
            let since = *self.idle_since_ms.get_or_insert(m.now_ms);
            let mins = config.idle_reminder_mins;
            let every = mins as i64 * 60_000;
            let due = m.now_ms - since >= every
                && self.last_reminder_ms.map_or(true, |last| m.now_ms - last >= every);
            if mins > 0 && m.has_tasks_today && due {
                self.last_reminder_ms = Some(m.now_ms);
                out.push(Alert::IdleReminder { mins });
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;
    const T0: i64 = 1_000_000_000_000;

    fn cfg(before: u32, idle: u32, goal: u32) -> AppConfig {
        AppConfig {
            notify_before_end_mins: before,
            idle_reminder_mins: idle,
            daily_goal_mins: goal,
            ..AppConfig::default()
        }
    }

    fn running(now_ms: i64, left: u32) -> Moment<'static> {
        Moment {
            now_ms,
            today: "2026-10-05",
            hour: 10,
            status: TimerStatus::Running,
            block: Some(("a", 1500, left, "Tarefa A")),
            focus_today_secs: 0,
            has_tasks_today: true,
        }
    }

    fn idle(now_ms: i64, hour: u32) -> Moment<'static> {
        Moment { status: TimerStatus::Idle, block: None, hour, ..running(now_ms, 0) }
    }

    #[test]
    fn warns_once_when_the_block_gets_close_to_its_end() {
        let config = cfg(5, 0, 0);
        let mut a = Alerts::default();
        assert!(a.check(&config, &running(T0, 400)).is_empty());
        assert_eq!(
            a.check(&config, &running(T0 + 1000, 300)),
            vec![Alert::BeforeEnd { title: "Tarefa A".into(), mins: 5 }]
        );
        assert!(a.check(&config, &running(T0 + 2000, 299)).is_empty());
    }

    #[test]
    fn a_block_shorter_than_the_heads_up_is_not_warned() {
        let config = cfg(5, 0, 0);
        let mut a = Alerts::default();
        let short = Moment { block: Some(("a", 240, 200, "A")), ..running(T0, 200) };
        assert!(a.check(&config, &short).is_empty());
    }

    #[test]
    fn the_next_block_is_warned_again() {
        let config = cfg(1, 0, 0);
        let mut a = Alerts::default();
        assert_eq!(a.check(&config, &running(T0, 60)).len(), 1);
        a.check(&config, &idle(T0 + MIN, 10));
        assert_eq!(a.check(&config, &running(T0 + 30 * MIN, 50)).len(), 1);
    }

    #[test]
    fn the_heads_up_is_off_by_default() {
        let mut a = Alerts::default();
        assert!(a.check(&AppConfig::default(), &running(T0, 10)).is_empty());
    }

    #[test]
    fn the_goal_is_announced_once_a_day() {
        let config = cfg(0, 0, 60);
        let mut a = Alerts::default();
        let mut m = idle(T0, 10);
        m.focus_today_secs = 3599;
        assert!(a.check(&config, &m).is_empty());
        m.focus_today_secs = 3600;
        assert_eq!(a.check(&config, &m), vec![Alert::GoalReached { mins: 60 }]);
        m.focus_today_secs = 9000;
        assert!(a.check(&config, &m).is_empty());
        m.today = "2026-10-06";
        assert_eq!(a.check(&config, &m).len(), 1);
    }

    #[test]
    fn reminds_after_the_idle_time_and_then_every_that_long() {
        let config = cfg(0, 30, 0);
        let mut a = Alerts::default();
        assert!(a.check(&config, &idle(T0, 10)).is_empty());
        assert!(a.check(&config, &idle(T0 + 29 * MIN, 10)).is_empty());
        assert_eq!(a.check(&config, &idle(T0 + 30 * MIN, 10)), vec![Alert::IdleReminder { mins: 30 }]);
        assert!(a.check(&config, &idle(T0 + 45 * MIN, 10)).is_empty());
        assert_eq!(a.check(&config, &idle(T0 + 60 * MIN, 10)).len(), 1);
    }

    #[test]
    fn working_restarts_the_idle_count() {
        let config = cfg(0, 30, 0);
        let mut a = Alerts::default();
        a.check(&config, &idle(T0, 10));
        a.check(&config, &running(T0 + 20 * MIN, 600));
        assert!(a.check(&config, &idle(T0 + 40 * MIN, 10)).is_empty());
        assert_eq!(a.check(&config, &idle(T0 + 70 * MIN, 10)).len(), 1);
    }

    #[test]
    fn no_reminder_outside_working_hours_or_without_tasks() {
        let config = cfg(0, 15, 0);
        let mut a = Alerts::default();
        a.check(&config, &idle(T0, 10));
        let mut free = idle(T0 + 20 * MIN, 10);
        free.has_tasks_today = false;
        assert!(a.check(&config, &free).is_empty());
        assert_eq!(a.check(&config, &idle(T0 + 20 * MIN, 10)).len(), 1);
        assert!(a.check(&config, &idle(T0 + 60 * MIN, 21)).is_empty());
    }

    #[test]
    fn the_idle_count_starts_with_working_hours() {
        let config = cfg(0, 30, 0);
        let mut a = Alerts::default();
        a.check(&config, &idle(T0, 7)); // PC on at 7h
        assert!(a.check(&config, &idle(T0 + 60 * MIN, 8)).is_empty(), "not right at 8h");
        assert_eq!(a.check(&config, &idle(T0 + 90 * MIN, 8)).len(), 1);
    }

    #[test]
    fn a_forgotten_paused_block_also_gets_a_reminder() {
        let config = cfg(0, 30, 0);
        let mut a = Alerts::default();
        let paused = |t| Moment { status: TimerStatus::Paused, ..running(t, 600) };
        a.check(&config, &paused(T0));
        assert_eq!(a.check(&config, &paused(T0 + 30 * MIN)), vec![Alert::IdleReminder { mins: 30 }]);
    }
}
