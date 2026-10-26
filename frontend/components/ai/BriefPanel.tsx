"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleDashed, HelpCircle, MessageCircleQuestion, RefreshCw, Target } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { AiBrief, Application } from "@/lib/types";
import { Card, CardHeader, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/Primitives";
import { AiButton, AiNotConfigured, AiWaiting, Quote, useAiStatus, Verified } from "./AiKit";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-stone-900">{icon}{title}</h3>
      {children}
    </section>
  );
}

export function BriefPanel({ app, onEdit }: { app: Application; onEdit: () => void }) {
  const status = useAiStatus();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: brief, setData, loading } = useAsync<AiBrief | null>(
    () => api.getBrief(app.id).catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))),
    [app.id]);

  const generate = async () => {
    setRunning(true);
    setError(null);
    try {
      setData(await api.generateBrief(app.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The brief could not be generated.");
    } finally {
      setRunning(false);
    }
  };

  if (loading || !status) return <Skeleton className="h-72" />;
  const hasPosting = (app.job_description ?? "").trim().length >= 80;

  if (!brief) {
    return (
      <Card>
        <EmptyState icon={<Target className="size-5" />} title="A 1-minute read before you apply or interview"
                    action={status.enabled && hasPosting && !running &&
                      <AiButton running={running} onClick={generate}>Generate the brief</AiButton>}>
          What this employer really cares about (quoted from the posting), how your profile matches, questions worth
          asking, and what to clarify. Every quote is checked against the posting before it is shown.
        </EmptyState>
        <div className="space-y-3 px-4 pb-4">
          {!status.enabled && <AiNotConfigured />}
          {status.enabled && !hasPosting && (
            <p className="text-center text-[13px] text-stone-500">
              Add the job description first. <button type="button" onClick={onEdit} className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">Edit the application</button>
            </p>
          )}
          <AiWaiting running={running} local={status.local} what="Reading the posting and checking every quote" />
          {error && <ErrorBanner message={error} />}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-[15px] leading-relaxed text-stone-800">{brief.summary}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Verified removed={brief.removed_claims} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-500">{formatDateTime(brief.created_at)} · {brief.model}</span>
            {status.enabled && (
              <AiButton running={running} onClick={generate} variant="secondary" size="sm">
                <RefreshCw className="size-3.5" />Regenerate
              </AiButton>
            )}
          </div>
        </div>
        {running && <div className="mt-3"><AiWaiting running local={status.local} what="Re-reading the posting" /></div>}
        {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <Section icon={<Target className="size-4 text-accent-600" />} title="What they care about">
            {brief.priorities.length === 0 ? <p className="text-[13px] text-stone-500">No verifiable priorities found.</p> : (
              <ul className="space-y-3">
                {brief.priorities.map((p) => (
                  <li key={p.quote} className="space-y-1">
                    <p className="text-[13px] font-medium text-stone-800">{p.point}</p>
                    <Quote>{p.quote}</Quote>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>

        <Card className="p-4">
          <Section icon={<Check className="size-4 text-accent-600" />} title="Your fit">
            <div className="space-y-3 text-[13px]">
              {brief.strengths.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-stone-500">Backed by evidence in your profile</p>
                  <ul className="space-y-1.5">
                    {brief.strengths.map((s) => (
                      <li key={s.skill}>
                        <span className="font-medium text-stone-900">{s.skill}</span>
                        <span className="text-xs text-stone-500"> · {s.evidence.join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {brief.self_reported.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                  <CircleDashed className="size-3.5 text-amber-600" />Self-reported, no evidence yet:
                  {brief.self_reported.map((s) => <span key={s} className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">{s}</span>)}
                </p>
              )}
              {brief.gaps.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                  <HelpCircle className="size-3.5" />Not in your profile:
                  {brief.gaps.map((s) => <span key={s} className="rounded border border-stone-200 px-1.5 py-0.5 text-stone-700">{s}</span>)}
                </p>
              )}
              {brief.strengths.length + brief.self_reported.length + brief.gaps.length === 0 && (
                <p className="text-stone-500">No known skills detected. <Link href="/profile?tab=skills" className="text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">Add skills</Link> to compare.</p>
              )}
              {brief.constraints.map((c) => (
                <p key={c} className="flex gap-1.5 text-xs text-stone-600"><AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-600" />{c}</p>
              ))}
            </div>
          </Section>
        </Card>

        <Card className="p-4">
          <Section icon={<MessageCircleQuestion className="size-4 text-accent-600" />} title="Worth asking them">
            {brief.questions_to_ask.length === 0 ? <p className="text-[13px] text-stone-500">No suggestions.</p> : (
              <ol className="list-decimal space-y-1.5 pl-4 text-[13px] text-stone-700 marker:text-stone-500">
                {brief.questions_to_ask.map((q) => <li key={q}>{q}</li>)}
              </ol>
            )}
          </Section>
        </Card>

        <Card className="p-4">
          <Section icon={<AlertTriangle className="size-4 text-amber-600" />} title="Clarify before saying yes">
            {brief.watch_outs.length === 0 ? <p className="text-[13px] text-stone-500">Nothing stood out.</p> : (
              <ul className="space-y-3">
                {brief.watch_outs.map((w) => (
                  <li key={w.quote} className="space-y-1">
                    <p className="text-[13px] font-medium text-stone-800">{w.point}</p>
                    <Quote>{w.quote}</Quote>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>
      </div>
      <Card><CardHeader title="Why you can trust this" description="The summary and quotes come from the AI and are checked word for word against the posting. Your fit comes from the deterministic compatibility engine, not from the AI." /></Card>
    </div>
  );
}
