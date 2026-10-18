import { useEffect, useMemo, useState } from "react";
import { appDisplayName, filterSystemProcesses, formatDuration, parseLocalDate, type ActivityApp } from "../lib/activityReport";
import { getActivityReport } from "../lib/tauri";
import { ChevronIcon } from "./icons";

interface Props {
  /** The day already selected at the top of the panel; "Dia" always follows it. */
  day: string;
}

type Mode = "day" | "week" | "month";
const MODES: { id: Mode; label: string }[] = [
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
];
const TOP_APPS = 5;

function mondayOf(d: Date): Date {
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Range and label for the period a given mode+offset points at. "day" ignores offset. */
function rangeFor(mode: Mode, day: string, offset: number): { from: Date; to: Date; label: string } {
  if (mode === "week") {
    const from = new Date(mondayOf(new Date()).getTime());
    from.setDate(from.getDate() + offset * 7);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1);
    const label =
      offset === 0 ? "esta semana" : `${from.getDate()}/${from.getMonth() + 1} – ${toEnd.getDate()}/${toEnd.getMonth() + 1}`;
    return { from, to, label };
  }
  if (mode === "month") {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    const label = offset === 0 ? "este mês" : `${MONTH_NAMES[from.getMonth()]} de ${from.getFullYear()}`;
    return { from, to, label };
  }
  const from = parseLocalDate(day);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  return { from, to, label: "" };
}

/** Compact Activity Tracking summary for the Resumo tab: top apps + ativo/ocioso for
 * the selected day (follows the panel's day), or for a week/month navigated locally. */
export default function ActivitySummaryWidget({ day }: Props) {
  const [mode, setMode] = useState<Mode>("day");
  const [offset, setOffset] = useState(0);
  const [apps, setApps] = useState<ActivityApp[]>([]);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const pickMode = (m: Mode) => {
    setMode(m);
    setOffset(0);
  };

  const { from, to, label } = useMemo(() => rangeFor(mode, day, offset), [mode, day, offset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getActivityReport(from, to)
      .then((r) => {
        if (cancelled) return;
        setApps(filterSystemProcesses(r.apps));
        setIdleSeconds(r.idle_seconds);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setApps([]);
        setIdleSeconds(0);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `from`/`to` are fresh Date objects every render; mode/day/offset are what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day, offset]);

  const activeTotal = apps.reduce((sum, a) => sum + a.seconds, 0);
  const top = useMemo(() => [...apps].sort((a, b) => b.seconds - a.seconds).slice(0, TOP_APPS), [apps]);

  return (
    <section className="activity-summary-widget">
      <div className="activity-summary-head">
        <div className="activity-summary-modes" role="tablist">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={mode === m.id ? "active" : ""}
              onClick={() => pickMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode !== "day" && (
          <div className="activity-summary-nav">
            <button type="button" aria-label="Período anterior" onClick={() => setOffset((o) => o - 1)}>
              <ChevronIcon dir="left" size={11} />
            </button>
            <span>{label}</span>
            <button type="button" aria-label="Próximo período" onClick={() => setOffset((o) => o + 1)}>
              <ChevronIcon dir="right" size={11} />
            </button>
          </div>
        )}
      </div>

      {error && <p className="activity-summary-muted">Serviço de atividade offline.</p>}
      {!error && !loading && apps.length === 0 && <p className="activity-summary-muted">Sem atividade neste período.</p>}
      {!error && (activeTotal > 0 || idleSeconds > 0) && (
        <p className="activity-summary-totals">
          Ativo <strong>{formatDuration(activeTotal)}</strong> · Ocioso <strong>{formatDuration(idleSeconds)}</strong>
        </p>
      )}

      {top.length > 0 && (
        <ul className="activity-summary-list">
          {top.map((a) => (
            <li key={a.app_name}>
              <span>{appDisplayName(a.app_name)}</span>
              <strong>{formatDuration(a.seconds)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
