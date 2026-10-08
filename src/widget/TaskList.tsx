import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { StateSnapshot } from "../lib/types";
import { addTask, fire, moveTask, reorderTasks } from "../lib/tauri";
import { carriedFrom, tasksForDay } from "../lib/day";
import { titleWithoutProject } from "../lib/project";
import { clampDelta, dropIndex, jumpDistance, moveItem, rowShift } from "../lib/reorder";
import TaskRow from "./TaskRow";

/** The gap between rows: must match `.task-list` in Widget.css. */
const GAP = 6;
/** The dragged row glides into its slot (and back) with this. */
const SETTLE = "transform 160ms cubic-bezier(0.32, 0.72, 0, 1)";
/** How long the rows stay shifted waiting for the backend's new order. */
const SETTLE_MAX_MS = 600;

interface Props {
  state: StateSnapshot;
  day: string;
  now: number;
  /** Tells the widget not to close while typing or dragging. */
  onHold: (hold: boolean) => void;
  /** The grid square under a dragged task (`null` when none). */
  onDropDay: (day: string | null) => void;
  /** A task was moved to another day. */
  onMoved: (day: string) => void;
}

interface Drag {
  from: number;
  over: number;
}

/** A plannable grid square under the pointer: today or a future day. */
function dayUnder(x: number, y: number, today: string): string | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day]");
  const day = el?.dataset.day;
  return day && day >= today ? day : null;
}

