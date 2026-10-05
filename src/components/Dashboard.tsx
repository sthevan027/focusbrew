import type { StateSnapshot, TimerPhase } from "../lib/types";
import { startCoffeeBreak, stopTimer } from "../lib/tauri";
import { buildHeatmapWeeks, computeStreak, intensityClass, monthLabelsForWeeks } from "../lib/heatmap";
import { appBadge } from "../lib/appIcons";

type Tab = "dashboard" | "tasks" | "github" | "settings";

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// "1h 25min" / "45min" — coarser than the countdown clock, this is a
// summary duration, not something you watch tick.
function formatDuration(secs: number): string {
  const totalMin = Math.round(secs / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Fraction of the current phase already elapsed (0..1) — same formula the
// widget's ring uses, kept local since the two windows are separate views
// that may diverge later.
function phaseProgress(state: StateSnapshot): number {
  const total =
    state.timer.phase === "focus"
      ? state.config.timer.focus_minutes * 60
      : state.timer.phase === "break"
      ? state.config.timer.break_minutes * 60
      : 0;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (total - state.timer.remaining_secs) / total));
}

const STATUS_COPY: Record<string, { title: string; hint: string }> = {
  break: { title: "Pausa do café", hint: "Volta pro foco quando o café acabar." },
  focus: { title: "Modo foco ativo", hint: "Apps de distração bloqueados, notificações em silêncio." },
  working: { title: "Trabalhando", hint: "Detectei atividade — o foco liga sozinho se estiver configurado." },
  idle: { title: "Sem atividade", hint: "Detecção automática via processos monitorados (VS Code, Claude Code, Cursor...)." },
};

function StatusCup({ state }: { state: StateSnapshot }) {
  const phase: TimerPhase = state.timer.phase;
  const kind = phase === "break" ? "coffee" : state.focus_mode ? "focus" : state.activity;
  const copy = STATUS_COPY[phase === "break" ? "break" : state.focus_mode ? "focus" : state.activity] ?? STATUS_COPY.idle;
  const progress = phaseProgress(state);

  return (
    <div
      className={`status-cup status-${kind}`}
      style={phase !== "off" ? ({ "--fill": progress } as React.CSSProperties) : undefined}
    >
      <div className="status-cup-fill" />
      <div className="status-cup-body">
        <h2>{copy.title}</h2>
        {phase !== "off" && <p className="timer">{formatTime(state.timer.remaining_secs)}</p>}
        <p className="hint">{copy.hint}</p>
        <div className="actions">
          {phase === "off" ? (
            <button onClick={() => startCoffeeBreak()}>Iniciar pausa-café ☕</button>
          ) : (
            <button onClick={() => stopTimer()}>Parar timer</button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTicket({ state }: { state: StateSnapshot }) {
  const todaySessions = state.sessions.filter((s) => isToday(s.started_at));
  const focusSecs = todaySessions.filter((s) => s.kind === "focus").reduce((sum, s) => sum + s.duration_secs, 0);
  const breakSecs = todaySessions.filter((s) => s.kind === "break").reduce((sum, s) => sum + s.duration_secs, 0);
  const cycles = todaySessions.filter((s) => s.kind === "focus").length;
  const topApps = Object.entries(state.app_seconds_today)
    .filter(([, secs]) => secs > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const hasSummary = todaySessions.length > 0 || topApps.length > 0;
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="ticket">
      <div className="ticket-header">
        <h3>Resumo de hoje</h3>
        <span className="ticket-date">{today}</span>
      </div>

      {!hasSummary ? (
        <p className="empty">Nenhuma sessão completa ainda — termina um ciclo de foco ou pausa pra ver os números.</p>
      ) : (
        <>
          <div className="ticket-row">
            <span className="label">Foco</span>
            <span className="leader" />
            <span className="value">{formatDuration(focusSecs)}</span>
          </div>
          <div className="ticket-row">
            <span className="label">Descanso</span>
            <span className="leader" />
            <span className="value">{formatDuration(breakSecs)}</span>
          </div>
          <div className="ticket-row">
            <span className="label">Ciclos de foco</span>
            <span className="leader" />
            <span className="value">{cycles}</span>
          </div>
          <div className="ticket-row ticket-row-muted">
            <span className="label">Computador ligado</span>
            <span className="leader" />
            <span className="value">{formatDuration(state.uptime_secs)}</span>
          </div>

          {topApps.length > 0 && (
            <>
              <p className="ticket-sub">Apps que ficaram mais tempo abertos</p>
              <ul className="app-usage-list">
                {topApps.map(([name, secs]) => {
                  const max = topApps[0][1];
                  const badge = appBadge(name);
                  return (
                    <li key={name} className="app-usage-row">
                      <span className="app-badge" style={{ background: badge.color }}>
                        {badge.monogram}
                      </span>
                      <span className="app-usage-name">{name}</span>
                      <span className="app-usage-bar-track">
                        <span
                          className="app-usage-bar-fill"
                          style={{ width: `${Math.max(6, (secs / max) * 100)}%` }}
                        />
                      </span>
                      <span className="app-usage-time">{formatDuration(secs)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function GithubCard({ state, onNavigate }: { state: StateSnapshot; onNavigate: (tab: Tab) => void }) {
  const days = Object.keys(state.github_days).length > 0 ? state.github_days : state.focus_days;
  const streak = computeStreak(days);
  const weeks = buildHeatmapWeeks(days, 40);
  const monthLabels = monthLabelsForWeeks(weeks);
  const dowLabel = (i: number) => (i === 1 ? "Seg" : i === 3 ? "Qua" : i === 5 ? "Sex" : "");

  return (
    <div className="ticket github-card">
      <div className="ticket-header">
        <h3>GitHub</h3>
        <button className="link-button" onClick={() => onNavigate("github")}>
          Ver tudo →
        </button>
      </div>

      {!state.config.github_login ? (
        <p className="empty">
          Conecte o GitHub na aba GitHub pra ver PRs/issues abertos e sua streak de verdade aqui.
        </p>
      ) : (
        <>
          {state.github_error && <p className="error">{state.github_error}</p>}
          {state.github_items.length === 0 && !state.github_error && (
            <p className="ticket-sub">Nada aberto envolvendo você agora — caixa de entrada zerada.</p>
          )}
          {state.github_items.length > 0 && (
            <ul className="github-mini-list">
              {state.github_items.slice(0, 3).map((item) => (
                <li key={`${item.repository}-${item.number}`} className="github-mini-row">
                  <span className="badge">{item.is_pull_request ? "PR" : "Issue"}</span>
                  <a href={item.html_url} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="heat">
        <p className="ticket-sub">{streak > 0 ? `${streak} dia${streak > 1 ? "s" : ""} seguidos` : "Streak"}</p>
        <div className="heat-scroll">
          <div className="heat-months">
            {monthLabels.map((label, i) => (
              <span key={i} className="heat-month">
                {label}
              </span>
            ))}
          </div>
          <div className="heat-grid">
            <div className="heat-dow">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span key={i} className="heat-dow-label">
                  {dowLabel(i)}
                </span>
              ))}
            </div>
            {weeks.map((col, i) => (
              <div className="heat-col" key={i}>
                {col.map((day) => (
                  <span
                    key={day.date}
                    className={`heat-cell ${intensityClass(day.count)}`}
                    title={`${day.date}: ${day.count}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ state, onNavigate }: { state: StateSnapshot; onNavigate: (tab: Tab) => void }) {
  return (
    <section className="dashboard">
      <StatusCup state={state} />
      <SummaryTicket state={state} />
      <GithubCard state={state} onNavigate={onNavigate} />
    </section>
  );
}
