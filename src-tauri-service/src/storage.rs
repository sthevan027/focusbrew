use crate::models::ActivityRecord;
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{params, Connection};

pub struct Storage {
    pub db: Connection,
}

/// Fixed-width UTC timestamps (always millis + `Z`), so SQLite's text comparisons order correctly.
pub fn fmt_ts(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

impl Storage {
    pub fn new(db_path: &str) -> Result<Self, String> {
        let db = Connection::open(db_path).map_err(|e| format!("Failed to open database: {e}"))?;
        let storage = Storage { db };
        storage.init_schema()?;
        Ok(storage)
    }

    pub fn open_memory() -> Result<Self, String> {
        let db = Connection::open_in_memory().map_err(|e| format!("Failed to open in-memory db: {e}"))?;
        let storage = Storage { db };
        storage.init_schema()?;
        Ok(storage)
    }

    fn init_schema(&self) -> Result<(), String> {
        self.db
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS activities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    app_name TEXT NOT NULL,
                    started_at DATETIME NOT NULL,
                    ended_at DATETIME,
                    is_idle INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_activities_started ON activities(started_at);
                CREATE INDEX IF NOT EXISTS idx_activities_app ON activities(app_name);
                ",
            )
            .map_err(|e| format!("Failed to init schema: {e}"))
    }

    pub fn write_activity(&self, record: &ActivityRecord) -> Result<(), String> {
        self.db
            .execute(
                "INSERT INTO activities (app_name, started_at, ended_at, is_idle) VALUES (?1, ?2, ?3, ?4)",
                params![
                    record.app_name,
                    fmt_ts(record.started_at),
                    record.ended_at.map(fmt_ts),
                    record.is_idle as i32,
                ],
            )
            .map_err(|e| format!("Failed to write activity: {e}"))?;
        Ok(())
    }

    /// Active time per app inside `[from, to)`. Each session is clipped to the range,
    /// so a session that straddles a boundary counts only its part inside it.
    /// Returns (app_name, seconds, sessions), longest first.
    pub fn query_activities(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
        app_filter: Option<&str>,
    ) -> Result<Vec<(String, u32, u32)>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT
                    MIN(app_name) AS app,
                    CAST(ROUND(SUM(
                        (MIN(julianday(COALESCE(ended_at, ?2)), julianday(?2))
                         - MAX(julianday(started_at), julianday(?1))) * 86400
                    )) AS INTEGER) AS seconds,
                    COUNT(*) AS sessions
                 FROM activities
                 WHERE is_idle = 0 AND started_at < ?2 AND COALESCE(ended_at, ?2) > ?1
                 GROUP BY LOWER(app_name)
                 ORDER BY seconds DESC",
            )
            .map_err(|e| format!("Failed to prepare query: {e}"))?;

        let rows = stmt
            .query_map(params![fmt_ts(from), fmt_ts(to)], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?, row.get::<_, u32>(2)?))
            })
            .map_err(|e| format!("Query failed: {e}"))?;

        let filter = app_filter.map(str::to_lowercase);
        let mut results = Vec::new();
        for row in rows {
            let (app, secs, sessions) = row.map_err(|e| format!("Row mapping failed: {e}"))?;
            if let Some(f) = &filter {
                if !app.to_lowercase().contains(f) {
                    continue;
                }
            }
            results.push((app, secs, sessions));
        }
        Ok(results)
    }

    pub fn get_config(&self, key: &str) -> Result<String, String> {
        self.db
            .query_row("SELECT value FROM config WHERE key = ?1", params![key], |row| row.get(0))
            .map_err(|_| format!("Config key '{key}' not found"))
    }

    pub fn set_config(&self, key: &str, value: &str) -> Result<(), String> {
        self.db
            .execute(
                "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?1, ?2, ?3)",
                params![key, value, fmt_ts(Utc::now())],
            )
            .map_err(|e| format!("Failed to set config: {e}"))?;
        Ok(())
    }

    /// Deletes records that started before the retention window.
    pub fn cleanup_old_records(&self, retention_days: u32) -> Result<(), String> {
        let cutoff = Utc::now() - Duration::days(retention_days as i64);
        self.db
            .execute("DELETE FROM activities WHERE started_at < ?1", params![fmt_ts(cutoff)])
            .map_err(|e| format!("Failed to cleanup: {e}"))?;
        Ok(())
    }
}
