import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SECTION_ICONS } from "./icons";

const names = Object.keys(SECTION_ICONS) as (keyof typeof SECTION_ICONS)[];
const html = (name: keyof typeof SECTION_ICONS) => renderToStaticMarkup(SECTION_ICONS[name]());

describe("the settings section icons", () => {
  it("has one icon per section", () => {
    expect(names.sort()).toEqual(["focus", "general", "github", "notch"]);
  });

  it("share the same grid, stroke and caps, so the set looks like one family", () => {
    const roots = names.map((n) => /^<svg[^>]*>/.exec(html(n))?.[0]);
    for (const root of roots) {
      expect(root).toContain('viewBox="0 0 24 24"');
      expect(root).toContain('fill="none"');
      expect(root).toContain('stroke="currentColor"');
      expect(root).toContain('stroke-width="2"');
      expect(root).toContain('stroke-linecap="round"');
      expect(root).toContain('stroke-linejoin="round"');
      expect(root).toContain('aria-hidden="true"');
    }
    expect(new Set(roots).size).toBe(1);
  });

  it("never hardcode a color: they take the text color of the button", () => {
    for (const name of names) {
      expect(html(name), name).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb\(|stroke="(?!currentColor)/);
    }
  });

  it("keep every coordinate within the 24 grid", () => {
    for (const name of names) {
      const numbers = [...html(name).matchAll(/(?:^|[\s"MLHVCSQTAZmlhvcsqtaz,])(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      expect(Math.max(...numbers), name).toBeLessThanOrEqual(24);
    }
  });
});
