use chrono::{Duration, TimeZone, Utc};
use focusbrew_tracker::models::ActivityRecord;
use focusbrew_tracker::storage::Storage;

fn base() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 17, 12, 0, 0).unwrap()
}

fn record(app: &str, start: chrono::DateTime<Utc>, secs: i64) -> ActivityRecord {
    ActivityRecord {
        id: None,
        app_name: app.to_string(),
        started_at: start,
        ended_at: Some(start + Duration::seconds(secs)),
        is_idle: false,
        continued: false,
        created_at: start,
    }
}

#[test]
fn test_query_activities_counts_sessions_not_checkpoints() {
    let storage = Storage::open_memory().unwrap();
    // Two hours in one app, stored as 120 one-minute checkpoint pieces.
    for i in 0..120 {
        let mut piece = record("Code.exe", base() + Duration::seconds(i * 60), 60);
        piece.continued = i > 0;
        storage.write_activity(&piece).unwrap();
    }

    let results = storage.query_activities(base(), base() + Duration::days(1), None).unwrap();

    assert_eq!(results[0].1, 7200);
    assert_eq!(results[0].2, 1, "one session, not one per checkpoint");
}

#[test]
fn test_query_activities_range_starting_mid_session_still_counts_one_session() {
    let storage = Storage::open_memory().unwrap();
    for i in 0..3 {
        let mut piece = record("Code.exe", base() + Duration::seconds(i * 60), 60);
        piece.continued = true; // the session began before the range
        storage.write_activity(&piece).unwrap();
    }

    let results = storage.query_activities(base(), base() + Duration::days(1), None).unwrap();

    assert_eq!(results[0].1, 180);
    assert_eq!(results[0].2, 1);
}

#[test]
fn test_new_upgrades_a_database_created_before_the_continued_column() {
    let path = std::env::temp_dir().join(format!("focusbrew-old-schema-{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    {
        let old = rusqlite::Connection::open(&path).unwrap();
        old.execute_batch(
            "CREATE TABLE activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_name TEXT NOT NULL,
                started_at DATETIME NOT NULL,
                ended_at DATETIME,
                is_idle INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO activities (app_name, started_at, ended_at)
            VALUES ('Old.exe', '2026-10-17T12:00:00.000Z', '2026-10-17T12:10:00.000Z');",
        )
        .unwrap();
    }

    let storage = Storage::new(path.to_str().unwrap()).unwrap();
    storage.write_activity(&record("New.exe", base(), 60)).unwrap();
    let results = storage
        .query_activities(base() - Duration::hours(1), base() + Duration::days(1), None)
        .unwrap();

    assert_eq!(results.len(), 2, "old rows survive and new rows are accepted");
    drop(storage);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn test_new_creates_activities_and_config_tables() {
    let storage = Storage::open_memory().unwrap();
    for table in ["activities", "config"] {
        let exists: i64 = storage
            .db
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1, "{table} table should exist");
    }
}

#[test]
fn test_write_activity_inserts_record() {
    let storage = Storage::open_memory().unwrap();
    storage.write_activity(&record("VSCode.exe", base(), 60)).unwrap();

    let count: i64 = storage
        .db
        .query_row("SELECT COUNT(*) FROM activities WHERE app_name = 'VSCode.exe'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn test_cleanup_old_records_deletes_expired() {
    let storage = Storage::open_memory().unwrap();
    let now = Utc::now();
    storage.write_activity(&record("old.exe", now - Duration::days(100), 3600)).unwrap();
    storage.write_activity(&record("new.exe", now, 3600)).unwrap();

    storage.cleanup_old_records(90).unwrap();

    let old: i64 = storage
        .db
        .query_row("SELECT COUNT(*) FROM activities WHERE app_name = 'old.exe'", [], |r| r.get(0))
        .unwrap();
    let new: i64 = storage
        .db
        .query_row("SELECT COUNT(*) FROM activities WHERE app_name = 'new.exe'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(old, 0, "record older than retention must be deleted");
    assert_eq!(new, 1, "recent record must remain");
}

#[test]
fn test_query_activities_aggregates_by_app() {
    let storage = Storage::open_memory().unwrap();
    for i in 0..3 {
        storage
            .write_activity(&record("VSCode.exe", base() + Duration::seconds(i * 1000), 600))
            .unwrap();
    }
    storage.write_activity(&record("Firefox.exe", base() + Duration::seconds(3000), 300)).unwrap();

    let results = storage
        .query_activities(base(), base() + Duration::days(1), None)
        .unwrap();

    assert_eq!(results.len(), 2);
    let vscode = results.iter().find(|(app, _, _)| app == "VSCode.exe").unwrap();
    assert_eq!(vscode.1, 1800);
    assert_eq!(vscode.2, 3);
    let firefox = results.iter().find(|(app, _, _)| app == "Firefox.exe").unwrap();
    assert_eq!(firefox.1, 300);
    assert_eq!(firefox.2, 1);
}

#[test]
fn test_query_activities_is_case_insensitive_per_app() {
    let storage = Storage::open_memory().unwrap();
    storage.write_activity(&record("VSCode.exe", base(), 600)).unwrap();
    storage.write_activity(&record("vscode.exe", base() + Duration::seconds(700), 600)).unwrap();

    let results = storage.query_activities(base(), base() + Duration::days(1), None).unwrap();

    assert_eq!(results.len(), 1, "same app in two cases must be one row");
    assert_eq!(results[0].1, 1200);
    assert_eq!(results[0].2, 2);
}

#[test]
fn test_query_activities_clips_session_to_range_start() {
    // Session runs 5 min before `from` and 5 min after: only the 5 min inside the range count.
    let storage = Storage::open_memory().unwrap();
    storage
        .write_activity(&record("Code.exe", base() - Duration::seconds(300), 600))
        .unwrap();

    let results = storage.query_activities(base(), base() + Duration::days(1), None).unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].1, 300);
}

#[test]
fn test_query_activities_excludes_idle_and_out_of_range() {
    let storage = Storage::open_memory().unwrap();
    let mut idle = record("Code.exe", base(), 600);
    idle.is_idle = true;
    storage.write_activity(&idle).unwrap();
    storage.write_activity(&record("Old.exe", base() - Duration::days(2), 600)).unwrap();

    let results = storage.query_activities(base(), base() + Duration::days(1), None).unwrap();

    assert!(results.is_empty());
}

#[test]
fn test_query_activities_app_filter_is_case_insensitive_substring() {
    let storage = Storage::open_memory().unwrap();
    storage.write_activity(&record("VSCode.exe", base(), 600)).unwrap();
    storage.write_activity(&record("firefox.exe", base() + Duration::seconds(700), 600)).unwrap();

    let results = storage
        .query_activities(base(), base() + Duration::days(1), Some("CODE"))
        .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].0, "VSCode.exe");
}

#[test]
fn test_config_set_then_get_roundtrip() {
    let storage = Storage::open_memory().unwrap();
    storage.set_config("idle_threshold_minutes", "15").unwrap();
    storage.set_config("idle_threshold_minutes", "20").unwrap();

    assert_eq!(storage.get_config("idle_threshold_minutes").unwrap(), "20");
    assert!(storage.get_config("missing").is_err());
}
