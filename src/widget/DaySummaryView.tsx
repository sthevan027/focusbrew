import type { StateSnapshot } from "../lib/types";
import { formatDuration } from "../lib/activity";
import { daySummary } from "../lib/summary";
import { githubForDay, knownTitles } from "../lib/github";
import { CheckIcon } from "./icons";

interface Props {
  state: StateSnapshot;
  day: string;
}

/** What was done on a day: time per task, what was checked off, per project. */
export default function DaySummaryView({ state, day }: Props) {
  const summary = daySummary(state.sessions, state.tasks, day);
  const max = Math.max(1, ...summary.rows.map((r) => r.secs));
  const github = githubForDay(state.github_events, day, knownTitles(state.github_items, state.tasks));

  if (summary.rows.length === 0 && github.length === 0) {
    // Focus from before the block history (v0.3) or older than the 42 days
    // the panel gets: the total is known, the per-task detail isn't.
    const focus = state.focus_secs_by_day[day] ?? 0;
    return (
      <section className="summary">
        <p className="empty">
          {focus > 0 ? `${formatDuration(focus)} de foco — sem detalhe por tarefa neste dia` : "Nada registrado neste dia"}
        </p>
      </section>
    );
  }

  return (
    <section className="summary">
      <ul className="summary-rows">
        {summary.rows.map((row) => (
          <li key={row.taskId} className={row.done ? "summary-row done" : "summary-row"}>
            <span className="summary-check">{row.done && <CheckIcon size={10} />}</span>
            <span className="summary-title" title={row.title}>
              {row.title}
              {row.project && <span className="summary-project">{row.project}</span>}
            </span>
            <span className="summary-time">{row.secs > 0 ? formatDuration(row.secs) : "—"}</span>
            <span className="summary-bar" style={{ width: `${(row.secs / max) * 100}%` }} />
          </li>
        ))}
      </ul>
      {github.length > 0 && (
        <>
          <h3 className="summary-heading">GitHub</h3>
          <ul className="summary-github">
            {github.map((line) => (
              <li key={line.key}>{line.text}</li>
            ))}
          </ul>
        </>
      )}
      {summary.byProject.length > 1 && (
        <p className="summary-projects">
          {summary.byProject.map((p) => (
            <span key={p.project ?? ""}>
              {p.project ?? "sem projeto"} <strong>{formatDuration(p.secs)}</strong>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
