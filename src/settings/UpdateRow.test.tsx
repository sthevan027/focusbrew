import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import UpdateRow from "./UpdateRow";
import { initialUpdateState } from "./updateStatus";
import type { UpdateState } from "./updateStatus";

const noop = () => {};
const render = (state: UpdateState) =>
  renderToStaticMarkup(<UpdateRow update={{ state, checkNow: noop, install: noop }} />);

describe("UpdateRow", () => {
  it("offers to check before any check has run", () => {
    const html = render(initialUpdateState);
    expect(html).toContain("Verificar agora");
    expect(html).not.toContain("Verificado às");
  });

  it("shows up to date after a clean check", () => {
    const html = render({ ...initialUpdateState, lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime() });
    expect(html).toContain("Você está na versão mais recente. Verificado às 17:09.");
    expect(html).toContain("Verificar agora");
  });

  it("offers to update when a version is available", () => {
    const html = render({
      ...initialUpdateState,
      lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime(),
      availableVersion: "0.5.0",
    });
    expect(html).toContain("Versão 0.5.0 disponível");
    expect(html).toContain("Atualizar agora");
  });

  it("shows the error text when there is one", () => {
    const html = render({ ...initialUpdateState, error: "sem internet" });
    expect(html).toContain("sem internet");
    expect(html).not.toContain("class=\"error\"");
  });

  it("disables the button while checking or installing", () => {
    expect(render({ ...initialUpdateState, checking: true })).toContain("disabled");
    expect(render({ ...initialUpdateState, installing: true })).toContain("disabled");
  });
});
