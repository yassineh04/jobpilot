"use client";
import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { AiDebrief, FactClaim } from "@/lib/types";
import { Card, CardHeader, ErrorBanner } from "@/components/ui/Primitives";
import { AiButton, AiWaiting, useAiStatus, Verified } from "./AiKit";

const STORAGE_KEY = "jobpilot.debrief";

function loadCached(): AiDebrief | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function Claim({ claim, facts, icon }: { claim: FactClaim; facts: Record<string, string>; icon: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[13px]">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="text-stone-800">{claim.text}</span>
        <span className="mt-0.5 block text-xs text-stone-500">
          Based on: {claim.fact_ids.map((id) => facts[id]).filter(Boolean).join(" · ")}
        </span>
      </span>
    </li>
  );
}

/** "Your week" written by the AI from facts computed by the server; every line cites its facts. */
export function DebriefCard() {
  const status = useAiStatus();
  const [debrief, setDebrief] = useState<AiDebrief | null>(loadCached);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status?.enabled) return null;

  const generate = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await api.debrief();
      setDebrief(result);
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result)); } catch { /* private mode */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the debrief.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Your week" description="A short debrief written from your own numbers"
                  action={<AiButton running={running} onClick={generate} variant="secondary" size="sm">
                    {debrief ? "Refresh" : "Write my debrief"}
                  </AiButton>} />
      <div className="space-y-4 p-4">
        <AiWaiting running={running} local={status.local} what="Looking at your week" />
        {error && <ErrorBanner message={error} />}
        {!debrief && !running && (
          <p className="text-[13px] text-stone-500">
            What moved this week, what is waiting on you, and three things to focus on next. Every line cites the numbers it comes from.
          </p>
        )}
        {debrief && !running && (
          <>
            <p className="text-[15px] font-medium text-stone-900">{debrief.headline}</p>
            {debrief.observations.length > 0 && (
              <ul className="space-y-2.5">
                {debrief.observations.map((o) => (
                  <Claim key={o.text} claim={o} facts={debrief.facts} icon={<Sparkles className="size-3.5 text-stone-500" />} />
                ))}
              </ul>
            )}
            {debrief.focus.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Focus next</p>
                <ul className="space-y-2.5">
                  {debrief.focus.map((f) => (
                    <Claim key={f.text} claim={f} facts={debrief.facts} icon={<ArrowRight className="size-3.5 text-accent-600" />} />
                  ))}
                </ul>
              </div>
            )}
            <Verified removed={debrief.removed_claims}>Every line cites facts computed from your data. Nothing predicts outcomes.</Verified>
          </>
        )}
      </div>
    </Card>
  );
}
