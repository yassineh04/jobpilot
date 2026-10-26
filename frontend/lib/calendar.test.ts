import { describe, expect, it } from "vitest";
import { googleCalendarUrl, icsContent, interviewEvent, outlookUrl, utcStamp } from "./calendar";
import type { Interview } from "./types";

const interview: Interview = {
  id: "abc", application_id: "app", scheduled_at: "2026-10-28T18:00:00", interview_type: "Technical",
  location_or_link: "https://meet.example.com/x", interviewer: "Sam Lee", duration_minutes: 60,
  notes: "Bring questions; system design, queues", reminder_sent: false,
};
const app = { position_title: "Backend Developer", company_name: "Shopify", job_url: null };

describe("calendar export", () => {
  const event = interviewEvent(interview, app);

  it("builds the event from the interview (stored times are UTC)", () => {
    expect(event.title).toBe("Technical: Shopify");
    expect(utcStamp(event.start)).toBe("20261028T180000Z");
    expect(event.details).toContain("With Sam Lee");
  });

  it("links to Google Calendar and Outlook with start and end", () => {
    const google = new URL(googleCalendarUrl(event));
    expect(google.searchParams.get("dates")).toBe("20261028T180000Z/20261028T190000Z");
    expect(google.searchParams.get("location")).toBe("https://meet.example.com/x");
    expect(new URL(outlookUrl(event)).searchParams.get("enddt")).toBe("2026-10-28T19:00:00.000Z");
  });

  it("writes a valid .ics file", () => {
    const ics = icsContent(event, new Date(Date.UTC(2026, 9, 1)));
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20261028T180000Z\r\nDTEND:20261028T190000Z");
    expect(ics).toContain("UID:interview-abc@jobpilot");
    expect(ics.replace(/\r\n /g, "")).toContain("Bring questions\\; system design\\, queues");  // escaped, unfolded
    expect(lines.every((line) => line.length <= 75)).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("defaults to 45 minutes and a generic title", () => {
    const e = interviewEvent({ ...interview, duration_minutes: null, interview_type: null }, app);
    expect(e.title).toBe("Interview: Shopify");
    expect(e.minutes).toBe(45);
  });
});
