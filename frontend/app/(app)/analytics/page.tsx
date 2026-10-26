"use client";
import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { EMPLOYMENT_LABELS, REJECTION_LABELS, SENIORITY_LABELS, STATUS_META, WORK_MODE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { AnalyticsOverview, Share, Stats, Status } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import {
  Badge, Card, CardHeader, EmptyState, ErrorBanner, LimitedData, Meter, Note, PageHeader, Skeleton, Stat, Tabs,
} from "@/components/ui/Primitives";

type Tab = "pipeline" | "works" | "market";
const TABS: { id: Tab; label: string }[] = [
  { id: "pipeline", label: "Pipeline" }, { id: "works", label: "What works" }, { id: "market", label: "Market" },
];

const ACCENT = "var(--color-accent-500)";

function BarRow({ label, value, max, right, tone = "bg-accent-500", badge }: {
  label: React.ReactNode; value: number; max: number; right: React.ReactNode; tone?: string; badge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="flex min-w-0 items-center gap-2 text-stone-700"><span className="truncate">{label}</span>{badge}</span>
        <span className="shrink-0 text-xs tabular-nums text-stone-500">{right}</span>
      </div>
      <Meter value={max ? (value / max) * 100 : 0} tone={tone} />
    </div>
  );
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-CA", { month: "short", year: "2-digit" });
}

function Activity({ stats }: { stats: Stats }) {
  const monthly = Object.entries(stats.applications_per_month as Record<string, number>).map(([k, v]) => ({ month: monthLabel(k), count: v }));
  const statuses = (Object.entries(stats.by_status) as [Status, number][]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...statuses.map(([, v]) => v), 1);
  const rejected = stats.by_status.REJECTED ?? 0;
  return (
    <div className="space-y-6">
      <Card className="grid grid-cols-2 md:grid-cols-4 md:divide-x divide-stone-100">
        <Stat label="Applications" value={stats.total} />
        <Stat label="Reached recruiter or beyond" value={`${stats.conversion_rate_interview}%`} hint="Of all tracked applications" />
        <Stat label="Offers" value={stats.by_status.OFFER ?? 0} hint={`${stats.conversion_rate_offer}% of tracked`} />
        <Stat label="Rejected" value={rejected} hint={stats.total ? `${Math.round((rejected / stats.total) * 100)}% of tracked` : undefined} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Applications per month" description="By application date (save date if not applied yet)" />
          <div className="h-64 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-stone-100)" />
                <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--color-stone-200)" }} tick={{ fontSize: 12, fill: "var(--color-stone-500)" }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-stone-500)" }} />
                <Tooltip cursor={{ fill: "var(--color-stone-100)" }} contentStyle={{ borderRadius: 6, border: "1px solid var(--color-stone-200)", background: "var(--color-white)", color: "var(--color-stone-900)", fontSize: 12 }} />
                <Bar dataKey="count" name="Applications" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Current status" />
          <div className="space-y-3 p-4">
            {statuses.map(([s, v]) => (
              <BarRow key={s} label={STATUS_META[s].label} value={v} max={max} right={v} tone={STATUS_META[s].dot} />
            ))}
          </div>
        </Card>
      </div>
      {(stats.avg_salary_min || stats.avg_salary_max) && (
        <Card className="grid grid-cols-2 divide-x divide-stone-100">
          <Stat label="Average posted minimum" value={stats.avg_salary_min ? Math.round(stats.avg_salary_min).toLocaleString("en-CA") : "—"} />
          <Stat label="Average posted maximum" value={stats.avg_salary_max ? Math.round(stats.avg_salary_max).toLocaleString("en-CA") : "—"} />
        </Card>
      )}
    </div>
  );
}

