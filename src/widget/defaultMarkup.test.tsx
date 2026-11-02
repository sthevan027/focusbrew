import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppConfig, MediaView, StateSnapshot, Task, TimerView } from "../lib/types";
import Notch from "./Notch";
import MediaBox from "./MediaBox";

// Regressão do tema padrão: a marcação do que o widget mostra fechado não pode mudar
// quando nenhum tema é escolhido. Os snapshots são a linha de base; se mudarem, é regressão.

const config: AppConfig = {
  github_login: null,
  github_use_gh: false,
  default_minutes: 25,
  notify_on_finish: true,
  notch_style: "standard",
  progress_line: true,
  rgb_line: false,
  accent_color: "#0A84FF",
  notch_media_controls: false,
  widget_visible: true,
  widget_edge: "top",
  side_count_style: "stacked",
  monitor: null,
  notify_before_end_mins: 0,
  idle_reminder_mins: 0,
  daily_goal_mins: 0,
  shortcut_toggle: "",
  shortcut_panel: "",
  shortcut_note: "",
  note_placement: "overlay",
  launch_at_login: false,
  panel_autoclose_secs: 0,
  google_connected: false,
  activity_tracking_enabled: false,
};

const task: Task = {
  id: "t1",
  title: "Escrever testes",
  note: null,
  minutes: 25,
  done: false,
  created_at: "2026-11-02T10:00:00Z",
  source: "manual",
  spent_secs: 0,
  day: "2026-11-02",
  done_at: null,
  project: null,
  url: null,
  google_event_id: null,
  updated_at: 0,
};

const timer = (status: TimerView["status"]): TimerView => ({
  status,
  task_id: "t1",
  planned_secs: 1500,
  remaining_secs: 1450,
  deadline_ms: status === "running" ? 1_000_000 + 1450 * 1000 : 0,
});

const media: MediaView = {
  title: "Thriller (Instrumental)",
  artist: "Michael Jackson",
  cover_data_url: null,
  position_secs: 30,
  duration_secs: 300,
  status: "playing",
};

const snapshot = (over: Partial<StateSnapshot>): StateSnapshot =>
  ({
    tasks: [task],
    timer: timer("idle"),
    focus_secs_by_day: {},
    sessions: [],
    today: "2026-11-02",
    config,
    github_items: [],
    github_error: null,
    github_days: {},
    github_events: [],
    github_source: null,
    shortcut_warning: null,
    google_connected: false,
    google_error: null,
    google_last_sync_ms: 0,
    media: null,
    ...over,
  }) as StateSnapshot;

const NOW = 1_000_000;

describe("marcação do tema padrão (sem tema escolhido)", () => {
  it("parado não renderiza nada dentro da caixa", () => {
    expect(renderToStaticMarkup(<Notch state={snapshot({})} now={NOW} activeTab="task" />)).toBe("");
  });

  it("rodando no topo, estilo padrão: relógio, título e barra", () => {
    const html = renderToStaticMarkup(
      <Notch state={snapshot({ timer: timer("running") })} now={NOW} activeTab="task" />,
    );
    expect(html).toMatchSnapshot();
  });

  it("pausado no topo, estilo mínimo: só o contador", () => {
    const html = renderToStaticMarkup(
      <Notch state={snapshot({ timer: timer("paused"), config: { ...config, notch_style: "minimal" } })} now={NOW} activeTab="task" />,
    );
    expect(html).toMatchSnapshot();
  });

  it("na borda lateral, empilhado", () => {
    const html = renderToStaticMarkup(
      <Notch state={snapshot({ timer: timer("running"), config: { ...config, widget_edge: "left" } })} now={NOW} activeTab="task" />,
    );
    expect(html).toMatchSnapshot();
  });

  it("só música: caixa de mídia com capa, progresso e controles", () => {
    expect(renderToStaticMarkup(<MediaBox media={media} />)).toMatchSnapshot();
  });
});
