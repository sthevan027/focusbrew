import { describe, expect, it } from "vitest";
import { MAX_THEME_CSS_BYTES, validateManifest } from "./themeManifest";

const valid = {
  id: "halloween-abobora",
  name: "Abóbora",
  version: "1.0.0",
  author: "Sthevan",
  accent: "#FF7A1A",
  fonts: [{ family: "Pirata One", file: "assets/fonts/PirataOne.woff2" }],
  css: "theme.css",
  sounds: "abobora",
};

const SOUND_SETS = ["abobora"];

describe("validateManifest", () => {
  it("aceita um manifesto completo e normaliza a cor de destaque", () => {
    const result = validateManifest(valid, SOUND_SETS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("halloween-abobora");
      expect(result.manifest.accent).toBe("#FF7A1A");
      expect(result.manifest.fonts).toEqual([{ family: "Pirata One", file: "assets/fonts/PirataOne.woff2" }]);
    }
  });

  it("aceita os campos opcionais ausentes (sem fontes, sem sons, sem cor)", () => {
    const { fonts, sounds, accent, ...minimal } = valid;
    void fonts;
    void sounds;
    void accent;
    const result = validateManifest(minimal, SOUND_SETS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.fonts).toEqual([]);
      expect(result.manifest.sounds).toBe("none");
      expect(result.manifest.accent).toBeNull();
    }
  });

  it("a mascote é opcional e vale none quando ausente", () => {
    const absent = validateManifest(valid, SOUND_SETS);
    expect(absent.ok && absent.manifest.mascot).toBe("none");
    const present = validateManifest({ ...valid, mascot: "pumpkin" }, SOUND_SETS);
    expect(present.ok && present.manifest.mascot).toBe("pumpkin");
  });

  it("rejeita uma mascote desconhecida", () => {
    expect(validateManifest({ ...valid, mascot: "dragon" }, SOUND_SETS).ok).toBe(false);
  });

  it("ignora campos desconhecidos (compatibilidade futura), sem executar nada", () => {
    const result = validateManifest({ ...valid, script: "alert(1)", unknown: 1 }, SOUND_SETS);
    expect(result.ok).toBe(true);
  });

  it("rejeita a entrada que não é um objeto", () => {
    for (const raw of [null, "theme", 3, []]) {
      const result = validateManifest(raw, SOUND_SETS);
      expect(result.ok).toBe(false);
    }
  });

  it.each([
    ["id vazio", { id: "" }],
    ["id com maiúscula ou espaço", { id: "Halloween Abóbora" }],
    ["id com barra (caminho)", { id: "../etc" }],
    ["id longo demais", { id: "a".repeat(41) }],
    ["nome vazio", { name: "   " }],
    ["versão que não é semver", { version: "v1" }],
    ["autor ausente", { author: undefined }],
    ["cor que não é hex", { accent: "laranja" }],
    ["css fora do pacote (..)", { css: "../theme.css" }],
    ["css absoluto", { css: "/theme.css" }],
    ["css com extensão errada", { css: "theme.js" }],
    ["fonte com extensão não permitida", { fonts: [{ family: "X", file: "assets/x.exe" }] }],
    ["fonte sem família", { fonts: [{ file: "assets/x.woff2" }] }],
    ["som de conjunto desconhecido", { sounds: "trombone" }],
  ])("rejeita %s", (_label, override) => {
    const result = validateManifest({ ...valid, ...override }, SOUND_SETS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reporta todos os erros de uma vez, não só o primeiro", () => {
    const result = validateManifest({ id: "", name: "", version: "x", author: "" }, SOUND_SETS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("expõe o limite de tamanho do CSS (200 KB)", () => {
    expect(MAX_THEME_CSS_BYTES).toBe(200_000);
  });
});
