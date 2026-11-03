// Harness de captura (não vai para o build). Monta o Widget real sobre dados fictícios.
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { AppConfig, MediaView, StateSnapshot, Task, TimerView } from "../../src/lib/types";
import Widget from "../../src/Widget";

const params = new URLSearchParams(window.location.search);
const scenario = params.get("scenario") ?? "parked";
const theme = params.get("theme") ?? "default";

const NOW = Date.now();
const config: AppConfig = {
  github_login: null, github_use_gh: false, default_minutes: 25, notify_on_finish: true,
  notch_style: "standard", progress_line: true, rgb_line: false, accent_color: "#0A84FF",
  notch_media_controls: true, widget_visible: true, widget_edge: "top", side_count_style: "stacked",
  monitor: null, notify_before_end_mins: 0, idle_reminder_mins: 0, daily_goal_mins: 0,
  shortcut_toggle: "", shortcut_panel: "", shortcut_note: "", note_placement: "overlay",
  launch_at_login: false, panel_autoclose_secs: 0, google_connected: false,
  activity_tracking_enabled: false, theme, theme_sounds: true,
};

const task = (id: string, title: string, project: string | null, over: Partial<Task> = {}): Task => ({
  id, title, note: null, minutes: 25, done: false, created_at: "2026-11-02T10:00:00Z", source: "manual",
  spent_secs: 0, day: "2026-11-02", done_at: null, project, url: null, google_event_id: null, updated_at: 0, ...over,
});

const tasks: Task[] = [
  task("t1", "Escrever testes do carrinho", "loja"),
  task("t2", "Ajustar o layout do dashboard", "virex", { minutes: 40 }),
  task("t3", "Responder o cliente sobre o prazo", "virex", { minutes: 10 }),
  task("t4", "Revisar o PR do login", "exemplo/app", { done: true, done_at: NOW - 3600_000 }),
];

const timer = (status: TimerView["status"], remaining = 1450): TimerView => ({
  status, task_id: "t1", planned_secs: 1500, remaining_secs: remaining,
  deadline_ms: status === "running" ? NOW + remaining * 1000 : 0,
});

const media: MediaView = {
  title: "Thriller (Instrumental)", artist: "Michael Jackson", cover_data_url: null,
  position_secs: 92, duration_secs: 357, status: "playing",
};

const base: StateSnapshot = {
  tasks, timer: timer("idle"), focus_secs_by_day: { "2026-11-02": 6300, "2026-11-01": 2700 },
  sessions: [
    { task_id: "t4", title: "Refatorar a API de pedidos", project: "loja", day: "2026-11-02", ended_ms: NOW - 7200_000, secs: 3000 },
    { task_id: "t5", title: "Corrigir o filtro de datas", project: "relatorios", day: "2026-11-02", ended_ms: NOW - 9000_000, secs: 2580 },
    { task_id: "t6", title: "Escrever testes do carrinho", project: "loja", day: "2026-11-02", ended_ms: NOW - 1000_000, secs: 600 },
  ],
  today: "2026-11-02", config, github_items: [], github_error: null, github_days: {}, github_events: [],
  github_source: null, shortcut_warning: null, google_connected: false, google_error: null,
  google_last_sync_ms: 0, media: null,
};

const scenarios: Record<string, Partial<StateSnapshot>> = {
  running: { timer: timer("running") },
  paused: { timer: timer("paused") },
  minimal: { timer: timer("running"), config: { ...config, notch_style: "minimal" } },
  media: { media },
  "media-running": { timer: timer("running"), media },
  "side-left": { timer: timer("running"), config: { ...config, widget_edge: "left" } },
  parked: {},
  "panel-tasks": { timer: timer("running") },
  "panel-summary": { timer: timer("idle") },
  "panel-media": { media },
};

const snapshot: StateSnapshot = { ...base, ...(scenarios[scenario] ?? {}) };
const wantPanel = scenario.startsWith("panel-");
if (wantPanel) window.localStorage.setItem("focusbrew.panelTab", scenario.slice("panel-".length));

mockWindows("widget");
mockIPC((cmd) => {
  if (cmd === "get_state") return snapshot;
  if (cmd.startsWith("plugin:event|")) return 1;
  return null;
});

createRoot(document.getElementById("root") as HTMLElement).render(<Widget />);

if (wantPanel) {
  // The panel opens pinned on a click of the bare shape (as a user does).
  window.setTimeout(() => (document.querySelector(".hit") as HTMLElement | null)?.click(), 400);
}
