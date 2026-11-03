import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, resolveAccent } from "../lib/themeLoader";
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

  // Regressão: a janela de Nota (e a Nota dentro do widget) usa o mesmo accent do tema, não o do usuário.
  it("no tema abóbora o accent é laranja mesmo com outra cor escolhida pelo usuário", () => {
    expect(resolveAccent(packageFor("halloween-abobora"), "#0A84FF")).toBe("#FF7A1A");
    expect(resolveAccent(packageFor(DEFAULT_THEME), "#0A84FF")).toBe("#0A84FF");
  });
});
