"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, Columns3, List, MapPin, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { STATUS_META, STATUSES, WORK_MODE_LABELS, enumOptions } from "@/lib/constants";
import { cn, formatSalary, formatShortDate, relativeTime } from "@/lib/format";
import { useAsync, useDebounced } from "@/lib/use-async";
import type { Application, Status } from "@/lib/types";
import { ApplicationForm } from "@/components/applications/ApplicationForm";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import {
  Badge, Card, EmptyState, ErrorBanner, PageHeader, SegmentedControl, Skeleton, StatusDot,
} from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";

type View = "board" | "list";
type SortKey = "updated" | "applied" | "company";

function AppCard({ app, onDragStart }: { app: Application; onDragStart: (e: React.DragEvent) => void }) {
  const salary = formatSalary(app.salary_min, app.salary_max, app.currency);
  return (
    <Link href={`/applications/${app.id}`} draggable onDragStart={onDragStart}
          className="block rounded-md border border-stone-200 bg-white p-3 transition-shadow hover:border-stone-300 hover:shadow-[0_1px_3px_rgb(0_0_0/0.06)] active:cursor-grabbing">
      <p className="text-[13px] font-medium leading-snug text-stone-900">{app.position_title}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">{app.company_name}</p>
      {(app.location || app.work_mode) && (
        <p className="mt-2 flex items-center gap-1 truncate text-xs text-stone-500">
          <MapPin className="size-3 shrink-0" />
          {[app.location, app.work_mode && WORK_MODE_LABELS[app.work_mode]].filter(Boolean).join(" · ")}
        </p>
      )}
      {salary && <p className="mt-1 text-xs tabular-nums text-stone-500">{salary}</p>}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 gap-1 overflow-hidden">
          {app.tags.slice(0, 2).map((t) => <Badge key={t} className="truncate">{t}</Badge>)}
        </div>
        <span className="shrink-0 text-[11px] text-stone-500">{relativeTime(app.updated_at)}</span>
      </div>
    </Link>
  );
}

