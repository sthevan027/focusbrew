import { describe, expect, it } from "vitest";
import type { GithubEvent, GithubItem, Task } from "./types";
import { githubForDay, knownTitles, linkedTask } from "./github";

const item = (number: number, repository = "me/focusbrew"): GithubItem => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/${repository}/pull/${number}`,
  repository,
  is_pull_request: true,
  updated_at: "",
});

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  note: null,
  minutes: 25,
  done: false,
  created_at: "",
  source: "github",
  spent_secs: 0,
  day: "2026-10-08",
  done_at: null,
  project: null,
  url: null,
  ...extra,
});

describe("knownTitles", () => {
  it("collects titles from the open items and from imported tasks", () => {
    const titles = knownTitles([item(5)], [task("t", { title: "Old PR", note: "me/x #3" }), task("m", { note: "loose note" })]);
    expect(titles).toEqual({ "me/focusbrew#5": "PR 5", "me/x#3": "Old PR" });
  });
});

describe("linkedTask", () => {
  it("finds the task made from this PR by its link", () => {
    const tasks = [task("a", { url: "https://github.com/me/focusbrew/pull/5" }), task("b")];
    expect(linkedTask(item(5), tasks)?.id).toBe("a");
    expect(linkedTask(item(6), tasks)).toBe(null);
  });

  it("also recognises tasks imported before links existed, by their note", () => {
    const tasks = [task("old", { note: "me/focusbrew #5" })];
    expect(linkedTask(item(5), tasks)?.id).toBe("old");
    expect(linkedTask(item(5, "me/other"), tasks)).toBe(null);
  });

  it("prefers an open task over a done one", () => {
    const url = "https://github.com/me/focusbrew/pull/5";
    const tasks = [task("done", { url, done: true }), task("open", { url })];
    expect(linkedTask(item(5), tasks)?.id).toBe("open");
  });
});

const ev = (kind: string, extra: Partial<GithubEvent> = {}): GithubEvent => ({
  day: "2026-10-05",
  kind,
  repo: "me/focusbrew",
  number: null,
  title: null,
  count: 1,
  at: "",
  ...extra,
});

describe("githubForDay", () => {
  it("adds up the pushes of a day per repository", () => {
    const lines = githubForDay(
      [ev("push", { count: 3 }), ev("push", { count: 2 }), ev("push", { count: 1, repo: "me/x" }), ev("push", { day: "2026-10-04", count: 9 })],
      "2026-10-05",
    );
    expect(lines).toEqual([
      { key: "push:me/focusbrew", text: "5 commits em focusbrew" },
      { key: "push:me/x", text: "1 commit em x" },
    ]);
  });

  it("describes PRs, issues and reviews, without repeating one", () => {
    const lines = githubForDay(
      [
        ev("pr_merged", { number: 5, title: "Daily notch" }),
        ev("pr_opened", { number: 5, title: "Daily notch" }),
        ev("issue_closed", { number: 9, title: "Bug", repo: "me/x" }),
        ev("review", { number: 2, title: "Feature", repo: "org/y" }),
        ev("review", { number: 2, title: "Feature", repo: "org/y" }),
      ],
      "2026-10-05",
    );
    expect(lines.map((l) => l.text)).toEqual([
      "PR #5 mesclado — Daily notch",
      "PR #5 aberto — Daily notch",
      "Issue #9 fechada — Bug",
      "Review no PR #2 — Feature",
    ]);
  });

  it("fills in titles the events API leaves out", () => {
    const lines = githubForDay([ev("pr_opened", { number: 5 })], "2026-10-05", { "me/focusbrew#5": "Daily notch" });
    expect(lines[0].text).toBe("PR #5 aberto — Daily notch");
  });

  it("leaves out a missing number instead of writing #null", () => {
    expect(githubForDay([ev("pr_merged", { number: null })], "2026-10-05")[0].text).toBe("PR mesclado");
  });

  it("is empty on a day with nothing", () => {
    expect(githubForDay([ev("push")], "2026-10-01")).toEqual([]);
  });
});
