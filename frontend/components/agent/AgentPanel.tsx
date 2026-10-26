"use client";
import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, RotateCcw, X } from "lucide-react";
import { AiNotConfigured, useAiStatus } from "@/components/ai/AiKit";
import { AgentConversation } from "./AgentChat";
import { AgentMark } from "./AgentMark";
import { useAgent } from "./AgentProvider";

const iconButton = "rounded-md p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900";

/** Floating button + side panel: the agent is one keystroke (J) away on every page. */
export function AgentPanel() {
  const pathname = usePathname();
  const status = useAiStatus();
  const { open, setOpen, messages, reset } = useAgent();
  const launcher = useRef<HTMLButtonElement>(null);
  const onPage = pathname === "/assistant";
  const visible = open && !onPage;

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());  // the launcher renders again after closing
  }, [setOpen]);

  useEffect(() => {
    if (!visible) return;
    document.body.dataset.agentOpen = "";
    // Esc closes the panel, unless a dialog on top of it should close first
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.body.dataset.agentOpen;
      window.removeEventListener("keydown", onKey);
    };
  }, [visible, close]);

  if (onPage) return null;
  return (
    <>
      {!open && (
        <button type="button" ref={launcher} onClick={() => setOpen(true)} aria-expanded={false}
                title="JobPilot agent (J)"
                className="fixed bottom-5 right-5 z-40 flex h-11 items-center gap-2 rounded-full bg-stone-900 pl-3.5 pr-4 text-[13px] font-medium text-white shadow-pop transition-transform hover:-translate-y-0.5 animate-pop-in">
          <AgentMark />
          <span>Ask JobPilot</span>
          <kbd className="hidden rounded border border-white/25 px-1 text-[10px] font-medium text-white/70 sm:inline">J</kbd>
        </button>
      )}
      {open && (
        <aside id="agent-panel" aria-label="JobPilot agent"
               className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-stone-200 bg-white shadow-pop animate-slide-in sm:w-[420px]">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 px-4">
            <span className="flex size-7 items-center justify-center rounded-full bg-accent-600 text-on-accent">
              <AgentMark />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-stone-900">JobPilot agent</h2>
              <p className="truncate text-[11px] text-stone-500">Looks things up, prepares changes. You confirm.</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={reset} aria-label="New conversation" title="New conversation" className={iconButton}>
                <RotateCcw className="size-4" />
              </button>
            )}
            <Link href="/assistant" onClick={() => setOpen(false)} aria-label="Open full page" title="Open full page" className={iconButton}>
              <Maximize2 className="size-4" />
            </Link>
            <button type="button" onClick={close} aria-label="Close agent" title="Close (Esc)" className={iconButton}>
              <X className="size-4" />
            </button>
          </header>
          {status && !status.enabled
            ? <div className="p-4"><AiNotConfigured /></div>
            : <AgentConversation variant="panel" />}
        </aside>
      )}
    </>
  );
}
