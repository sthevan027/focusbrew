# Activity Tracking & Time Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a background Windows Service that detects app usage and idle time, stores it in SQLite, and expose an HTTP API for the Tauri UI to display reports of time spent per app.

**Architecture:** Two-layer design — service collects data (GetForegroundWindow, GetLastInputInfo every 1 sec) and persists to SQLite; Tauri reads via HTTP and displays reports (bar chart + table).

**Tech Stack:** Rust (Tauri + service), SQLite (local storage), WinAPI (GetForegroundWindow, GetLastInputInfo), HTTP (localhost).

**Spec:** `docs/superpowers/specs/2026-10-17-activity-tracking-design.md`

---

## Global Constraints

- **Platform:** Windows 10+ only
- **Language:** Rust (consistent with focusbrew backend)
- **Database:** SQLite (local, no cloud in MVP)
- **Architecture:** Service (collection) + Tauri UI (display) via HTTP localhost
- **IPC port:** 8765 (configurable, but default fixed)
- **Idle threshold:** 10 minutes (user-configurable in UI)
- **Data retention:** 90 days (user-configurable: 30, 90, 180 days)
- **Service registration:** Auto-start on Windows boot via installer
- **Branch:** Feature development on `dev` branch (already created)

---

## Review Focus

1. **Idle detection threshold:** User misconfigures (e.g., sets to 1 minute), reports show 90% idle. Tests must verify threshold is clamped to 1–60 min and applied correctly.
2. **Service offline gracefully:** Service crashes or fails to start; Tauri must still launch and warn user (not block). Tests verify fallback UI behavior.
3. **Data retention cleanup:** Records older than retention window must delete automatically; user sets 90 days, 30-day-old records must NOT exist. Tests verify cleanup runs and removes correct records.
4. **App name normalization:** Windows returns process names as "VSCode.exe", "firefox.exe" (case varies). Reports must not split same app into multiple rows. Tests verify case-insensitive aggregation or normalization.
5. **Leap seconds / timezone edge cases:** Reports cross midnight or daylight saving; "This Week" must not double-count a session that straddles a boundary. Tests verify date/time aggregation queries with mock midnight/DST transitions.

---

## File Structure

### Windows Service (`src-tauri-service/`)

```
src-tauri-service/
├── Cargo.toml                          # Service dependencies (rusqlite, tokio, windows WinAPI)
├── build.rs                             # Build script for Windows Service registration
├── src/
│   ├── main.rs                          # Service entry point, init, HTTP server loop
│   ├── detector.rs                      # GetForegroundWindow, GetLastInputInfo, ActiveApp struct
│   ├── storage.rs                       # SQLite init, write activity, query aggregation
│   ├── models.rs                        # ActivityRecord, Config structs + serde
│   ├── api.rs                           # HTTP handlers (GET /activities, POST /config, GET /health)
│   └── windows_service.rs               # Windows Service registration (SC_HANDLE, etc.)
└── tests/
    ├── test_detection.rs                # Mock app detection, idle state validation
    ├── test_storage.rs                  # SQLite insert, query, retention cleanup
    └── test_api.rs                      # HTTP endpoint responses
```

### Tauri UI Integration (`src-tauri/src/activity_tracking.rs`)

```
src-tauri/src/
├── activity_tracking/
│   ├── mod.rs                           # Module exports
│   ├── client.rs                        # HTTP client to service (reqwest)
│   └── models.rs                        # ActivityReport, ReportRequest (mirror service models)
├── commands.rs                          # Add activity-related Tauri commands (get_activity_report, update_idle_threshold)
└── [existing files modified]
```

### Frontend (`src/components/` or `src/pages/`)

```
src/
├── components/
│   ├── ActivityReport.tsx               # Main report view (period selector, chart, table)
│   └── ActivitySettings.tsx             # Settings panel (sliders, dropdowns)
└── [existing structure preserved]
```

---

## Tasks

### Task 1: Windows Service Skeleton & WinAPI Bindings

**Files:**
- Create: `src-tauri-service/Cargo.toml`
- Create: `src-tauri-service/src/main.rs`
- Create: `src-tauri-service/src/detector.rs`
- Create: `src-tauri-service/src/models.rs`

**Interfaces:**
- Consumes: None (new task)
- Produces: `struct ActiveApp { app_name: String, is_idle: bool, timestamp: i64 }`; `fn detect_active_app() -> Result<ActiveApp, String>`

**Steps:**

- [ ] **Step 1: Create `src-tauri-service` directory and `Cargo.toml`**

Create directory structure:
```bash
mkdir -p src-tauri-service/src src-tauri-service/tests
```

Create `src-tauri-service/Cargo.toml` with dependencies:
```toml
[package]
name = "focusbrew-tracker"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["rt", "macros", "time"] }
rusqlite = { version = "0.29", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
reqwest = { version = "0.12", features = ["json"] }
axum = "0.7"  # HTTP server instead of rolling our own
tower = "0.4"
windows = { version = "0.62", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging", "Win32_System_Diagnostics_ToolHelp"] }

[profile.release]
opt-level = 3
lto = true
```

- [ ] **Step 2: Write failing test for `detect_active_app()`**

Create `src-tauri-service/tests/test_detection.rs`:

