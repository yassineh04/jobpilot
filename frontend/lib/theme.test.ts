import { describe, expect, it } from "vitest";
import { ACCENTS, resolveDark, THEME_BOOTSTRAP } from "./theme";
import { hueFor } from "@/components/ui/CompanyAvatar";

describe("resolveDark", () => {
  it("follows an explicit choice", () => {
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
  });
  it("follows the operating system in system mode", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
  });
});

describe("theme bootstrap script", () => {
  function run(stored: Record<string, string>, systemDark: boolean) {
    const classes = new Set<string>();
    const root = { classList: { add: (c: string) => classes.add(c) }, dataset: {} as Record<string, string> };
    const fn = new Function("localStorage", "matchMedia", "document", THEME_BOOTSTRAP);
    fn({ getItem: (k: string) => stored[k] ?? null }, () => ({ matches: systemDark }), { documentElement: root });
    return { dark: classes.has("dark"), accent: root.dataset.accent };
  }
  it("applies the stored mode and accent before React loads", () => {
    expect(run({ "jp-theme": "dark", "jp-accent": "iris" }, false)).toEqual({ dark: true, accent: "iris" });
  });
  it("defaults to the system preference", () => {
    expect(run({}, true).dark).toBe(true);
    expect(run({}, false).dark).toBe(false);
  });
  it("never throws when storage is blocked", () => {
    const fn = new Function("localStorage", "matchMedia", "document", THEME_BOOTSTRAP);
    expect(() => fn({ getItem: () => { throw new Error("blocked"); } }, () => ({ matches: false }), {})).not.toThrow();
  });
});

describe("accents and company colors", () => {
  it("has unique accent ids", () => {
    expect(new Set(ACCENTS.map((a) => a.id)).size).toBe(ACCENTS.length);
  });
  it("gives a company the same hue every time, whatever the case", () => {
    expect(hueFor("Shopify")).toBe(hueFor("shopify"));
    expect(hueFor("Shopify")).toBeGreaterThanOrEqual(0);
    expect(hueFor("Shopify")).toBeLessThan(360);
  });
});
