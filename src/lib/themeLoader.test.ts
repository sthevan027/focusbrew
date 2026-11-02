import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_STYLE_ID, applyTheme, buildPackage, markRoot, resolveAccent, themeAttribute } from "./themeLoader";
import { MAX_THEME_CSS_BYTES } from "./themeManifest";

const manifest = {
  id: "halloween-abobora",
  name: "Abóbora",
  version: "1.0.0",
  author: "Sthevan",
  accent: "#FF7A1A",
  fonts: [],
  css: "theme.css",
  sounds: "abobora",
};

const SOUND_SETS = ["abobora"];

/** A document with just what the loader touches: a head, and style elements by id. */
function fakeDocument() {
  const head: FakeEl[] = [];
  const doc = {
    head: {
      appendChild(el: FakeEl) {
        head.push(el);
        return el;
      },
    },
    createElement(tag: string) {
      const el: FakeEl = {
        tagName: tag.toUpperCase(),
        id: "",
        textContent: "",
        remove() {
          const at = head.indexOf(el);
          if (at >= 0) head.splice(at, 1);
        },
      };
      return el;
    },
    getElementById(id: string) {
      return head.find((el) => el.id === id) ?? null;
    },
  };
  return { doc, head };
}
interface FakeEl {
  tagName?: string;
  id: string;
  textContent: string | null;
  remove: () => void;
}

describe("themeAttribute", () => {
  it("o tema padrão não põe atributo nenhum (a marcação fica igual)", () => {
    expect(themeAttribute(DEFAULT_THEME)).toBeUndefined();
  });

  it("qualquer outro tema vira data-theme com o id", () => {
    expect(themeAttribute("halloween-abobora")).toBe("halloween-abobora");
  });
});

describe("buildPackage", () => {
  it("monta o pacote a partir do manifesto e do CSS validados", () => {
    const result = buildPackage({ manifest, css: ".widget-root[data-theme=\"halloween-abobora\"]{color:red}" }, SOUND_SETS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pkg.manifest.id).toBe("halloween-abobora");
  });

  it("recusa CSS vazio", () => {
    const result = buildPackage({ manifest, css: "   " }, SOUND_SETS);
    expect(result.ok).toBe(false);
  });

  it("recusa CSS acima do limite de tamanho", () => {
    const css = "a".repeat(MAX_THEME_CSS_BYTES + 1);
    const result = buildPackage({ manifest, css }, SOUND_SETS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/grande/);
  });

  it("recusa manifesto inválido e devolve os erros", () => {
    const result = buildPackage({ manifest: { ...manifest, id: "Bad Id" }, css: "a{}" }, SOUND_SETS);
    expect(result.ok).toBe(false);
  });
});

describe("applyTheme", () => {
  const pkg = (() => {
    const r = buildPackage({ manifest, css: "/*x*/" }, SOUND_SETS);
    if (!r.ok) throw new Error("fixture");
    return r.pkg;
  })();

  it("com tema padrão não cria nem toca em nenhum <style> do tema", () => {
    const { doc, head } = fakeDocument();
    applyTheme(doc as unknown as Document, DEFAULT_THEME, null);
    expect(head).toHaveLength(0);
  });

  it("injeta o CSS do pacote num único <style> com id fixo", () => {
    const { doc, head } = fakeDocument();
    applyTheme(doc as unknown as Document, "halloween-abobora", pkg);
    expect(head).toHaveLength(1);
    expect(head[0].id).toBe(THEME_STYLE_ID);
    expect(head[0].textContent).toBe("/*x*/");
  });

  it("trocar de tema substitui o CSS, sem duplicar o <style>", () => {
    const { doc, head } = fakeDocument();
    applyTheme(doc as unknown as Document, "halloween-abobora", pkg);
    const second = buildPackage({ manifest: { ...manifest, id: "outro" }, css: "/*y*/" }, SOUND_SETS);
    if (!second.ok) throw new Error("fixture");
    applyTheme(doc as unknown as Document, "outro", second.pkg);
    expect(head).toHaveLength(1);
    expect(head[0].textContent).toBe("/*y*/");
  });

  it("voltar ao padrão remove o <style> que o tema tinha deixado", () => {
    const { doc, head } = fakeDocument();
    applyTheme(doc as unknown as Document, "halloween-abobora", pkg);
    applyTheme(doc as unknown as Document, DEFAULT_THEME, null);
    expect(head).toHaveLength(0);
  });
});

describe("resolveAccent", () => {
  const pkg = (() => {
    const r = buildPackage({ manifest, css: "/*x*/" }, SOUND_SETS);
    if (!r.ok) throw new Error("fixture");
    return r.pkg;
  })();

  it("sem tema, vale a cor que o usuário escolheu", () => {
    expect(resolveAccent(null, "#0A84FF")).toBe("#0A84FF");
  });

  it("com tema que fixa a cor, o laranja do tema ganha", () => {
    expect(resolveAccent(pkg, "#0A84FF")).toBe("#FF7A1A");
  });
});

describe("markRoot", () => {
  function fakeRoot() {
    const attrs = new Map<string, string>();
    return {
      attrs,
      el: {
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        removeAttribute: (k: string) => attrs.delete(k),
      } as unknown as HTMLElement,
    };
  }

  it("o padrão deixa a raiz sem data-theme", () => {
    const { attrs, el } = fakeRoot();
    markRoot(el, DEFAULT_THEME);
    expect(attrs.has("data-theme")).toBe(false);
  });

  it("um tema põe data-theme, e voltar ao padrão tira", () => {
    const { attrs, el } = fakeRoot();
    markRoot(el, "halloween-abobora");
    expect(attrs.get("data-theme")).toBe("halloween-abobora");
    markRoot(el, DEFAULT_THEME);
    expect(attrs.has("data-theme")).toBe(false);
  });
});
