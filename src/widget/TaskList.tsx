import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { StateSnapshot } from "../lib/types";
import { addTask, fire, moveTask, reorderTasks } from "../lib/tauri";
import { carriedFrom, tasksForDay } from "../lib/day";
import { dropIndex, moveItem } from "../lib/reorder";
import TaskRow from "./TaskRow";

interface Props {
  state: StateSnapshot;
  day: string;
  now: number;
  /** Tells the widget not to close while typing or dragging. */
  onHold: (hold: boolean) => void;
  /** The grid square under a dragged task (`null` when none). */
  onDropDay: (day: string | null) => void;
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

export default function TaskList({ state, day, now, onHold, onDropDay }: Props) {
  const { timer, today } = state;
  const { open, done } = tasksForDay(state.tasks, day, today);

  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());

  // `onHold` changes identity on every render of the widget (the clock ticks
  // every second); calling it from an effect that depends on it would restart
  // the close timer each time and the panel would never close.
  const holdRef = useRef(onHold);
  holdRef.current = onHold;
  useEffect(() => {
    holdRef.current(typing || drag !== null);
  }, [typing, drag]);
  useEffect(() => () => holdRef.current(false), []);

  const dropRef = useRef(onDropDay);
  dropRef.current = onDropDay;
  useEffect(() => {
    dropRef.current(dropDay);
  }, [dropDay]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    fire(addTask(title, day));
    setDraft("");
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: index, over: index });
  };

  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const target = dayUnder(e.clientX, e.clientY, today);
    if (target !== dropDay) setDropDay(target);
    if (target) return;
    const middles = open.map((t) => {
      const el = rows.current.get(t.id);
      if (!el) return 0;
      const box = el.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const over = dropIndex(middles, e.clientY, drag.from);
    if (over !== drag.over) setDrag({ from: drag.from, over });
  };

  const onHandleUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const target = dayUnder(e.clientX, e.clientY, today);
    const task = open[drag.from];
    if (target && task && target !== task.day) {
      fire(moveTask(task.id, target));
    } else if (!target && drag.over !== drag.from) {
      fire(reorderTasks(moveItem(open.map((t) => t.id), drag.from, drag.over)));
    }
    setDrag(null);
    setDropDay(null);
  };

  // The guide line: before the row that would come after the dragged one, or
  // after the last of the *other* rows. Hidden while over a grid square.
  const others = drag ? open.filter((_, i) => i !== drag.from) : [];
  const guideFor = (index: number): "before" | "after" | null => {
    if (!drag || dropDay || index === drag.from) return null;
    const otherIndex = index < drag.from ? index : index - 1;
    if (otherIndex === drag.over) return "before";
    if (drag.over >= others.length && otherIndex === others.length - 1) return "after";
    return null;
  };

  return (
    <section className="todo">
      <div className="task-list">
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
            guide={guideFor(i)}
            rowRef={(el) => {
              if (el) rows.current.set(task.id, el);
              else rows.current.delete(task.id);
            }}
            onHandleDown={(e) => onHandleDown(e, i)}
            onHandleMove={onHandleMove}
            onHandleUp={onHandleUp}
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
            guide={null}
            rowRef={() => {}}
            onHandleDown={() => {}}
            onHandleMove={() => {}}
            onHandleUp={() => {}}
          />
        ))}
      </div>
      <form onSubmit={submit}>
        <input
          value={draft}
          maxLength={200}
          placeholder={day === today ? "Add a task" : "Planejar uma tarefa"}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
        />
      </form>
    </section>
  );
}
