"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CalendarPlus, Check, Circle, ExternalLink, Mail, MessagesSquare, Pencil, Plus, Trash2, UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  EMPLOYMENT_LABELS, EVENT_LABELS, REJECTION_LABELS, SENIORITY_LABELS, STATUS_META, STATUSES, placeLabel,
} from "@/lib/constants";
import { cn, formatDate, formatDateTime, formatSalary, formatShortDate, parseDate, relativeTime } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { AppEvent, Application, Interview, Status } from "@/lib/types";
import { ApplicationForm } from "@/components/applications/ApplicationForm";
import { InterviewForm } from "@/components/applications/InterviewForm";
import { AddToCalendar } from "@/components/applications/AddToCalendar";
import { CvCheck } from "@/components/applications/CvCheck";
import { MatchReview } from "@/components/applications/MatchReview";
import { StatusStepper } from "@/components/applications/StatusStepper";
import { BriefPanel } from "@/components/ai/BriefPanel";
import { DraftDialog } from "@/components/ai/DraftDialog";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { controlClass } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Modal";
import {
  Badge, Card, CardHeader, EmptyState, ErrorBanner, Skeleton, Tabs,
} from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";

type Tab = "overview" | "brief" | "match" | "interviews" | "history";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-[13px]">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right text-stone-900">{children || "—"}</dd>
    </div>
  );
}

/** Renders a pasted posting with headings and bullets, without any HTML injection. */
function Description({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1.5" />;
        const bullet = trimmed.match(/^[-•*·]\s+(.*)/);
        if (bullet) return <p key={i} className="flex gap-2 pl-1"><span className="text-stone-500">•</span><span>{bullet[1]}</span></p>;
        const heading = trimmed.length < 60 && !/[.,:;]$/.test(trimmed) && i > 0 && !lines[i - 1].trim();
        return <p key={i} className={heading ? "pt-1 font-medium text-stone-900" : ""}>{trimmed}</p>;
      })}
    </div>
  );
}

