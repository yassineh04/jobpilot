"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, ChevronRight, RotateCcw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import type { AssistantReply } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, ErrorBanner, Note, PageHeader, Skeleton } from "@/components/ui/Primitives";
import { AiNotConfigured, AiWaiting, useAiStatus } from "@/components/ai/AiKit";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: AssistantReply["sources"];
}

const SUGGESTIONS = [
  "Which applications am I waiting to hear back on?",
  "Which saved jobs require AWS?",
  "Who should I follow up with?",
  "What interview topics come up most?",
  "Which resume have I used most often?",
  "Quelles candidatures ai-je envoyées ces 30 derniers jours ?",
];

/** Safe renderer: paragraphs, "- " bullets and **bold**. No HTML is injected. */
function Rich({ text }: { text: string }) {
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

function Sources({ sources }: { sources: AssistantReply["sources"] }) {
  const [open, setOpen] = useState<string | null>(sources[0]?.title ?? null);
  if (!sources.length) return null;
  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-stone-500">
        <ShieldCheck className="size-3.5 text-accent-600" />Data used for this answer (read directly from your records)
      </p>
      <div className="space-y-1.5">
        {sources.map((s) => (
          <div key={s.title} className="rounded-md border border-stone-200">
            <button onClick={() => setOpen(open === s.title ? null : s.title)} aria-expanded={open === s.title}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-50">
              {s.title}
              <ChevronRight className={cn("size-3.5 text-stone-500 transition-transform", open === s.title && "rotate-90")} />
            </button>
            {open === s.title && s.items.length === 0 && (
              <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">No matching records.</p>
            )}
            {open === s.title && s.items.length > 0 && (
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const status = useAiStatus();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await api.assistantChat(next.map(({ role, content }) => ({ role, content })));
      setMessages([...next, { role: "assistant", content: res.reply, sources: res.sources }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant could not answer.");
      setMessages(messages);
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  if (!status) return <Skeleton className="h-96" />;

  if (!status.enabled) {
    return (
      <>
        <PageHeader title="Ask JobPilot" description="Questions about your own applications, interviews, resumes and contacts" />
        <div className="max-w-2xl"><AiNotConfigured /></div>
      </>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col lg:h-[calc(100dvh-4rem)]">
      <PageHeader title="Ask JobPilot"
                  description={`Answers come from your own records, which are shown under each answer. ${status.provider}${status.local ? ", running on this computer" : ""}.`}
                  actions={messages.length > 0 && <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />}
                                                          onClick={() => { setMessages([]); setError(null); }}>New conversation</Button>} />

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl pt-4">
            <p className="mb-3 text-[13px] text-stone-500">Try one of these:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                        className="rounded-md border border-stone-200 bg-white px-3.5 py-2.5 text-left text-[13px] text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5 pb-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" && "justify-end")}>
                {m.role === "user" ? (
                  <div className="max-w-[80%] rounded-lg bg-stone-900 px-3.5 py-2 text-[13px] text-white">{m.content}</div>
                ) : (
                  <Card className="max-w-[90%] px-4 py-3 text-[13px] leading-relaxed text-stone-800">
                    <Rich text={m.content} />
                    {m.sources && <Sources sources={m.sources} />}
                  </Card>
                )}
              </div>
            ))}
            <AiWaiting running={sending} local={status.local} what="Looking through your data" />
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl pt-3">
        {error && <div className="mb-2"><ErrorBanner message={error} /></div>}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-end gap-2 rounded-lg border border-stone-300 bg-white p-2 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={4000}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                    placeholder="Ask about your job search, in any language…" aria-label="Message"
                    className="max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm outline-none placeholder:text-stone-400" />
          <Button type="submit" variant="primary" size="sm" disabled={!input.trim()} loading={sending}
                  icon={!sending && <ArrowUp className="size-4" />} aria-label="Send" className="size-8 px-0" />
        </form>
        <Note className="mt-2">Read-only: the assistant can look at your data but never changes it. Check important details in the sources.</Note>
      </div>
    </div>
  );
}
