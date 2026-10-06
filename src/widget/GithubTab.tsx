import { openUrl } from "@tauri-apps/plugin-opener";
import type { GithubItem, StateSnapshot } from "../lib/types";
import { fire, importGithubItemAsTask, moveTask } from "../lib/tauri";
import { dayLabel, dayOfMs, shortDate } from "../lib/day";
import { linkedTask } from "../lib/github";

interface Props {
  state: StateSnapshot;
  /** The day new tasks go to. */
  day: string;
}

/** Open PRs/issues that involve you; each says whether it's already a task. */
export default function GithubTab({ state, day }: Props) {
  const { today } = state;
  if (state.github_items.length === 0) {
    return (
      <section className="gh">
        <p className="empty">{state.github_error ?? "Nenhum PR/issue aberto envolvendo você"}</p>
      </section>
    );
  }
  return (
    <section className="gh">
      <ul className="gh-list">
        {state.github_items.map((item) => (
          <GithubRow key={item.html_url} item={item} state={state} day={day} today={today} />
        ))}
      </ul>
    </section>
  );
}

function GithubRow({ item, state, day, today }: { item: GithubItem; state: StateSnapshot; day: string; today: string }) {
  const task = linkedTask(item, state.tasks);
  const where = dayLabel(day, today).toLowerCase();

  let status: string | null = null;
  let action: { label: string; run: () => void } | null = null;
  if (!task) {
    action = { label: `+ ${where}`, run: () => fire(importGithubItemAsTask(item, day)) };
  } else if (task.done) {
    status = task.done_at ? `✓ feita ${shortDate(dayOfMs(task.done_at))}` : "✓ feita";
  } else {
    // An open task left over from an earlier day is on today's list.
    const planned = task.day < today ? today : task.day;
    status = `tarefa · ${dayLabel(planned, today).toLowerCase()}`;
    if (planned !== day) {
      action = { label: `trazer pra ${where}`, run: () => fire(moveTask(task.id, day)) };
    }
  }

  return (
    <li className="gh-row">
      <button
        type="button"
        className="gh-title"
        title="Abrir no GitHub"
        onClick={() => item.html_url.startsWith("https://") && fire(openUrl(item.html_url))}
      >
        <span className={item.is_pull_request ? "gh-kind pr" : "gh-kind issue"}>
          {item.is_pull_request ? "PR" : "Issue"}
        </span>
        <span className="gh-name">
          #{item.number} {item.title}
        </span>
      </button>
      <div className="gh-meta">
        <span className="gh-repo">{item.repository}</span>
        {status && <span className={task?.done ? "gh-status done" : "gh-status"}>{status}</span>}
        {action && (
          <button type="button" className="gh-action" onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>
    </li>
  );
}
