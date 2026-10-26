"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight, ArrowRightLeft, ArrowUp, CalendarPlus, Check, CheckCircle2, ChevronRight, CircleAlert, ListTodo,
  Loader2, MessageCircle, Plus, ShieldCheck, StickyNote,
} from "lucide-react";
import { cn } from "@/lib/format";
import type { AgentAction, AgentMessage } from "@/lib/agent";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/Primitives";
import { AiWaiting, useAiStatus } from "@/components/ai/AiKit";
import { AgentMark } from "./AgentMark";
import { useAgent } from "./AgentProvider";

const ACTION_ICONS: Record<string, typeof ListTodo> = {
  create_task: ListTodo, update_application_status: ArrowRightLeft, add_application: Plus,
  schedule_interview: CalendarPlus, add_application_note: StickyNote, complete_task: CheckCircle2,
  log_contact_interaction: MessageCircle,
};

function suggestionsFor(pathname: string) {
  if (/^\/applications\/[0-9a-f-]{36}$/.test(pathname)) {
    return [
      "Summarize this application and what I should do next",
      "Remind me to follow up on this in one week",
      "I have a technical interview for this next Tuesday at 10am",
      "Add a note: the recruiter said the team is hiring two people",
    ];
  }
  return [
    "What should I focus on this week?",
    "Which applications am I waiting to hear back on?",
    "Who should I follow up with?",
    "I just applied to Stripe for a Backend Engineer role",
    "Quelles entrevues ai-je dans les 2 prochaines semaines ?",
    "Mark my overdue follow-ups as tasks for tomorrow",
  ];
}

/** Safe renderer: paragraphs, "- " bullets and **bold**. No HTML is injected. */
export function Rich({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part);
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
        if (bullet) return <p key={i} className="flex gap-2 pl-1"><span className="text-stone-500">•</span><span>{inline(bullet[1])}</span></p>;
        return line.trim() ? <p key={i}>{inline(line)}</p> : <div key={i} className="h-1" />;
      })}
    </div>
  );
}

