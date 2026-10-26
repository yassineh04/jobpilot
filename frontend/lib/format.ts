import { twMerge } from "tailwind-merge";

const LOCALE = "en-CA";

/** Backend datetimes are naive UTC; make sure the browser parses them as UTC. */
export function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
}

export function formatDate(value?: string | null, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "—";
  return parseDate(value).toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric", ...opts });
}

export function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const date = parseDate(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(LOCALE, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function formatTime(value: string) {
  return parseDate(value).toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(value: string) {
  return `${formatShortDate(value)} · ${formatTime(value)}`;
}

export function relativeTime(value?: string | null) {
  if (!value) return "—";
  const date = parseDate(value);
  const diffDays = Math.round((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 0 && diffDays > -30) return `${-diffDays}d ago`;
  if (diffDays > 0 && diffDays < 30) return `in ${diffDays}d`;
  return formatShortDate(value);
}

export function daysUntil(value: string) {
  return Math.round((startOfDay(parseDate(value)).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** yyyy-mm-dd in local time, for <input type="date"> */
export function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatMoney(value: number, currency?: string | null) {
  const compact = value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
  return currency ? `${compact} ${currency}` : compact;
}

export function formatSalary(min?: number | null, max?: number | null, currency?: string | null) {
  if (!min && !max) return null;
  if (min && max && min !== max) return `${formatMoney(min)}–${formatMoney(max)} ${currency ?? ""}`.trim();
  return formatMoney((min || max) as number, currency);
}

export function pluralize(count: number, word: string, plural = `${word}s`) {
  return `${count} ${count === 1 ? word : plural}`;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

/** Joins class names; later Tailwind classes override conflicting earlier ones (w-auto beats w-full). */
export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(" "));
}

/** "May 2024 – Aug 2024", "Sep 2023 – Present". A missing end date means the role is current. */
export function monthRange(start?: string | null, end?: string | null) {
  const month = (v: string) => formatDate(v, { day: undefined });
  return `${start ? month(start) : "—"} – ${end ? month(end) : "Present"}`;
}

/** "2022 – 2026". Schools usually give years only, so months would be invented. */
export function yearRange(start?: string | null, end?: string | null) {
  const year = (v: string) => v.slice(0, 4);
  if (!start && !end) return "";
  return start && end ? `${year(start)} – ${year(end)}` : start ? `Since ${year(start)}` : `Until ${year(end!)}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
