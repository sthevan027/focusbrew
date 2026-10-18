use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::{Duration, TimeZone, Utc};
use focusbrew_tracker::api::{build_router, AppState};
use focusbrew_tracker::models::{ActivityRecord, Config};
use focusbrew_tracker::storage::Storage;
use tower::ServiceExt;

fn state() -> AppState {
    AppState::new(Storage::open_memory().unwrap(), Config::default())
}

async fn call(state: &AppState, method: &str, uri: &str, body: Option<serde_json::Value>) -> (StatusCode, serde_json::Value) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(match body {
            Some(v) => Body::from(v.to_string()),
            None => Body::empty(),
        })
        .unwrap();
    let res = build_router(state.clone()).oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
}

async fn seed(state: &AppState) {
    let base = Utc.with_ymd_and_hms(2026, 10, 17, 12, 0, 0).unwrap();
    let storage = state.storage.lock().await;
    storage
        .write_activity(&ActivityRecord {
            id: None,
            app_name: "Code.exe".into(),
            started_at: base,
            ended_at: Some(base + Duration::seconds(600)),
            is_idle: false,
            created_at: base,
        })
        .unwrap();
    storage
        .write_activity(&ActivityRecord {
            id: None,
            app_name: "Code.exe".into(),
            started_at: base + Duration::seconds(600),
            ended_at: Some(base + Duration::seconds(900)),
            is_idle: true,
            created_at: base,
        })
        .unwrap();
}

const RANGE: &str = "from=2026-10-17T00:00:00%2B00:00&to=2026-10-18T00:00:00%2B00:00";

#[tokio::test]
async fn get_activities_returns_apps_and_idle_seconds() {
    let state = state();
    seed(&state).await;

    let (status, body) = call(&state, "GET", &format!("/api/activities?{RANGE}"), None).await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["data"].is_array());
    assert_eq!(body["data"][0]["app_name"], "Code.exe");
    assert_eq!(body["data"][0]["seconds"], 600);
    assert_eq!(body["data"][0]["sessions"], 1);
    assert_eq!(body["idle_seconds"], 300);
}

#[tokio::test]
async fn get_activities_rejects_unparseable_dates() {
    let (status, _) = call(&state(), "GET", "/api/activities?from=nope&to=nope", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn post_config_clamps_idle_threshold_to_1_through_60() {
    let state = state();

    let (_, low) = call(&state, "POST", "/api/config", Some(serde_json::json!({ "idle_threshold_minutes": 0 }))).await;
    assert_eq!(low["idle_threshold_minutes"], 1);

    let (_, high) = call(&state, "POST", "/api/config", Some(serde_json::json!({ "idle_threshold_minutes": 999 }))).await;
    assert_eq!(high["idle_threshold_minutes"], 60);
}

#[tokio::test]
async fn post_config_persists_and_retention_is_clamped_to_30_through_365() {
    let state = state();

    let (_, body) = call(
        &state,
        "POST",
        "/api/config",
        Some(serde_json::json!({ "idle_threshold_minutes": 15, "retention_days": 10 })),
    )
    .await;

    assert_eq!(body["idle_threshold_minutes"], 15);
    assert_eq!(body["retention_days"], 30);
    let storage = state.storage.lock().await;
    assert_eq!(storage.get_config("idle_threshold_minutes").unwrap(), "15");
    assert_eq!(storage.get_config("retention_days").unwrap(), "30");
}

#[tokio::test]
async fn get_config_returns_current_values() {
    let (status, body) = call(&state(), "GET", "/api/config", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["idle_threshold_minutes"], 10);
    assert_eq!(body["retention_days"], 90);
    assert_eq!(body["service_port"], 8765);
}

#[tokio::test]
async fn get_health_reports_ok_with_uptime() {
    let (status, body) = call(&state(), "GET", "/api/health", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
    assert!(body["uptime_secs"].is_u64());
}