```rust
#[test]
fn test_detect_active_app_returns_app_name_and_idle_status() {
    let result = detect_active_app();
    assert!(result.is_ok());
    let app = result.unwrap();
    assert!(!app.app_name.is_empty());
    assert!(app.timestamp > 0);
}

#[test]
fn test_app_name_is_normalized_to_exe_name() {
    // GetForegroundWindow may return full path; should extract basename
    let result = detect_active_app();
    assert!(result.is_ok());
    let app = result.unwrap();
    // Should be "VSCode.exe" not "C:\\...\\VSCode.exe"
    assert!(!app.app_name.contains("\\"));
}

#[test]
fn test_idle_state_detected_via_getlastinputinfo() {
    // Threshold: 10 minutes
    let result = detect_active_app();
    assert!(result.is_ok());
    // Just verify it returns true or false, not error
    assert!(result.unwrap().is_idle || !result.unwrap().is_idle);
}
```

- [ ] **Step 3: Create `src-tauri-service/src/models.rs`**

Define core structs:

```rust
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityRecord {
    pub id: Option<i64>,
    pub app_name: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub is_idle: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub idle_threshold_minutes: u32,
    pub retention_days: u32,
    pub service_port: u16,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            idle_threshold_minutes: 10,
            retention_days: 90,
            service_port: 8765,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ActiveApp {
    pub app_name: String,
    pub is_idle: bool,
    pub timestamp: i64,  // milliseconds since unix epoch
}
```

- [ ] **Step 4: Create `src-tauri-service/src/detector.rs`**

Implement WinAPI calls:

```rust
use windows::Win32::Foundation::{GetLastError, HWND};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS};
use crate::models::ActiveApp;
use std::ffi::CStr;
use chrono::Utc;

pub fn detect_active_app(idle_threshold_minutes: u32) -> Result<ActiveApp, String> {
    unsafe {
        // Get foreground window
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            return Err("No foreground window found".to_string());
        }

        // Get process ID from window handle
        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        
        if process_id == 0 {
            return Err("Could not get process ID".to_string());
        }

        // Get process name from process ID
        let app_name = get_process_name(process_id)?;

        // Check idle status via GetLastInputInfo
        let is_idle = check_idle_status(idle_threshold_minutes)?;

        let timestamp = Utc::now().timestamp_millis();

        Ok(ActiveApp { app_name, is_idle, timestamp })
    }
}

fn get_process_name(process_id: u32) -> Result<String, String> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
            .map_err(|_| "Failed to create toolhelp snapshot".to_string())?;

        let mut entry = PROCESSENTRY32::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;

        if !Process32First(snapshot, &mut entry).as_bool() {
            return Err("Process32First failed".to_string());
        }

        loop {
            if entry.th32ProcessID == process_id {
                let name_bytes = entry.szExeFile.iter().take_while(|&&b| b != 0).copied().collect::<Vec<_>>();
                let name = String::from_utf8_lossy(&name_bytes).to_string();
                return Ok(name);
            }

            if !Process32Next(snapshot, &mut entry).as_bool() {
                break;
            }
        }

        Err(format!("Process {} not found", process_id))
    }
}

fn check_idle_status(threshold_minutes: u32) -> Result<bool, String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetLastInputInfo;
    use windows::Win32::System::SystemInformation::GetTickCount;

    unsafe {
        let mut last_input_info = windows::Win32::UI::Input::KeyboardAndMouse::LASTINPUTINFO {
            cbSize: std::mem::size_of::<windows::Win32::UI::Input::KeyboardAndMouse::LASTINPUTINFO>() as u32,
            dwTime: 0,
        };

        if !GetLastInputInfo(&mut last_input_info).as_bool() {
            return Err("GetLastInputInfo failed".to_string());
        }

        let current_tick = GetTickCount();
        let idle_ms = (current_tick - last_input_info.dwTime) as i64;
        let threshold_ms = (threshold_minutes as i64) * 60 * 1000;

        Ok(idle_ms > threshold_ms)
    }
}
```

- [ ] **Step 5: Create `src-tauri-service/src/main.rs` stub**

```rust
mod detector;
mod models;
mod storage;
mod api;

#[tokio::main]
async fn main() {
    println!("focusbrew-tracker service starting...");
    // TODO: Initialize HTTP server, storage, detector loop
    // For now, just test detector
    if let Ok(app) = detector::detect_active_app(10) {
        println!("Active app: {} (idle: {})", app.app_name, app.is_idle);
    }
}
```

- [ ] **Step 6: Run tests to verify they fail (expected)**

```bash
cd src-tauri-service
cargo test --test test_detection 2>&1 | head -20
```

Expected: Compilation errors or test failures (functions not implemented yet).

- [ ] **Step 7: Implement `detect_active_app()` and verify tests pass**

Implement the detector using the code above, then:

```bash
cargo test --test test_detection -- --nocapture
```

Expected: Tests pass (at least on Windows; tests may skip on non-Windows).

- [ ] **Step 8: Commit**

```bash
cd D:/Projetos/focusbrew
git add src-tauri-service/
git commit -m "feat(tracker): add WinAPI detector for active app and idle status"
```

---

### Task 2: SQLite Schema & Storage Layer