function Board({ apps, onMove }: { apps: Application[]; onMove: (app: Application, status: Status) => void }) {
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const grouped = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, [] as Application[]])) as Record<Status, Application[]>;
    for (const a of apps) map[a.status].push(a);
    return map;
  }, [apps]);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 scroll-thin sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex min-w-max gap-3">
        {STATUSES.map((status) => (
          <section key={status} aria-label={STATUS_META[status].label}
                   onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
                   onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
                   onDrop={(e) => {
                     e.preventDefault();
                     setDragOver(null);
                     const app = apps.find((a) => a.id === e.dataTransfer.getData("text/application-id"));
                     if (app && app.status !== status) onMove(app, status);
                   }}
                   className={cn("flex w-64 shrink-0 flex-col rounded-lg border p-2 transition-colors",
                                 dragOver === status ? "border-accent-300 bg-accent-50/60" : "border-transparent bg-stone-100/70")}>
            <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
              <span className="flex items-center gap-2 text-[13px] font-medium text-stone-700">
                <StatusDot status={status} />{STATUS_META[status].label}
              </span>
              <span className="text-xs tabular-nums text-stone-500">{grouped[status].length}</span>
            </header>
            <div className="flex min-h-24 flex-col gap-2">
              {grouped[status].map((app) => (
                <AppCard key={app.id} app={app}
                         onDragStart={(e) => {
                           e.dataTransfer.setData("text/application-id", app.id);
                           e.dataTransfer.effectAllowed = "move";
                         }} />
              ))}
              {grouped[status].length === 0 && (
                <p className="rounded-md border border-dashed border-stone-300/80 px-2 py-5 text-center text-xs text-stone-500">
                  Drop here
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ListView({ apps, onStatusChange }: { apps: Application[]; onStatusChange: (app: Application, status: Status) => void }) {
  const [sort, setSort] = useState<SortKey>("updated");
  const sorted = useMemo(() => [...apps].sort((a, b) => {
    if (sort === "company") return a.company_name.localeCompare(b.company_name);
    if (sort === "applied") return (b.applied_date ?? "").localeCompare(a.applied_date ?? "");
    return b.updated_at.localeCompare(a.updated_at);
  }), [apps, sort]);

  const th = (key: SortKey, label: string, className = "") => (
    <th className={cn("px-3 py-2 font-medium", className)}>
      <button onClick={() => setSort(key)} className={cn("hover:text-stone-900", sort === key && "text-stone-900")}>
        {label}{sort === key && " ↓"}
      </button>
    </th>
  );

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead className="border-b border-stone-200 bg-stone-50/70 text-left text-xs text-stone-500">
          <tr>
            {th("company", "Role", "pl-4")}
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Location</th>
            <th className="px-3 py-2 font-medium">Salary</th>
            {th("applied", "Applied")}
            {th("updated", "Updated", "pr-4")}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {sorted.map((app) => (
            <tr key={app.id} className="group hover:bg-stone-50/70">
              <td className="py-2.5 pl-4 pr-3">
                <Link href={`/applications/${app.id}`} className="font-medium text-stone-900 group-hover:underline underline-offset-2">
                  {app.position_title}
                </Link>
                <p className="text-xs text-stone-500">{app.company_name}</p>
              </td>
              <td className="px-3">
                <select value={app.status} aria-label={`Status of ${app.position_title}`}
                        onChange={(e) => onStatusChange(app, e.target.value as Status)}
                        className={cn("rounded border-0 bg-transparent py-1 pl-1.5 pr-6 text-xs font-medium focus:ring-2 focus:ring-accent-500/30", STATUS_META[app.status].tone)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </td>
              <td className="px-3 text-stone-600">
                {app.location ?? "—"}
                {app.work_mode && <span className="text-stone-500"> · {WORK_MODE_LABELS[app.work_mode]}</span>}
              </td>
              <td className="px-3 tabular-nums text-stone-600">{formatSalary(app.salary_min, app.salary_max, app.currency) ?? "—"}</td>
              <td className="px-3 tabular-nums text-stone-600">{formatShortDate(app.applied_date)}</td>
              <td className="pl-3 pr-4 text-stone-500">{relativeTime(app.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ApplicationsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [view, setView] = useState<View>(params.get("status") ? "list" : "board");
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [workMode, setWorkMode] = useState("");
  const [location, setLocation] = useState("");
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const debouncedSearch = useDebounced(search);
  const debouncedLocation = useDebounced(location);

  const showForm = params.get("new") === "1";
  const closeForm = () => router.replace("/applications");

  const resumeId = params.get("resume_id") ?? "";
  const { data: apps, setData: setApps, error, loading, reload } = useAsync(
    () => api.listApplications({
      search: debouncedSearch || undefined, status: status || undefined,
      work_mode: workMode || undefined, location: debouncedLocation || undefined,
      resume_id: resumeId || undefined,
    }),
    [debouncedSearch, status, workMode, debouncedLocation, resumeId]);

  const filtersActive = !!(search || status || workMode || location || resumeId);

  const move = async (app: Application, next: Status) => {
    if (next === "REJECTED") {
      setRejectTarget({ ...app, status: next });
      return;
    }
    const previous = apps;
    setApps((list) => list?.map((a) => (a.id === app.id ? { ...a, status: next } : a)) ?? null);
    try {
      const updated = await api.updateApplication(app.id, { status: next });
      setApps((list) => list?.map((a) => (a.id === app.id ? updated : a)) ?? null);
      toast(`Moved to ${STATUS_META[next].label}`);
    } catch (err) {
      setApps(previous);
      toast(err instanceof Error ? err.message : "Could not update the status.", "error");
    }
  };

  return (
    <>
      <PageHeader title="Applications"
                  description={apps ? `${apps.length} ${filtersActive ? "matching" : "tracked"}` : "Your pipeline"}
                  actions={<>
                    <SegmentedControl value={view} onChange={setView} options={[
                      { id: "board", label: "Board", icon: <Columns3 className="size-3.5" /> },
                      { id: "list", label: "List", icon: <List className="size-3.5" /> },
                    ]} />
                    <Button variant="primary" icon={<Plus className="size-4" />}
                            onClick={() => router.replace("/applications?new=1")}>New</Button>
                  </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search role or company"
                 aria-label="Search applications" className={cn(controlClass, "h-8 pl-8")} />
        </div>
        {view === "list" && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"
                  className={cn(controlClass, "h-8 w-auto")}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        )}
        <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} aria-label="Work mode"
                className={cn(controlClass, "h-8 w-auto")}>
          <option value="">Any work mode</option>
          {enumOptions(WORK_MODE_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location"
               aria-label="Location" className={cn(controlClass, "h-8 w-36")} />
        {filtersActive && (
          <Button variant="ghost" size="sm" icon={<X className="size-3.5" />}
                  onClick={() => {
                    setSearch(""); setStatus(""); setWorkMode(""); setLocation("");
                    if (resumeId) router.replace("/applications");
                  }}>
            Clear
          </Button>
        )}
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}

      {loading && !apps ? (
        <div className="flex gap-3 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-80 w-64 shrink-0" />)}</div>
      ) : apps && apps.length === 0 && !filtersActive ? (
        <Card>
          <EmptyState icon={<Briefcase className="size-5" />} title="No applications yet"
                      action={<Button variant="primary" icon={<Plus className="size-4" />}
                                      onClick={() => router.replace("/applications?new=1")}>Add an application</Button>}>
            Save jobs as soon as they interest you. Moving a card between columns records the change
            in your timeline, which powers response-time analytics.
          </EmptyState>
        </Card>
      ) : apps && apps.length === 0 ? (
        <Card><EmptyState title="Nothing matches these filters">Try removing a filter or searching for something else.</EmptyState></Card>
      ) : apps && (view === "board"
        ? <Board apps={apps} onMove={move} />
        : <ListView apps={apps} onStatusChange={move} />)}

      {showForm && (
        <ApplicationForm onClose={closeForm}
                         onSaved={(app) => { closeForm(); router.push(`/applications/${app.id}`); }} />
      )}
      {rejectTarget && (
        <ApplicationForm application={rejectTarget} initialStatus="REJECTED"
                         onClose={() => setRejectTarget(null)}
                         onSaved={() => { setRejectTarget(null); reload(); }} />
      )}
    </>
  );
}

export default function ApplicationsPage() {
  return <Suspense><ApplicationsInner /></Suspense>;
}
