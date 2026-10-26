"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { historyForModel, localTime, offsetFor, type AgentAction, type AgentMessage } from "@/lib/agent";
import { notifyDataChanged } from "@/lib/use-async";
import { useToast } from "@/components/ui/Toast";

const STORAGE_KEY = "jp-agent";

interface AgentValue {
  messages: AgentMessage[];
  sending: boolean;
  error: string | null;
  open: boolean;
  setOpen: (open: boolean | ((o: boolean) => boolean)) => void;
  send: (text: string) => Promise<void>;
  confirm: (messageIndex: number, actionId: string) => Promise<void>;
  dismiss: (messageIndex: number, actionId: string) => void;
  reset: () => void;
}

const AgentContext = createContext<AgentValue | null>(null);

function load(): AgentMessage[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]") as AgentMessage[];
    // A confirmation cut off by a reload is unknown: show it as pending again
    return saved.map((m) => ({ ...m, actions: m.actions?.map((a) => (a.state === "running" ? { ...a, state: "pending" } : a)) }));
  } catch {
    return [];
  }
}

/** One conversation for the whole app: it follows you from page to page (kept for this tab only). */
export function AgentProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const toast = useToast();
  const [messages, setMessages] = useState<AgentMessage[]>(load);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch { /* storage blocked: memory only */ }
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...latest.current, { role: "user" as const, content }];
    setMessages(next);
    setSending(true);
    setError(null);
    try {
      const res = await api.agentChat(historyForModel(next), { path: pathname, local_time: localTime() });
      setMessages([...next, {
        role: "assistant", content: res.reply, steps: res.steps, sources: res.sources, readOnly: res.mode === "read_only",
        actions: res.actions.map((a) => ({ ...a, state: "pending" as const })),
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The agent could not answer.");
      setMessages(latest.current.slice(0, -1));
      throw err;
    } finally {
      setSending(false);
    }
  }, [pathname, sending]);

  const patch = useCallback((messageIndex: number, actionId: string, change: Partial<AgentAction>) => {
    setMessages((all) => all.map((m, i) => i !== messageIndex ? m : {
      ...m, actions: m.actions?.map((a) => (a.id === actionId ? { ...a, ...change } : a)),
    }));
  }, []);

  const confirm = useCallback(async (messageIndex: number, actionId: string) => {
    const action = latest.current[messageIndex]?.actions?.find((a) => a.id === actionId);
    if (!action || action.state !== "pending") return;
    patch(messageIndex, actionId, { state: "running" });
    try {
      const res = await api.agentConfirm(action, offsetFor(action));
      patch(messageIndex, actionId, { state: "done", result: res.message, href: res.href });
      notifyDataChanged();
      toast(res.message);
    } catch (err) {
      patch(messageIndex, actionId, { state: "failed", result: err instanceof Error ? err.message : "It could not be done." });
    }
  }, [patch, toast]);

  const dismiss = useCallback((messageIndex: number, actionId: string) => {
    patch(messageIndex, actionId, { state: "dismissed" });
  }, [patch]);

  const reset = useCallback(() => { setMessages([]); setError(null); }, []);

  const value = useMemo(() => ({ messages, sending, error, open, setOpen, send, confirm, dismiss, reset }),
    [messages, sending, error, open, send, confirm, dismiss, reset]);
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const value = useContext(AgentContext);
  if (!value) throw new Error("useAgent must be used inside AgentProvider");
  return value;
}
