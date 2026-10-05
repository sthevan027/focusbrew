//! The tasks of the day: what they are, how they are validated and ordered,
//! and the `tasks.json` file they live in.

use std::collections::HashSet;
use std::fs;

use serde::{Deserialize, Serialize};

use crate::config::data_dir;

pub const MIN_MINUTES: u32 = 5;
pub const MAX_MINUTES: u32 = 180;
pub const DEFAULT_MINUTES: u32 = 25;
pub const MAX_TITLE_CHARS: usize = 200;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskSource {
    Manual,
    Github,
}

fn default_minutes() -> u32 {
    DEFAULT_MINUTES
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    /// One line under the title; filled for GitHub imports ("dono/repo #12").
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default = "default_minutes")]
    pub minutes: u32,
    pub done: bool,
    pub created_at: String,
    pub source: TaskSource,
    /// Total seconds worked on this task, across blocks.
    #[serde(default)]
    pub spent_secs: u32,
}

pub fn clamp_minutes(minutes: u32) -> u32 {
    minutes.clamp(MIN_MINUTES, MAX_MINUTES)
}

/// Trimmed title, at most 200 *characters*; `None` for a blank one.
pub fn clean_title(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let cut: String = trimmed.chars().take(MAX_TITLE_CHARS).collect();
    Some(cut.trim_end().to_string())
}

pub fn new_task(title: &str, source: TaskSource, minutes: u32) -> Option<Task> {
    Some(Task {
        id: uuid::Uuid::new_v4().to_string(),
        title: clean_title(title)?,
        note: None,
        minutes: clamp_minutes(minutes),
        done: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        source,
        spent_secs: 0,
    })
}

/// Puts the tasks named in `ids` first, in that order; everything else keeps
/// its relative order after them. Unknown and repeated ids are ignored.
pub fn reorder(tasks: &mut Vec<Task>, ids: &[String]) {
    let mut remaining = std::mem::take(tasks);
    let mut seen = HashSet::new();
    let mut ordered = Vec::with_capacity(remaining.len());
    for id in ids {
        if !seen.insert(id.as_str()) {
            continue;
        }
        if let Some(pos) = remaining.iter().position(|t| &t.id == id) {
            ordered.push(remaining.remove(pos));
        }
    }
    ordered.extend(remaining);
    *tasks = ordered;
}

fn tasks_path() -> std::path::PathBuf {
    data_dir().join("tasks.json")
}

pub fn parse(raw: &str) -> Vec<Task> {
    serde_json::from_str(raw).unwrap_or_default()
}

pub fn load() -> Vec<Task> {
    match fs::read_to_string(tasks_path()) {
        Ok(raw) => parse(&raw),
        Err(_) => Vec::new(),
    }
}

pub fn save(tasks: &[Task]) -> std::io::Result<()> {
    let raw = serde_json::to_string_pretty(tasks)?;
    fs::write(tasks_path(), raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str) -> Task {
        let mut t = new_task(id, TaskSource::Manual, 25).unwrap();
        t.id = id.to_string();
        t
    }

    fn ids(tasks: &[Task]) -> Vec<&str> {
        tasks.iter().map(|t| t.id.as_str()).collect()
    }

    fn strings(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    // The file written by focusbrew 0.1.x has no note/minutes/spent_secs.
    #[test]
    fn an_old_tasks_file_loads_with_the_new_fields_filled_in() {
        let raw = r#"[{"id":"1","title":"Escrever testes","done":true,
                       "created_at":"2026-09-10T10:00:00Z","source":"github"}]"#;
        let tasks = parse(raw);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Escrever testes");
        assert!(tasks[0].done);
        assert_eq!(tasks[0].source, TaskSource::Github);
        assert_eq!(tasks[0].minutes, 25);
        assert_eq!(tasks[0].spent_secs, 0);
        assert_eq!(tasks[0].note, None);
    }

    // Review focus: corrupted / empty files must not panic.
    #[test]
    fn empty_or_corrupted_files_become_an_empty_list() {
        assert!(parse("").is_empty());
        assert!(parse("not json").is_empty());
        assert!(parse("{\"a\":1}").is_empty());
        assert!(parse("[{\"id\":1}]").is_empty());
    }

    #[test]
    fn minutes_are_clamped_to_the_allowed_range() {
        assert_eq!(clamp_minutes(0), 5);
        assert_eq!(clamp_minutes(1), 5);
        assert_eq!(clamp_minutes(25), 25);
        assert_eq!(clamp_minutes(180), 180);
        assert_eq!(clamp_minutes(999), 180);
    }

    #[test]
    fn titles_are_trimmed_and_blank_ones_are_refused() {
        assert_eq!(clean_title("  Revisar PR  ").as_deref(), Some("Revisar PR"));
        assert_eq!(clean_title(""), None);
        assert_eq!(clean_title("   \t\n"), None);
        assert!(new_task("   ", TaskSource::Manual, 25).is_none());
    }

    // Review focus: 200 *characters*, not bytes — accents and emoji must not
    // be cut in the middle (which would panic on a byte slice).
    #[test]
    fn long_titles_are_cut_at_200_characters() {
        let long: String = "ç".repeat(250);
        let cut = clean_title(&long).unwrap();
        assert_eq!(cut.chars().count(), 200);

        let emoji: String = "🚀".repeat(300);
        assert_eq!(clean_title(&emoji).unwrap().chars().count(), 200);
    }

    #[test]
    fn a_new_task_gets_the_requested_minutes_clamped() {
        let t = new_task("x", TaskSource::Manual, 1).unwrap();
        assert_eq!(t.minutes, 5);
        assert!(!t.done);
        assert_eq!(t.spent_secs, 0);
        assert!(!t.id.is_empty());
    }

    #[test]
    fn reorder_puts_the_listed_tasks_first_in_the_given_order() {
        let mut tasks = vec![task("a"), task("b"), task("c"), task("d")];
        reorder(&mut tasks, &strings(&["c", "a"]));
        assert_eq!(ids(&tasks), vec!["c", "a", "b", "d"]);
    }

    // Review focus: a task may be removed between the drag and the drop.
    #[test]
    fn reorder_ignores_unknown_and_repeated_ids() {
        let mut tasks = vec![task("a"), task("b"), task("c")];
        reorder(&mut tasks, &strings(&["ghost", "c", "c", "a"]));
        assert_eq!(ids(&tasks), vec!["c", "a", "b"]);
    }

    #[test]
    fn reorder_with_no_ids_changes_nothing() {
        let mut tasks = vec![task("a"), task("b")];
        reorder(&mut tasks, &[]);
        assert_eq!(ids(&tasks), vec!["a", "b"]);
    }

    #[test]
    fn done_tasks_left_out_of_the_list_stay_after_the_reordered_ones() {
        let mut tasks = vec![task("a"), task("done"), task("b")];
        reorder(&mut tasks, &strings(&["b", "a"]));
        assert_eq!(ids(&tasks), vec!["b", "a", "done"]);
    }
}