function Health({ overview }: { overview: AnalyticsOverview }) {
  const f = overview.funnel;
  const max = Math.max(...f.stages.map((s) => s.count), 1);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader title="Application funnel" description={`${f.stages[0].count} submitted applications`}
                    action={f.limited_data && <LimitedData label={`Fewer than ${f.min_sample}`} />} />
        <div className="space-y-4 p-4">
          {f.stages.map((s, i) => (
            <BarRow key={s.key} label={s.label} value={s.count} max={max}
                    right={<>{s.count}{i > 0 && f.steps[i - 1].rate !== null && <span className="text-stone-500"> · {f.steps[i - 1].rate}% of previous</span>}</>} />
          ))}
        </div>
        <div className="border-t border-stone-100 px-4 py-3">
          {f.bottleneck ? (
            <div className="text-[13px]">
              <p className="font-medium text-stone-900">Lowest step conversion: {f.bottleneck.from_label} → {f.bottleneck.to_label}</p>
              <p className="mt-0.5 text-stone-600">{f.bottleneck.message}</p>
            </div>
          ) : <p className="text-[13px] text-stone-500">Not enough entries at each stage yet to point out the step with the lowest conversion.</p>}
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Outside the funnel" />
          <dl className="divide-y divide-stone-100 text-[13px]">
            <div className="flex justify-between px-4 py-2"><dt className="text-stone-600">Rejected</dt><dd className="tabular-nums">{f.rejected_count}</dd></div>
            <div className="flex justify-between px-4 py-2"><dt className="text-stone-600">Withdrawn</dt><dd className="tabular-nums">{f.withdrawn_count}</dd></div>
          </dl>
        </Card>
        <details className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-[13px]">
          <summary className="cursor-pointer font-medium text-stone-700">How stages are defined</summary>
          <ul className="mt-2 space-y-1.5 text-xs text-stone-600">
            {Object.entries(f.definitions).map(([k, v]) => <li key={k}><span className="font-medium capitalize text-stone-800">{k}</span>: {v as string}</li>)}
          </ul>
        </details>
        <Note>Descriptive patterns in your own data. Nothing here predicts an outcome.</Note>
      </div>
    </div>
  );
}

function Rejections({ overview }: { overview: AnalyticsOverview }) {
  const r = overview.rejections;
  if (r.total_rejected === 0) {
    return <Card><EmptyState title="No rejections recorded">When you move an application to Rejected you can note the reason. Patterns show up here.</EmptyState></Card>;
  }
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Rejection reasons" description={`${r.total_rejected} rejections recorded`}
                  action={r.limited_data && <LimitedData label={`Fewer than ${r.min_sample}`} />} />
      <div className="space-y-3 p-4">
        {r.items.map((i) => (
          <BarRow key={i.reason} label={REJECTION_LABELS[i.reason as keyof typeof REJECTION_LABELS] ?? i.reason}
                  value={i.count} max={r.total_rejected} right={<>{i.percent}% <span className="text-stone-500">· n = {i.count}</span></>} tone="bg-rose-400" />
        ))}
      </div>
      <div className="border-t border-stone-100 px-4 py-2.5"><Note>Reasons are the ones you recorded; they may differ from the employer&apos;s actual reason.</Note></div>
    </Card>
  );
}