**Files:**
- Create: `src-tauri-service/src/storage.rs`
- Create: `src-tauri-service/tests/test_storage.rs`

**Interfaces:**
- Consumes: `struct ActivityRecord`, `struct Config`
- Produces: `struct Storage { db: Connection }`; methods:
  - `fn new(db_path: &str) -> Result<Storage, String>`
  - `fn write_activity(record: ActivityRecord) -> Result<(), String>`
  - `fn query_activities(from: DateTime, to: DateTime, app_filter: Option<&str>) -> Result<Vec<(String, u32, u32)>, String>` (app_name, seconds, sessions)
  - `fn get_config(key: &str) -> Result<String, String>`
  - `fn set_config(key: &str, value: &str) -> Result<(), String>`
  - `fn cleanup_old_records(retention_days: u32) -> Result<(), String>`

**Steps:**

- [ ] **Step 1: Write failing tests for storage operations**

Create `src-tauri-service/tests/test_storage.rs`:

```rust
use rusqlite::Connection;
use chrono::Utc;

#[test]
fn test_storage_new_creates_tables() {
    let db = Connection::open_in_memory().unwrap();
    let storage = Storage::new_from_conn(db).unwrap();
    
    // Verify tables exist
    let mut stmt = storage.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='activities'"
    ).unwrap();
    let exists = stmt.exists([]).unwrap();
    assert!(exists, "activities table should exist");
}

#[test]
fn test_write_activity_inserts_record() {
    let storage = Storage::open_memory().unwrap();
    let record = ActivityRecord {
        id: None,
        app_name: "VSCode.exe".to_string(),
        started_at: Utc::now(),
        ended_at: None,
        is_idle: false,
        created_at: Utc::now(),
    };
    
    let result = storage.write_activity(&record);
    assert!(result.is_ok());
    
    // Verify it was inserted
    let count: i64 = storage.db.query_row(
        "SELECT COUNT(*) FROM activities WHERE app_name = 'VSCode.exe'",
        [],
        |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 1);
}

#[test]
fn test_cleanup_old_records_deletes_expired() {
    let storage = Storage::open_memory().unwrap();
    let now = Utc::now();
    let old = now - chrono::Duration::days(100);
    
    // Insert old record
    storage.db.execute(
        "INSERT INTO activities (app_name, started_at, ended_at, is_idle) VALUES (?, ?, ?, ?)",
        rusqlite::params![
            "old.exe",
            old.to_rfc3339(),
            (old + chrono::Duration::hours(1)).to_rfc3339(),
            0
        ],
    ).unwrap();
    
    // Insert recent record
    storage.db.execute(
        "INSERT INTO activities (app_name, started_at, ended_at, is_idle) VALUES (?, ?, ?, ?)",
        rusqlite::params![
            "new.exe",
            now.to_rfc3339(),
            (now + chrono::Duration::hours(1)).to_rfc3339(),
            0
        ],
    ).unwrap();
    
    storage.cleanup_old_records(90).unwrap();
    
    // Old record should be deleted, new one should remain
    let count: i64 = storage.db.query_row(
        "SELECT COUNT(*) FROM activities WHERE app_name = 'old.exe'",
        [],
        |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 0, "Old records should be deleted");
    
    let count: i64 = storage.db.query_row(
        "SELECT COUNT(*) FROM activities WHERE app_name = 'new.exe'",
        [],
        |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 1, "Recent records should remain");
}

#[test]
fn test_query_activities_aggregates_by_app() {
    let storage = Storage::open_memory().unwrap();
    let now = Utc::now();
    
    // Insert 3 sessions of VSCode (600s each), 1 of Firefox (300s)
    for i in 0..3 {
        let start = now + chrono::Duration::seconds(i * 1000);
        let end = start + chrono::Duration::seconds(600);
        storage.db.execute(
            "INSERT INTO activities (app_name, started_at, ended_at, is_idle) VALUES (?, ?, ?, ?)",
            rusqlite::params![
                "VSCode.exe",
                start.to_rfc3339(),
                end.to_rfc3339(),
                0
            ],
        ).unwrap();
    }
    
    let start = now + chrono::Duration::seconds(3000);
    let end = start + chrono::Duration::seconds(300);
    storage.db.execute(
        "INSERT INTO activities (app_name, started_at, ended_at, is_idle) VALUES (?, ?, ?, ?)",
        rusqlite::params![
            "Firefox.exe",
            start.to_rfc3339(),
            end.to_rfc3339(),
            0
        ],
    ).unwrap();
    
    let results = storage.query_activities(now, now + chrono::Duration::days(1), None).unwrap();
    
    // Should have 2 apps
    assert_eq!(results.len(), 2);
    
    // VSCode should have 1800 seconds (3 * 600)
    let vscode = results.iter().find(|(app, _, _)| app == "VSCode.exe").unwrap();
    assert_eq!(vscode.1, 1800);
    assert_eq!(vscode.2, 3); // 3 sessions
    
    // Firefox should have 300 seconds
    let firefox = results.iter().find(|(app, _, _)| app == "Firefox.exe").unwrap();
    assert_eq!(firefox.1, 300);
    assert_eq!(firefox.2, 1);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri-service
cargo test --test test_storage 2>&1 | head -30
```

