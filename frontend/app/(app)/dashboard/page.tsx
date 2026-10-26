"use client";
import Link from "next/link";
import {
  ArrowUpRight, CalendarClock, Check, Circle, Clock, Plus, UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { EVENT_LABELS, STATUS_META, STATUSES } from "@/lib/constants";
import { cn, daysUntil, formatDateTime, formatShortDate, pluralize, relativeTime } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { ApplicationRef, DashboardSummary, Status } from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Delta, Sparkline } from "@/components/ui/Trend";
import {
  Card, CardHeader, ErrorBanner, PageHeader, Skeleton, StatusDot,
} from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { DebriefCard } from "@/components/ai/DebriefCard";
import { Onboarding } from "@/components/dashboard/Onboarding";
import { AgentMark } from "@/components/agent/AgentMark";
import { useAgent } from "@/components/agent/AgentProvider";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function AppLink({ app }: { app: ApplicationRef }) {
  return (
    <Link href={`/applications/${app.id}`} className="font-medium text-stone-900 hover:underline underline-offset-2">
      {app.position_title} <span className="font-normal text-stone-500">· {app.company_name}</span>
    </Link>
  );
}

/** Two-line application row with the company avatar; used by the side lists. */
function AppRow({ app, meta, trailing }: { app: ApplicationRef; meta?: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <li>
      <Link href={`/applications/${app.id}`} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-stone-50">
        <CompanyAvatar name={app.company_name} />
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="truncate font-medium text-stone-900 group-hover:underline underline-offset-2">{app.position_title}</p>
          <p className="truncate text-xs text-stone-500">{app.company_name}{meta && <> · {meta}</>}</p>
        </div>
        {trailing}
      </Link>
    </li>
  );
}

function Kpi({ label, value, hint, href, trend, trendLabel }: {
  label: string; value: React.ReactNode; hint: React.ReactNode; href: string; trend?: number[]; trendLabel?: string;
}) {
  return (
    <Link href={href} className="group flex items-end justify-between gap-3 bg-white px-4 py-3.5 transition-colors hover:bg-stone-50">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-xs font-medium text-stone-500">
          {label}<ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-stone-900">{value}</p>
        <div className="mt-0.5 flex h-4 items-center truncate text-xs text-stone-500">{hint}</div>
      </div>
      {trend && <Sparkline values={trend} label={trendLabel} className="mb-1 hidden shrink-0 xl:block" />}
    </Link>
  );
}

