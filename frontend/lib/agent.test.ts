import { describe, expect, it } from "vitest";
import { historyForModel, localTime, offsetFor, type AgentMessage } from "./agent";

const proposal = { id: "1", tool: "create_task", input: {}, detail: "" };

describe("historyForModel", () => {
  it("tells the model what happened to each proposal", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Remind me" },
      { role: "assistant", content: "Proposed.", actions: [
        { ...proposal, title: "Create task A", state: "done" },
        { ...proposal, id: "2", title: "Create task B", state: "dismissed" },
        { ...proposal, id: "3", title: "Create task C", state: "failed", result: "Task not found" },
      ] },
    ];
    const [, assistant] = historyForModel(messages);
    expect(assistant.content).toBe("Proposed.\n\n[Proposals - confirmed and done: Create task A; "
      + "dismissed by the user: Create task B; failed: Create task C (Task not found)]");
  });

  it("keeps every message within the API limit", () => {
    const long = "x".repeat(5000);
    const history = historyForModel([
      { role: "user", content: long },
      { role: "assistant", content: long, actions: [{ ...proposal, title: "T", state: "pending" }] },
    ]);
    expect(history.every((m) => m.content.length <= 4000)).toBe(true);
    expect(history[1].content.endsWith("not confirmed yet: T]")).toBe(true);
  });

  it("sends only the recent turns", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: "user" as const, content: String(i) }));
    expect(historyForModel(many)).toHaveLength(12);
  });
});

describe("time helpers", () => {
  it("formats the local time with weekday and offset, within 40 characters", () => {
    const value = localTime(new Date(2026, 9, 28, 9, 5));
    expect(value).toMatch(/^2026-10-28T09:05 Wednesday \(UTC[+-]\d{2}:\d{2}\)$/);
    expect(value.length).toBeLessThanOrEqual(40);
  });

  it("uses the interview's own date for the offset", () => {
    const at = "2026-07-01T10:00";
    expect(offsetFor({ tool: "schedule_interview", input: { scheduled_at: at } })).toBe(new Date(at).getTimezoneOffset());
    expect(offsetFor({ tool: "create_task", input: {} })).toBe(new Date().getTimezoneOffset());
  });
});
