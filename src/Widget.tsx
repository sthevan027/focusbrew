import { useEffect, useState } from "react";
import type { StateSnapshot, Task } from "./lib/types";
import {
  addTask,
  getAccentColor,
  getState,
  onStateChanged,
  openMainWindow,
  setWidgetExpanded,
  startCoffeeBreak,
  stopTimer,
  toggleFocusSession,
  togglePauseTimer,
  toggleTask,
} from "./lib/tauri";
import { buildHeatmap, computeStreak, intensityClass } from "./lib/heatmap";
import "./Widget.css";

interface Glyph {
  symbol: string;
  className: string;
}

function glyphFor(state: StateSnapshot): Glyph {
  if (state.timer.phase === "break") return { symbol: "☕", className: "glyph-coffee" };
  if (state.timer.paused) return { symbol: "⏸", className: "glyph-paused" };
  // Same split as the tray icon (lib.rs `icon_for`): focus-locked and
  // merely-detected-working are different states, not one blue blob.
  if (state.focus_mode) return { symbol: "</>", className: "glyph-focus" };
  if (state.activity === "working") return { symbol: "</>", className: "glyph-working" };
  return { symbol: "●", className: "glyph-idle" };
}

function statusLabel(state: StateSnapshot): string {
  if (state.timer.phase === "break") return "Pausa café";
  if (state.timer.paused) return "Pausado";
  if (state.focus_mode) return "Foco";
  if (state.activity === "working") return "Trabalhando";
  return "Ocioso";
}

function formatRemaining(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

const FALLBACK_RING_COLOR = "#d99a4e";

function phaseTotalSecs(state: StateSnapshot): number {
  if (state.timer.phase === "focus") return state.config.timer.focus_minutes * 60;
  if (state.timer.phase === "break") return state.config.timer.break_minutes * 60;
  return 0;
}

// Fraction of the current phase already elapsed (0..1), driving the ring.
function progressFor(state: StateSnapshot): number {
  const total = phaseTotalSecs(state);
  if (total <= 0) return 0;
  const elapsed = total - state.timer.remaining_secs;
  return Math.min(1, Math.max(0, elapsed / total));
}

export default function Widget() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [accentColor, setAccentColor] = useState<string | null>(null);

  useEffect(() => {
    // Scoped to this window only (not CSS) so it can never leak into the
    // main dashboard window, which shares the same bundled stylesheet.
    document.documentElement.style.background = "transparent";
    document.documentElement.style.overflow = "hidden";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    getState().then(setState);
    getAccentColor().then(setAccentColor).catch(() => setAccentColor(null));
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    setWidgetExpanded(next);
  };

  if (!state) return null;

  const glyph = glyphFor(state);
  const label = statusLabel(state);
  const timerActive = state.timer.phase !== "off";
  const currentTask = state.tasks.find((t) => !t.done)?.title;
  const ringColor = state.config.ring_color ?? accentColor ?? FALLBACK_RING_COLOR;
  const progress = progressFor(state);
  const ringStyle = timerActive
    ? ({ "--progress": progress, "--ring-color": ringColor } as React.CSSProperties)
    : undefined;

  const openPanel = () => {
    setExpanded(false);
    setWidgetExpanded(false);
    openMainWindow();
  };

  if (!expanded) {
    return (
      <div
        className={`widget-pill ${timerActive ? "widget-ring" : ""}`}
        style={ringStyle}
        onClick={toggleExpanded}
      >
        <span className={`widget-glyph ${glyph.className}`}>{glyph.symbol}</span>
        <span className="widget-time">{timerActive ? formatRemaining(state.timer.remaining_secs) : label}</span>
        {timerActive && currentTask && <span className="widget-task-hint">{currentTask}</span>}
        <span className="widget-chevron">▾</span>
      </div>
    );
  }

  return (
    <div className={`widget-panel ${timerActive ? "widget-ring" : ""}`} style={ringStyle}>
      <div className="widget-panel-header">
        <span className={`widget-glyph ${glyph.className}`}>{glyph.symbol}</span>
        <span className="widget-text">{label}</span>
        <span className="widget-time widget-time-inline">
          {timerActive ? formatRemaining(state.timer.remaining_secs) : "--:--"}
        </span>
        <button className="widget-collapse" onClick={toggleExpanded} aria-label="Minimizar">
          ▴
        </button>
      </div>

      <div className="widget-actions">
        <button onClick={() => (state.timer.phase === "off" ? toggleFocusSession() : stopTimer())}>
          {state.timer.phase === "off" ? "Iniciar foco" : "Parar"}
        </button>
        {state.timer.phase !== "off" && (
          <button onClick={() => togglePauseTimer()}>{state.timer.paused ? "Retomar" : "Pausar"}</button>
        )}
        <button onClick={() => startCoffeeBreak()} disabled={state.timer.phase === "break"}>
          Pausa café ☕
        </button>
      </div>

      <div className="widget-columns">
        <TodoColumn tasks={state.tasks} />
        <ActivityColumn
          days={Object.keys(state.github_days).length > 0 ? state.github_days : state.focus_days}
        />
      </div>

      <button className="widget-open" onClick={openPanel}>
        Abrir painel
      </button>
    </div>
  );
}

function TodoColumn({ tasks }: { tasks: Task[] }) {
  const [draft, setDraft] = useState("");
  const pending = tasks.filter((t) => !t.done).slice(0, 5);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    addTask(draft.trim());
    setDraft("");
  };

  return (
    <div className="widget-col widget-todo">
      <div className="widget-col-title">To Do</div>
      <ul className="widget-todo-list">
        {pending.length === 0 && <li className="widget-todo-empty">Sem tarefas</li>}
        {pending.map((t) => (
          <li key={t.id} className="widget-todo-item" onClick={() => toggleTask(t.id)}>
            <span className="widget-todo-dot" />
            <span className="widget-todo-text">{t.title}</span>
          </li>
        ))}
      </ul>
      <form className="widget-todo-add" onSubmit={submit}>
        <input value={draft} onChange={(e) => setDraft(e.currentTarget.value)} placeholder="Add a task" />
      </form>
    </div>
  );
}

function ActivityColumn({ days: dayCounts }: { days: Record<string, number> }) {
  const days = buildHeatmap(dayCounts, 9);
  const streak = computeStreak(dayCounts);

  return (
    <div className="widget-col widget-activity">
      <div className="widget-col-title">{streak > 0 ? `${streak} dia${streak > 1 ? "s" : ""} seguidos` : "Streak"}</div>
      <div className="widget-heatmap">
        {days.map((d) => (
          <span key={d.date} className={`widget-heat-cell ${intensityClass(d.count)}`} title={`${d.date}: ${d.count}`} />
        ))}
      </div>
    </div>
  );
}
