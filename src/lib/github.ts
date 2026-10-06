import type { GithubEvent, GithubItem, Task } from "./types";

/**
 * The task made from this PR/issue, if any: by its link, or — for tasks
 * imported before links were kept — by the "dono/repo #N" note. An open
 * task wins over a done one.
 */
export function linkedTask(item: GithubItem, tasks: Task[]): Task | null {
  const note = `${item.repository} #${item.number}`;
  const matches = tasks.filter((t) => t.url === item.html_url || (t.url === null && t.note === note));
  return matches.find((t) => !t.done) ?? matches[0] ?? null;
}

const LABEL: Record<string, string> = {
  pr_opened: "aberto",
  pr_merged: "mesclado",
  pr_closed: "fechado",
  pr_reopened: "reaberto",
  issue_opened: "aberta",
  issue_closed: "fechada",
  issue_reopened: "reaberta",
};

const repoName = (repo: string) => repo.split("/").pop() ?? repo;

/**
 * "dono/repo#N" -> title, from the open PRs/issues and from tasks imported
 * from GitHub (their note is "dono/repo #N"). The events feed often comes
 * without titles.
 */
export function knownTitles(items: GithubItem[], tasks: Task[]): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const t of tasks) {
    const m = t.note?.match(/^(\S+\/\S+) #(\d+)$/);
    if (m) titles[`${m[1]}#${m[2]}`] = t.title;
  }
  for (const i of items) titles[`${i.repository}#${i.number}`] = i.title;
  return titles;
}

function describe(e: GithubEvent, titles: Record<string, string>): string {
  const known = e.title ?? titles[`${e.repo}#${e.number}`];
  const title = known ? ` — ${known}` : "";
  if (e.kind === "review") return `Review no PR #${e.number}${title}`;
  const what = e.kind.startsWith("pr_") ? "PR" : "Issue";
  return `${what} #${e.number} ${LABEL[e.kind] ?? ""}${title}`;
}

/** What happened on GitHub that day: pushes summed per repo, then the rest. */
export function githubForDay(
  events: GithubEvent[],
  day: string,
  titles: Record<string, string> = {},
): { key: string; text: string }[] {
  const commits = new Map<string, number>();
  const others: { key: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.day !== day) continue;
    if (e.kind === "push") {
      commits.set(e.repo, (commits.get(e.repo) ?? 0) + e.count);
      continue;
    }
    const key = `${e.kind}:${e.repo}#${e.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    others.push({ key, text: describe(e, titles) });
  }
  const pushes = [...commits.entries()].map(([repo, n]) => ({
    key: `push:${repo}`,
    text: `${n} commit${n > 1 ? "s" : ""} em ${repoName(repo)}`,
  }));
  return [...pushes, ...others];
}
