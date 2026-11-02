import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "../lib/themeLoader";
import { packageFor, themeOptions } from "./index";

describe("temas embutidos", () => {
  it("o padrão vem primeiro e não tem pacote", () => {
    const options = themeOptions();
    expect(options[0]).toEqual({ id: DEFAULT_THEME, name: "Padrão" });
    expect(packageFor(DEFAULT_THEME)).toBeNull();
  });

  it("todo tema embutido passa na validação e aparece no seletor", () => {
    const ids = themeOptions().map((o) => o.id);
    expect(ids).toContain("halloween-abobora");
    const pkg = packageFor("halloween-abobora");
    expect(pkg?.manifest.accent).toBe("#FF7A1A");
    expect(pkg?.css.length).toBeGreaterThan(0);
  });

  it("um id desconhecido não tem pacote", () => {
    expect(packageFor("nao-existe")).toBeNull();
  });
});
