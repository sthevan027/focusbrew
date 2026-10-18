import { useEffect, useMemo, useState } from "react";
import {
  appDisplayName,
  filterSystemProcesses,
  formatDuration,
  periodRange,
  type ActivityApp,
  type ActivityReportData,
  type CustomRange,
  type Period,
} from "../lib/activityReport";
import { getActivityReport } from "../lib/tauri";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mês" },
  { id: "custom", label: "Personalizado" },
];

/** Apps under this total are hidden from the table unless "Mostrar todos" is on. */
const MIN_SHOWN_SECONDS = 5 * 60;
const CHART_APPS = 10;

type SortKey = "app_name" | "seconds" | "sessions";

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function ActivityReport() {
  const [period, setPeriod] = useState<Period>("today");
  const [custom, setCustom] = useState<CustomRange>(() => {
    const today = isoDay(new Date());
    return { from: today, to: today };
  });
  const [report, setReport] = useState<ActivityReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "seconds", desc: true });

  const customValid = period !== "custom" || (custom.from !== "" && custom.to !== "" && custom.to >= custom.from);

  useEffect(() => {
    if (!customValid) return;
    let cancelled = false;
    const { from, to } = periodRange(period, new Date(), custom);
    setLoading(true);
    getActivityReport(from, to)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setReport(null);
        setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, custom, customValid]);

  const apps = useMemo(() => filterSystemProcesses(report?.apps ?? []), [report]);
  const activeTotal = apps.reduce((sum, a) => sum + a.seconds, 0);
  const idleTotal = report?.idle_seconds ?? 0;
  const activePercent = activeTotal + idleTotal > 0 ? Math.round((activeTotal / (activeTotal + idleTotal)) * 100) : 0;

  const chartApps = useMemo(
    () =>
      [...apps]
        .sort((a, b) => b.seconds - a.seconds)
        .filter((a) => a.seconds >= MIN_SHOWN_SECONDS)
        .slice(0, CHART_APPS),
    [apps],
  );

  const rows = useMemo(() => {
    const visible = showAll ? apps : apps.filter((a) => a.seconds >= MIN_SHOWN_SECONDS);
    const compare = (a: ActivityApp, b: ActivityApp) => {
      const diff = sort.key === "app_name" ? a.app_name.localeCompare(b.app_name) : a[sort.key] - b[sort.key];
      return sort.desc ? -diff : diff;
    };
    return [...visible].sort(compare);
  }, [apps, showAll, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "app_name" }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.desc ? " ↓" : " ↑") : "");

  return (
    <section className="activity-report">
      <div className="activity-toolbar">
        <div className="activity-periods" role="tablist">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={period === p.id ? "active" : ""}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="activity-range">
            <input
              type="date"
              aria-label="De"
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
            <input
              type="date"
              aria-label="Até"
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="activity-warning" role="status">
          Serviço de atividade offline. Os dados voltam quando ele estiver rodando.
        </p>
      )}
      {!customValid && <p className="activity-warning">A data final precisa ser igual ou posterior à inicial.</p>}

      <div className="activity-summary">
        <div>
          <span>Ativo</span>
          <strong>{formatDuration(activeTotal)}</strong>
        </div>
        <div>
          <span>Ocioso</span>
          <strong>{formatDuration(idleTotal)}</strong>
        </div>
        <div>
          <span>Ativo / ocioso</span>
          <strong>{activePercent}%</strong>
        </div>
      </div>

      {loading && <p className="activity-muted">Carregando…</p>}

      {!loading && !error && apps.length === 0 && customValid && (
        <p className="activity-muted">Sem atividade neste período.</p>
      )}

      {chartApps.length > 0 && (
        <ul className="activity-chart" aria-label="Tempo por app">
          {chartApps.map((a) => (
            <li key={a.app_name}>
              <span className="activity-bar-label">{appDisplayName(a.app_name)}</span>
              <span className="activity-bar-value">{formatDuration(a.seconds)}</span>
            </li>
          ))}
        </ul>
      )}

      {apps.length > 0 && (
        <>
          <label className="activity-showall">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Mostrar todos (incluindo apps com menos de 5 min)
          </label>
          <table className="activity-table">
            <thead>
              <tr>
                <th>
                  <button type="button" onClick={() => toggleSort("app_name")}>
                    App{arrow("app_name")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort("seconds")}>
                    Tempo{arrow("seconds")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort("sessions")}>
                    Sessões{arrow("sessions")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.app_name}>
                  <td>{appDisplayName(a.app_name)}</td>
                  <td>{formatDuration(a.seconds)}</td>
                  <td>{a.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
