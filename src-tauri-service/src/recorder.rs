use crate::models::ActivityRecord;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
struct Segment {
    app_name: String,
    is_idle: bool,
    started_at: DateTime<Utc>,
}

/// Turns per-second observations into one record per run of the same app and idle state.
/// A record is produced when its segment closes, never while it is still open.
#[derive(Default)]
pub struct Recorder {
    current: Option<Segment>,
}

impl Recorder {
    /// `obs` is `None` when there is no foreground window; that closes the current segment.
    pub fn observe(&mut self, obs: Option<(&str, bool)>, now: DateTime<Utc>) -> Option<ActivityRecord> {
        match obs {
            Some((app, idle)) => {
                if let Some(cur) = &self.current {
                    if cur.app_name == app && cur.is_idle == idle {
                        return None;
                    }
                }
                let closed = self.close(now);
                self.current = Some(Segment {
                    app_name: app.to_string(),
                    is_idle: idle,
                    started_at: now,
                });
                closed
            }
            None => self.close(now),
        }
    }

    /// Flushes the open segment, e.g. on shutdown.
    pub fn finish(&mut self, now: DateTime<Utc>) -> Option<ActivityRecord> {
        self.close(now)
    }

    fn close(&mut self, now: DateTime<Utc>) -> Option<ActivityRecord> {
        let cur = self.current.take()?;
        if now <= cur.started_at {
            return None;
        }
        Some(ActivityRecord {
            id: None,
            app_name: cur.app_name,
            started_at: cur.started_at,
            ended_at: Some(now),
            is_idle: cur.is_idle,
            created_at: now,
        })
    }
}
