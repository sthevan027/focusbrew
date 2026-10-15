import { describe, expect, it } from "vitest";
import { FALLBACK_INSTALLER_URL, fetchReleases, formatSize, installerUrl, parseHighlights, parseReleases, pickInstaller } from "./release";
import { isWindows } from "./platform";

const asset = (name: string) => ({ name, size: 2_411_724, browser_download_url: `https://x/${name}` });
const rel = (tag: string, extra = {}) => ({
  tag_name: tag,
  name: tag,
  html_url: `https://x/${tag}`,
  published_at: "2026-10-09T12:00:00Z",
  draft: false,
  prerelease: false,
  assets: [asset(`focusbrew_${tag.slice(1)}_x64-setup.exe`)],
  ...extra,
});

describe("release", () => {
  it("acha o instalador pelo padrão de nome, ignorando outros assets", () => {
    expect(pickInstaller([asset("latest.json"), asset("focusbrew_0.4.1_x64-setup.exe")])?.name).toBe(
      "focusbrew_0.4.1_x64-setup.exe",
    );
    expect(pickInstaller([asset("latest.json")])).toBeUndefined();
  });

  it("ignora rascunhos e pré-releases e não quebra sem asset", () => {
    const list = parseReleases([rel("v0.5.0-beta.1", { prerelease: true }), rel("v0.4.2", { draft: true }), rel("v0.4.1", { assets: [] })]);
    expect(list.map((r) => r.version)).toEqual(["v0.4.1"]);
    expect(list[0].installer).toBeUndefined();
  });

  it("usa a entrada não-array como lista vazia", () => {
    expect(parseReleases({ message: "rate limited" })).toEqual([]);
  });

  it("propaga erro da API e usa o cache de sessão", async () => {
    await expect(fetchReleases((async () => new Response("", { status: 403 })) as typeof fetch)).rejects.toThrow("403");
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    let calls = 0;
    const ok = (async () => (calls++, new Response(JSON.stringify([rel("v0.4.1")])))) as typeof fetch;
    expect((await fetchReleases(ok, storage))[0].version).toBe("v0.4.1");
    await fetchReleases(ok, storage);
    expect(calls).toBe(1);
  });

  it("baixa direto o instalador da última release, ou o fallback — nunca a página da release", () => {
    const [latest] = parseReleases([rel("v0.5.0")]);
    expect(installerUrl(latest)).toBe("https://x/focusbrew_0.5.0_x64-setup.exe");
    expect(installerUrl(undefined)).toBe(FALLBACK_INSTALLER_URL);
    expect(installerUrl(parseReleases([rel("v0.5.1", { assets: [] })])[0])).toBe(FALLBACK_INSTALLER_URL);
    expect(FALLBACK_INSTALLER_URL).toMatch(/\/releases\/download\/.+_x64-setup\.exe$/);
  });

  it("formata tamanho em MB pt-BR", () => {
    expect(formatSize(2_411_724)).toBe("2,3 MB");
  });

  it("o beta nunca é a versão mais recente retornada", () => {
    const list = parseReleases([rel("v0.5.0-beta.1", { prerelease: true }), rel("v0.4.1")]);
    expect(list[0].version).toBe("v0.4.1");
  });
});

describe("parseHighlights", () => {
  it("lê os itens de Novidades, junta continuações e limpa PRs/imagens, parando em Instalação", () => {
    const body = "## Novidades\n\n- **Notas rápidas** — texto, caneta e formas,\n  direto sobre o painel (#7)\n- **Activity grid** — streak de dias seguidos (#5)\n\n![img](https://x/a.png)\n\n## Instalação\n\n- baixe o `.exe`";
    expect(parseHighlights(body)).toEqual([
      "**Notas rápidas** — texto, caneta e formas, direto sobre o painel",
      "**Activity grid** — streak de dias seguidos",
    ]);
  });

  it("para em seções de assinatura e limita a 5 itens", () => {
    const body = "# FocusBrew 0.4.1\n\n## Correções\n\n" + Array.from({ length: 7 }, (_, i) => `- item ${i}`).join("\n") + "\n\n## Agora assinado ✍️\n\n- não entra";
    const list = parseHighlights(body);
    expect(list).toHaveLength(5);
    expect(list).not.toContain("não entra");
  });

  it("devolve vazio sem notas e entra em ReleaseInfo", () => {
    expect(parseHighlights(null)).toEqual([]);
    expect(parseReleases([{ ...rel("v0.4.1"), body: "- um\n- dois" }])[0].highlights).toEqual(["um", "dois"]);
  });
});

describe("platform", () => {
  it("detecta Windows", () => {
    expect(isWindows({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(true);
    expect(isWindows({ userAgent: "Mozilla/5.0 (Macintosh)", userAgentData: { platform: "macOS" } })).toBe(false);
    expect(isWindows({ userAgent: "Mozilla/5.0 (Linux; Android 14)" })).toBe(false);
  });
});