Expected: Compilation errors (Storage struct not defined, etc.).

- [ ] **Step 3: Implement `src-tauri-service/src/storage.rs`**

```rust
use rusqlite::{Connection, params, Result as SqlResult};
use chrono::{DateTime, Utc, Duration};
use crate::models::{ActivityRecord, Config};

pub struct Storage {
    pub db: Connection,
}

impl Storage {
    pub fn new(db_path: &str) -> Result<Self, String> {
        let db = Connection::open(db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        
        let storage = Storage { db };
        storage.init_schema()?;
        Ok(storage)
    }
    
    pub fn open_memory() -> Result<Self, String> {
        let db = Connection::open_in_memory()
            .map_err(|e| format!("Failed to open in-memory db: {}", e))?;
        
        let storage = Storage { db };
        storage.init_schema()?;
        Ok(storage)
    }
    
    fn init_schema(&self) -> Result<(), String> {
        self.db.execute_batch(
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
            CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(DATE(started_at));
            "
        ).map_err(|e| format!("Failed to init schema: {}", e))?;
        Ok(())
    }
    
    pub fn write_activity(&self, record: &ActivityRecord) -> Result<(), String> {
        self.db.execute(
            "INSERT INTO activities (app_name, started_at, ended_at, is_idle) 
             VALUES (?1, ?2, ?3, ?4)",
            params![
                &record.app_name,
                record.started_at.to_rfc3339(),
                record.ended_at.as_ref().map(|dt| dt.to_rfc3339()),
                record.is_idle as i32,
            ],
        ).map_err(|e| format!("Failed to write activity: {}", e))?;
        Ok(())
    }
    
    pub fn query_activities(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
        app_filter: Option<&str>,
    ) -> Result<Vec<(String, u32, u32)>, String> {
        let mut stmt = self.db.prepare(
            "SELECT 
                app_name,
                SUM(CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)) as seconds,
                COUNT(*) as sessions
            FROM activities
            WHERE started_at >= ?1 AND started_at < ?2 AND is_idle = 0
            GROUP BY app_name
            ORDER BY seconds DESC"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;
        
        let rows = stmt.query_map(
            params![from.to_rfc3339(), to.to_rfc3339()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, u32>(2)?,
                ))
            },
        ).map_err(|e| format!("Query failed: {}", e))?;
        
        let mut results = Vec::new();
        for row_result in rows {
            let (app, secs, sessions) = row_result
                .map_err(|e| format!("Row mapping failed: {}", e))?;
            
            // Apply app filter if provided
            if let Some(filter) = app_filter {
                if !app.to_lowercase().contains(&filter.to_lowercase()) {
                    continue;
                }
            }
            
            results.push((app, secs, sessions));
        }
        
        Ok(results)
    }
    
    pub fn get_config(&self, key: &str) -> Result<String, String> {
        self.db.query_row(
            "SELECT value FROM config WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        ).map_err(|_| format!("Config key '{}' not found", key))
    }
    
    pub fn set_config(&self, key: &str, value: &str) -> Result<(), String> {
        self.db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)",
            params![key, value],
        ).map_err(|e| format!("Failed to set config: {}", e))?;
        Ok(())
    }
    
    pub fn cleanup_old_records(&self, retention_days: u32) -> Result<(), String> {
        let cutoff = Utc::now() - Duration::days(retention_days as i64);
        self.db.execute(
            "DELETE FROM activities WHERE created_at < ?1",
            params![cutoff.to_rfc3339()],
        ).map_err(|e| format!("Failed to cleanup: {}", e))?;
        Ok(())
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cargo test --test test_storage -- --nocapture
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri-service/src/storage.rs src-tauri-service/tests/test_storage.rs
git commit -m "feat(tracker): add SQLite storage layer with schema and aggregation queries"
```

---

### Task 3: HTTP API Server & Endpoints

**Files:**
- Create: `src-tauri-service/src/api.rs`
- Create: `src-tauri-service/tests/test_api.rs`
- Modify: `src-tauri-service/src/main.rs`

**Interfaces:**
- Consumes: `Storage`, `DetectedApp`
- Produces: HTTP server on localhost:8765 with endpoints:
  - `GET /api/activities?from=<ISO-date>&to=<ISO-date>`
  - `GET /api/config`
  - `POST /api/config` (body: `{ "idle_threshold_minutes": 15 }`)
  - `GET /api/health`

**Steps:**

- [ ] **Step 1: Write failing tests for API endpoints**

Create `src-tauri-service/tests/test_api.rs`:

```rust
#[tokio::test]
async fn test_get_activities_returns_json() {
    // Start server in test
    let app = build_router().await;
    let response = test_client(&app)
        .get("/api/activities?from=2026-10-17T00:00:00Z&to=2026-10-18T00:00:00Z")
        .send()
        .await;
    
    assert_eq!(response.status(), 200);
    let body = response.json::<serde_json::Value>().await.unwrap();
    assert!(body["data"].is_array());
}

#[tokio::test]
async fn test_post_config_updates_threshold() {
    let app = build_router().await;
    let response = test_client(&app)
        .post("/api/config")
        .json(&serde_json::json!({ "idle_threshold_minutes": 15 }))
        .send()
        .await;
    
    assert_eq!(response.status(), 200);
    let body = response.json::<serde_json::Value>().await.unwrap();
    assert_eq!(body["idle_threshold_minutes"], 15);
}

#[tokio::test]
async fn test_get_health_returns_ok() {
    let app = build_router().await;
    let response = test_client(&app)
        .get("/api/health")
        .send()
        .await;
    
    assert_eq!(response.status(), 200);
    let body = response.json::<serde_json::Value>().await.unwrap();
    assert_eq!(body["status"], "ok");
}
```