export default function TaskList({ state, day, now, onHold, onDropDay, onMoved }: Props) {
  const { timer, today } = state;
  const { open, done } = tasksForDay(state.tasks, day, today);

  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [typing, setTyping] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  // After the drop the rows stay where they will be until the new order arrives.
  const [settling, setSettling] = useState<Drag | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  // Measured when the drag starts, before any row moves: the rows' middles and heights.
  const slots = useRef({ mids: [] as number[], heights: [] as number[] });
  const startY = useRef(0);
  // How far the dragged row may travel up (min) and down (max) and stay inside the list.
  const travel = useRef({ min: 0, max: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  // `onHold` changes identity on every render of the widget (the clock ticks
  // every second); calling it from an effect that depends on it would restart
  // the close timer each time and the panel would never close.
  const holdRef = useRef(onHold);
  holdRef.current = onHold;
  useEffect(() => {
    holdRef.current(typing || editing || drag !== null);
  }, [typing, editing, drag]);
  useEffect(() => () => holdRef.current(false), []);

  const dropRef = useRef(onDropDay);
  dropRef.current = onDropDay;
  useEffect(() => {
    dropRef.current(dropDay);
  }, [dropDay]);

  // Drops the inline motion of every row (the dragged one is moved by hand).
  const resetRows = () => {
    rows.current.forEach((el) => {
      el.style.transition = "";
      el.style.transform = "";
    });
  };

  // The backend sent the new order: the rows are in their final places, so the
  // leftover offsets go away before the next paint (no double shift).
  const order = open.map((t) => t.id).join(",");
  useLayoutEffect(() => {
    if (!settling) return;
    resetRows();
    setSettling(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);
  // If the new order never comes (the order did not change), let go anyway.
  useEffect(() => {
    if (!settling) return;
    const id = window.setTimeout(() => {
      resetRows();
      setSettling(null);
    }, SETTLE_MAX_MS);
    return () => window.clearTimeout(id);
  }, [settling]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    // Only a "#tag" would create nothing: say so instead of eating the text.
    if (!titleWithoutProject(title)) {
      setInvalid(true);
      return;
    }
    fire(addTask(title, day));
    setDraft("");
  };

  const rowEl = (index: number) => {
    const id = open[index]?.id;
    return id ? rows.current.get(id) : undefined;
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resetRows();
    const boxes = open.map((t) => rows.current.get(t.id)?.getBoundingClientRect());
    slots.current = {
      mids: boxes.map((b) => (b ? b.top + b.height / 2 : 0)),
      heights: boxes.map((b) => b?.height ?? 0),
    };
    startY.current = e.clientY;
    const list = listRef.current?.getBoundingClientRect();
    const own = boxes[index];
    travel.current =
      list && own ? { min: list.top - own.top, max: list.bottom - own.bottom } : { min: 0, max: 0 };
    const el = rowEl(index);
    if (el) el.style.transition = "none"; // follows the pointer, no easing
    setSettling(null);
    setDrag({ from: index, over: index });
  };

  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    // The dragged row follows the pointer: moved by hand (no render per move).
    const el = rowEl(drag.from);
    if (el) {
      const dy = clampDelta(e.clientY - startY.current, travel.current.min, travel.current.max);
      el.style.transform = `translate3d(0, ${dy}px, 0) scale(1.015)`;
    }
    const target = dayUnder(e.clientX, e.clientY, today);
    if (target !== dropDay) setDropDay(target);
    if (target) return;
    const over = dropIndex(slots.current.mids, e.clientY, drag.from);
    if (over !== drag.over) setDrag({ from: drag.from, over });
  };

  const onHandleUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const target = dayUnder(e.clientX, e.clientY, today);
    const task = open[drag.from];
    const el = rowEl(drag.from);
    if (target && task && target !== task.day) {
      fire(moveTask(task.id, target));
      onMoved(target);
      resetRows();
    } else if (!target && drag.over !== drag.from) {
      // Glide into the new slot now; the rows stay shifted until the order arrives.
      const distance = jumpDistance(slots.current.heights, drag.from, drag.over, GAP);
      if (el) {
        el.style.transition = SETTLE;
        el.style.transform = `translate3d(0, ${distance}px, 0)`;
      }
      fire(reorderTasks(moveItem(open.map((t) => t.id), drag.from, drag.over)));
      setSettling(drag);
    } else {
      // Nothing changed: glide back to where it was.
      if (el) {
        el.style.transition = SETTLE;
        el.style.transform = "";
      }
      setSettling({ from: drag.from, over: drag.from });
    }
    setDrag(null);
    setDropDay(null);
  };

  // While dragging (and while settling) the other rows slide out of the way,
  // unless the pointer is over a grid square (the task goes to another day).
  const moving = drag ?? settling;
  const slotOver = moving ? (drag && dropDay ? moving.from : moving.over) : 0;
  const step = moving ? (slots.current.heights[moving.from] ?? 0) + GAP : 0;
  const shiftFor = (index: number) => (moving ? rowShift(index, moving.from, slotOver, step) : 0);

  return (
    <section className="todo">
      <div ref={listRef} className={moving ? "task-list reordering" : "task-list"}>
        {open.length === 0 && done.length === 0 && (
          <p className="empty">{day === today ? "Nenhuma tarefa pra hoje" : "Nada planejado — adicione abaixo"}</p>
        )}
        {open.map((task, i) => (
          <TaskRow
            key={task.id}
            task={task}
            timer={timer}
            now={now}
            viewDay={day}
            carried={carriedFrom(task, today)}
            dragging={drag?.from === i}
            shift={shiftFor(i)}
            rowRef={(el) => {
              if (el) rows.current.set(task.id, el);
              else rows.current.delete(task.id);
            }}
            onHandleDown={(e) => onHandleDown(e, i)}
            onHandleMove={onHandleMove}
            onHandleUp={onHandleUp}
            onEditing={setEditing}
            onMoved={onMoved}
          />
        ))}
        {done.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            timer={timer}
            now={now}
            viewDay={day}
            carried={null}
            dragging={false}
            shift={0}
            rowRef={() => {}}
            onHandleDown={() => {}}
            onHandleMove={() => {}}
            onHandleUp={() => {}}
            onEditing={setEditing}
            onMoved={onMoved}
          />
        ))}
      </div>
      <form onSubmit={submit}>
        <input
          className={invalid ? "invalid" : undefined}
          value={draft}
          maxLength={200}
          aria-invalid={invalid}
          placeholder={day === today ? "Adicionar tarefa — #projeto no fim" : "Planejar uma tarefa — #projeto no fim"}
          onChange={(e) => {
            setDraft(e.currentTarget.value);
            setInvalid(false);
          }}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
        />
        {invalid && <p className="field-hint">Escreva um título antes do #projeto</p>}
      </form>
    </section>
  );
}
