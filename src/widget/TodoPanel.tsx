import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { StateSnapshot } from "../lib/types";
import { addTask, reorderTasks } from "../lib/tauri";
import { dropIndex, moveItem } from "../lib/reorder";
import ActivityGrid from "./ActivityGrid";
import { BarsIcon } from "./icons";
import TaskRow from "./TaskRow";

interface Props {
  state: StateSnapshot;
  now: number;
  /** Tells the widget not to close while typing or dragging. */
  onHold: (hold: boolean) => void;
}

interface Drag {
  from: number;
  over: number;
}

export default function TodoPanel({ state, now, onHold }: Props) {
  const { timer } = state;
  const open = state.tasks.filter((t) => !t.done);
  const done = state.tasks.filter((t) => t.done);

  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());

  // `onHold` changes identity on every render of the widget (the clock ticks
  // 4 times a second); calling it from an effect that depends on it would
  // restart the close timer each time and the panel would never close.
  const holdRef = useRef(onHold);
  holdRef.current = onHold;
  useEffect(() => {
    holdRef.current(typing || drag !== null);
  }, [typing, drag]);
  useEffect(() => () => holdRef.current(false), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    void addTask(title);
    setDraft("");
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: index, over: index });
  };

  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const middles = open.map((t) => {
      const el = rows.current.get(t.id);
      if (!el) return 0;
      const box = el.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const over = dropIndex(middles, e.clientY, drag.from);
    if (over !== drag.over) setDrag({ from: drag.from, over });
  };

  const onHandleUp = () => {
    if (!drag) return;
    if (drag.over !== drag.from) {
      void reorderTasks(moveItem(open.map((t) => t.id), drag.from, drag.over));
    }
    setDrag(null);
  };

  // The guide line: before the row that would come after the dragged one, or
  // after the last of the *other* rows.
  const others = drag ? open.filter((_, i) => i !== drag.from) : [];
  const guideFor = (index: number): "before" | "after" | null => {
    if (!drag || index === drag.from) return null;
    const otherIndex = index < drag.from ? index : index - 1;
    if (otherIndex === drag.over) return "before";
    if (drag.over >= others.length && otherIndex === others.length - 1) return "after";
    return null;
  };

  return (
    <div className="panel">
      <div className="panel-body">
        <section className="todo">
          <h2>To Do</h2>
          <div className="task-list">
            {open.length === 0 && done.length === 0 && <p className="empty">Nenhuma tarefa ainda</p>}
            {open.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                timer={timer}
                now={now}
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
              placeholder="Add a task"
              onChange={(e) => setDraft(e.currentTarget.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
            />
          </form>
        </section>

        <div className="divider" />

        <section className="activity">
          <h2>
            <BarsIcon /> Activity
          </h2>
          <ActivityGrid secsByDay={state.focus_secs_by_day} />
        </section>
      </div>
    </div>
  );
}