function Pipeline({ pipeline }: { pipeline: DashboardSummary["pipeline"] }) {
  const total = pipeline.reduce((s, p) => s + p.count, 0) || 1;
  const counts = Object.fromEntries(pipeline.map((p) => [p.status, p.count])) as Record<Status, number>;
  return (
    <Card>
      <CardHeader title="Pipeline" description="Where every application currently stands"
                  action={<Link href="/applications" className="text-xs font-medium text-stone-500 hover:text-stone-900">Open board</Link>} />
      <div className="px-4 pb-4 pt-3.5">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-stone-100">
          {STATUSES.filter((s) => counts[s]).map((s) => (
            <div key={s} className={STATUS_META[s].dot} style={{ width: `${(counts[s] / total) * 100}%` }}
                 title={`${STATUS_META[s].label}: ${counts[s]}`} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {STATUSES.map((s) => (
            <Link key={s} href={`/applications?status=${s}`}
                  className="group flex items-center justify-between rounded px-1.5 py-1 text-[13px] hover:bg-stone-50">
              <span className="flex items-center gap-2 text-stone-600 group-hover:text-stone-900">
                <StatusDot status={s} />{STATUS_META[s].label}
              </span>
              <span className={cn("tabular-nums", counts[s] ? "font-medium text-stone-900" : "text-stone-500")}>{counts[s] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Activity({ events }: { events: DashboardSummary["recent_activity"] }) {
  return (
    <Card>
      <CardHeader title="Recent activity" />
      {events.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-stone-500">Changes to your applications will show up here.</p>
      ) : (
        <ol className="px-4 py-2">
          {events.map((e, i) => (
            <li key={e.id} className="relative flex gap-3 py-2">
              {i < events.length - 1 && <span className="absolute left-[3.5px] top-5 h-full w-px bg-stone-200" />}
              <span className={cn("relative mt-1.5 size-2 shrink-0 rounded-full",
                                  e.to_status ? STATUS_META[e.to_status].dot : "bg-stone-300")} />
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="text-stone-600">
                  {e.application ? <AppLink app={e.application} /> : "Application"}
                </p>
                <p className="text-xs text-stone-500">
                  {e.event_type === "STATUS_CHANGED" && e.to_status
                    ? <>Moved to <span className="text-stone-700">{STATUS_META[e.to_status].label}</span></>
                    : e.description || EVENT_LABELS[e.event_type]}
                  {" · "}{relativeTime(e.occurred_at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function SideList({ title, empty, action, children }: {
  title: string; empty?: string | false; action?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} action={action} />
      {empty ? <p className="px-4 py-5 text-[13px] text-stone-500">{empty}</p> : <ul className="divide-y divide-stone-100">{children}</ul>}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const agent = useAgent();
  const { data, error, loading, reload } = useAsync(() => api.dashboard());
  const toast = useToast();

  if (loading && !data) return <DashboardSkeleton />;
  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;

  const completeTask = async (id: string) => {
    try {
      await api.updateTask(id, { done: true });
      toast("Task completed");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the task.", "error");
    }
  };

  const today = new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
  const total = data.pipeline.reduce((s, p) => s + p.count, 0);

  return (
    <>
      <PageHeader title={`${greeting()}, ${data.user_name.split(" ")[0]}`} description={today}
                  actions={<>
                    <Button variant="secondary" icon={<AgentMark />} onClick={() => agent.setOpen(true)}>Ask the agent</Button>
                    <ButtonLink href="/applications?new=1" variant="primary" icon={<Plus className="size-4" />}>New application</ButtonLink>
                  </>} />

      {total === 0 ? (
        <Onboarding />
      ) : (
        <div className="space-y-6">
          <Card className="grid grid-cols-2 gap-px overflow-hidden bg-stone-100 md:grid-cols-4">
            <Kpi label="Active applications" value={data.kpis.active_applications} href="/applications?view=list"
                 hint={data.kpis.response_rate !== null ? `${data.kpis.response_rate}% response rate` : "Submitted and still open"}
                 trend={data.trend.map((w) => w.responses)} trendLabel="Responses per week, last 8 weeks" />
            <Kpi label="Interviews" value={data.kpis.upcoming_interviews} hint="Next 14 days" href="/agenda" />
            <Kpi label="Follow-ups due" value={data.kpis.follow_ups_due} href="/agenda"
                 hint={data.kpis.follow_ups_due ? <span className="text-amber-700">Today or overdue</span> : "All caught up"} />
            <Kpi label="Applied this week" value={data.kpis.applied_this_week} href="/analytics"
                 hint={<Delta current={data.kpis.applied_this_week} previous={data.kpis.applied_previous_week} />}
                 trend={data.trend.map((w) => w.applied)} trendLabel="Applications sent per week, last 8 weeks" />
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <DebriefCard />
              <Pipeline pipeline={data.pipeline} />
              <Activity events={data.recent_activity} />
            </div>

            <div className="space-y-6">
              <SideList title="Upcoming interviews" empty={data.upcoming_interviews.length === 0 && "No interviews in the next two weeks."}
                        action={<Link href="/agenda" className="text-xs font-medium text-stone-500 hover:text-stone-900">Agenda</Link>}>
                {data.upcoming_interviews.map((i) => i.application ? (
                  <AppRow key={i.id} app={i.application} meta={i.interview_type || "Interview"}
                          trailing={<span className="shrink-0 text-right text-xs tabular-nums text-stone-600">{formatDateTime(i.scheduled_at)}</span>} />
                ) : (
                  <li key={i.id} className="flex gap-3 px-4 py-2.5 text-[13px]">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-stone-500" />
                    <p className="text-stone-600">{i.interview_type || "Interview"} · {formatDateTime(i.scheduled_at)}</p>
                  </li>
                ))}
              </SideList>

              <SideList title="Follow-ups due" empty={data.follow_ups.length === 0 && "Nothing due"}
                        action={<Link href="/agenda" className="text-xs font-medium text-stone-500 hover:text-stone-900">Agenda</Link>}>
                {data.follow_ups.map((f) => (
                  <li key={`${f.kind}-${f.id}`} className="flex items-start gap-2.5 px-4 py-2.5 text-[13px]">
                    {f.kind === "task" ? (
                      <button type="button" onClick={() => completeTask(f.id)} aria-label={`Complete ${f.title}`}
                              className="group mt-px text-stone-500 hover:text-accent-600">
                        <Circle className="size-4 group-hover:hidden" /><Check className="hidden size-4 group-hover:block" />
                      </button>
                    ) : <UserRound className="mt-px size-4 shrink-0 text-stone-500" />}
                    <div className="min-w-0 flex-1">
                      {f.kind === "contact"
                        ? <Link href={`/contacts?focus=${f.id}`} className="text-stone-900 hover:underline underline-offset-2">{f.title}</Link>
                        : <p className="text-stone-900">{f.title}</p>}
                      <p className={cn("text-xs", daysUntil(f.due_date) < 0 ? "text-rose-700" : "text-stone-500")}>
                        {daysUntil(f.due_date) < 0 ? `Overdue · ${formatShortDate(f.due_date)}` : "Due today"}
                      </p>
                    </div>
                  </li>
                ))}
              </SideList>

              {data.deadlines.length > 0 && (
                <SideList title="Application deadlines">
                  {data.deadlines.map((d) => (
                    <AppRow key={d.id} app={d}
                            trailing={<span className={cn("shrink-0 text-xs tabular-nums", daysUntil(d.deadline) <= 3 ? "font-medium text-rose-700" : "text-stone-500")}>
                              {relativeTime(d.deadline)}
                            </span>} />
                  ))}
                </SideList>
              )}

              {data.waiting_for_response.length > 0 && (
                <SideList title="No response for 2+ weeks">
                  {data.waiting_for_response.map((a) => (
                    <AppRow key={a.id} app={a} trailing={<Clock className="size-3.5 shrink-0 text-stone-500" aria-label="Waiting" />} />
                  ))}
                </SideList>
              )}

              <Card>
                <CardHeader title="Search insights" description={`From ${pluralize(data.insights.postings_analyzed, "saved posting")}`}
                            action={<Link href="/analytics?tab=market" className="text-xs font-medium text-stone-500 hover:text-stone-900">More</Link>} />
                <dl className="grid grid-cols-2 divide-x divide-stone-100 text-[13px]">
                  <div className="px-4 py-3">
                    <dt className="text-xs text-stone-500">Most requested skill</dt>
                    <dd className="mt-0.5 font-medium text-stone-900">{data.insights.top_skill ?? "—"}</dd>
                    {data.insights.top_skill && <dd className="text-xs text-stone-500">{pluralize(data.insights.top_skill_count, "posting")}</dd>}
                  </div>
                  <div className="px-4 py-3">
                    <dt className="text-xs text-stone-500">Most common location</dt>
                    <dd className="mt-0.5 truncate font-medium text-stone-900">{data.insights.top_location ?? "—"}</dd>
                  </div>
                </dl>
                {!data.has_profile && (
                  <Link href="/profile" className="block border-t border-stone-100 px-4 py-2.5 text-xs text-accent-700 hover:bg-stone-50">
                    Add skills to your profile to see how postings compare with it →
                  </Link>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
