# Activity Tracking & Time Reports — Design Document

**Date:** October 17, 2026  
**Author:** Sthevan Santos  
**Status:** Design Review  

---

## Intent & Why Now

focusbrew currently tracks **manual tasks with timers** (pomodoro-style). The new Activity Tracking feature adds **automatic detection** of what you're actually doing on your computer, building a historical record of app usage and idle time, then generating reports to show where your time went.

This answers: _"Beyond the tasks I planned, where did I actually spend time today? Which apps consumed the most hours?"_

## Goals, Non-Goals, Anti-Goals

### Goals
1. **Automatic activity detection** — know which app is active without manual input
2. **Idle detection** — distinguish "working" from "user stepped away" (10 min default)
3. **Time reports by app** — see total time spent in each app (today, this week, this month, custom range)
4. **Local data storage** — all data persists offline in SQLite on the user's machine
5. **Works continuously** — service runs 24/7 in background, survives app restarts and reboots
6. **Minimal privacy footprint** — captures only app name + timestamps, never keystroke content or window text

### Non-Goals (Explicitly Deferred)
- User-defined app categories (grouping VSCode + Slack as "work") — future feature
- Timeline view or heatmaps — first release is summary totals only
- Cloud sync or multi-device support — local-first, can add later
- Keyboard/mouse logging for productivity analysis — explicitly rejected
- Real-time notifications when switching apps — not in scope

### Anti-Goals (What Would Make This Fail)
- Capturing keystroke content, URLs, window titles — breaks privacy and trust
- Using keyboard/mouse hooks for idle detection — causes system lag, defeats the purpose
- Defaulting to "all time" reports — unbounded queries are slow; must default to "today"
- Storing data forever — needs retention policy (90 days default) to avoid disk bloat
- Blocking the Tauri app on service startup — app must launch even if service is unreachable

---

## Constraints

- **Platform:** Windows 10+ (uses WinAPI GetForegroundWindow, GetLastInputInfo)
- **Language:** Rust (matches focusbrew backend + service)
- **Database:** SQLite (local, no external dependencies)
- **Architecture:** Separate Windows Service (collection) + Tauri UI (display)
- **IPC:** HTTP on localhost (port configurable, default 8765)
- **Data retention:** 90 days default (user-configurable: 30, 90, 180 days)
- **Idle threshold:** 10 minutes default (user-configurable in UI)

---

## User-Facing Design

### Report View
**Location:** New tab in focusbrew UI called "Activity" or "Time Reports"

**Layout:**
1. **Period Selector** (top bar)
   - Button tabs: "Today" | "This Week" | "This Month" | "Custom Range"
   - Default: "Today"
   - Custom range opens date picker (from / to)

2. **Bar Chart** (visual)
   - Horizontal bars, one per app
   - X-axis: hours or minutes
   - Apps ranked by time (descending)
   - Colors consistent across apps

3. **Table** (below chart, exact numbers)
   - Columns: App Name | Time Spent | # Sessions
   - Sortable by any column
   - Show only apps with > 5 min usage (toggle to "show all")

4. **Summary** (top-right corner)
   - Total active time (e.g., "6h 42m today")
   - Total idle time (e.g., "2h 18m idle")
   - % active vs idle

### Settings Page
**Location:** Existing Settings tab, new section "Activity Tracking"

**Configurable:**
- **Idle threshold** (slider: 1 min to 60 min, default 10 min)
- **Data retention** (dropdown: 30 / 90 / 180 days, default 90)
- **Service status** (read-only: "Running" / "Stopped"; button to restart)
- **Clear all data** (button, with confirmation)
- **Export data** (button to export JSON or CSV of last 30 days)

---

## Technical Architecture

### Layers

```
┌─────────────────────────────────────┐
│     focusbrew Tauri (UI Layer)      │
│  - Report view (chart + table)      │
│  - Settings (idle threshold, etc.)  │
│  - HTTP calls to Service API        │
└──────────────┬──────────────────────┘
               │ HTTP localhost:8765
               ↓
┌─────────────────────────────────────┐
│  focusbrew-tracker Service (Rust)   │
│  - Windows Service (runs 24/7)      │
│  - GetForegroundWindow every 1 sec  │
│  - GetLastInputInfo every 1 sec     │
│  - SQLite storage                   │
│  - HTTP REST API                    │
└─────────────────────────────────────┘
```

### Data Collection (Service)

**Tick frequency:** Every 1 second

**Per tick:**
1. Call `GetForegroundWindow()` → get active app name
2. Call `GetLastInputInfo()` → check idle status (compare tick count)
3. If app or idle state changed, log a record
4. If app/idle state same, skip logging (avoid bloat)

**Data recorded (one record = one app change OR idle transition):**
```rust
struct ActivityRecord {
    app_name: String,        // e.g., "VSCode.exe", "chrome.exe"
    started_at: DateTime,
    ended_at: Option<DateTime>,
    is_idle: bool,           // true = user was idle during this period
    created_at: DateTime,
}
```

**Processing:**
- Persist to SQLite table `activities`
- Every tick, check for records older than retention window (e.g., 90 days) → delete
- No real-time cleanup, runs lazily on write to avoid blocking

### Service Startup

