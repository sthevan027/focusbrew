import { MAX_THEME_CSS_BYTES, validateManifest } from "./themeManifest";
import type { ThemeManifest } from "./themeManifest";

/** The id of the theme that changes nothing: no attribute, no injected CSS. */
export const DEFAULT_THEME = "default";
/** The one `<style>` the loader owns. Changing themes replaces its text; the default removes it. */
export const THEME_STYLE_ID = "focusbrew-theme-css";

/** A theme ready to apply: its validated manifest and its stylesheet. */
export interface ThemePackage {
  manifest: ThemeManifest;
  css: string;
}

/** What the build hands over for a package: the parsed theme.json and the theme.css text. */
export interface ThemeSource {
  manifest: unknown;
  css: string;
}

export type PackageResult = { ok: true; pkg: ThemePackage } | { ok: false; errors: string[] };

/**
 * Validates a package before it is applied. The stylesheet is checked for size
 * and emptiness here, the manifest by `validateManifest`.
 */
export function buildPackage(source: ThemeSource, soundSets: readonly string[]): PackageResult {
  const parsed = validateManifest(source.manifest, soundSets);
  if (!parsed.ok) return parsed;
  const errors: string[] = [];
  const bytes = new TextEncoder().encode(source.css).length;
  if (source.css.trim().length === 0) errors.push("css: o arquivo de estilo está vazio");
  if (bytes > MAX_THEME_CSS_BYTES) errors.push(`css: arquivo grande demais (máximo ${MAX_THEME_CSS_BYTES} bytes)`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, pkg: { manifest: parsed.manifest, css: source.css } };
}

/**
 * The `data-theme` value for the window's root element. The default theme gives
 * no attribute at all, so its markup is the same as before the theme system.
 */
export function themeAttribute(themeId: string): string | undefined {
  return themeId === DEFAULT_THEME ? undefined : themeId;
}

/**
 * Puts the theme's stylesheet in the document, or takes it out. The CSS itself is
 * scoped to `[data-theme="<id>"]`, so a stale sheet matches nothing.
 */
export function applyTheme(doc: Document, themeId: string, pkg: ThemePackage | null): void {
  const existing = doc.getElementById(THEME_STYLE_ID);
  if (themeId === DEFAULT_THEME || !pkg) {
    existing?.remove();
    return;
  }
  const style = existing ?? doc.createElement("style");
  style.id = THEME_STYLE_ID;
  style.textContent = pkg.css;
  if (!existing) doc.head.appendChild(style);
}

/** The accent a window uses: the theme's fixed one, else the user's own color. */
export function resolveAccent(pkg: ThemePackage | null, userAccent: string): string {
  return pkg?.manifest.accent ?? userAccent;
}

/** Sets or removes `data-theme` on a root element (the settings and note windows have no `.widget-root`). */
export function markRoot(el: HTMLElement, themeId: string): void {
  const value = themeAttribute(themeId);
  if (value === undefined) el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", value);
}

/** The format a font file is declared with, from its extension. */
function fontFormat(file: string): string {
  if (file.endsWith(".woff2")) return "woff2";
  if (file.endsWith(".woff")) return "woff";
  return "truetype";
}

/**
 * The `@font-face` rules for a package's fonts, pointing at URLs the build made.
 * Fonts whose file has no URL are left out (the theme falls back to the system font).
 * The family name is cleaned of quotes and backslashes before it goes into CSS.
 */
export function fontFaceCss(
  fonts: { family: string; file: string }[],
  urlFor: (file: string) => string | undefined,
): string {
  return fonts
    .flatMap((font) => {
      const url = urlFor(font.file);
      if (!url) return [];
      const family = font.family.replace(/["\\\r\n]/g, "");
      return [
        `@font-face{font-family:"${family}";src:url("${url}") format("${fontFormat(font.file)}");font-weight:200 1000;font-style:normal;font-display:swap}`,
      ];
    })
    .join("\n");
}
