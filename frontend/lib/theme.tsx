"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "forest" | "ocean" | "iris" | "graphite";

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "forest", label: "Forest", swatch: "#236848" },
  { id: "ocean", label: "Ocean", swatch: "#2559a3" },
  { id: "iris", label: "Iris", swatch: "#5442b8" },
  { id: "graphite", label: "Graphite", swatch: "#48596b" },
];

const MODE_KEY = "jp-theme";
const ACCENT_KEY = "jp-accent";

/** Runs in <head> before the first paint so the page never flashes the wrong theme. */
export const THEME_BOOTSTRAP = `(function(){try{var m=localStorage.getItem("${MODE_KEY}")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");var a=localStorage.getItem("${ACCENT_KEY}");if(a)r.dataset.accent=a;}catch(e){}})();`;

export function resolveDark(mode: ThemeMode, systemDark: boolean) {
  return mode === "dark" || (mode === "system" && systemDark);
}

interface ThemeContextValue {
  mode: ThemeMode;
  accent: Accent;
  dark: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function read<T extends string>(key: string, fallback: T, allowed: readonly string[]): T {
  try {
    const value = localStorage.getItem(key);
    return value && allowed.includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function apply(dark: boolean, accent: Accent, animate: boolean) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 250);
  }
  root.classList.toggle("dark", dark);
  root.dataset.accent = accent;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [accent, setAccentState] = useState<Accent>("forest");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with localStorage after mount
    setModeState(read(MODE_KEY, "system", ["light", "dark", "system"]));
    setAccentState(read(ACCENT_KEY, "forest", ACCENTS.map((a) => a.id)));
    setSystemDark(media.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const dark = resolveDark(mode, systemDark);
  useEffect(() => { apply(dark, accent, false); }, [dark, accent]);

  const setMode = useCallback((next: ThemeMode) => {
    try { localStorage.setItem(MODE_KEY, next); } catch { /* private mode */ }
    apply(resolveDark(next, matchMedia("(prefers-color-scheme: dark)").matches), accent, true);
    setModeState(next);
  }, [accent]);

  const setAccent = useCallback((next: Accent) => {
    try { localStorage.setItem(ACCENT_KEY, next); } catch { /* private mode */ }
    apply(dark, next, true);
    setAccentState(next);
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ mode, accent, dark, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within a ThemeProvider");
  return value;
}
