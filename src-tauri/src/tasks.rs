use serde::{Deserialize, Serialize};
use std::fs;

use crate::config::data_dir;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskSource {
    Manual,
    Github,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub done: bool,
    pub created_at: String,
    pub source: TaskSource,
}

fn tasks_path() -> std::path::PathBuf {
    data_dir().join("tasks.json")
}

pub fn load() -> Vec<Task> {
    match fs::read_to_string(tasks_path()) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn save(tasks: &[Task]) -> std::io::Result<()> {
    let raw = serde_json::to_string_pretty(tasks)?;
    fs::write(tasks_path(), raw)
}

pub fn new_task(title: String, source: TaskSource) -> Task {
    Task {
        id: uuid::Uuid::new_v4().to_string(),
        title,
        done: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        source,
    }
}
