use crate::models::{clamp_idle_threshold, clamp_retention_days, Config};
use crate::storage::Storage;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{sync::Arc, time::Instant};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub storage: Arc<Mutex<Storage>>,
    pub config: Arc<Mutex<Config>>,
    pub started: Instant,
}

impl AppState {
    pub fn new(storage: Storage, config: Config) -> Self {
        AppState {
            storage: Arc::new(Mutex::new(storage)),
            config: Arc::new(Mutex::new(config)),
            started: Instant::now(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ActivitiesQuery {
    from: String,
    to: String,
    #[serde(default)]
    app_filter: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ConfigUpdate {
    #[serde(default)]
    pub idle_threshold_minutes: Option<u32>,
    #[serde(default)]
    pub retention_days: Option<u32>,
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/activities", get(get_activities))
        .route("/api/config", get(get_config).post(post_config))
        .route("/api/health", get(get_health))
        .with_state(state)
}

fn parse_ts(raw: &str) -> Result<DateTime<Utc>, StatusCode> {
    DateTime::parse_from_rfc3339(raw)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn get_activities(
    State(state): State<AppState>,
    Query(q): Query<ActivitiesQuery>,
) -> Result<Json<Value>, StatusCode> {
    let from = parse_ts(&q.from)?;
    let to = parse_ts(&q.to)?;

    let storage = state.storage.lock().await;
    let rows = storage
        .query_activities(from, to, q.app_filter.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let idle_seconds = storage
        .query_idle_seconds(from, to)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let data: Vec<Value> = rows
        .into_iter()
        .map(|(app_name, seconds, sessions)| json!({ "app_name": app_name, "seconds": seconds, "sessions": sessions }))
        .collect();

    Ok(Json(json!({ "data": data, "idle_seconds": idle_seconds })))
}

fn config_json(config: &Config) -> Value {
    json!({
        "idle_threshold_minutes": config.idle_threshold_minutes,
        "retention_days": config.retention_days,
        "service_port": config.service_port,
    })
}

async fn get_config(State(state): State<AppState>) -> Json<Value> {
    let config = state.config.lock().await;
    Json(config_json(&config))
}

async fn post_config(
    State(state): State<AppState>,
    Json(update): Json<ConfigUpdate>,
) -> Result<Json<Value>, StatusCode> {
    let mut config = state.config.lock().await;
    if let Some(minutes) = update.idle_threshold_minutes {
        config.idle_threshold_minutes = clamp_idle_threshold(minutes);
    }
    if let Some(days) = update.retention_days {
        config.retention_days = clamp_retention_days(days);
    }

    // Persisted so the threshold and retention survive a service restart.
    let storage = state.storage.lock().await;
    storage
        .set_config("idle_threshold_minutes", &config.idle_threshold_minutes.to_string())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    storage
        .set_config("retention_days", &config.retention_days.to_string())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(config_json(&config)))
}

async fn get_health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({ "status": "ok", "uptime_secs": state.started.elapsed().as_secs() }))
}
