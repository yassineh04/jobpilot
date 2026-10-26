import type { AgentProposal, AgentReply } from "./types";

export type ActionState = "pending" | "running" | "done" | "dismissed" | "failed";

export interface AgentAction extends AgentProposal {
  state: ActionState;
  result?: string;
  href?: string;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  steps?: string[];
  sources?: AgentReply["sources"];
  actions?: AgentAction[];
  readOnly?: boolean;
}

const OUTCOME: Record<ActionState, string> = {
  pending: "not confirmed yet",
  running: "not confirmed yet",
  done: "confirmed and done",
  dismissed: "dismissed by the user",
  failed: "failed",
};

/** What the model sees of the conversation: the text, plus what happened to each proposal. */
export function historyForModel(messages: AgentMessage[]) {
  return messages.slice(-12).map(({ role, content, actions }) => {
    if (role === "user" || !actions?.length) return { role, content: content.slice(0, 4000) };
    const notes = actions.map((a) => `${OUTCOME[a.state]}: ${a.title}${a.state === "failed" && a.result ? ` (${a.result})` : ""}`);
    const note = `\n\n[Proposals - ${notes.join("; ")}]`;
    return { role, content: content.slice(0, 4000 - note.length) + note };
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-24T09:05 Saturday (UTC-04:00)": lets the agent resolve "next Tuesday at 10". */
export function localTime(d = new Date()) {
  const offset = -d.getTimezoneOffset();
  const abs = Math.abs(offset);
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())} ${day} `
    + `(UTC${offset >= 0 ? "+" : "-"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}

/** UTC offset to apply when the action runs. An interview uses the offset of its own date (DST). */
export function offsetFor(action: Pick<AgentProposal, "tool" | "input">) {
  const when = action.input.scheduled_at;
  if (action.tool === "schedule_interview" && typeof when === "string") {
    const date = new Date(when);
    if (!Number.isNaN(date.getTime())) return date.getTimezoneOffset();
  }
  return new Date().getTimezoneOffset();
}
