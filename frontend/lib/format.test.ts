import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cn, daysUntil, formatBytes, formatMoney, formatSalary, initials, monthRange, parseDate, pluralize, relativeTime,
  toDateInput, yearRange,
} from "./format";

describe("parseDate", () => {
  it("treats naive backend datetimes as UTC", () => {
    expect(parseDate("2026-10-16T12:00:00").toISOString()).toBe("2026-10-16T12:00:00.000Z");
  });
  it("keeps explicit timezones", () => {
    expect(parseDate("2026-10-16T12:00:00+02:00").toISOString()).toBe("2026-10-16T10:00:00.000Z");
    expect(parseDate("2026-10-16T12:00:00Z").toISOString()).toBe("2026-10-16T12:00:00.000Z");
  });
  it("parses plain dates as local midnight (no off-by-one day)", () => {
    const d = parseDate("2026-03-01");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 1, 0]);
  });
});

describe("relative dates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 16, 15, 0));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["2026-10-16", "Today"], ["2026-10-15", "Yesterday"], ["2026-10-17", "Tomorrow"],
    ["2026-10-11", "5d ago"], ["2026-10-20", "in 4d"],
  ])("relativeTime(%s) = %s", (input, expected) => {
    expect(relativeTime(input)).toBe(expected);
  });

  it("falls back to a short date beyond a month", () => {
    expect(relativeTime("2026-01-02")).toMatch(/Jan/);
  });

  it("counts calendar days, not 24h blocks", () => {
    expect(daysUntil("2026-10-17")).toBe(1);
    expect(daysUntil("2026-10-16")).toBe(0);
    expect(daysUntil("2026-10-01")).toBe(-15);
  });

  it("handles missing values", () => {
    expect(relativeTime(null)).toBe("—");
  });
});

describe("money and text", () => {
  it.each([
    [[90000, 120000, "CAD"], "90k–120k CAD"],
    [[90000, 90000, "CAD"], "90k CAD"],
    [[null, 75000, "USD"], "75k USD"],
    [[null, null, "CAD"], null],
  ] as const)("formatSalary(%j) = %s", ([min, max, cur], expected) => {
    expect(formatSalary(min, max, cur)).toBe(expected);
  });

  it("formats small amounts without a k", () => {
    expect(formatMoney(25)).toBe("25");
  });

  it("pluralizes and builds initials", () => {
    expect(pluralize(1, "task")).toBe("1 task");
    expect(pluralize(3, "task")).toBe("3 tasks");
    expect(initials("Émilie de la Roche")).toBe("ÉD");
    expect(initials("  alex  ")).toBe("A");
  });

  it("formats dates for date inputs in local time", () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("cn", () => {
  it("drops falsy values and lets later Tailwind classes win", () => {
    expect(cn("w-full px-2", false, null, "w-36")).toBe("px-2 w-36");
    expect(cn("text-sm", undefined, "font-medium")).toBe("text-sm font-medium");
  });
});

describe("monthRange and formatBytes", () => {
  it("shows month ranges, with Present for current roles", () => {
    expect(monthRange("2024-05-01", "2024-08-01")).toBe("May 2024 – Aug 2024");
    expect(monthRange("2023-09-01", null)).toBe("Sep 2023 – Present");
    expect(monthRange(null, null)).toBe("— – Present");
  });
  it("formats file sizes", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(146_000)).toBe("143 KB");
    expect(formatBytes(2_621_440)).toBe("2.5 MB");
  });
});

describe("yearRange", () => {
  it("shows years only", () => {
    expect(yearRange("2022-01-01", "2026-01-01")).toBe("2022 – 2026");
    expect(yearRange("2022-09-01", null)).toBe("Since 2022");
    expect(yearRange(null, "2020-06-01")).toBe("Until 2020");
    expect(yearRange(null, null)).toBe("");
  });
});
