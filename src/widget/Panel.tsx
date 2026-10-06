import { useState } from "react";
import type { MouseEvent } from "react";
import type { StateSnapshot } from "../lib/types";
import { formatDuration } from "../lib/activity";
import { addDays, dayLabel, tabsFor, tasksForDay } from "../lib/day";
import type { PanelTab } from "../lib/day";
import { daySummary } from "../lib/summary";
import ActivityPanel from "./ActivityPanel";
import DaySummaryView from "./DaySummaryView";
import { ChevronIcon, PinIcon } from "./icons";
import TaskList from "./TaskList";

interface Props {
  state: StateSnapshot;
  now: number;
  day: string;
  onDay: (day: string) => void;
  pinned: boolean;
  onTogglePin: () => void;
  onHold: (hold: boolean) => void;
}

const TAB_LABEL: Record<PanelTab, string> = { tasks: "Tarefas", summary: "Resumo", github: "GitHub" };

export default function Panel({ state, now, day, onDay, pinned, onTogglePin, onHold }: Props) {
  const { today } = state;
  const [wanted, setWanted] = useState<PanelTab>("tasks");
  const [dropDay, setDropDay] = useState<string | null>(null);
  const tabs = tabsFor(day, today, false);
  const tab = tabs.includes(wanted) ? wanted : tabs[0];

  let stats: string;
  if (day > today) {
    const planned = tasksForDay(state.tasks, day, today).open.length;
    stats = planned === 0 ? "nada planejado" : `${planned} planejada${planned > 1 ? "s" : ""}`;
  } else {
    const done = daySummary(state.sessions, state.tasks, day).doneCount;
    const secs = state.focus_secs_by_day[day] ?? 0;
    stats = secs === 0 && done === 0 ? "nada ainda" : `${formatDuration(secs)} · ${done} ✓`;
  }

  // A click on the bare header pins/unpins; its buttons don't.
  const onHeaderClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onTogglePin();
  };

  return (
    <div className="panel">
      <header className="panel-header" onClick={onHeaderClick}>
        <div className="day-nav">
          <button type="button" aria-label="Dia anterior" onClick={() => onDay(addDays(day, -1))}>
            <ChevronIcon dir="left" />
          </button>
          <button
            type="button"
            className={day === today ? "day-label today" : "day-label"}
            title="Voltar pra hoje"
            onClick={() => onDay(today)}
          >
            {dayLabel(day, today)}
          </button>
          <button type="button" aria-label="Próximo dia" onClick={() => onDay(addDays(day, 1))}>
            <ChevronIcon dir="right" />
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === tab}
                className={t === tab ? "tab active" : "tab"}
                onClick={() => setWanted(t)}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
        )}

        <span className="day-stats">{stats}</span>
        <button
          type="button"
          className={pinned ? "pin pinned" : "pin"}
          aria-label={pinned ? "Desafixar o painel" : "Fixar o painel aberto"}
          aria-pressed={pinned}
          title={pinned ? "Fixado — Esc ou clique fora pra soltar" : "Fixar aberto"}
          onClick={onTogglePin}
        >
          <PinIcon />
        </button>
      </header>

      <div className="panel-body">
        {tab === "tasks" ? (
          <TaskList state={state} day={day} now={now} onHold={onHold} onDropDay={setDropDay} />
        ) : (
          <DaySummaryView state={state} day={day} />
        )}
        <div className="divider" />
        <ActivityPanel state={state} selected={day} onSelect={onDay} dropDay={dropDay} />
      </div>
    </div>
  );
}
