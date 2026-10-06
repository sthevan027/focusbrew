import type { PointerEvent } from "react";
import type { Task, TimerView } from "../lib/types";
import {
  fire,
  moveTask,
  nudgeTaskMinutes,
  removeTask,
  startTask,
  toggleTask,
  toggleTimerPause,
} from "../lib/tauri";
import { formatClock, remainingSecs } from "../lib/progress";
import { addDays } from "../lib/day";
import { ArrowRightIcon, CheckIcon, ClockIcon, GripIcon, PauseIcon, PlayIcon } from "./icons";

interface Props {
  task: Task;
  timer: TimerView;
  now: number;
  /** The day the list is showing; "→" moves the task to the day after it. */
  viewDay: string;
  /** "02/10" when the task was left over from an earlier day. */
  carried: string | null;
  dragging: boolean;
  /** Where the drop guide line is drawn relative to this row, if at all. */
  guide: "before" | "after" | null;
  rowRef: (el: HTMLDivElement | null) => void;
  onHandleDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onHandleMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onHandleUp: (e: PointerEvent<HTMLButtonElement>) => void;
}

export default function TaskRow({
  task,
  timer,
  now,
  viewDay,
  carried,
  dragging,
  guide,
  rowRef,
  onHandleDown,
  onHandleMove,
  onHandleUp,
}: Props) {
  const active = timer.task_id === task.id && timer.status !== "idle";
  const running = active && timer.status === "running";
  const classes = [
    "task-row",
    active ? "active" : "",
    task.done ? "done" : "",
    dragging ? "dragging" : "",
    guide ? `guide-${guide}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const details = [task.project, task.note, carried && `de ${carried}`].filter(Boolean).join(" · ");

  return (
    <div ref={rowRef} className={classes}>
      <button
        className="check"
        aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
        onClick={() => fire(toggleTask(task.id))}
      >
        {task.done && <CheckIcon />}
      </button>

      <div className="task-main">
        <div className="task-title" title={task.title}>
          {task.title}
        </div>
        {details && <div className="task-note">{details}</div>}
      </div>

      {!task.done && (
        <>
          <button
            className="move"
            aria-label="Mover pro dia seguinte"
            title="Mover pro dia seguinte"
            onClick={() => fire(moveTask(task.id, addDays(viewDay, 1)))}
          >
            <ArrowRightIcon />
          </button>
          <div className="minutes">
            <ClockIcon />
            <span className="minutes-value">
              {active ? formatClock(remainingSecs(timer, now)) : task.minutes}
            </span>
            <span className="stepper">
              <button aria-label="Mais 5 minutos" onClick={() => fire(nudgeTaskMinutes(task.id, 5))}>
                ▲
              </button>
              <button aria-label="Menos 5 minutos" onClick={() => fire(nudgeTaskMinutes(task.id, -5))}>
                ▼
              </button>
            </span>
          </div>
          <button
            className="play"
            aria-label={running ? "Pausar" : "Iniciar"}
            onClick={() => fire(running ? toggleTimerPause() : startTask(task.id))}
          >
            {running ? <PauseIcon /> : <PlayIcon />}
          </button>
        </>
      )}

      <button className="remove" aria-label="Remover tarefa" onClick={() => fire(removeTask(task.id))}>
        ×
      </button>

      {!task.done && (
        <button
          className="handle"
          aria-label="Arrastar para reordenar ou para um dia"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <GripIcon />
        </button>
      )}
    </div>
  );
}
