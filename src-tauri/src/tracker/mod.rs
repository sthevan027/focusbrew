//! Everything about the tasks of the day and the timer that runs on them.
//! Pure logic: no Tauri, no clock of its own, so it is unit-testable.

#![allow(dead_code)] // wired up in Task 7; remove there

pub mod tasks;
pub mod timer;
