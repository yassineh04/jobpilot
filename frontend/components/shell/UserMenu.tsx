"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Keyboard, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn, initials } from "@/lib/format";
import { ACCENTS, type ThemeMode, useTheme } from "@/lib/theme";

const MODES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeControls({ compact }: { compact?: boolean }) {
  const { mode, setMode, accent, setAccent } = useTheme();
  return (
    <div className={cn("space-y-3", compact && "space-y-2.5")}>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-md bg-stone-100 p-0.5">
        {MODES.map((m) => (
          <button type="button" key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)}
                  className={cn("flex h-7 items-center justify-center gap-1.5 rounded text-xs font-medium transition-colors",
                                mode === m.id ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:text-stone-900")}>
            <m.icon className="size-3.5" />{m.label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Accent color" className="flex items-center gap-2">
        {ACCENTS.map((a) => (
          <button type="button" key={a.id} role="radio" aria-checked={accent === a.id} aria-label={a.label} title={a.label}
                  onClick={() => setAccent(a.id)}
                  className={cn("flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-white transition-shadow",
                                accent === a.id ? "ring-2 ring-stone-400" : "hover:ring-2 hover:ring-stone-200")}
                  style={{ background: a.swatch }}>
            {accent === a.id && <Check className="size-3.5 text-white" />}
          </button>
        ))}
        {!compact && <span className="ml-1 text-xs text-stone-500">{ACCENTS.find((a) => a.id === accent)?.label}</span>}
      </div>
    </div>
  );
}

export function UserMenu({ onShortcuts, onNavigate }: { onShortcuts: () => void; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = user?.full_name || user?.email || "";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {open && (
        <div id="account-popover" role="group" aria-label="Account"
             className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-stone-200 bg-white p-1.5 shadow-pop animate-pop-in">
          <div className="px-2.5 pb-2.5 pt-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Appearance</p>
            <div className="mt-2"><ThemeControls compact /></div>
          </div>
          <div className="my-1 h-px bg-stone-100" />
          <Link href="/settings" onClick={() => { setOpen(false); onNavigate?.(); }}
                className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-stone-700 hover:bg-stone-100">
            <Settings className="size-4 text-stone-500" />Settings
          </Link>
          <button type="button" onClick={() => { setOpen(false); onShortcuts(); }}
                  className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-stone-700 hover:bg-stone-100">
            <Keyboard className="size-4 text-stone-500" />Keyboard shortcuts
            <kbd className="ml-auto rounded border border-stone-200 px-1 text-[10px] text-stone-500">?</kbd>
          </button>
          <button type="button" onClick={logout}
                  className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-stone-700 hover:bg-stone-100">
            <LogOut className="size-4 text-stone-500" />Log out
          </button>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={open ? "account-popover" : undefined}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-stone-200/50">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[11px] font-semibold text-accent-800">
          {name ? initials(name) : ""}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-stone-900">{user?.full_name || "—"}</span>
          <span className="block truncate text-[11px] text-stone-600">{user?.email}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-stone-500" />
      </button>
    </div>
  );
}

/** One-click light/dark switch for pages without the sidebar. */
export function ThemeToggle({ className }: { className?: string }) {
  const { dark, setMode } = useTheme();
  return (
    <button type="button" onClick={() => setMode(dark ? "light" : "dark")}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"}
            className={cn("flex size-8 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-200/60 hover:text-stone-900", className)}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