function Sources({ sources }: { sources: NonNullable<AgentMessage["sources"]> }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!sources.length) return null;
  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-stone-500">
        <ShieldCheck className="size-3.5 text-accent-600" />Data used for this answer (read directly from your records)
      </p>
      <div className="space-y-1.5">
        {sources.map((s) => (
          <div key={s.title} className="rounded-md border border-stone-200">
            <button type="button" onClick={() => setOpen(open === s.title ? null : s.title)} aria-expanded={open === s.title}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-50">
              {s.title}
              <ChevronRight className={cn("size-3.5 text-stone-500 transition-transform", open === s.title && "rotate-90")} />
            </button>
            {open === s.title && (s.items.length === 0 ? (
              <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">No matching records.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-stone-100 overflow-y-auto border-t border-stone-100 scroll-thin">
                {s.items.map((item, i) => (
                  <li key={i}>
                    <Link href={item.href} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs hover:bg-stone-50">
                      <span className="truncate text-stone-800">{item.label}</span>
                      <span className="shrink-0 text-stone-500">{item.detail}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionCard({ action, onConfirm, onDismiss }: { action: AgentAction; onConfirm: () => void; onDismiss: () => void }) {
  const Icon = ACTION_ICONS[action.tool] ?? ListTodo;
  const settled = action.state === "done" || action.state === "dismissed";
  return (
    <div className={cn("rounded-md border bg-white px-3 py-2.5 transition-colors",
                       action.state === "done" ? "border-accent-200 bg-accent-50/40" : "border-stone-200",
                       action.state === "dismissed" && "opacity-60")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                            action.state === "done" ? "bg-accent-600 text-on-accent" : "bg-stone-100 text-stone-600")}>
          {action.state === "done" ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13px] font-medium text-stone-900", action.state === "dismissed" && "line-through")}>{action.title}</p>
          {action.detail && <p className="mt-0.5 truncate text-xs text-stone-500">{action.detail}</p>}
          {action.state === "failed" && (
            <p className="mt-1 flex items-center gap-1 text-xs text-rose-700"><CircleAlert className="size-3.5" />{action.result}</p>
          )}
        </div>
      </div>
      {!settled && (
        <div className="mt-2.5 flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={action.state === "running"}>Dismiss</Button>
          <Button size="sm" variant="primary" onClick={onConfirm} loading={action.state === "running"}
                  icon={<Check className="size-3.5" />}>{action.state === "failed" ? "Try again" : "Confirm"}</Button>
        </div>
      )}
      {action.state === "done" && (
        <div className="mt-1.5 flex items-center justify-between pl-8.5 text-xs">
          <span className="text-accent-700">Done</span>
          {action.href && (
            <Link href={action.href} className="inline-flex items-center gap-1 font-medium text-stone-700 hover:text-stone-900">
              Open<ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      )}
      {action.state === "dismissed" && <p className="mt-1 pl-8.5 text-xs text-stone-500">Dismissed</p>}
    </div>
  );
}

function AssistantBubble({ message, index }: { message: AgentMessage; index: number }) {
  const { confirm, dismiss } = useAgent();
  const pending = message.actions?.filter((a) => a.state === "pending") ?? [];
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-600 text-on-accent">
        <AgentMark className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-stone-800">
        {!!message.steps?.length && (
          <ul className="mb-1.5 flex flex-wrap gap-1" aria-label="What the agent looked at">
            {message.steps.map((s) => (
              <li key={s} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
                <Check className="size-3 text-accent-600" />{s}
              </li>
            ))}
          </ul>
        )}
        <Rich text={message.content} />
        {!!message.actions?.length && (
          <div className="mt-3 space-y-2" role="group" aria-label="Proposed changes">
            {message.actions.map((a) => (
              <ActionCard key={a.id} action={a} onConfirm={() => confirm(index, a.id)} onDismiss={() => dismiss(index, a.id)} />
            ))}
            {pending.length > 1 && (
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => pending.forEach((a) => confirm(index, a.id))}>
                  Confirm all {pending.length}
                </Button>
              </div>
            )}
          </div>
        )}
        {message.sources && <Sources sources={message.sources} />}
        {message.readOnly && (
          <p className="mt-2 text-xs text-stone-500">This model can only read your data, so the agent can&apos;t propose changes here.</p>
        )}
      </div>
    </div>
  );
}

export function AgentConversation({ variant }: { variant: "page" | "panel" }) {
  const status = useAiStatus();
  const pathname = usePathname();
  const { messages, sending, error, send } = useAgent();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);
  useEffect(() => { if (variant === "panel") inputRef.current?.focus(); }, [variant]);

  const submit = (text: string) => {
    if (!text.trim() || sending) return;
    setInput("");
    send(text).catch(() => setInput(text));
  };

  const page = variant === "page";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("min-h-0 flex-1 overflow-y-auto scroll-thin", !page && "px-4 py-4")}>
        {messages.length === 0 ? (
          <div className={cn(page && "mx-auto max-w-2xl pt-4")}>
            <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3.5">
              <p className="flex items-center gap-2 text-[13px] font-medium text-stone-900">
                <AgentMark className="text-accent-600" />What the agent can do
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
                Ask about your applications, or tell it what happened. It looks things up in your records and
                prepares the changes (tasks, statuses, interviews, notes). Nothing changes until you confirm.
              </p>
            </div>
            <p className="mb-2 text-xs font-medium text-stone-500">Try</p>
            <div className={cn("grid gap-2", page && "sm:grid-cols-2")}>
              {suggestionsFor(pathname).map((s) => (
                <button type="button" key={s} onClick={() => submit(s)} disabled={sending}
                        className="rounded-md border border-stone-200 bg-white px-3 py-2 text-left text-[13px] text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={cn("space-y-5 pb-2", page && "mx-auto max-w-3xl pb-4")} aria-live="polite">
            {messages.map((m, i) => m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-stone-900 px-3.5 py-2 text-[13px] text-white">{m.content}</div>
              </div>
            ) : <AssistantBubble key={i} message={m} index={i} />)}
            <AiWaiting running={sending} local={status?.local} what="Working on it" />
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className={cn(page ? "mx-auto w-full max-w-3xl pt-3" : "border-t border-stone-200 px-4 pb-4 pt-3")}>
        {error && <div className="mb-2"><ErrorBanner message={error} /></div>}
        <form onSubmit={(e) => { e.preventDefault(); submit(input); }}
              className="flex items-end gap-2 rounded-lg border border-stone-300 bg-white p-2 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={4000}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); } }}
                    placeholder="Ask, or tell the agent what happened…" aria-label="Message to the agent"
                    className="max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm outline-none placeholder:text-stone-400" />
          <Button type="submit" variant="primary" size="sm" disabled={!input.trim()} loading={sending}
                  icon={!sending && <ArrowUp className="size-4" />} aria-label="Send" className="size-8 px-0" />
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-stone-500">
          {sending ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
          Reads only your data. Changes need your confirmation.
          {status?.provider && <span className="ml-auto">{status.provider}</span>}
        </p>
      </div>
    </div>
  );
}
