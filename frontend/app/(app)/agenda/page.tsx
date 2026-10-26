"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Circle, Flag, Plus, Trash2, Video } from "lucide-react";
import { api } from "@/lib/api";
import { TASK_KIND_LABELS } from "@/lib/constants";
import { cn, daysUntil, formatShortDate, formatTime, parseDate, toDateInput } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { Application, Interview, Task } from "@/lib/types";
import { InterviewForm } from "@/components/applications/InterviewForm";
import { Button, IconButton } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { Badge, Card, CardHeader, ErrorBanner, PageHeader, SegmentedControl } from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayKey = (d: Date) => toDateInput(d);

function bucket(task: Task): string {
  if (!task.due_date) return "No date";
  const d = daysUntil(task.due_date);
  return d < 0 ? "Overdue" : d === 0 ? "Today" : d <= 7 ? "This week" : "Later";
}
const BUCKETS = ["Overdue", "Today", "This week", "Later", "No date"];

export default function AgendaPage() {
  const toast = useToast();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const [editing, setEditing] = useState<Interview | "new" | null>(null);
  const [showDone, setShowDone] = useState<"open" | "done">("open");
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });

  const range = useMemo(() => ({
    start: new Date(month.getFullYear(), month.getMonth(), -6).toISOString(),
    end: new Date(month.getFullYear(), month.getMonth() + 1, 7, 23, 59).toISOString(),
  }), [month]);
  const interviews = useAsync(() => api.listInterviews(range), [range.start]);
  const tasks = useAsync(() => api.listTasks(showDone), [showDone]);
  const apps = useAsync(() => api.listApplications(), []);
  const appsById = useMemo(() => new Map((apps.data ?? []).map((a) => [a.id, a])), [apps.data]);

  const byDay = useMemo(() => {
    const map = new Map<string, { interviews: Interview[]; tasks: Task[]; deadlines: Application[] }>();
    const slot = (key: string) => map.get(key) ?? (map.set(key, { interviews: [], tasks: [], deadlines: [] }), map.get(key)!);
    for (const i of interviews.data ?? []) slot(dayKey(parseDate(i.scheduled_at))).interviews.push(i);
    for (const t of tasks.data ?? []) if (t.due_date && !t.done) slot(t.due_date).tasks.push(t);
    for (const a of apps.data ?? []) {
      if (a.deadline && ["SAVED", "PREPARING"].includes(a.status)) slot(a.deadline).deadlines.push(a);
    }
    return map;
  }, [interviews.data, tasks.data, apps.data]);

  const cells = useMemo(() => {
    const offset = (startOfMonth(month).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  }, [month]);

  const groups = useMemo(() => {
    const list = tasks.data ?? [];
    if (showDone === "done") return [["Completed", list] as const];
    const map = new Map<string, Task[]>();
    for (const t of list) map.set(bucket(t), [...(map.get(bucket(t)) ?? []), t]);
    return BUCKETS.filter((b) => map.has(b)).map((b) => [b, map.get(b)!] as const);
  }, [tasks.data, showDone]);

  const today = new Date();
  const day = byDay.get(dayKey(selected)) ?? { interviews: [], tasks: [], deadlines: [] };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    try {
      await api.createTask({ title: newTask.title.trim(), kind: "FOLLOW_UP", due_date: newTask.due_date || null });
      setNewTask({ title: "", due_date: "" });
      tasks.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add the task.", "error");
    }
  };
  const toggle = async (t: Task) => {
    tasks.setData((list) => list?.filter((x) => x.id !== t.id) ?? null);
    try {
      await api.updateTask(t.id, { done: !t.done });
      toast(t.done ? "Task reopened" : "Task completed", "success", {
        label: "Undo",
        onClick: () => api.updateTask(t.id, { done: t.done }).then(tasks.reload).catch(() => toast("Could not undo.", "error")),
      });
    } catch {
      toast("Could not update the task.", "error");
      tasks.reload();
    }
  };
  const remove = async (t: Task) => {
    tasks.setData((list) => list?.filter((x) => x.id !== t.id) ?? null);
    try {
      await api.deleteTask(t.id);
      toast("Task deleted", "success", {
        label: "Undo",
        onClick: () => api.createTask({ title: t.title, kind: t.kind, due_date: t.due_date, application_id: t.application_id,
                                        contact_id: t.contact_id }).then(tasks.reload).catch(() => toast("Could not undo.", "error")),
      });
    } catch {
      toast("Could not delete the task.", "error");
      tasks.reload();
    }
  };

  return (
    <>
      <PageHeader title="Agenda" description="Interviews, follow-ups and deadlines in one place"
                  actions={<Button variant="primary" icon={<CalendarPlus className="size-4" />} disabled={!apps.data?.length}
                                   onClick={() => setEditing("new")}>Schedule interview</Button>} />
      {(interviews.error || tasks.error) && <div className="mb-4"><ErrorBanner message={interviews.error || tasks.error || ""} /></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
              <h2 className="text-[15px] font-semibold text-stone-900">
                {month.toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
              </h2>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setMonth(startOfMonth(today)); setSelected(today); }}>Today</Button>
                <Button size="sm" variant="ghost" aria-label="Previous month" icon={<ChevronLeft className="size-4" />}
                        onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
                <Button size="sm" variant="ghost" aria-label="Next month" icon={<ChevronRight className="size-4" />}
                        onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
              </div>
            </div>
            <div className="grid grid-cols-7 border-b border-stone-100 text-center text-[11px] font-medium uppercase tracking-wide text-stone-500">
              {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, idx) => {
                const items = byDay.get(dayKey(date));
                const inMonth = date.getMonth() === month.getMonth();
                return (
                  <button type="button" key={idx} onClick={() => setSelected(date)} aria-label={date.toDateString()}
                          aria-pressed={sameDay(date, selected)}
                          className={cn("flex h-24 min-w-0 flex-col gap-1 overflow-hidden border-b border-r border-stone-100 p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0",
                                        sameDay(date, selected) ? "bg-accent-50/60" : "hover:bg-stone-50", !inMonth && "bg-stone-50/50")}>
                    <span className={cn("flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                                        sameDay(date, today) ? "bg-stone-900 font-medium text-white" : inMonth ? "text-stone-700" : "text-stone-500")}>
                      {date.getDate()}
                    </span>
                    {items?.interviews.slice(0, 2).map((i) => (
                      <span key={i.id} className="block max-w-full truncate rounded bg-accent-100/70 px-1 py-0.5 text-[10px] font-medium text-accent-900">
                        {formatTime(i.scheduled_at)} {appsById.get(i.application_id)?.company_name ?? ""}
                      </span>
                    ))}
                    {items && (items.tasks.length > 0 || items.deadlines.length > 0 || items.interviews.length > 2) && (
                      <span className="flex items-center gap-1.5 px-0.5 text-[10px] text-stone-500">
                        {items.interviews.length > 2 && <span>+{items.interviews.length - 2}</span>}
                        {items.tasks.length > 0 && <span className="flex items-center gap-0.5"><Circle className="size-2.5" />{items.tasks.length}</span>}
                        {items.deadlines.length > 0 && <span className="flex items-center gap-0.5 text-rose-700"><Flag className="size-2.5" />{items.deadlines.length}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title={selected.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })} />
            {day.interviews.length + day.tasks.length + day.deadlines.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-stone-500">Nothing on this day.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {day.interviews.map((i) => {
                  const app = appsById.get(i.application_id);
                  return (
                    <li key={i.id}>
                      <button type="button" onClick={() => setEditing(i)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                        <span className="w-16 shrink-0 text-xs font-medium tabular-nums text-stone-700">{formatTime(i.scheduled_at)}</span>
                        <span className="min-w-0 flex-1 text-[13px]">
                          <span className="block truncate font-medium text-stone-900">{i.interview_type || "Interview"} · {app?.company_name}</span>
                          <span className="block truncate text-xs text-stone-500">{app?.position_title}{i.interviewer && ` · with ${i.interviewer}`}</span>
                        </span>
                        {i.location_or_link?.startsWith("http") && <Video className="size-3.5 text-stone-500" />}
                      </button>
                    </li>
                  );
                })}
                {day.deadlines.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <Flag className="size-3.5 shrink-0 text-rose-700" />
                    <Link href={`/applications/${a.id}`} className="min-w-0 flex-1 truncate text-stone-900 hover:underline">
                      Application deadline · {a.position_title} at {a.company_name}
                    </Link>
                  </li>
                ))}
                {day.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <Circle className="size-3.5 shrink-0 text-stone-500" /><span className="flex-1">{t.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Tasks" action={<SegmentedControl value={showDone} onChange={setShowDone}
                                                               options={[{ id: "open", label: "Open" }, { id: "done", label: "Done" }]} />} />
          <form onSubmit={addTask} className="flex gap-2 border-b border-stone-100 p-3">
            <input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                   placeholder="Add a follow-up…" aria-label="New task" className={cn(controlClass, "h-8 flex-1")} />
            <input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                   aria-label="Due date" className={cn(controlClass, "h-8 w-34 px-1.5 text-xs")} />
            <Button size="sm" type="submit" icon={<Plus className="size-3.5" />} aria-label="Add task" className="h-8" />
          </form>
          {tasks.data?.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-stone-500">
              {showDone === "open" ? "All caught up. Add follow-ups after applying or interviewing." : "Completed tasks show up here."}
            </p>
          ) : (
            <div className="max-h-[640px] overflow-y-auto scroll-thin">
              {groups.map(([label, items]) => (
                <section key={label}>
                  <h3 className={cn("bg-stone-50/70 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide",
                                    label === "Overdue" ? "text-rose-700" : "text-stone-500")}>
                    {label} · {items.length}
                  </h3>
                  <ul className="divide-y divide-stone-100">
                    {items.map((t) => (
                      <li key={t.id} className="group flex items-start gap-2.5 px-4 py-2.5">
                        <button type="button" onClick={() => toggle(t)} aria-label={t.done ? "Reopen task" : "Complete task"}
                                className={cn("mt-px", t.done ? "text-accent-600" : "text-stone-500 hover:text-accent-600")}>
                          {t.done ? <Check className="size-4" /> : <Circle className="size-4" />}
                        </button>
                        <div className="min-w-0 flex-1 text-[13px]">
                          <p className={cn("text-stone-900", t.done && "text-stone-500 line-through")}>{t.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                            {t.kind !== "OTHER" && <Badge>{TASK_KIND_LABELS[t.kind]}</Badge>}
                            {t.application && (
                              <Link href={`/applications/${t.application.id}`} className="truncate hover:text-stone-900 hover:underline">
                                {t.application.company_name}
                              </Link>
                            )}
                            {t.contact_name && <span>· {t.contact_name}</span>}
                          </p>
                        </div>
                        {t.due_date && (
                          <span className={cn("shrink-0 text-xs tabular-nums", !t.done && daysUntil(t.due_date) < 0 ? "text-rose-700" : "text-stone-500")}>
                            {formatShortDate(t.due_date)}
                          </span>
                        )}
                        <IconButton label="Delete task" onClick={() => remove(t)} className="-my-1 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-700">
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>

      {editing && apps.data && (
        <InterviewForm interview={editing === "new" ? undefined : editing}
                       applications={[...apps.data].sort((a, b) => Number(["SAVED", "REJECTED", "WITHDRAWN"].includes(a.status))
                                                                     - Number(["SAVED", "REJECTED", "WITHDRAWN"].includes(b.status)))}
                       defaultDate={(() => { const d = new Date(selected); d.setHours(10, 0, 0, 0); return d; })()}
                       onClose={() => setEditing(null)} onSaved={() => { setEditing(null); interviews.reload(); }} />
      )}
    </>
  );
}