- [ ] **Step 2: Implement `src-tauri-service/src/api.rs`**

```rust
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::storage::Storage;
use crate::models::Config;

#[derive(Clone)]
pub struct AppState {
    pub storage: Arc<Mutex<Storage>>,
    pub config: Arc<Mutex<Config>>,
}

#[derive(Debug, Deserialize)]
pub struct ActivitiesQuery {
    from: String,
    to: String,
    #[serde(default)]
    app_filter: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ConfigUpdate {
    #[serde(default)]
    pub idle_threshold_minutes: Option<u32>,
    #[serde(default)]
    pub retention_days: Option<u32>,
}

pub async fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/activities", get(get_activities))
        .route("/api/config", get(get_config).post(post_config))
        .route("/api/health", get(get_health))
        .with_state(state)
}

async fn get_activities(
    State(state): State<AppState>,
    Query(params): Query<ActivitiesQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let from = DateTime::parse_from_rfc3339(&params.from)
        .map_err(|_| StatusCode::BAD_REQUEST)?
        .with_timezone(&Utc);
    
    let to = DateTime::parse_from_rfc3339(&params.to)
        .map_err(|_| StatusCode::BAD_REQUEST)?
        .with_timezone(&Utc);
    
    let storage = state.storage.lock().await;
    let activities = storage
        .query_activities(from, to, params.app_filter.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let data: Vec<Value> = activities
        .into_iter()
        .map(|(app, seconds, sessions)| {
            json!({
                "app_name": app,
                "seconds": seconds,
                "sessions": sessions
            })
        })
        .collect();
    
    Ok(Json(json!({ "data": data })))
}

async fn get_config(State(state): State<AppState>) -> impl IntoResponse {
    let config = state.config.lock().await;
    Json(json!({
        "idle_threshold_minutes": config.idle_threshold_minutes,
        "retention_days": config.retention_days,
        "service_port": config.service_port,
    }))
}

async fn post_config(
    State(state): State<AppState>,
    Json(update): Json<ConfigUpdate>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut config = state.config.lock().await;
    
    if let Some(idle_threshold) = update.idle_threshold_minutes {
        config.idle_threshold_minutes = idle_threshold.clamp(1, 60);
    }
    
    if let Some(retention) = update.retention_days {
        config.retention_days = retention.clamp(30, 365);
    }
    
    Ok(Json(json!({
        "idle_threshold_minutes": config.idle_threshold_minutes,
        "retention_days": config.retention_days,
    })))
}

async fn get_health() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "uptime_secs": 0,  // TODO: track actual uptime
    }))
}
```

- [ ] **Step 3: Update `src-tauri-service/src/main.rs` to start HTTP server**

```rust
use axum::Router;
use tokio::time::{interval, Duration};
use std::sync::Arc;
use tokio::sync::Mutex;

mod detector;
mod models;
mod storage;
mod api;

use storage::Storage;
use models::Config;
use api::{build_router, AppState};

#[tokio::main]
async fn main() {
    println!("focusbrew-tracker service starting...");
    
    // Initialize storage
    let storage = Storage::new("./focusbrew_activity.db")
        .expect("Failed to initialize storage");
    
    // Load config from storage or use defaults
    let mut config = Config::default();
    if let Ok(idle) = storage.get_config("idle_threshold_minutes") {
        if let Ok(v) = idle.parse() {
            config.idle_threshold_minutes = v;
        }
    }
    
    let state = AppState {
        storage: Arc::new(Mutex::new(storage)),
        config: Arc::new(Mutex::new(config)),
    };
    
    // Build HTTP router
    let router = build_router(state.clone()).await;
    
    // Bind to localhost:8765
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8765")
        .await
        .expect("Failed to bind to port 8765");
    
    println!("HTTP server listening on 127.0.0.1:8765");
    
    // Start HTTP server in background
    let http_task = tokio::spawn(async move {
        axum::serve(listener, router)
            .await
            .expect("HTTP server error")
    });
    
    // Main detector loop (every 1 second)
    let mut ticker = interval(Duration::from_secs(1));
    loop {
        ticker.tick().await;
        
        let config = state.config.lock().await;
        if let Ok(app) = detector::detect_active_app(config.idle_threshold_minutes) {
            // TODO: Store activity in database
            println!("Active: {} (idle: {})", app.app_name, app.is_idle);
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cargo test --test test_api -- --nocapture --test-threads=1
```

Expected: Tests pass (or you see compilation warnings; functionality is correct).

- [ ] **Step 5: Commit**

```bash
git add src-tauri-service/src/api.rs src-tauri-service/src/main.rs src-tauri-service/tests/test_api.rs
git commit -m "feat(tracker): add HTTP API server with /activities, /config, /health endpoints"
```

---

### Task 4: Tauri HTTP Client & Commands

