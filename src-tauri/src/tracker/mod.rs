//! Everything about the tasks of the day and the timer that runs on them.
//! Pure logic: no Tauri, no clock of its own, so it is unit-testable.

#![allow(dead_code)] // wired up in Task 7; remove there

pub mod activity;
pub mod tasks;
pub mod timer;

use activity::ActivityLog;
use tasks::{clamp_minutes, Task};
use timer::{Timer, SLEEP_GAP_MS};

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Today's local date, "AAAA-MM-DD" — the key of `focus_secs_by_day`.
pub fn today_key() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// A block that ran to its end (or was cut to a length already used up).
/// The caller turns it into a notification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finished {
    pub title: String,
    pub secs: u32,
}

pub struct Tracker {
    pub timer: Timer,
    pub tasks: Vec<Task>,
    pub log: ActivityLog,
}

impl Tracker {
    pub fn new(tasks: Vec<Task>, log: ActivityLog) -> Self {
        Tracker { timer: Timer::Idle, tasks, log }
    }

    pub fn first_open_task(&self) -> Option<String> {
        self.tasks.iter().find(|t| !t.done).map(|t| t.id.clone())
    }

    /// Adds worked seconds to the task and to the day's total.
    fn record(&mut self, task_id: &str, secs: u32, today: &str) {
        if secs == 0 {
            return;
        }
        if let Some(task) = self.tasks.iter_mut().find(|t| t.id == task_id) {
            task.spent_secs = task.spent_secs.saturating_add(secs);
        }
        self.log.add_focus_secs(today, secs);
    }

    /// Ends the active block counting `secs` as worked.
    fn finish(&mut self, task_id: &str, secs: u32, today: &str) -> Finished {
        let title = self
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .map(|t| t.title.clone())
            .unwrap_or_default();
        self.record(task_id, secs, today);
        self.timer = Timer::Idle;
        Finished { title, secs }
    }

    /// Ends whatever is running, keeping the time actually worked.
    pub fn stop(&mut self, now_ms: i64, today: &str) {
        if let Some(id) = self.timer.task_id().map(str::to_string) {
            let secs = self.timer.elapsed_secs(now_ms);
            self.record(&id, secs, today);
        }
        self.timer = Timer::Idle;
    }

    pub fn start_task(&mut self, id: &str, now_ms: i64, today: &str) -> Result<(), String> {
        let task = self
            .tasks
            .iter()
            .find(|t| t.id == id)
            .ok_or_else(|| "tarefa não encontrada".to_string())?;
        if task.done {
            return Err("tarefa já concluída".to_string());
        }
        let planned_secs = task.minutes * 60;

        if self.timer.task_id() == Some(id) {
            // Already the active task: running stays as is, paused resumes.
            self.timer.resume(now_ms);
            return Ok(());
        }
        self.stop(now_ms, today);
        self.timer = Timer::start(id, planned_secs, now_ms);
        Ok(())
    }

    pub fn toggle_pause(&mut self, now_ms: i64) {
        match self.timer.status() {
            timer::TimerStatus::Running => self.timer.pause(now_ms),
            timer::TimerStatus::Paused => self.timer.resume(now_ms),
            timer::TimerStatus::Idle => {}
        }
    }

    /// Edits a task's minutes. If it is the active task, the block is
    /// re-based; a length already used up ends the block (`Some(Finished)`).
    pub fn set_minutes(
        &mut self,
        id: &str,
        minutes: u32,
        now_ms: i64,
        today: &str,
    ) -> Option<Finished> {
        let minutes = clamp_minutes(minutes);
        {
            let task = self.tasks.iter_mut().find(|t| t.id == id)?;
            task.minutes = minutes;
        }
        if self.timer.task_id() != Some(id) {
            return None;
        }
        let planned_secs = minutes * 60;
        if self.timer.set_planned(planned_secs, now_ms) {
            return Some(self.finish(id, planned_secs, today));
        }
        None
    }

    pub fn toggle_task(&mut self, id: &str, now_ms: i64, today: &str) {
        let now_done = {
            let Some(task) = self.tasks.iter_mut().find(|t| t.id == id) else {
                return;
            };
            task.done = !task.done;
            task.done
        };
        if now_done && self.timer.task_id() == Some(id) {
            self.stop(now_ms, today);
        }
    }

    pub fn remove_task(&mut self, id: &str, now_ms: i64, today: &str) {
        if self.timer.task_id() == Some(id) {
            self.stop(now_ms, today);
        }
        self.tasks.retain(|t| t.id != id);
    }

