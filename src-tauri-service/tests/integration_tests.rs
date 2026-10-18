// End-to-end over the in-process pipeline: observations -> recorder -> storage -> HTTP API.
// The Windows service process itself is exercised by the manual smoke steps, not here.
use axum::body::Body;
use axum::http::Request;
use chrono::{DateTime, Duration, TimeZone, Utc};
use focusbrew_tracker::api::{build_router, AppState};
use focusbrew_tracker::models::Config;
use focusbrew_tracker::recorder::Recorder;
use focusbrew_tracker::storage::Storage;
use tower::ServiceExt;

fn at(h: u32, m: u32, s: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 17, h, m, s).unwrap()
}

async fn get_json(state: &AppState, uri: &str) -> serde_json::Value {
    let req = Request::builder().uri(uri).body(Body::empty()).unwrap();
    let res = build_router(state.clone()).oneshot(req).await.unwrap();
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

/// Feeds observations through the recorder, as the collector loop does, and stores what it emits.
async fn collect(state: &AppState, timeline: &[(DateTime<Utc>, Option<(&str, bool)>)]) {
    // The timelines here jump minutes at a time; a wide gap limit keeps them from reading as suspends.
    let mut recorder = Recorder::with_max_gap(Duration::days(1));
    for (now, obs) in timeline {
        if let Some(record) = recorder.observe(*obs, *now) {
            state.storage.lock().await.write_activity(&record).unwrap();
        }
    }
}

#[tokio::test]
async fn collected_timeline_is_reported_with_active_and_idle_totals() {
    let state = AppState::new(Storage::open_memory().unwrap(), Config::default());
    collect(
        &state,
        &[
            (at(12, 0, 0), Some(("Code.exe", false))),
            (at(12, 10, 0), Some(("Code.exe", true))), // went idle after 10 min of work
            (at(12, 15, 0), Some(("chrome.exe", false))), // came back on another app
            (at(12, 20, 0), None),                     // no foreground window: session ends
        ],
    )
    .await;

    let body = get_json(
        &state,
        "/api/activities?from=2026-10-17T00:00:00Z&to=2026-10-18T00:00:00Z",
    )
    .await;

    assert_eq!(body["data"][0]["app_name"], "Code.exe");
    assert_eq!(body["data"][0]["seconds"], 600);
    assert_eq!(body["data"][0]["sessions"], 1);
    assert_eq!(body["data"][1]["app_name"], "chrome.exe");
    assert_eq!(body["data"][1]["seconds"], 300);
    assert_eq!(body["idle_seconds"], 300);
}

#[tokio::test]
async fn session_crossing_midnight_is_split_by_day_and_never_double_counted() {
    let state = AppState::new(Storage::open_memory().unwrap(), Config::default());
    let start = Utc.with_ymd_and_hms(2026, 10, 17, 23, 55, 0).unwrap();
    collect(
        &state,
        &[
            (start, Some(("Code.exe", false))),
            (start + Duration::minutes(10), None), // 00:05 next day
        ],
    )
    .await;

    let day_one = get_json(&state, "/api/activities?from=2026-10-17T00:00:00Z&to=2026-10-18T00:00:00Z").await;
    let day_two = get_json(&state, "/api/activities?from=2026-10-18T00:00:00Z&to=2026-10-19T00:00:00Z").await;

    assert_eq!(day_one["data"][0]["seconds"], 300, "5 minutes before midnight");
    assert_eq!(day_two["data"][0]["seconds"], 300, "5 minutes after midnight");
}
