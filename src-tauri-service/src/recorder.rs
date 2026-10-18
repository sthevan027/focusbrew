use crate::models::ActivityRecord;
use chrono::{DateTime, Duration, Utc};

/// Longest silence between two observations that still counts as time spent. Anything longer
/// (a suspend, a hibernation) belongs to nobody.
pub const DEFAULT_MAX_GAP_SECS: i64 = 10;

#[derive(Debug, Clone)]
struct Segment {
    app_name: String,
    is_idle: bool,
    started_at: DateTime<Utc>,
    /// Set once a checkpoint has written an earlier piece of this same session.
    resumed: bool,
}

/// Turns per-second observations into one record per run of the same app and idle state.
/// A record is produced when its segment closes (or at a checkpoint), never while it is still open.
pub struct Recorder {
    current: Option<Segment>,
    last_seen: Option<DateTime<Utc>>,
    max_gap: Duration,
}

impl Default for Recorder {
    fn default() -> Self {
        Self::with_max_gap(Duration::seconds(DEFAULT_MAX_GAP_SECS))
    }
}

impl Recorder {
    pub fn with_max_gap(max_gap: Duration) -> Self {
        Recorder { current: None, last_seen: None, max_gap }
    }

    /// `obs` is `None` when there is no foreground window; that closes the current segment.
    /// If more than `max_gap` passed since the previous observation, the open segment ends at
    /// that previous observation instead of absorbing the silence.
    pub fn observe(&mut self, obs: Option<(&str, bool)>, now: DateTime<Utc>) -> Option<ActivityRecord> {
        let after_gap = self.close_on_gap(now);
        self.last_seen = Some(now);
        match obs {
            Some((app, idle)) => {
                if let Some(cur) = &self.current {
                    if cur.app_name == app && cur.is_idle == idle {
                        return after_gap;
                    }
                }
                let closed = self.close(now);
                self.current = Some(Segment {
                    app_name: app.to_string(),
                    is_idle: idle,
                    started_at: now,
                    resumed: false,
                });
                after_gap.or(closed)
            }
            None => after_gap.or_else(|| self.close(now)),
        }
    }

    /// Flushes the open segment, e.g. on shutdown.
    pub fn finish(&mut self, now: DateTime<Utc>) -> Option<ActivityRecord> {
        self.close_on_gap(now).or_else(|| self.close(now))
    }

    /// Writes the span so far and keeps the segment open from `now`. Without this, a long
    /// session with no app switch would reach the database only when it ended. The pieces are
    /// marked `continued` so they still count as a single session.
    pub fn checkpoint(&mut self, now: DateTime<Utc>) -> Option<ActivityRecord> {
        if let Some(record) = self.close_on_gap(now) {
            return Some(record);
        }
        let cur = self.current.as_mut()?;
        if now <= cur.started_at {
            return None;
        }
        let record = record_of(cur, now);
        cur.started_at = now;
        cur.resumed = true;
        Some(record)
    }

    fn close_on_gap(&mut self, now: DateTime<Utc>) -> Option<ActivityRecord> {
        let last = self.last_seen?;
        if now - last <= self.max_gap {
            return None;
        }
        self.close(last)
    }

    fn close(&mut self, end: DateTime<Utc>) -> Option<ActivityRecord> {
        let cur = self.current.take()?;
        if end <= cur.started_at {
            return None;
        }
        Some(record_of(&cur, end))
    }
}

fn record_of(segment: &Segment, end: DateTime<Utc>) -> ActivityRecord {
    ActivityRecord {
        id: None,
        app_name: segment.app_name.clone(),
        started_at: segment.started_at,
        ended_at: Some(end),
        is_idle: segment.is_idle,
        continued: segment.resumed,
        created_at: end,
    }
}
