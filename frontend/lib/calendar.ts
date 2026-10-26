import type { Application, Interview } from "./types";
import { parseDate } from "./format";

export interface CalendarEvent {
  uid: string;
  title: string;
  start: Date;
  minutes: number;
  location: string;
  details: string;
}

export function interviewEvent(interview: Interview, app: Pick<Application, "position_title" | "company_name" | "job_url">): CalendarEvent {
  const lines = [
    `${app.position_title} at ${app.company_name}`,
    interview.interviewer && `With ${interview.interviewer}`,
    interview.notes,
    app.job_url && `Posting: ${app.job_url}`,
  ];
  return {
    uid: `interview-${interview.id}@jobpilot`,
    title: `${interview.interview_type || "Interview"}: ${app.company_name}`,
    start: parseDate(interview.scheduled_at),
    minutes: interview.duration_minutes || 45,
    location: interview.location_or_link ?? "",
    details: lines.filter(Boolean).join("\n"),
  };
}

const end = (e: CalendarEvent) => new Date(e.start.getTime() + e.minutes * 60_000);

/** 20261028T180000Z */
export function utcStamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(e: CalendarEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE", text: e.title, dates: `${utcStamp(e.start)}/${utcStamp(end(e))}`, details: e.details, location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookUrl(e: CalendarEvent) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose", rru: "addevent", subject: e.title, body: e.details, location: e.location,
    startdt: e.start.toISOString(), enddt: end(e).toISOString(),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 characters continue on the next line after a space (RFC 5545). */
function fold(line: string) {
  const parts = [];
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73));
  return parts.join("\r\n ");
}

export function icsContent(e: CalendarEvent, now = new Date()) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JobPilot//Interviews//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`, `DTSTAMP:${utcStamp(now)}`, `DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(end(e))}`,
    `SUMMARY:${escape(e.title)}`, `DESCRIPTION:${escape(e.details)}`, `LOCATION:${escape(e.location)}`,
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${escape(e.title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(e: CalendarEvent) {
  const url = URL.createObjectURL(new Blob([icsContent(e)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${e.title.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase()}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
