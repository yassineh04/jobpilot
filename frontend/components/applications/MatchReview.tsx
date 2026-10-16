"use client";
import Link from "next/link";
import { AlertTriangle, Check, CircleDashed, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { TechnicalDetail } from "@/lib/types";
import { Card, CardHeader, ErrorBanner, Meter, Note, Skeleton } from "@/components/ui/Primitives";

const LABELS: Record<string, string> = {
  technical: "Technical skills", experience: "Experience", education: "Education",
  location: "Location & work mode", preferences: "Preferences",
};

function tone(score: number | null) {
  if (score === null) return "bg-stone-300";
  if (score >= 75) return "bg-accent-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-rose-400";
}

function SkillGroup({ icon, title, hint, children }: {
  icon: React.ReactNode; title: string; hint: string; children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-stone-800">{icon}{title}</p>
      <p className="mb-2 text-xs text-stone-500">{hint}</p>
      {children}
    </div>
  );
}

export function MatchReview({ applicationId }: { applicationId: string }) {
  const { data, error, loading, reload } = useAsync(() => api.getApplicationMatch(applicationId), [applicationId]);

  if (loading && !data) return <Skeleton className="h-80 w-full" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;

  const tech = data.components.technical.detail as TechnicalDetail;
  const exp = data.components.experience.detail as { candidate_years: number | null; required_years: number | null };

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-6 p-5 md:grid-cols-[180px_1fr]">
          <div>
            <p className="text-xs font-medium text-stone-500">Compatibility</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-stone-900">
              {data.overall !== null ? `${Math.round(data.overall)}%` : "—"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              With your recorded profile. Not a prediction of any hiring outcome.
            </p>
          </div>
          <div className="space-y-3">
            {Object.entries(data.components).map(([key, comp]) => (
              <div key={key}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className={cn("font-medium", comp.score === null ? "text-stone-500" : "text-stone-700")}>{LABELS[key]}</span>
                  <span className="text-xs tabular-nums text-stone-500">
                    {comp.score !== null ? `${Math.round(comp.score)}%` : "not evaluated"}
                    <span className="text-stone-500"> · weight {comp.effective_weight ?? 0}%</span>
                  </span>
                </div>
                <Meter value={comp.score} tone={tone(comp.score)} />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Review before applying"
                    description={tech.detected ? `${tech.detected} skills detected in the posting` : "No known skills detected in the posting"} />
        <div className="grid gap-6 p-4 md:grid-cols-3">
          <SkillGroup icon={<Check className="size-4 text-accent-600" />} title="Strong alignment"
                      hint="In your profile, backed by evidence">
            {tech.confirmed.length === 0 ? <p className="text-xs text-stone-500">None yet</p> : (
              <ul className="space-y-2">
                {tech.confirmed.map((c) => (
                  <li key={c.skill} className="text-[13px]">
                    <span className="font-medium text-stone-900">{c.skill}</span>
                    <ul className="mt-0.5 space-y-0.5">
                      {c.evidence.map((ev) => <li key={ev} className="text-xs text-stone-500">↳ {ev}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </SkillGroup>
          <SkillGroup icon={<CircleDashed className="size-4 text-amber-600" />} title="Self-reported"
                      hint="In your profile, no evidence attached">
            {tech.probable.length === 0 ? <p className="text-xs text-stone-500">None</p> : (
              <div className="flex flex-wrap gap-1.5">
                {tech.probable.map((s) => <span key={s} className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">{s}</span>)}
              </div>
            )}
          </SkillGroup>
          <SkillGroup icon={<HelpCircle className="size-4 text-stone-500" />} title="Not found in profile"
                      hint="Requested by the posting, not listed in your profile">
            {tech.not_found.length === 0 ? <p className="text-xs text-stone-500">None</p> : (
              <div className="flex flex-wrap gap-1.5">
                {tech.not_found.map((s) => <span key={s} className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-xs text-stone-700">{s}</span>)}
              </div>
            )}
          </SkillGroup>
        </div>
        {(tech.not_found.length > 0 || tech.probable.length > 0) && (
          <div className="border-t border-stone-100 px-4 py-2.5">
            <Note>
              “Not found” only means it isn&apos;t in your profile yet. If you have the skill,{" "}
              <Link href="/profile?tab=skills" className="text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">add it with evidence</Link>.
            </Note>
          </div>
        )}
      </Card>

      {data.constraints.length > 0 && (
        <Card>
          <CardHeader title="Potential constraints" description="Differences with your stated preferences and experience" />
          <ul className="space-y-2 p-4">
            {data.constraints.map((c) => (
              <li key={c} className="flex gap-2 text-[13px] text-stone-700">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />{c}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <details className="group rounded-lg border border-stone-200 bg-white px-4 py-3 text-[13px]">
        <summary className="cursor-pointer font-medium text-stone-700">How is this calculated?</summary>
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-stone-600">
          <p>Base weights: technical 40%, experience 20%, education 10%, location 10%, preferences 20%. Components without
            enough data are left out and their weight is spread over the others (shown as “weight” above).</p>
          <p>Technical: each skill detected in the posting counts 1 if it&apos;s in your profile with evidence, 0.5 without
            evidence, 0 if not found.{exp.required_years ? ` Experience: your recorded ${exp.candidate_years ?? 0} years against about ${exp.required_years} for this level.` : ""}</p>
          <p>{data.explanation}</p>
        </div>
      </details>
    </div>
  );
}
