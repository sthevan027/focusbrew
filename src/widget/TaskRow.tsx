import type { PointerEvent } from "react";
import type { Task, TimerView } from "../lib/types";
import { removeTask, startTask, toggleTask, toggleTimerPause, updateTaskMinutes } from "../lib/tauri";
import { formatClock, remainingSecs } from "../lib/progress";
import { CheckIcon, ClockIcon, GripIcon, PauseIcon, PlayIcon } from "./icons";

interface Props {
  task: Task;
  timer: TimerView;
  now: number;
  dragging: boolean;
  /** Where the drop guide line is drawn relative to this row, if at all. */
  guide: "before" | "after" | null;
  rowRef: (el: HTMLDivElement | null) => void;
  onHandleDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onHandleMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onHandleUp: () => void;
}

export default function TaskRow({
  task,
  timer,
  now,
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

  return (
    <div ref={rowRef} className={classes}>
      <button
        className="check"
        aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
        onClick={() => void toggleTask(task.id)}
      >
        {task.done && <CheckIcon />}
      </button>

      <div className="task-main">
        <div className="task-title" title={task.title}>
          {task.title}
        </div>
        {task.note && <div className="task-note">{task.note}</div>}
      </div>

      {!task.done && (
        <>
          <div className="minutes">
            <ClockIcon />
            <span className="minutes-value">
              {active ? formatClock(remainingSecs(timer, now)) : task.minutes}
            </span>
            <span className="stepper">
              <button aria-label="Mais 5 minutos" onClick={() => void updateTaskMinutes(task.id, task.minutes + 5)}>
                ▲
              </button>
              <button aria-label="Menos 5 minutos" onClick={() => void updateTaskMinutes(task.id, task.minutes - 5)}>
                ▼
              </button>
            </span>
          </div>
          <button
            className="play"
            aria-label={running ? "Pausar" : "Iniciar"}
            onClick={() => void (running ? toggleTimerPause() : startTask(task.id))}
          >
            {running ? <PauseIcon /> : <PlayIcon />}
          </button>
        </>
      )}

      <button className="remove" aria-label="Remover tarefa" onClick={() => void removeTask(task.id)}>
        ×
      </button>

      {!task.done && (
        <button
          className="handle"
          aria-label="Arrastar para reordenar"
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