function Sources({ overview }: { overview: AnalyticsOverview }) {
  const t = overview.timing;
  const fmt = (s: { median_days: number | null }) => (s.median_days !== null ? `${s.median_days} days` : "—");
  const groups: [keyof AnalyticsOverview["breakdowns"], string, (v: string) => string][] = [
    ["source", "By job source", (v) => v],
    ["work_mode", "By work mode", (v) => WORK_MODE_LABELS[v as keyof typeof WORK_MODE_LABELS] ?? v],
    ["location", "By location", (v) => v],
  ];
  return (
    <div className="space-y-6">
      <Card className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-stone-100">
        <Stat label="Median time to first response" value={fmt(t.first_response)}
              hint={<>From applying to recruiter contact or beyond · n = {t.first_response.n} {t.first_response.limited_data && <LimitedData />}</>} />
        <Stat label="Median time to rejection" value={fmt(t.to_rejection)}
              hint={<>From applying · n = {t.to_rejection.n} {t.to_rejection.limited_data && <LimitedData />}</>} />
      </Card>
      {t.time_in_stage.length > 0 && (
        <Card>
          <CardHeader title="Median time spent in each stage" description="Before the application moved on" />
          <div className="grid gap-px bg-stone-100 sm:grid-cols-3 lg:grid-cols-5">
            {t.time_in_stage.map((s) => (
              <div key={s.status} className="bg-white px-4 py-3">
                <p className="text-xs text-stone-500">{STATUS_META[s.status as Status]?.label ?? s.status}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-stone-900">{s.median_days ?? "—"}<span className="text-xs font-normal text-stone-500"> days</span></p>
                <p className="text-[11px] text-stone-500">n = {s.n}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        {groups.map(([key, title, label]) => (
          <Card key={key}>
            <CardHeader title={title} description="Observed response rate, submitted applications" />
            <div className="space-y-3 p-4">
              {overview.breakdowns[key].length === 0 && <p className="text-[13px] text-stone-500">No submitted applications yet.</p>}
              {overview.breakdowns[key].map((b) => (
                <BarRow key={b.label} label={label(b.label)} value={b.response_rate ?? 0} max={100}
                        badge={b.limited_data && <LimitedData label="Small sample" />}
                        right={<>{b.response_rate ?? 0}% <span className="text-stone-500">· {b.responses}/{b.applications}</span></>} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Resumes() {
  const { data, error, loading } = useAsync(() => api.getResumeComparison(), []);
  if (loading && !data) return <Skeleton className="h-64" />;
  if (error || !data) return <ErrorBanner message={error ?? "Could not load the comparison."} />;
  if (!data.resumes.length) {
    return <Card><EmptyState title="No data yet" action={<ButtonLink href="/profile?tab=resumes" size="sm">Manage resumes</ButtonLink>}>Attach a resume when you submit applications to compare versions over time.</EmptyState></Card>;
  }
  const best = Math.max(...data.resumes.map((r) => r.response_rate ?? 0));
  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-[13px]">
          <thead className="border-b border-stone-200 bg-stone-50/70 text-left text-xs text-stone-500">
            <tr><th className="py-2 pl-4 font-medium">Resume</th><th className="px-3 text-right font-medium">Submitted</th>
              <th className="px-3 text-right font-medium">Responses</th><th className="px-3 font-medium">Response rate</th>
              <th className="pr-4 text-right font-medium">Interview rate</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.resumes.map((r) => (
              <tr key={r.resume_id ?? "none"}>
                <td className="py-2.5 pl-4"><span className={cn(!r.resume_id && "text-stone-500")}>{r.name}</span> {r.limited_data && <LimitedData />}</td>
                <td className="px-3 text-right tabular-nums">{r.applications}</td>
                <td className="px-3 text-right tabular-nums">{r.responses}</td>
                <td className="w-56 px-3">
                  <div className="flex items-center gap-2">
                    <Meter value={r.response_rate} className="flex-1" tone={r.response_rate === best && !r.limited_data ? "bg-accent-500" : "bg-stone-400"} />
                    <span className="w-12 text-right tabular-nums">{r.response_rate}%</span>
                  </div>
                </td>
                <td className="pr-4 text-right tabular-nums">{r.interview_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="px-4 py-3 text-[13px] text-stone-800">{data.comparison}</Card>
      <Note>{data.label} A difference is only highlighted when each resume has at least {data.min_sample} submitted applications.</Note>
    </div>
  );
}

function Market() {
  const { data, error, loading } = useAsync(() => api.marketInsights(), []);
  if (loading && !data) return <Skeleton className="h-64" />;
  if (error || !data) return <ErrorBanner message={error ?? "Could not load market insights."} />;
  if (!data.postings_with_description) {
    return <Card><EmptyState title="No postings to analyze">Paste job descriptions into your applications to see which skills, locations and salaries come up most.</EmptyState></Card>;
  }
  const dist = (title: string, items: Share[], labels?: Record<string, string>) => (
    <Card>
      <CardHeader title={title} />
      <div className="space-y-2.5 p-4">
        {items.length === 0 && <p className="text-[13px] text-stone-500">Not recorded.</p>}
        {items.map((i) => <BarRow key={i.label} label={labels?.[i.label] ?? i.label} value={i.count} max={items[0].count}
                                  right={`${i.percent}% · ${i.count}`} tone="bg-stone-500" />)}
      </div>
    </Card>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone-600">
        <span>{data.label}</span>
        <Badge>{data.postings_with_description} postings analyzed</Badge>
        {data.limited_data && <LimitedData label={`Fewer than ${data.min_sample} postings`} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Most requested skills" description="Share of your saved postings that mention each skill" />
          <div className="space-y-2.5 p-4">
            {data.skills.map((s) => (
              <BarRow key={s.skill} label={s.skill} value={s.percent} max={100} right={`${s.percent}% · ${s.count}`}
                      tone={s.in_profile ? "bg-accent-500" : "bg-stone-400"}
                      badge={!s.in_profile && <Badge tone="border border-dashed border-stone-300 text-stone-500">not in profile</Badge>} />
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          {data.skill_gaps.length > 0 && (
            <Card>
              <CardHeader title="Recurring skills not in your profile" />
              <div className="flex flex-wrap gap-1.5 p-4">
                {data.skill_gaps.map((s) => <Badge key={s.skill} tone="bg-amber-50 text-amber-900">{s.skill} · {s.count}</Badge>)}
              </div>
              <div className="border-t border-stone-100 px-4 py-2.5">
                <Note>If you have one of these skills, <Link href="/profile?tab=skills" className="text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">add it with evidence</Link>.</Note>
              </div>
            </Card>
          )}
          {data.salary.length > 0 && (
            <Card>
              <CardHeader title="Posted salaries" description="Midpoint of each posted range" />
              <dl className="divide-y divide-stone-100 text-[13px]">
                {data.salary.map((s) => (
                  <div key={s.currency} className="px-4 py-2.5">
                    <dt className="text-xs text-stone-500">{s.currency} · {s.postings} postings</dt>
                    <dd className="tabular-nums text-stone-900">median {s.median_midpoint.toLocaleString("en-CA")} <span className="text-stone-500">(range {s.min.toLocaleString("en-CA")}–{s.max.toLocaleString("en-CA")})</span></dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {dist("Locations", data.locations)}
        {dist("Work mode", data.work_modes, WORK_MODE_LABELS)}
        {dist("Seniority", data.seniority, SENIORITY_LABELS)}
        {dist("Employment type", data.employment_types, EMPLOYMENT_LABELS)}
      </div>
    </div>
  );
}

function AnalyticsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "pipeline") as Tab;
  const { data, error, loading, reload } = useAsync(() => Promise.all([api.getStats(), api.getAnalyticsOverview()]), []);
  const [stats, overview] = useMemo(() => data ?? [null, null], [data]);

  return (
    <>
      <PageHeader title="Analytics" description="Descriptive statistics from your own job-search history" />
      <Tabs className="mb-5" value={tab} onChange={(t) => router.replace(`/analytics?tab=${t}`, { scroll: false })} tabs={TABS} />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data ? <Skeleton className="h-80" /> : stats && overview && (
        stats.total === 0 && tab !== "market" ? (
          <Card>
            <EmptyState icon={<BarChart3 className="size-5" />} title="Nothing to analyze yet"
                        action={<ButtonLink href="/applications?new=1" variant="primary">Add an application</ButtonLink>}>
              Analytics build up as you add and update applications.
            </EmptyState>
          </Card>
        ) : (
          <>
            {tab === "pipeline" && <div className="space-y-8"><Activity stats={stats} /><Health overview={overview} /></div>}
            {tab === "works" && (
              <div className="space-y-8">
                <Sources overview={overview} />
                <section><h2 className="mb-3 text-sm font-semibold text-stone-900">Resume versions</h2><Resumes /></section>
                <Rejections overview={overview} />
              </div>
            )}
            {tab === "market" && <Market />}
          </>
        )
      )}
    </>
  );
}

export default function AnalyticsPage() {
  return <Suspense><AnalyticsInner /></Suspense>;
}
