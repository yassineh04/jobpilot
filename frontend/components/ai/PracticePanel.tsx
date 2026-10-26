"use client";
import { useMemo, useState } from "react";
import { BookmarkPlus, Check, Lightbulb, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { AiFeedback, PracticeQuestion } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { FormError, Select, Textarea, controlClass } from "@/components/ui/Field";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { AiButton, AiNotConfigured, AiWaiting, Quote, useAiStatus, Verified } from "./AiKit";

const STAR: { key: keyof AiFeedback["star"]; label: string }[] = [
  { key: "situation", label: "Situation" }, { key: "task", label: "Task" },
  { key: "action", label: "Action" }, { key: "result", label: "Result" },
];

function FeedbackView({ feedback }: { feedback: AiFeedback }) {
  return (
    <div className="space-y-4 rounded-md border border-stone-200 bg-stone-50/60 p-4">
      <p className="text-[13px] leading-relaxed text-stone-800">{feedback.summary}</p>
      <div className="flex flex-wrap gap-1.5" aria-label="STAR structure">
        {STAR.map((s) => (
          <span key={s.key} className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
                                          feedback.star[s.key] ? "bg-accent-100 text-accent-800" : "bg-white text-stone-500 ring-1 ring-stone-200")}>
            {feedback.star[s.key] ? <Check className="size-3" /> : <X className="size-3" />}{s.label}
          </span>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">What works</p>
          <ul className="space-y-1 text-[13px] text-stone-700">{feedback.strengths.map((s) => <li key={s}>• {s}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">To improve</p>
          <ul className="space-y-1 text-[13px] text-stone-700">{feedback.improvements.map((s) => <li key={s}>• {s}</li>)}</ul>
        </div>
      </div>
      {feedback.suggested_evidence.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
            <Lightbulb className="size-3.5 text-amber-500" />From your own profile, you could mention
          </p>
          <ul className="space-y-1">
            {feedback.suggested_evidence.map((e) => <li key={e.id} className="rounded bg-white px-2.5 py-1.5 text-[13px] text-stone-700 ring-1 ring-stone-200">{e.text}</li>)}
          </ul>
        </div>
      )}
      <Verified removed={feedback.removed_claims}>Suggestions only reference experiences you recorded.</Verified>
    </div>
  );
}

export function PracticePanel({ initialAppId }: { initialAppId?: string | null }) {
  const status = useAiStatus();
  const toast = useToast();
  const { data: apps } = useAsync(() => api.listApplications(), []);
  const { data: topics } = useAsync(() => api.listQuestionTopics(), []);
  const withPosting = useMemo(() => (apps ?? []).filter((a) => (a.job_description ?? "").length >= 80), [apps]);
  const [appId, setAppId] = useState(initialAppId ?? "");
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [weak, setWeak] = useState<string[]>([]);
  const [current, setCurrent] = useState<PracticeQuestion | null>(null);
  const [custom, setCustom] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<AiFeedback | null>(null);
  const [confidence, setConfidence] = useState("3");
  const [busy, setBusy] = useState<"questions" | "feedback" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const app = withPosting.find((a) => a.id === appId) ?? null;

  const generate = async () => {
    if (!appId) return;
    setBusy("questions");
    setError(null);
    try {
      const res = await api.practiceQuestions(appId);
      setQuestions(res.questions);
      setWeak(res.weak_topics);
      pick(res.questions[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate questions.");
    } finally {
      setBusy(null);
    }
  };

  const pick = (q: PracticeQuestion | null) => {
    setCurrent(q);
    setAnswer("");
    setFeedback(null);
  };

  const getFeedback = async () => {
    const question = current?.question ?? custom.trim();
    if (!question || answer.trim().length < 20) return setError("Write a fuller answer (a few sentences) first.");
    setBusy("feedback");
    setError(null);
    try {
      setFeedback(await api.answerFeedback(question, answer.trim(), appId || null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get feedback.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const question = current?.question ?? custom.trim();
    const topic = topics?.find((t) => t.name === current?.topic);
    try {
      await api.createQuestion({
        question, user_answer: answer.trim(), confidence: Number(confidence), topic_id: topic?.id ?? null,
        application_id: appId || null, company: app?.company_name ?? null, role: app?.position_title ?? null,
        interview_type: "Practice", notes: feedback?.improvements.join(" · ") || null,
      });
      toast("Saved to your question bank");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save.", "error");
    }
  };

  if (status && !status.enabled) return <AiNotConfigured />;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4">
        <Card className="p-4">
          <p className="mb-3 text-[13px] text-stone-600">Questions likely for a specific role, weighted toward the topics where you rated your confidence lowest.</p>
          <div className="space-y-3">
            <Select label="Application" value={appId} onChange={(e) => { setAppId(e.target.value); setQuestions([]); pick(null); }}
                    placeholder={withPosting.length ? "Choose an application" : "No application has a job description yet"}
                    options={withPosting.map((a) => ({ value: a.id, label: `${a.company_name} · ${a.position_title}` }))} />
            <AiButton running={busy === "questions"} onClick={generate} disabled={!appId} className="w-full">Generate questions</AiButton>
          </div>
          {weak.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-stone-500">Focusing on: {weak.map((w) => <Badge key={w}>{w}</Badge>)}</p>
          )}
        </Card>
        <AiWaiting running={busy === "questions"} local={status?.local} what="Reading the posting and your weak topics" />
        {questions.length > 0 && (
          <Card>
            <CardHeader title="Questions" description={app ? `${app.position_title} · ${app.company_name}` : undefined} />
            <ol className="divide-y divide-stone-100">
              {questions.map((q, i) => (
                <li key={q.question}>
                  <button type="button" onClick={() => pick(q)} aria-current={current === q}
                          className={cn("flex w-full gap-3 px-4 py-2.5 text-left text-[13px]", current === q ? "bg-accent-50/70" : "hover:bg-stone-50")}>
                    <span className="tabular-nums text-stone-500">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-stone-900">{q.question}</span>
                      {q.topic && <span className="mt-0.5 block text-xs text-stone-500">{q.topic}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>

      <Card className="h-fit">
        {!current && !custom && questions.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Lightbulb className="size-5" />} title="Practice an answer">
              Generate questions for an application, or type any question you want to rehearse.
            </EmptyState>
            <input value={custom} onChange={(e) => { setCustom(e.target.value); setCurrent(null); }}
                   placeholder="e.g. Tell me about a time you disagreed with a teammate" aria-label="Your own question"
                   className={cn(controlClass, "h-9")} />
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div>
              {current ? (
                <>
                  <p className="text-[15px] font-medium leading-snug text-stone-900">{current.question}</p>
                  {current.reason && <p className="mt-1 text-xs text-stone-500">Why it&apos;s likely: {current.reason}</p>}
                  {current.quote && <div className="mt-2"><Quote>{current.quote}</Quote></div>}
                </>
              ) : (
                <input value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Your own question"
                       placeholder="Type the question to practice" className={cn(controlClass, "h-9")} />
              )}
            </div>
            <Textarea label="Your answer" rows={8} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={6000}
                      placeholder="Answer as you would out loud. Situation, task, action, result works well for behavioral questions."
                      hint={`${answer.trim().split(/\s+/).filter(Boolean).length} words`} />
            <FormError message={error} />
            <AiWaiting running={busy === "feedback"} local={status?.local} what="Reviewing your answer" />
            {busy !== "feedback" && (
              <AiButton running={false} onClick={getFeedback} disabled={answer.trim().length < 20}>Get feedback</AiButton>
            )}
            {feedback && (
              <>
                <FeedbackView feedback={feedback} />
                <div className="flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4">
                  <Select label="How confident do you feel? (1–5)" value={confidence} onChange={(e) => setConfidence(e.target.value)}
                          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} wrapperClassName="w-56" />
                  <Button icon={<BookmarkPlus className="size-4" />} onClick={save}>Save to question bank</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