function Interviews({ app, onChange }: { app: Application; onChange: () => void }) {
  const [editing, setEditing] = useState<Interview | "new" | null>(null);
  const sorted = [...app.interviews].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  return (
    <Card>
      <CardHeader title="Interviews" description="Every round, with your notes and how it went"
                  action={<div className="flex gap-2">
                    <ButtonLink href={`/interviews?tab=practice&app=${app.id}`} size="sm" variant="ghost"
                                icon={<MessagesSquare className="size-3.5" />}>Practice</ButtonLink>
                    <Button size="sm" icon={<CalendarPlus className="size-3.5" />} onClick={() => setEditing("new")}>Schedule</Button>
                  </div>} />
      {sorted.length === 0 ? (
        <EmptyState title="No interviews yet">
          Once you schedule an interview, you can track the interviewer, your notes, how it went and the follow-up here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100">
          {sorted.map((i) => (
            <li key={i.id} className="group flex items-start gap-4 px-4 py-3">
              <div className="w-24 shrink-0 text-xs text-stone-500">
                <p className="font-medium text-stone-800">{formatShortDate(i.scheduled_at)}</p>
                <p>{formatDateTime(i.scheduled_at).split(" · ")[1]}</p>
              </div>
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="font-medium text-stone-900">
                  {i.interview_type || "Interview"}
                  {i.interviewer && <span className="font-normal text-stone-500"> with {i.interviewer}</span>}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {i.outcome && i.outcome !== "PENDING" && (
                    <Badge tone={i.outcome === "PASSED" ? "bg-accent-50 text-accent-800" : i.outcome === "FAILED" ? "bg-rose-50 text-rose-800" : undefined}>
                      {i.outcome === "PASSED" ? "Passed" : i.outcome === "FAILED" ? "Not passed" : "Unknown"}
                    </Badge>
                  )}
                  {i.self_assessment && <Badge>Felt {i.self_assessment}/5</Badge>}
                  {i.duration_minutes && <Badge>{i.duration_minutes} min</Badge>}
                </div>
                {i.notes && <p className="mt-1.5 whitespace-pre-line text-xs text-stone-600">{i.notes}</p>}
                {i.follow_up && <p className="mt-1 text-xs text-stone-500">Follow-up: {i.follow_up}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {parseDate(i.scheduled_at) > new Date() && <AddToCalendar interview={i} app={app} />}
                <IconButton label="Edit interview" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => setEditing(i)}>
                  <Pencil className="size-3.5" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <InterviewForm interview={editing === "new" ? undefined : editing} applicationId={app.id}
                       onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange(); }} />
      )}
    </Card>
  );
}

function History({ data, error }: { data: AppEvent[] | null; error: string | null }) {
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Skeleton className="h-40" />;
  return (
    <Card>
      <CardHeader title="History" description="Recorded automatically when the application changes" />
      <ol className="px-4 py-3">
        {data?.map((e, i) => (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < data.length - 1 && <span className="absolute left-[3.5px] top-4 h-full w-px bg-stone-200" />}
            <span className={cn("relative mt-1.5 size-2 shrink-0 rounded-full", e.to_status ? STATUS_META[e.to_status].dot : "bg-stone-300")} />
            <div className="text-[13px]">
              <p className="text-stone-800">
                {e.event_type === "STATUS_CHANGED" && e.to_status
                  ? <>{e.from_status ? `${STATUS_META[e.from_status].label} → ` : ""}<span className="font-medium">{STATUS_META[e.to_status].label}</span></>
                  : e.event_type === "CREATED" ? `Saved as ${e.to_status ? STATUS_META[e.to_status].label : "Saved"}`
                  : e.description || EVENT_LABELS[e.event_type]}
              </p>
              <p className="text-xs text-stone-500">{formatDateTime(e.occurred_at)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function SideTasks({ app }: { app: Application }) {
  const toast = useToast();
  const { data: tasks, reload } = useAsync(() => api.listTasks("all"), []);
  const [title, setTitle] = useState("");
  const mine = (tasks ?? []).filter((t) => t.application_id === app.id);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createTask({ title: title.trim(), kind: "FOLLOW_UP", application_id: app.id });
      setTitle("");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add the task.", "error");
    }
  };
  const toggle = async (id: string, done: boolean) => {
    await api.updateTask(id, { done }).catch(() => toast("Could not update the task.", "error"));
    reload();
  };

  return (
    <Card>
      <CardHeader title="Tasks" />
      <ul className="divide-y divide-stone-100">
        {mine.map((t) => (
          <li key={t.id} className="flex items-start gap-2.5 px-4 py-2 text-[13px]">
            <button type="button" onClick={() => toggle(t.id, !t.done)} aria-label={t.done ? "Mark as open" : "Mark as done"}
                    className={cn("mt-px", t.done ? "text-accent-600" : "text-stone-500 hover:text-accent-600")}>
              {t.done ? <Check className="size-4" /> : <Circle className="size-4" />}
            </button>
            <span className={cn("flex-1", t.done && "text-stone-500 line-through")}>{t.title}</span>
            {t.due_date && <span className="text-xs text-stone-500">{relativeTime(t.due_date)}</span>}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2 border-t border-stone-100 p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a follow-up…"
               aria-label="New task" className={cn(controlClass, "h-8")} />
        <Button size="sm" type="submit" icon={<Plus className="size-3.5" />} aria-label="Add task" />
      </form>
    </Card>
  );
}

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState<Status | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: app, setData: setApp, error, loading, reload } = useAsync(() => api.getApplication(id), [id]);
  const { data: contacts } = useAsync(() => api.applicationContacts(id), [id]);
  const { data: events, error: eventsError, reload: reloadEvents } = useAsync(() => api.applicationEvents(id), [id]);
  const { data: resumes } = useAsync(() => api.listResumes(), []);

  if (loading && !app) return <div className="space-y-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-96" /></div>;
  if (error || !app) {
    return (
      <Card>
        <EmptyState title="Application not found" action={<Link href="/applications" className="text-sm text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">Back to applications</Link>}>
          {error ?? "It may have been deleted."}
        </EmptyState>
      </Card>
    );
  }

  const changeStatus = async (status: Status) => {
    if (status === "REJECTED") return setEditing("REJECTED");
    const before = { status: app.status, applied_date: app.applied_date ?? null };
    try {
      setApp(await api.updateApplication(app.id, { status }));
      reloadEvents();
      toast(`Moved to ${STATUS_META[status].label}`, "success", {
        label: "Undo",
        onClick: () => api.updateApplication(app.id, before).then((restored) => { setApp(restored); reloadEvents(); })
          .catch(() => toast("Could not undo the change.", "error")),
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the status.", "error");
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteApplication(app.id);
      toast("Application deleted");
      router.push("/applications");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete the application.", "error");
      setDeleting(false);
    }
  };

  const resume = resumes?.find((r) => r.id === app.resume_id);

  return (
    <>
      <Link href="/applications" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-900">
        <ArrowLeft className="size-3.5" />Applications
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <CompanyAvatar name={app.company_name} size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-stone-900">{app.position_title}</h1>
            <p className="mt-0.5 text-sm text-stone-500">
              {[app.company_name, placeLabel(app.location, app.work_mode)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={app.status} onChange={(e) => changeStatus(e.target.value as Status)} aria-label="Status"
                  className={cn(controlClass, "h-8.5 w-auto font-medium")}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <Button icon={<Mail className="size-3.5" />} onClick={() => setDrafting(true)}>Draft message</Button>
          <Button icon={<Pencil className="size-3.5" />} onClick={() => setEditing("edit")}>Edit</Button>
          <IconButton label="Delete application" onClick={() => setConfirmDelete(true)} className="size-8.5 hover:text-rose-700">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="mb-6">
        <StatusStepper status={app.status} events={events} onChange={changeStatus} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
            { id: "overview", label: "Overview" },
            { id: "brief", label: "Brief" },
            { id: "match", label: "Fit score" },
            { id: "interviews", label: "Interviews", count: app.interviews.length },
            { id: "history", label: "History" },
          ]} />
          {tab === "overview" && (
            <div className="space-y-4">
              {app.status === "REJECTED" && (
                <Card className="border-rose-200 bg-rose-50/40 px-4 py-3 text-[13px] text-rose-900">
                  Rejected · reason recorded: {app.rejection_reason ? REJECTION_LABELS[app.rejection_reason] : "not recorded"}
                </Card>
              )}
              {app.notes && (
                <Card>
                  <CardHeader title="Notes" />
                  <p className="whitespace-pre-line px-4 py-3 text-[13px] text-stone-700">{app.notes}</p>
                </Card>
              )}
              <Card>
                <CardHeader title="Job description" />
                <div className="px-4 py-3">
                  {app.job_description ? <Description text={app.job_description} /> : (
                    <EmptyState title="No description saved" action={<Button size="sm" onClick={() => setEditing("edit")}>Add the posting</Button>}>
                      Paste the posting to get a compatibility review and to include it in market insights.
                    </EmptyState>
                  )}
                </div>
              </Card>
            </div>
          )}
          {tab === "brief" && <BriefPanel app={app} onEdit={() => setEditing("edit")} />}
          {tab === "match" && (
            <div className="space-y-4">
              <MatchReview applicationId={app.id} />
              <CvCheck applicationId={app.id} />
            </div>
          )}
          {tab === "interviews" && <Interviews app={app} onChange={reload} />}
          {tab === "history" && <History data={events} error={eventsError} />}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-stone-100 px-4 py-1.5">
              <Fact label="Saved">{formatDate(app.date_saved)}</Fact>
              <Fact label="Applied">{app.applied_date ? formatDate(app.applied_date) : null}</Fact>
              {app.deadline && <Fact label="Deadline">{formatDate(app.deadline)}</Fact>}
              <Fact label="Salary">{formatSalary(app.salary_min, app.salary_max, app.currency)}</Fact>
              <Fact label="Employment">{app.employment_type && EMPLOYMENT_LABELS[app.employment_type]}</Fact>
              <Fact label="Seniority">{app.seniority && SENIORITY_LABELS[app.seniority]}</Fact>
              <Fact label="Source">{app.source}</Fact>
              <Fact label="Resume">{resume ? `${resume.name}${resume.version ? ` · ${resume.version}` : ""}` : null}</Fact>
              {app.tags.length > 0 && (
                <Fact label="Tags"><span className="flex flex-wrap justify-end gap-1">{app.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span></Fact>
              )}
            </dl>
            {app.job_url && (
              <a href={app.job_url} target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1.5 border-t border-stone-100 px-4 py-2.5 text-[13px] text-accent-700 hover:bg-stone-50">
                View original posting <ExternalLink className="size-3.5" />
              </a>
            )}
          </Card>

          <Card>
            <CardHeader title="Contacts" action={<Link href="/contacts?new=1" className="text-xs font-medium text-stone-500 hover:text-stone-900">Add</Link>} />
            {contacts && contacts.length > 0 ? (
              <ul className="divide-y divide-stone-100">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/contacts?focus=${c.id}`} className="flex items-center gap-2.5 px-4 py-2 text-[13px] hover:bg-stone-50">
                      <UserRound className="size-4 text-stone-500" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-stone-900">{c.name}</span>
                        {c.role && <span className="text-stone-500"> · {c.role}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-3 text-xs text-stone-500">Link recruiters or referrals from the Contacts page.</p>}
          </Card>

          <SideTasks app={app} />
        </aside>
      </div>

      {editing && (
        <ApplicationForm application={app} initialStatus={editing === "edit" ? undefined : editing}
                         onClose={() => setEditing(null)}
                         onSaved={(saved) => { setApp(saved); setEditing(null); reloadEvents(); }} />
      )}
      {drafting && <DraftDialog app={app} onClose={() => setDrafting(false)} />}
      {confirmDelete && (
        <ConfirmDialog title="Delete this application?" loading={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={remove}
                       message={<>“{app.position_title}” at {app.company_name}, its interviews and history will be permanently removed.</>} />
      )}
    </>
  );
}
