"use client";
import { Check, X } from "lucide-react";
import { STATUS_META, STATUSES } from "@/lib/constants";
import { cn, formatShortDate } from "@/lib/format";
import type { AppEvent, Status } from "@/lib/types";

/** The forward path; Rejected and Withdrawn are endings shown on top of it. */
const PATH: Status[] = STATUSES.filter((s) => s !== "REJECTED" && s !== "WITHDRAWN");
const ENDINGS: Status[] = ["REJECTED", "WITHDRAWN"];

/** Pipeline progress for one application. Each step is a button that moves the application there. */
export function StatusStepper({ status, events, onChange }: {
  status: Status; events: AppEvent[] | null; onChange: (status: Status) => void;
}) {
  const reachedAt = new Map<Status, string>();
  for (const e of [...(events ?? [])].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    if (e.to_status && !reachedAt.has(e.to_status)) reachedAt.set(e.to_status, e.occurred_at);
  }
  const ended = ENDINGS.includes(status);
  // When closed, progress stops at the furthest stage the history shows
  const furthest = ended
    ? Math.max(0, ...PATH.map((s, i) => (reachedAt.has(s) ? i : -1)))
    : PATH.indexOf(status);

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-3">
      <ol className="flex items-start overflow-x-auto scroll-thin" aria-label="Application progress">
        {PATH.map((s, i) => {
          const done = i < furthest || (ended && i === furthest);
          const current = !ended && i === furthest;
          return (
            <li key={s} className="flex min-w-[84px] flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <span className={cn("h-px flex-1", i === 0 ? "bg-transparent" : i <= furthest ? "bg-accent-400" : "bg-stone-200")} />
                <button type="button" onClick={() => s !== status && onChange(s)} aria-current={current ? "step" : undefined}
                        aria-label={`${STATUS_META[s].label}${current ? " (current)" : done ? " (done)" : ""}. Move here`}
                        title={s === status ? STATUS_META[s].label : `Move to ${STATUS_META[s].label}`}
                        className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-all",
                                      current ? "bg-accent-600 text-on-accent ring-4 ring-accent-100"
                                        : done ? "bg-accent-100 text-accent-800 hover:bg-accent-200"
                                        : "bg-white text-stone-500 ring-1 ring-stone-300 hover:ring-stone-400 hover:text-stone-700")}>
                  {done ? <Check className="size-3.5" /> : i + 1}
                </button>
                <span className={cn("h-px flex-1", i === PATH.length - 1 ? "bg-transparent" : i < furthest ? "bg-accent-400" : "bg-stone-200")} />
              </div>
              <span className={cn("mt-1.5 px-1 text-center text-[11px] leading-tight",
                                  current ? "font-semibold text-stone-900" : done ? "text-stone-700" : "text-stone-500")}>
                {STATUS_META[s].label}
              </span>
              {reachedAt.has(s) && (i <= furthest) && (
                <span className="text-[10px] tabular-nums text-stone-500">{formatShortDate(reachedAt.get(s)!)}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-xs">
        {ended ? (
          <span className={cn("inline-flex items-center gap-1.5 font-medium", status === "REJECTED" ? "text-rose-700" : "text-stone-600")}>
            <X className="size-3.5" />{STATUS_META[status].label}
            {reachedAt.has(status) && <span className="font-normal text-stone-500">· {formatShortDate(reachedAt.get(status)!)}</span>}
          </span>
        ) : (
          <span className="text-stone-500">Click a step to move the application. Every change is kept in its history.</span>
        )}
        <span className="flex gap-1">
          {ENDINGS.filter((s) => s !== status).map((s) => (
            <button type="button" key={s} onClick={() => onChange(s)}
                    className="rounded-md px-2 py-1 font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900">
              {s === "REJECTED" ? "Mark rejected" : "Withdraw"}
            </button>
          ))}
          {ended && (
            <button type="button" onClick={() => onChange(PATH[furthest])}
                    className="rounded-md px-2 py-1 font-medium text-accent-700 transition-colors hover:bg-accent-50">
              Reopen
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