    /// Called once a second. A gap longer than `SLEEP_GAP_MS` since the last
    /// call means the computer slept: that time is not work, so a running
    /// deadline moves later by the gap. Returns the block that just ended.
    pub fn tick(&mut self, now_ms: i64, last_tick_ms: i64, today: &str) -> Option<Finished> {
        let gap = now_ms - last_tick_ms;
        if gap > SLEEP_GAP_MS {
            self.timer.shift_deadline(gap);
        }
        if !self.timer.is_expired(now_ms) {
            return None;
        }
        let id = self.timer.task_id()?.to_string();
        let secs = self.timer.planned_secs();
        Some(self.finish(&id, secs, today))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tasks::TaskSource;

    const T0: i64 = 1_000_000_000_000;
    const MIN: i64 = 60_000;
    const DAY: &str = "2026-10-05";

    fn tracker(tasks: &[(&str, u32)]) -> Tracker {
        let list = tasks
            .iter()
            .map(|(id, minutes)| {
                let mut t = tasks::new_task(id, TaskSource::Manual, *minutes).unwrap();
                t.id = id.to_string();
                t
            })
            .collect();
        Tracker::new(list, ActivityLog::default())
    }

    fn day_secs(tr: &Tracker, day: &str) -> u32 {
        *tr.log.focus_secs_by_day.get(day).unwrap_or(&0)
    }

    fn spent(tr: &Tracker, id: &str) -> u32 {
        tr.tasks.iter().find(|t| t.id == id).unwrap().spent_secs
    }

    fn minutes(tr: &Tracker, id: &str) -> u32 {
        tr.tasks.iter().find(|t| t.id == id).unwrap().minutes
    }

    #[test]
    fn stopping_early_keeps_the_time_worked() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.stop(T0 + 10 * MIN, DAY);
        assert_eq!(spent(&tr, "a"), 600);
        assert_eq!(day_secs(&tr, DAY), 600);
        assert_eq!(tr.timer, Timer::Idle);
    }