**Windows Service Registration:**
- Installer (part of Tauri build) registers service with Windows at first app launch
- Service name: `FocusbrewActivityTracker`
- Service mode: `LocalService` (no user login required)
- Startup type: `Auto` (boots with Windows)
- Executable: `src-tauri-service/target/release/focusbrew-tracker.exe`

**Fallback:**
- If service does not start, Tauri app still launches
- UI shows warning: "Activity Tracking service is offline. Check Settings to restart."
- User can restart from Settings page (button calls `sc start FocusbrewActivityTracker`)

### HTTP API (Service)

**Base URL:** `http://localhost:8765`

**Endpoints:**

```
GET /api/activities?from=<ISO-date>&to=<ISO-date>&app_filter=<regex>
  Response:
  {
    "data": [
      { "app_name": "VSCode.exe", "seconds": 14400, "sessions": 3 },
      { "app_name": "Firefox.exe", "seconds": 7200, "sessions": 2 }
    ]
  }

GET /api/config
  Response:
  {
    "idle_threshold_minutes": 10,
    "retention_days": 90,
    "service_port": 8765
  }

POST /api/config
  Body:
  { "idle_threshold_minutes": 15 }
  Response: { "success": true, "config": {...} }

GET /api/health
  Response: { "status": "ok", "uptime_secs": 123456 }
```

### SQLite Schema

```sql
-- Core activity log
CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_name TEXT NOT NULL,          -- e.g., "VSCode.exe"
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  is_idle INTEGER DEFAULT 0,       -- 0 = active, 1 = idle
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Configuration (app settings)
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Example config rows:
-- ("idle_threshold_minutes", "10")
-- ("retention_days", "90")
```

**Indexes:**
```sql
CREATE INDEX idx_activities_started ON activities(started_at);
CREATE INDEX idx_activities_app ON activities(app_name);
CREATE INDEX idx_activities_date ON activities(DATE(started_at));
```

---

## Report Aggregation

### Query Pattern: Time per App (Today)

```sql
SELECT 
  app_name,
  SUM(CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)) as seconds,
  COUNT(*) as sessions
FROM activities
WHERE DATE(started_at) = DATE('now')
  AND is_idle = 0
GROUP BY app_name
ORDER BY seconds DESC;
```

**Result:** One row per app with total seconds + session count.

**For custom ranges:** Replace `DATE(started_at) = DATE('now')` with `started_at >= ? AND started_at < ?` (parameterized).

---

## Privacy & Security

### Data Captured
- App name (process name from handle)
- Timestamps (when active)
- Idle vs active state

### Data NOT Captured (Explicitly Rejected)
- Keystroke content
- Window titles or URLs
- Clipboard content
- Any user input beyond "was there activity"

### Storage
- Stored locally on user's machine (SQLite file in `%APPDATA%/focusbrew/`)
- No cloud transmission by default
- User can manually export (future: UI button for JSON/CSV export)
- User can delete all data (Settings button)

---

## User Workflow

### First Time
1. User installs focusbrew (with the new version)
2. Installer registers `FocusbrewActivityTracker` service
3. Service starts automatically
4. User opens focusbrew Tauri app
5. New "Activity" tab is available
6. Reports start populating as user works

### Ongoing
1. Service runs invisibly in background (24/7)
2. User clicks "Activity" tab to see reports
3. Selects period (Today, This Week, etc.)
4. Sees bar chart + table of app usage
5. Can adjust idle threshold in Settings if needed

### Configuration
1. User opens Settings → "Activity Tracking" section
2. Slider for idle threshold (e.g., change from 10 to 5 minutes)
3. Dropdown for retention (e.g., keep data for 180 days)
4. Button to clear all historical data
5. Service status shown; can restart if needed

---

## Implementation Phases

### Phase 1: MVP (Weeks 1–2)
- Windows Service skeleton + GetForegroundWindow + GetLastInputInfo
- SQLite schema + persistence
- HTTP API (read activities, config endpoints)
- Tauri UI: Report view (Today default, period selector)
- Basic bar chart + table
- Settings page (idle threshold, service restart)
- Installer integration (auto-register service)

### Phase 2: Polish & Stability (Week 3)
- Error handling (service offline, disk full, etc.)
- Data cleanup (retention policy)
- Tests (service endpoints, aggregation queries)
- Installer refinement (clean uninstall, upgrade path)

### Phase 3: Future (Not in MVP)
- User-defined app categories (group apps into "work", "social", etc.)
- Timeline heatmap or detailed breakdown
- Cloud sync (optional, Supabase)
- Mobile companion (read-only view of reports)

---

## Success Criteria

✓ Service runs 24/7 without consuming > 1% CPU  
✓ SQLite queries (aggregations) respond in < 500ms  
✓ Tauri UI opens and loads reports in < 2 seconds  
✓ Idle detection correctly classifies user away vs working (validated via manual observation)  
✓ Reports show correct app names and total times (spot-check against actual work)  
✓ Service survives app restart and reboot  
✓ User can change idle threshold and see effect immediately  
✓ Data retention policy runs (delete records > 90 days on startup)  

---

## Questions Left to the Builder

None — this design is complete. Builders follow the implementation plan (`docs/superpowers/plans/2026-10-17-activity-tracking-implementation.md`).
