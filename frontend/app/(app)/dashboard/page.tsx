"use client";
import Link from "next/link";
import {
  ArrowUpRight, Briefcase, CalendarClock, Check, Circle, Clock, MessageSquareText, Plus, UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { EVENT_LABELS, STATUS_META, STATUSES } from "@/lib/constants";
import { cn, daysUntil, formatDateTime, formatShortDate, pluralize, relativeTime } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { ApplicationRef, Status } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import {
  Card, CardHeader, EmptyState, ErrorBanner, PageHeader, Skeleton, Stat, StatusDot,
} from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { DebriefCard } from "@/components/ai/DebriefCard";

interface Summary {
  user_name: string;
  kpis: { active_applications: number; upcoming_interviews: number; follow_ups_due: number;
          applied_this_week: number; response_rate: number | null; submitted: number };
  pipeline: { status: Status; count: number }[];
  upcoming_interviews: { id: string; scheduled_at: string; interview_type: string | null;
                         location_or_link: string | null; application: ApplicationRef | null }[];
  follow_ups: { kind: "task" | "contact"; id: string; title: string; due_date: string }[];
  deadlines: (ApplicationRef & { deadline: string })[];
  waiting_for_response: ApplicationRef[];
  recent_activity: { id: string; event_type: keyof typeof EVENT_LABELS; from_status: Status | null;
                     to_status: Status | null; description: string | null; occurred_at: string;
                     application: ApplicationRef | null }[];
  insights: { top_skill: string | null; top_skill_count: number; top_location: string | null; postings_analyzed: number };
  has_profile: boolean;
}

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

function Pipeline({ pipeline }: { pipeline: Summary["pipeline"] }) {
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

function Activity({ events }: { events: Summary["recent_activity"] }) {
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
  const { data, error, loading, reload } = useAsync<Summary>(() => api.dashboard());
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
                    <ButtonLink href="/assistant" variant="secondary" icon={<MessageSquareText className="size-4" />}>Ask</ButtonLink>
                    <ButtonLink href="/applications?new=1" variant="primary" icon={<Plus className="size-4" />}>New application</ButtonLink>
                  </>} />

      {total === 0 ? (
        <Card>
          <EmptyState icon={<Briefcase className="size-5" />} title="Let's set up your job search"
                      action={<ButtonLink href="/applications?new=1" variant="primary" icon={<Plus className="size-4" />}>Add your first application</ButtonLink>}>
            Save the jobs you are interested in, even before applying. Paste the posting and JobPilot
            extracts the details for you. Your pipeline, follow-ups and analytics build themselves from there.
          </EmptyState>
          <div className="grid border-t border-stone-100 sm:grid-cols-3">
            {[
              { href: "/profile", title: "Build your profile", text: "Skills backed by evidence power the compatibility review." },
              { href: "/profile?tab=resumes", title: "Add your resumes", text: "Track which version you sent where." },
              { href: "/contacts", title: "Add contacts", text: "Recruiters, referrals and follow-up reminders." },
            ].map((s) => (
              <Link key={s.href} href={s.href} className="group border-stone-100 p-4 sm:border-l first:border-l-0 hover:bg-stone-50">
                <p className="flex items-center gap-1 text-[13px] font-medium text-stone-900">
                  {s.title}<ArrowUpRight className="size-3.5 text-stone-500 group-hover:text-stone-700" />
                </p>
                <p className="mt-0.5 text-xs text-stone-500">{s.text}</p>
              </Link>
            ))}
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="grid grid-cols-2 divide-stone-100 md:grid-cols-4 md:divide-x [&>*:nth-child(-n+2)]:border-b md:[&>*:nth-child(-n+2)]:border-b-0 [&>*]:border-stone-100">
            <Stat label="Active applications" value={data.kpis.active_applications}
                  hint={data.kpis.response_rate !== null ? `${data.kpis.response_rate}% observed response rate` : "Submitted and still open"} />
            <Stat label="Interviews" value={data.kpis.upcoming_interviews} hint="Next 14 days" />
            <Stat label="Follow-ups due" value={data.kpis.follow_ups_due} hint="Tasks and contacts, today or overdue" />
            <Stat label="Applied this week" value={data.kpis.applied_this_week} hint="Last 7 days" />
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
                {data.upcoming_interviews.map((i) => (
                  <li key={i.id} className="flex gap-3 px-4 py-2.5">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-stone-500" />
                    <div className="min-w-0 text-[13px]">
                      {i.application && <AppLink app={i.application} />}
                      <p className="text-xs text-stone-500">{i.interview_type || "Interview"} · {formatDateTime(i.scheduled_at)}</p>
                    </div>
                  </li>
                ))}
              </SideList>

              <SideList title="Follow-ups due" empty={data.follow_ups.length === 0 && "Nothing due. Nice."}
                        action={<Link href="/agenda" className="text-xs font-medium text-stone-500 hover:text-stone-900">Agenda</Link>}>
                {data.follow_ups.map((f) => (
                  <li key={`${f.kind}-${f.id}`} className="flex items-start gap-2.5 px-4 py-2.5 text-[13px]">
                    {f.kind === "task" ? (
                      <button onClick={() => completeTask(f.id)} aria-label={`Complete ${f.title}`}
                              className="group mt-px text-stone-500 hover:text-accent-600">
                        <Circle className="size-4 group-hover:hidden" /><Check className="hidden size-4 group-hover:block" />
                      </button>
                    ) : <UserRound className="mt-px size-4 shrink-0 text-stone-500" />}
                    <div className="min-w-0 flex-1">
                      {f.kind === "contact"
                        ? <Link href={`/contacts?focus=${f.id}`} className="text-stone-900 hover:underline underline-offset-2">{f.title}</Link>
                        : <p className="text-stone-900">{f.title}</p>}
                      <p className={cn("text-xs", daysUntil(f.due_date) < 0 ? "text-rose-600" : "text-stone-500")}>
                        {daysUntil(f.due_date) < 0 ? `Overdue · ${formatShortDate(f.due_date)}` : "Due today"}
                      </p>
                    </div>
                  </li>
                ))}
              </SideList>

              {data.deadlines.length > 0 && (
                <SideList title="Application deadlines">
                  {data.deadlines.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                      <div className="min-w-0 truncate"><AppLink app={d} /></div>
                      <span className={cn("shrink-0 text-xs tabular-nums", daysUntil(d.deadline) <= 3 ? "text-rose-600" : "text-stone-500")}>
                        {relativeTime(d.deadline)}
                      </span>
                    </li>
                  ))}
                </SideList>
              )}

              {data.waiting_for_response.length > 0 && (
                <SideList title="No response for 2+ weeks">
                  {data.waiting_for_response.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px]">
                      <Clock className="size-4 shrink-0 text-stone-500" />
                      <div className="min-w-0 truncate"><AppLink app={a} /></div>
                    </li>
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
