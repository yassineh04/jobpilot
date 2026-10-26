"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

/** "g" then a letter navigates, like Gmail or Linear. */
export const GO_TO: Record<string, { href: string; label: string }> = {
  o: { href: "/dashboard", label: "Overview" },
  a: { href: "/applications", label: "Applications" },
  g: { href: "/agenda", label: "Agenda" },
  i: { href: "/interviews", label: "Interview prep" },
  c: { href: "/contacts", label: "Contacts" },
  p: { href: "/profile", label: "Profile & resumes" },
  y: { href: "/analytics", label: "Analytics" },
  j: { href: "/assistant", label: "JobPilot agent (full page)" },
  s: { href: "/settings", label: "Settings" },
};

const ACTIONS = [
  { keys: ["Ctrl", "K"], label: "Search everything" },
  { keys: ["N"], label: "New application" },
  { keys: ["J"], label: "Open or close the agent" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Esc"], label: "Close a dialog" },
];

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function useGlobalShortcuts({ onPalette, onHelp, onAgent }: { onPalette: () => void; onHelp: () => void; onAgent: () => void }) {
  const router = useRouter();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onPalette();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        if (GO_TO[key]) {
          e.preventDefault();
          router.push(GO_TO[key].href);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = window.setTimeout(() => { pendingG.current = null; }, 1200);
      } else if (key === "n") {
        e.preventDefault();
        router.push("/applications?new=1");
      } else if (key === "j") {
        e.preventDefault();
        onAgent();
      } else if (e.key === "?") {
        e.preventDefault();
        onHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, onPalette, onHelp, onAgent]);
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex gap-1">
      {keys.map((k) => (
        <kbd key={k} className="min-w-6 rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-center text-[11px] font-medium text-stone-700">{k}</kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" description="Work without leaving the keyboard." onClose={onClose}>
      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Actions</h3>
          <ul className="space-y-2">
            {ACTIONS.map((a) => (
              <li key={a.label} className="flex items-center justify-between gap-3 text-[13px] text-stone-700">{a.label}<Keys keys={a.keys} /></li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Go to</h3>
          <ul className="space-y-2">
            {Object.entries(GO_TO).map(([key, item]) => (
              <li key={key} className="flex items-center justify-between gap-3 text-[13px] text-stone-700">{item.label}<Keys keys={["G", key.toUpperCase()]} /></li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
