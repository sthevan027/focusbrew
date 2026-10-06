import { describe, expect, it } from "vitest";
import { titleWithoutProject } from "./project";

// Same rule as split_project in src-tauri/src/tracker/tasks.rs.
describe("titleWithoutProject", () => {
  it("drops a trailing #project", () => {
    expect(titleWithoutProject("Corrigir login #virex")).toBe("Corrigir login");
    expect(titleWithoutProject("#virex")).toBe("");
    expect(titleWithoutProject("  Deploy  #focus-brew ")).toBe("Deploy");
  });

  it("keeps hashtags that are not projects", () => {
    expect(titleWithoutProject("Revisar PR #12")).toBe("Revisar PR #12");
    expect(titleWithoutProject("Aprender C#")).toBe("Aprender C#");
    expect(titleWithoutProject("tag#virex")).toBe("tag#virex");
  });
});
