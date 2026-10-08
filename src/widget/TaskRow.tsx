import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Task, TimerView } from "../lib/types";
import {
  editTask,
  fire,
  moveTask,
  removeTask,
  setTaskMinutes,
  startTask,
  toggleTask,
  toggleTimerPause,
} from "../lib/tauri";
import { formatClock, remainingSecs } from "../lib/progress";
import { addDays } from "../lib/day";
import { parseMinutes } from "../lib/minutes";
import { titleWithoutProject } from "../lib/project";
import { ArrowRightIcon, CheckIcon, ClockIcon, GripIcon, LinkIcon, PauseIcon, PlayIcon } from "./icons";

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
  /** The title is being edited (keeps the panel open). */
  onEditing: (editing: boolean) => void;
  /** The task was moved to `day` (the grid flashes that square). */
  onMoved: (day: string) => void;
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
  onEditing,
  onMoved,
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  // Enter saves and unmounts the field, which also fires blur: save once.
  const open = useRef(false);
  const startEditing = () => {
    setDraft(task.project ? `${task.title} #${task.project}` : task.title);
    open.current = true;
    setEditing(true);
    onEditing(true);
  };
  const stopEditing = () => {
    open.current = false;
    setInvalid(false);
    setEditing(false);
    onEditing(false);
  };
  const save = () => {
    if (!open.current) return;
    const text = draft.trim();
    // Only a "#tag" would leave no title: keep the field open, marked.
    if (text && !titleWithoutProject(text)) {
      setInvalid(true);
      return;
    }
    if (text && text !== (task.project ? `${task.title} #${task.project}` : task.title)) {
      fire(editTask(task.id, text));
    }
    stopEditing();
  };

  // The time field: click the number, type the minutes. Same save-once guard
  // as the title (Enter unmounts the field, which also fires blur).
  const [timeEditing, setTimeEditing] = useState(false);
  const [timeDraft, setTimeDraft] = useState("");
  const timeOpen = useRef(false);
  const startTimeEdit = () => {
    setTimeDraft(String(task.minutes));
    timeOpen.current = true;
    setTimeEditing(true);
    onEditing(true);
  };
  const stopTimeEdit = () => {
    timeOpen.current = false;
    setTimeEditing(false);
    onEditing(false);
  };
  const saveTime = () => {
    if (!timeOpen.current) return;
    const minutes = parseMinutes(timeDraft);
    if (minutes !== null && minutes !== task.minutes) fire(setTaskMinutes(task.id, minutes));
    stopTimeEdit();
  };

  // A GitHub task's note ("dono/repo #N") already names its project.
  const details = [task.note ?? task.project, carried && `de ${carried}`].filter(Boolean).join(" · ");

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
        {editing ? (
          <input
            className={invalid ? "task-edit invalid" : "task-edit"}
            autoFocus
            value={draft}
            maxLength={240}
            aria-label="Editar tarefa (título #projeto)"
            aria-invalid={invalid}
            title={invalid ? "Escreva um título antes do #projeto" : undefined}
            onChange={(e) => {
              setDraft(e.currentTarget.value);
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                e.stopPropagation(); // Esc here cancels the edit, not the pinned panel
                stopEditing();
              }
            }}
            onBlur={save}
          />
        ) : (
          <div className="task-title" title="Duplo clique pra editar" onDoubleClick={startEditing}>
            {task.title}
          </div>
        )}
        {(details || task.url) && !editing && (
          <div className="task-note">
            {task.url && (
              <button
                className="link"
                aria-label="Abrir no GitHub"
                title="Abrir no GitHub"
                onClick={() => fire(openUrl(task.url!))}
              >
                <LinkIcon size={10} />
              </button>
            )}
            {details}
          </div>
        )}
      </div>

      {!task.done && (
        <>
          <button
            className="move"
            aria-label="Mover pro dia seguinte"
            title="Mover pro dia seguinte"
            onClick={() => {
              const next = addDays(viewDay, 1);
              fire(moveTask(task.id, next));
              onMoved(next);
            }}
          >
            <ArrowRightIcon />
          </button>
          <div className={timeEditing ? "minutes editing" : "minutes"}>
            <ClockIcon />
            {timeEditing ? (
              <input
                className="minutes-edit"
                autoFocus
                inputMode="numeric"
                maxLength={3}
                value={timeDraft}
                aria-label="Minutos da atividade (5 a 180)"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setTimeDraft(e.currentTarget.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTime();
                  if (e.key === "Escape") {
                    e.stopPropagation(); // Esc here cancels the edit, not the pinned panel
                    stopTimeEdit();
                  }
                }}
                onBlur={saveTime}
              />
            ) : (
              <button
                className="minutes-value"
                aria-label="Mudar o tempo da atividade"
                title="Clique pra digitar os minutos"
                onClick={startTimeEdit}
              >
                {active ? formatClock(remainingSecs(timer, now)) : task.minutes}
              </button>
            )}
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
