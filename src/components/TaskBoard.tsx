import { useState } from "react";
import type { Task } from "../lib/types";
import { addTask, removeTask, toggleTask } from "../lib/tauri";

export default function TaskBoard({ tasks }: { tasks: Task[] }) {
  const [title, setTitle] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask(trimmed);
    setTitle("");
  };

  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <section className="task-board">
      <form onSubmit={submit} className="task-form">
        <input
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder="Nova tarefa..."
        />
        <button type="submit">Adicionar</button>
      </form>

      <ul className="task-list">
        {pending.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </ul>

      {done.length > 0 && (
        <details className="task-done">
          <summary>Concluídas ({done.length})</summary>
          <ul className="task-list">
            {done.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        </details>
      )}

      {tasks.length === 0 && <p className="empty">Nenhuma tarefa ainda.</p>}
    </section>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <li className={`task-row ${task.done ? "done" : ""}`}>
      <label>
        <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} />
        <span>{task.title}</span>
      </label>
      {task.source === "github" && <span className="badge">GitHub</span>}
      <button className="remove" onClick={() => removeTask(task.id)} aria-label="Remover">
        ×
      </button>
    </li>
  );
}
