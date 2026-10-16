"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import type { AiStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";

let statusPromise: Promise<AiStatus> | null = null;

/** AI provider status, fetched once per page load. */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    statusPromise ??= api.aiStatus().catch(() => ({ enabled: false, provider: null, model: null, local: false }));
    let alive = true;
    statusPromise.then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);
  return status;
}

/** Seconds since `running` became true, so slow local models still feel alive. */
function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart the counter for each run
    setSeconds(0);
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return seconds;
}

export function AiButton({ running, onClick, children, variant = "primary", size = "md", disabled, className }: {
  running: boolean; onClick: () => void; children: React.ReactNode;
  variant?: "primary" | "secondary"; size?: "sm" | "md"; disabled?: boolean; className?: string;
}) {
  const seconds = useElapsed(running);
  return (
    <Button variant={variant} size={size} onClick={onClick} disabled={disabled || running} className={className}
            icon={running ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}>
      {running ? `Working… ${seconds}s` : children}
    </Button>
  );
}

export function AiWaiting({ running, local, what }: { running: boolean; local?: boolean; what: string }) {
  const seconds = useElapsed(running);
  if (!running) return null;
  return (
    <div className="flex items-center gap-3 rounded-md border border-stone-200 bg-stone-50 px-3.5 py-3 text-[13px] text-stone-600" role="status">
      <Loader2 className="size-4 shrink-0 animate-spin text-accent-600" />
      <span className="flex-1">
        {what}… <span className="tabular-nums text-stone-500">{seconds}s</span>
        {local && seconds > 8 && <span className="block text-xs text-stone-500">The local model runs on your computer, so this can take up to a minute.</span>}
      </span>
    </div>
  );
}

export function AiNotConfigured({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex gap-3 rounded-md border border-dashed border-stone-300 bg-white text-[13px] text-stone-600",
                       compact ? "px-3 py-2.5" : "p-4")}>
      <KeyRound className="mt-0.5 size-4 shrink-0 text-stone-500" />
      <p>
        AI features are off on this server. They are free to turn on: run the local model with Docker, or add a free
        Groq or Gemini key. <Link href="/settings#ai" className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">See how</Link>
      </p>
    </div>
  );
}

/** Tells the user that claims were checked, and how many were removed. */
export function Verified({ removed, children }: { removed: number; children?: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-stone-500">
      <ShieldCheck className="mt-px size-3.5 shrink-0 text-accent-600" />
      <span>
        {children ?? "Every quote was checked against the source."}
        {removed > 0 && ` ${removed} unverifiable statement${removed === 1 ? " was" : "s were"} removed.`}
      </span>
    </p>
  );
}

export function Quote({ children }: { children: React.ReactNode }) {
  return <q className="block border-l-2 border-accent-200 pl-2.5 text-xs italic text-stone-500 before:content-none after:content-none">{children}</q>;
}