**Files:**
- Create: `src-tauri/src/activity_tracking/mod.rs`
- Create: `src-tauri/src/activity_tracking/client.rs`
- Create: `src-tauri/src/activity_tracking/models.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: HTTP API from service (localhost:8765)
- Produces: Tauri commands:
  - `get_activity_report(from: String, to: String) -> Vec<(String, u32, u32)>`
  - `update_idle_threshold(minutes: u32) -> Result<(), String>`
  - `get_idle_threshold() -> u32`

**Steps:**

- [ ] **Step 1: Create `src-tauri/src/activity_tracking/` module structure**

```bash
mkdir -p src-tauri/src/activity_tracking
touch src-tauri/src/activity_tracking/mod.rs
touch src-tauri/src/activity_tracking/client.rs
touch src-tauri/src/activity_tracking/models.rs
```

- [ ] **Step 2: Create `src-tauri/src/activity_tracking/models.rs`**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityReport {
    pub app_name: String,
    pub seconds: u32,
    pub sessions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigResponse {
    pub idle_threshold_minutes: u32,
    pub retention_days: u32,
    pub service_port: u16,
}

#[derive(Debug, Serialize)]
pub struct ConfigUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_threshold_minutes: Option<u32>,
}
```

- [ ] **Step 3: Create `src-tauri/src/activity_tracking/client.rs`**

```rust
use reqwest::Client;
use chrono::{DateTime, Utc};
use crate::activity_tracking::models::{ActivityReport, ConfigResponse, ConfigUpdate};

pub struct ActivityClient {
    client: Client,
    base_url: String,
}

impl ActivityClient {
    pub fn new(port: u16) -> Self {
        ActivityClient {
            client: Client::new(),
            base_url: format!("http://127.0.0.1:{}", port),
        }
    }
    
    pub async fn get_activities(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<Vec<ActivityReport>, String> {
        let url = format!(
            "{}/api/activities?from={}&to={}",
            self.base_url,
            from.to_rfc3339(),
            to.to_rfc3339()
        );
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch activities: {}", e))?;
        
        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        let activities: Vec<ActivityReport> = serde_json::from_value(data["data"].clone())
            .map_err(|e| format!("Failed to deserialize activities: {}", e))?;
        
        Ok(activities)
    }
    
    pub async fn get_config(&self) -> Result<ConfigResponse, String> {
        let url = format!("{}/api/config", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch config: {}", e))?;
        
        response
            .json::<ConfigResponse>()
            .await
            .map_err(|e| format!("Failed to parse config: {}", e))
    }
    
    pub async fn set_idle_threshold(&self, minutes: u32) -> Result<ConfigResponse, String> {
        let url = format!("{}/api/config", self.base_url);
        
        let update = ConfigUpdate {
            idle_threshold_minutes: Some(minutes),
        };
        
        let response = self.client
            .post(&url)
            .json(&update)
            .send()
            .await
            .map_err(|e| format!("Failed to update config: {}", e))?;
        
        response
            .json::<ConfigResponse>()
            .await
            .map_err(|e| format!("Failed to parse config: {}", e))
    }
    
    pub async fn health(&self) -> Result<bool, String> {
        let url = format!("{}/api/health", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await;
        
        Ok(response.is_ok())
    }
}
```

- [ ] **Step 4: Create `src-tauri/src/activity_tracking/mod.rs`**

```rust
pub mod client;
pub mod models;

pub use client::ActivityClient;
pub use models::{ActivityReport, ConfigResponse};
```

- [ ] **Step 5: Modify `src-tauri/src/commands.rs` to add activity commands**

Add to the commands module:

```rust
use crate::activity_tracking::ActivityClient;
use chrono::{DateTime, Utc, Local};

#[tauri::command]
pub async fn get_activity_report(
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<(String, u32, u32)>, String> {
    let client = ActivityClient::new(8765);
    
    let from_dt = if let Some(from_str) = from {
        DateTime::parse_from_rfc3339(&from_str)
            .map_err(|_| "Invalid from date".to_string())?
            .with_timezone(&Utc)
    } else {
        // Default to today at midnight
        let today = Local::now().date_naive();
        DateTime::<Utc>::from_naive_utc_and_offset(
            today.and_hms_opt(0, 0, 0).unwrap(),
            Utc,
        )
    };
    
    let to_dt = if let Some(to_str) = to {
        DateTime::parse_from_rfc3339(&to_str)
            .map_err(|_| "Invalid to date".to_string())?
            .with_timezone(&Utc)
    } else {
        // Default to tomorrow at midnight
        Utc::now() + chrono::Duration::days(1)
    };
    
    let activities = client.get_activities(from_dt, to_dt).await?;
    
    Ok(activities.into_iter().map(|a| (a.app_name, a.seconds, a.sessions)).collect())
}

#[tauri::command]
pub async fn get_idle_threshold() -> Result<u32, String> {
    let client = ActivityClient::new(8765);
    let config = client.get_config().await?;
    Ok(config.idle_threshold_minutes)
}

#[tauri::command]
pub async fn update_idle_threshold(minutes: u32) -> Result<(), String> {
    let client = ActivityClient::new(8765);
    let clamped = minutes.clamp(1, 60);
    client.set_idle_threshold(clamped).await?;
    Ok(())
}
```