    #[test]
    fn stopping_the_same_instant_records_nothing() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.stop(T0, DAY);
        assert!(!tr.log.focus_secs_by_day.contains_key(DAY));
        assert_eq!(spent(&tr, "a"), 0);
    }

    #[test]
    fn starting_another_task_closes_the_first_one() {
        let mut tr = tracker(&[("a", 25), ("b", 10)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.start_task("b", T0 + 5 * MIN, DAY).unwrap();
        assert_eq!(spent(&tr, "a"), 300);
        assert_eq!(tr.timer.task_id(), Some("b"));
        assert_eq!(tr.timer.planned_secs(), 600);
    }

    #[test]
    fn play_on_the_running_task_changes_nothing() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let before = tr.timer.clone();
        tr.start_task("a", T0 + 5 * MIN, DAY).unwrap();
        assert_eq!(tr.timer, before);
        assert_eq!(spent(&tr, "a"), 0);
    }

    #[test]
    fn play_on_a_paused_task_resumes_it() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.toggle_pause(T0 + 5 * MIN);
        tr.start_task("a", T0 + 8 * MIN, DAY).unwrap();
        assert_eq!(
            tr.timer,
            Timer::Running { task_id: "a".into(), planned_secs: 1500, deadline_ms: T0 + 8 * MIN + 20 * MIN }
        );
    }

    #[test]
    fn a_done_or_unknown_task_cannot_be_started() {
        let mut tr = tracker(&[("a", 25)]);
        tr.toggle_task("a", T0, DAY);
        assert!(tr.start_task("a", T0, DAY).is_err());
        assert!(tr.start_task("ghost", T0, DAY).is_err());
        assert_eq!(tr.timer, Timer::Idle);
    }

    #[test]
    fn paused_time_does_not_count() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.toggle_pause(T0 + MIN); // 60 s worked
        tr.toggle_pause(T0 + 61 * MIN); // an hour later
        tr.stop(T0 + 61 * MIN + 30_000, DAY); // 30 s more
        assert_eq!(spent(&tr, "a"), 90);
    }

    #[test]
    fn pausing_when_idle_does_nothing() {
        let mut tr = tracker(&[("a", 25)]);
        tr.toggle_pause(T0);
        assert_eq!(tr.timer, Timer::Idle);
    }

    #[test]
    fn changing_the_minutes_of_the_running_task_rebases_the_block() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let finished = tr.set_minutes("a", 45, T0 + 10 * MIN, DAY);
        assert_eq!(finished, None);
        assert_eq!(minutes(&tr, "a"), 45);
        assert_eq!(tr.timer.remaining_secs(T0 + 10 * MIN), 35 * 60);
    }

    #[test]
    fn shrinking_the_running_task_below_the_time_worked_finishes_it() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let finished = tr.set_minutes("a", 5, T0 + 10 * MIN, DAY);
        assert_eq!(finished, Some(Finished { title: "a".into(), secs: 300 }));
        assert_eq!(spent(&tr, "a"), 300);
        assert_eq!(tr.timer, Timer::Idle);
        assert!(!tr.tasks[0].done, "finishing a block never checks the task off");
    }

    #[test]
    fn minutes_are_clamped_and_idle_tasks_are_only_edited() {
        let mut tr = tracker(&[("a", 25)]);
        assert_eq!(tr.set_minutes("a", 1, T0, DAY), None);
        assert_eq!(minutes(&tr, "a"), 5);
        tr.set_minutes("a", 999, T0, DAY);
        assert_eq!(minutes(&tr, "a"), 180);
        assert_eq!(tr.timer, Timer::Idle);
        assert_eq!(tr.set_minutes("ghost", 30, T0, DAY), None);
    }

    #[test]
    fn checking_off_the_running_task_stops_it_and_keeps_the_time() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.toggle_task("a", T0 + 7 * MIN, DAY);
        assert!(tr.tasks[0].done);
        assert_eq!(spent(&tr, "a"), 420);
        assert_eq!(tr.timer, Timer::Idle);
    }

    #[test]
    fn checking_off_another_task_leaves_the_timer_alone() {
        let mut tr = tracker(&[("a", 25), ("b", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let before = tr.timer.clone();
        tr.toggle_task("b", T0 + MIN, DAY);
        assert_eq!(tr.timer, before);
    }

    #[test]
    fn unchecking_a_task_brings_it_back() {
        let mut tr = tracker(&[("a", 25)]);
        tr.toggle_task("a", T0, DAY);
        tr.toggle_task("a", T0, DAY);
        assert!(!tr.tasks[0].done);
    }

    #[test]
    fn removing_the_running_task_keeps_the_day_total() {
        let mut tr = tracker(&[("a", 25), ("b", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.remove_task("a", T0 + 4 * MIN, DAY);
        assert_eq!(tr.tasks.len(), 1);
        assert_eq!(tr.timer, Timer::Idle);
        assert_eq!(day_secs(&tr, DAY), 240);
    }

    #[test]
    fn removing_another_task_leaves_the_timer_alone() {
        let mut tr = tracker(&[("a", 25), ("b", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.remove_task("b", T0 + MIN, DAY);
        assert_eq!(tr.timer.task_id(), Some("a"));
    }

    #[test]
    fn reaching_zero_records_the_planned_time_and_leaves_the_task_open() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let finished = tr.tick(T0 + 25 * MIN, T0 + 25 * MIN - 1000, DAY);
        assert_eq!(finished, Some(Finished { title: "a".into(), secs: 1500 }));
        assert_eq!(spent(&tr, "a"), 1500);
        assert_eq!(day_secs(&tr, DAY), 1500);
        assert_eq!(tr.timer, Timer::Idle);
        assert!(!tr.tasks[0].done);
    }

    #[test]
    fn a_tick_before_the_deadline_does_nothing() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        assert_eq!(tr.tick(T0 + 10 * MIN, T0 + 10 * MIN - 1000, DAY), None);
        assert_eq!(tr.timer.task_id(), Some("a"));
    }

    #[test]
    fn a_paused_timer_does_not_finish_on_tick() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.toggle_pause(T0 + MIN);
        assert_eq!(tr.tick(T0 + 100 * MIN, T0 + 99 * MIN, DAY), None);
    }

    #[test]
    fn a_long_gap_means_the_computer_slept_and_does_not_count() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        // 3 hours pass between two checks (sleep)
        let last = T0 + 1000;
        let now = T0 + 3 * 60 * MIN;
        assert_eq!(tr.tick(now, last, DAY), None);
        // the block still has (almost) all of its time left
        assert_eq!(tr.timer.remaining_secs(now), 25 * 60 - 1);
    }

    #[test]
    fn a_gap_of_exactly_the_limit_still_counts_as_time() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let before = tr.timer.clone();
        assert_eq!(tr.tick(T0 + SLEEP_GAP_MS, T0, DAY), None);
        assert_eq!(tr.timer, before);
    }

    // Review focus: a block that crosses midnight belongs to the day it ends.
    #[test]
    fn the_day_comes_from_when_the_block_ends() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, "2026-10-05").unwrap();
        tr.stop(T0 + 20 * MIN, "2026-10-06");
        assert_eq!(day_secs(&tr, "2026-10-06"), 1200);
        assert_eq!(day_secs(&tr, "2026-10-05"), 0);
    }

    #[test]
    fn first_open_task_skips_done_ones() {
        let mut tr = tracker(&[("a", 25), ("b", 25)]);
        assert_eq!(tr.first_open_task().as_deref(), Some("a"));
        tr.toggle_task("a", T0, DAY);
        assert_eq!(tr.first_open_task().as_deref(), Some("b"));
        tr.toggle_task("b", T0, DAY);
        assert_eq!(tr.first_open_task(), None);
    }
}
