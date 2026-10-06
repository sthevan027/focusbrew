import { useState } from "react";
import type { StateSnapshot } from "../lib/types";
import { buildGrid, formatDuration, streak, weekTotal } from "../lib/activity";
import type { DayCell } from "../lib/activity";
import { dayLabel, plannedByDay } from "../lib/day";
import { daySummary } from "../lib/summary";
import { BarsIcon } from "./icons";

interface Props {
  state: StateSnapshot;
  selected: string;
  onSelect: (day: string) => void;
  /** Square a task is being dragged over. */
  dropDay: string | null;
}

const WEEKDAY_INITIALS = ["S", "T", "Q", "Q", "S", "S", "D"];

function describe(cell: DayCell, state: StateSnapshot): string {
  const label = dayLabel(cell.date, state.today);
  if (cell.when === "future") {
    return cell.planned > 0 ? `${label} — ${cell.planned} planejada${cell.planned > 1 ? "s" : ""}` : `${label} — nada planejado`;
  }
  const done = daySummary(state.sessions, state.tasks, cell.date).doneCount;
  const parts = [formatDuration(cell.secs)];
  if (done > 0) parts.push(`${done} concluída${done > 1 ? "s" : ""}`);
  return `${label} — ${parts.join(" · ")}`;
}

/**
 * Focus per day: 3 past weeks, this one and the next. A square is a day —
 * click to open it; drop a task on today or a future square to plan it there.
 */
export default function ActivityPanel({ state, selected, onSelect, dropDay }: Props) {
  const { focus_secs_by_day: secs, today } = state;
  const cells = buildGrid(secs, today, plannedByDay(state.tasks, today));
  const [hovered, setHovered] = useState<DayCell | null>(null);
  const shown = hovered ?? cells.find((c) => c.date === selected) ?? null;
  const days = streak(secs, today);

  return (
    <section className="activity">
      <h2>
        <BarsIcon /> Activity
      </h2>
      <p className="activity-stats">
        semana <strong>{formatDuration(weekTotal(secs, today))}</strong>
        {days > 0 && (
          <>
            {" · "}
            <strong>{days}</strong> {days === 1 ? "dia" : "dias seguidos"}
          </>
        )}
      </p>

      <div className="grid weekdays" aria-hidden="true">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid" role="grid" aria-label="Foco por dia" onMouseLeave={() => setHovered(null)}>
        {cells.map((cell) => {
          const classes = [
            "cell",
            `level-${cell.level}`,
            cell.when,
            cell.date === selected ? "selected" : "",
            cell.date === dropDay ? "drop" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={cell.date}
              type="button"
              className={classes}
              data-day={cell.date}
              aria-label={describe(cell, state)}
              onMouseEnter={() => setHovered(cell)}
              onClick={() => onSelect(cell.date)}
            >
              {cell.when === "future" && cell.planned > 0 && <span className="dot" />}
            </button>
          );
        })}
      </div>

      <p className="activity-line">{shown ? describe(shown, state) : ""}</p>
      <div className="legend" aria-hidden="true">
        menos
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`cell level-${l}`} />
        ))}
        mais
      </div>
    </section>
  );
}