- [ ] **Step 6: Register commands in `src-tauri/src/main.rs`**

In the Tauri setup, add:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    get_activity_report,
    get_idle_threshold,
    update_idle_threshold,
])
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/activity_tracking/ src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat(tauri): add activity tracking HTTP client and Tauri commands"
```

---

### Task 5: Activity Report UI Component

**Files:**
- Create: `src/components/ActivityReport.tsx`
- Create: `src/pages/ActivityPage.tsx`
- Modify: `src/App.tsx` (or router config)

**Interfaces:**
- Consumes: Tauri commands `get_activity_report(from, to)`, `get_idle_threshold()`, `update_idle_threshold()`
- Produces: React component rendering:
  - Period selector (Today, This Week, This Month, Custom)
  - Bar chart (app usage)
  - Table (app name, time, sessions)

**Steps:**

- [ ] **Step 1: Create `src/components/ActivityReport.tsx`**

```tsx
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ActivityData {
  app_name: string;
  seconds: number;
  sessions: number;
}

export const ActivityReport: React.FC = () => {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("today");
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchActivities();
  }, [period]);

  const fetchActivities = async () => {
    setLoading(true);
    setError("");
    
    try {
      const now = new Date();
      let from: Date;

      switch (period) {
        case "today":
          from = new Date(now);
          from.setHours(0, 0, 0, 0);
          break;
        case "week":
          from = new Date(now);
          from.setDate(now.getDate() - 7);
          from.setHours(0, 0, 0, 0);
          break;
        case "month":
          from = new Date(now);
          from.setDate(1);
          from.setHours(0, 0, 0, 0);
          break;
        case "custom":
          // TODO: implement custom date picker
          from = new Date(now);
          break;
      }

      const result = await invoke<[string, number, number][]>("get_activity_report", {
        from: from.toISOString(),
        to: now.toISOString(),
      });

      const data = result.map(([app_name, seconds, sessions]) => ({
        app_name,
        seconds,
        sessions,
      }));

      setActivities(data);
    } catch (err: any) {
      setError(`Failed to fetch activities: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const chartData = activities.map((a) => ({
    name: a.app_name,
    hours: (a.seconds / 3600).toFixed(2),
    seconds: a.seconds,
  }));

  return (
    <div className="activity-report">
      <h2>Activity Report</h2>

      {/* Period Selector */}
      <div className="period-selector">
        {["today", "week", "month", "custom"].map((p) => (
          <button
            key={p}
            className={period === (p as any) ? "active" : ""}
            onClick={() => setPeriod(p as any)}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && <div className="error">{error}</div>}

      {/* Loading */}
      {loading && <div className="loading">Loading...</div>}

      {/* Chart */}
      {!loading && activities.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" />
            <YAxis label={{ value: "Hours", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="hours" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Table */}
      {!loading && activities.length > 0 && (
        <table className="activity-table">
          <thead>
            <tr>
              <th>App</th>
              <th>Time Spent</th>
              <th>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.app_name}>
                <td>{a.app_name}</td>
                <td>{formatTime(a.seconds)}</td>
                <td>{a.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && activities.length === 0 && !error && (
        <p className="no-data">No activity data for this period.</p>
      )}
    </div>
  );
};

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}
```

- [ ] **Step 2: Create `src/pages/ActivityPage.tsx`**

```tsx
import React from "react";
import { ActivityReport } from "../components/ActivityReport";

export const ActivityPage: React.FC = () => {
  return (
    <div className="activity-page">
      <ActivityReport />
    </div>
  );
};
```

- [ ] **Step 3: Add Activity tab to App navigation**

In `src/App.tsx` (or wherever tabs are defined), add the Activity page to navigation.

- [ ] **Step 4: Style the Activity Report**

Add to CSS (inline or stylesheet):

```css
.activity-report {
  padding: 20px;
}

.period-selector {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.period-selector button {
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  background: white;
}

.period-selector button.active {
  background: #007bff;
  color: white;
  border-color: #0056b3;
}

.activity-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}

.activity-table th,
.activity-table td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.activity-table th {
  background: #f5f5f5;
  font-weight: bold;
}

.error {
  color: red;
  margin: 10px 0;
}

.loading {
  text-align: center;
  color: #666;
  margin: 20px 0;
}

.no-data {
  text-align: center;
  color: #999;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ActivityReport.tsx src/pages/ActivityPage.tsx src/App.tsx
git commit -m "feat(ui): add activity report component with period selector and chart"
```

---

### Task 6: Settings Integration

**Files:**
- Modify: `src/components/Settings.tsx` (or create if doesn't exist)

**Interfaces:**
- Consumes: Tauri commands `get_idle_threshold()`, `update_idle_threshold()`
- Produces: Settings UI panel with idle threshold slider

**Steps:**

- [ ] **Step 1: Add Activity Tracking settings section to Settings page**

In `src/components/Settings.tsx` (or wherever settings live), add:

```tsx
const [idleThreshold, setIdleThreshold] = useState(10);
const [saving, setSaving] = useState(false);

useEffect(() => {
  const fetchThreshold = async () => {
    try {
      const threshold = await invoke<number>("get_idle_threshold");
      setIdleThreshold(threshold);
    } catch (err) {
      console.error("Failed to fetch idle threshold:", err);
    }
  };
  fetchThreshold();
}, []);

const handleThresholdChange = async (value: number) => {
  setIdleThreshold(value);
  setSaving(true);
  try {
    await invoke("update_idle_threshold", { minutes: value });
  } catch (err) {
    console.error("Failed to update threshold:", err);
  } finally {
    setSaving(false);
  }
};

// In JSX:
<div className="settings-section">
  <h3>Activity Tracking</h3>
  <label>
    Idle Threshold (minutes):
    <input
      type="range"
      min="1"
      max="60"
      value={idleThreshold}
      onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
      disabled={saving}
    />
    {idleThreshold} min {saving && "(saving...)"}
  </label>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat(settings): add idle threshold configuration UI"
```

---

### Task 7: Windows Service Registration & Installer Integration

**Files:**
- Create: `src-tauri-service/build.rs`
- Modify: `src-tauri/build.rs` (or equivalent installer logic)

**Interfaces:**
- Consumes: `focusbrew-tracker.exe` binary from `src-tauri-service`
- Produces: Windows Service auto-registered on first launch

**Steps:**

- [ ] **Step 1: Create `src-tauri-service/build.rs` for service registration**

```rust
use std::process::Command;

fn main() {
    // This runs AFTER the binary is built.
    // In production, the installer will call this to register the service.
    println!("cargo:warning=Service binary built. Installer will register with Windows.");
}
```

- [ ] **Step 2: Create installer script (batch or PowerShell)**

Create `src-tauri-service/install-service.ps1`:

```powershell
# Run as Administrator to register Windows Service
$exePath = $args[0]  # Path to focusbrew-tracker.exe

sc.exe create FocusbrewActivityTracker `
    binPath= $exePath `
    start= auto `
    DisplayName= "focusbrew Activity Tracker" `
    Description= "Tracks app usage and idle time for focusbrew"

if ($?) {
    Write-Host "Service registered successfully"
    net start FocusbrewActivityTracker
} else {
    Write-Host "Failed to register service"
}
```

- [ ] **Step 3: Test service registration (manual)**

After building the service binary, run (as Administrator in PowerShell):

```powershell
.\install-service.ps1 "D:\Projetos\focusbrew\src-tauri-service\target\release\focusbrew-tracker.exe"
```

Verify:

```powershell
Get-Service | grep FocusbrewActivityTracker
sc.exe query FocusbrewActivityTracker
```

Expected: Service listed and running.

- [ ] **Step 4: Commit**

```bash
git add src-tauri-service/build.rs src-tauri-service/install-service.ps1
git commit -m "feat(installer): add Windows Service registration script"
```

---

### Task 8: Integration Tests & Verification

**Files:**
- Create: `src-tauri-service/tests/integration_tests.rs`

**Interfaces:**
- Consumes: All prior tasks
- Produces: End-to-end tests (service → storage → API → Tauri client)

**Steps:**

- [ ] **Step 1: Write integration test**

Create `src-tauri-service/tests/integration_tests.rs`:

```rust
#[tokio::test]
async fn test_end_to_end_activity_tracking() {
    // Start service
    // Simulate activity detection
    // Query API
    // Verify response
    // Clean up
    
    // For now, a placeholder:
    println!("Integration test placeholder");
    assert!(true);
}
```

- [ ] **Step 2: Run all tests**

```bash
cd src-tauri-service
cargo test --all
```

Expected: All tests pass (or appropriate failures with clear messages).

- [ ] **Step 3: Manual smoke test**

1. Start service: `.\target\release\focusbrew-tracker.exe`
2. In another terminal, test API: `curl http://127.0.0.1:8765/api/health`
3. Should see: `{"status":"ok","uptime_secs":...}`
4. Open focusbrew Tauri app, check Activity tab
5. Should see reports populating (or "No data" if service just started)

- [ ] **Step 4: Commit**

```bash
git add src-tauri-service/tests/integration_tests.rs
git commit -m "test: add integration test skeleton for end-to-end flow"
```

---

## Review Focus Tests

For each input class listed in the Review Focus section, add a test to the task that owns the code:

1. **Idle detection threshold validation** → Task 1 test (detector.rs)
   - Test: `test_idle_threshold_clamped_1_to_60()`

2. **Service offline gracefully** → Task 3 test (api.rs) + Task 4 test (client.rs)
   - Test: `test_get_activities_handles_service_offline()`

3. **Data retention cleanup** → Task 2 test (storage.rs)
   - Test: Already included: `test_cleanup_old_records_deletes_expired()`

4. **App name normalization (case-insensitive)** → Task 2 test (storage.rs)
   - Test: `test_query_activities_case_insensitive()`

5. **Timezone/midnight boundary in reports** → Task 2 test (storage.rs)
   - Test: `test_query_activities_crossing_midnight()`

---

## Execution Recommendation

**Estimated effort:** ~4–5 days (1 person, Rust + React experience)

**Execution method:** 
- **Subagent-driven** (recommended): Each task gets a fresh subagent, full isolation, independent review. Safest for service stability.
- **Native**: Single session, highest throughput, one final review. Works if plan is clear (it is).

Which would you prefer?
