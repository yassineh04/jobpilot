"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, ChevronDown } from "lucide-react";
import { downloadIcs, googleCalendarUrl, interviewEvent, outlookUrl } from "@/lib/calendar";
import { cn } from "@/lib/format";
import type { Application, Interview } from "@/lib/types";

const item = "flex w-full items-center rounded px-2.5 py-1.5 text-left text-[13px] text-stone-700 hover:bg-stone-100 hover:text-stone-900";

export function AddToCalendar({ interview, app, className }: {
  interview: Interview; app: Pick<Application, "position_title" | "company_name" | "job_url">; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const event = interviewEvent(interview, app);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900">
        <CalendarPlus className="size-3.5" />Add to calendar<ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="group" aria-label="Calendar apps"
             className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-stone-200 bg-white p-1 shadow-pop animate-pop-in">
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>Google Calendar</a>
          <a href={outlookUrl(event)} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>Outlook.com</a>
          <button type="button" className={item} onClick={() => { downloadIcs(event); setOpen(false); }}>
            Apple Calendar, Outlook app (.ics)
          </button>
        </div>
      )}
    </div>
  );
}
