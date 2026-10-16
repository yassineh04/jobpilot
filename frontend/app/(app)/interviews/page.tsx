"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight, MessagesSquare, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { INTERVIEW_TYPES } from "@/lib/constants";
import { cn, formatShortDate } from "@/lib/format";
import { useAsync, useDebounced } from "@/lib/use-async";
import type { Application, Question, Topic } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/Button";
import { FormError, Input, Select, Textarea, controlClass } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import {
  Badge, Card, CardHeader, EmptyState, ErrorBanner, LimitedData, Meter, Note, PageHeader, Skeleton, Tabs,
} from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { PracticePanel } from "@/components/ai/PracticePanel";

interface TopicStat {
  topic: string; question_count: number; rated_count: number; average_confidence: number | null;
  first_half_average: number | null; recent_average: number | null;
  trend: "improving" | "declining" | "stable" | null; limited_data: boolean;
}

function QuestionForm({ question, topics, apps, onClose, onSaved, onTopicCreated }: {
  question?: Question; topics: Topic[]; apps: Application[];
  onClose: () => void; onSaved: () => void; onTopicCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    question: question?.question ?? "", topic_id: question?.topic_id ?? "", application_id: question?.application_id ?? "",
    company: question?.company ?? "", role: question?.role ?? "", interview_type: question?.interview_type ?? "",
    asked_date: question?.asked_date ?? "", difficulty: question?.difficulty?.toString() ?? "",
    confidence: question?.confidence?.toString() ?? "", user_answer: question?.user_answer ?? "", notes: question?.notes ?? "",
  });
  const [newTopic, setNewTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const pickApplication = (id: string) => {
    const app = apps.find((a) => a.id === id);
    setForm((f) => ({ ...f, application_id: id, company: app?.company_name ?? f.company, role: app?.position_title ?? f.role }));
  };

  const addTopic = async () => {
    if (!newTopic.trim()) return;
    try {
      const t = await api.createQuestionTopic(newTopic.trim());
      setNewTopic("");
      set("topic_id", t.id);
      onTopicCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the topic.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.question.trim()) return setError("Write down the question.");
    setSaving(true);
    const payload = {
      question: form.question.trim(), topic_id: form.topic_id || null, application_id: form.application_id || null,
      company: form.company.trim() || null, role: form.role.trim() || null, interview_type: form.interview_type || null,
      asked_date: form.asked_date || null, difficulty: form.difficulty ? Number(form.difficulty) : null,
      confidence: form.confidence ? Number(form.confidence) : null,
      user_answer: form.user_answer.trim() || null, notes: form.notes.trim() || null,
    };
    try {
      if (question) await api.updateQuestion(question.id, payload);
      else await api.createQuestion(payload);
      toast(question ? "Question updated" : "Question recorded");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the question.");
    } finally {
      setSaving(false);
    }
  };

  const scale = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
  return (
    <Modal title={question ? "Edit question" : "Record a question"} size="lg" onClose={onClose}
           footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="question-form" loading={saving}>Save</Button></>}>
      <form id="question-form" onSubmit={submit} className="space-y-3.5">
        <Textarea label="Question" rows={2} value={form.question} onChange={(e) => set("question", e.target.value)}
                  placeholder="e.g. How would you design a rate limiter?" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Select label="Topic" value={form.topic_id} onChange={(e) => set("topic_id", e.target.value)} placeholder="Uncategorized"
                    options={topics.map((t) => ({ value: t.id, label: t.name }))} />
            <div className="mt-1.5 flex gap-1.5">
              <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="New topic"
                     aria-label="New topic" className={cn(controlClass, "h-7 text-xs")} />
              <Button size="sm" onClick={addTopic}>Add</Button>
            </div>
          </div>
          <Select label="Interview type" value={form.interview_type} onChange={(e) => set("interview_type", e.target.value)}
                  placeholder="—" options={INTERVIEW_TYPES.map((t) => ({ value: t, label: t }))} />
        </div>
        <Select label="Application" optional value={form.application_id} onChange={(e) => pickApplication(e.target.value)}
                placeholder="None" options={apps.map((a) => ({ value: a.id, label: `${a.company_name} · ${a.position_title}` }))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Company" value={form.company} onChange={(e) => set("company", e.target.value)} />
          <Input label="Role" value={form.role} onChange={(e) => set("role", e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Date asked" type="date" value={form.asked_date} onChange={(e) => set("asked_date", e.target.value)} />
          <Select label="Difficulty" value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)} placeholder="—" options={scale} />
          <Select label="My confidence" value={form.confidence} onChange={(e) => set("confidence", e.target.value)} placeholder="—" options={scale} />
        </div>
        <Textarea label="My answer" optional rows={3} value={form.user_answer} onChange={(e) => set("user_answer", e.target.value)} />
        <Textarea label="Notes" optional rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="What to review next time" />
        <FormError message={error} />
      </form>
    </Modal>
  );
}

function QuestionBank() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const debounced = useDebounced(search);
  const { data: questions, error, loading, reload } = useAsync(
    () => api.listQuestions({ search: debounced || undefined, topic_id: topicFilter || undefined, limit: "200" }),
    [debounced, topicFilter]);
  const { data: topics, reload: reloadTopics } = useAsync(() => api.listQuestionTopics(), []);
  const { data: apps } = useAsync(() => api.listApplications(), []);

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.deleteQuestion(deleting.id);
      toast("Question deleted");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete the question.", "error");
    }
    setDeleting(null);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions"
                 aria-label="Search questions" className={cn(controlClass, "h-8 pl-8")} />
        </div>
        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} aria-label="Topic" className={cn(controlClass, "h-8 w-auto")}>
          <option value="">All topics</option>
          {topics?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex-1" />
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Record question</Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !questions ? <Skeleton className="h-64" /> : questions && questions.length === 0 ? (
        <Card>
          <EmptyState icon={<MessagesSquare className="size-5" />} title={search || topicFilter ? "No questions match" : "No questions recorded yet"}>
            {!search && !topicFilter && "After each interview, write down the questions you were asked and rate your confidence. Patterns appear in the Weakness map."}
          </EmptyState>
        </Card>
      ) : (
        <Card className="divide-y divide-stone-100">
          {questions?.map((q) => (
            <div key={q.id} className="group px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <p className="text-[13px] font-medium leading-snug text-stone-900">{q.question}</p>
                <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton label="Edit question" onClick={() => setEditing(q)}><Pencil className="size-3.5" /></IconButton>
                  <IconButton label="Delete question" onClick={() => setDeleting(q)} className="hover:text-rose-600"><Trash2 className="size-3.5" /></IconButton>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                {q.topic_name && <Badge tone="bg-accent-50 text-accent-800">{q.topic_name}</Badge>}
                {q.interview_type && <Badge>{q.interview_type}</Badge>}
                {q.company && <span>{q.company}{q.role ? ` · ${q.role}` : ""}</span>}
                {q.asked_date && <span>· {formatShortDate(q.asked_date)}</span>}
                {q.difficulty && <span>· difficulty {q.difficulty}/5</span>}
                {q.confidence && <span>· confidence {q.confidence}/5</span>}
              </div>
              {q.user_answer && <p className="mt-2 whitespace-pre-line border-l-2 border-stone-200 pl-3 text-xs text-stone-600">{q.user_answer}</p>}
              {q.notes && <p className="mt-1.5 text-xs text-stone-500">{q.notes}</p>}
            </div>
          ))}
        </Card>
      )}

      {editing && topics && apps && (
        <QuestionForm question={editing === "new" ? undefined : editing} topics={topics} apps={apps}
                      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} onTopicCreated={reloadTopics} />
      )}
      {deleting && (
        <ConfirmDialog title="Delete question?" onCancel={() => setDeleting(null)} onConfirm={remove}
                       message={<span className="line-clamp-3">{deleting.question}</span>} />
      )}
    </>
  );
}

const TREND = {
  improving: { icon: ArrowUpRight, text: "Improving", className: "text-accent-700" },
  declining: { icon: ArrowDownRight, text: "Declining", className: "text-rose-600" },
  stable: { icon: ArrowRight, text: "Stable", className: "text-stone-500" },
};

function WeaknessMap() {
  const { data, error, loading, reload } = useAsync(() => api.getWeaknessMap(), []);
  if (loading && !data) return <Skeleton className="h-64" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data || data.total_questions === 0) {
    return (
      <Card>
        <EmptyState icon={<MessagesSquare className="size-5" />} title="No interview data yet">
          Record questions with a topic and a confidence rating. Your weakness map builds itself from them.
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader title="Self-reported confidence by topic" description={`${data.total_questions} questions recorded · weakest first`} />
        <ul className="divide-y divide-stone-100">
          {data.topics.map((t: TopicStat) => {
            const trend = t.trend ? TREND[t.trend] : null;
            return (
              <li key={t.topic} className="px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-stone-900">{t.topic}</span>
                    {t.limited_data && <LimitedData />}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-stone-500">
                    {trend && <span className={cn("flex items-center gap-0.5", trend.className)}><trend.icon className="size-3.5" />{trend.text}</span>}
                    <span className="tabular-nums">{t.average_confidence !== null ? `${t.average_confidence} / 5` : "not rated"}</span>
                  </span>
                </div>
                <Meter value={((t.average_confidence ?? 0) / 5) * 100}
                       tone={t.average_confidence === null ? "bg-stone-300" : t.average_confidence >= 4 ? "bg-accent-500" : t.average_confidence >= 3 ? "bg-amber-500" : "bg-rose-400"} />
                <p className="mt-1 text-xs text-stone-500">
                  {t.question_count} question{t.question_count === 1 ? "" : "s"}, {t.rated_count} rated
                  {t.first_half_average !== null && t.recent_average !== null && ` · earlier ${t.first_half_average}, recent ${t.recent_average}`}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Most frequent topics" />
          <ol className="divide-y divide-stone-100">
            {data.most_frequent.map((t: { topic: string; question_count: number }, i: number) => (
              <li key={t.topic} className="flex items-center justify-between px-4 py-2 text-[13px]">
                <span className="text-stone-700"><span className="mr-2 text-stone-500 tabular-nums">{i + 1}</span>{t.topic}</span>
                <span className="tabular-nums text-stone-900">{t.question_count}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Note>{data.label} Topics with fewer than {data.min_observations} rated questions are marked “Limited data”.</Note>
      </div>
    </div>
  );
}

type PrepTab = "practice" | "questions" | "weakness";

function InterviewsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (["practice", "questions", "weakness"].includes(params.get("tab") ?? "") ? params.get("tab") : "practice") as PrepTab;
  return (
    <>
      <PageHeader title="Interview prep" description="Rehearse with feedback, keep the questions you were asked, and see where to focus" />
      <Tabs className="mb-5" value={tab} onChange={(t) => router.replace(`/interviews?tab=${t}`, { scroll: false })}
            tabs={[{ id: "practice", label: "Practice" }, { id: "questions", label: "Question bank" }, { id: "weakness", label: "Weakness map" }]} />
      {tab === "practice" && <PracticePanel initialAppId={params.get("app")} />}
      {tab === "questions" && <QuestionBank />}
      {tab === "weakness" && <WeaknessMap />}
    </>
  );
}

export default function InterviewsPage() {
  return <Suspense><InterviewsInner /></Suspense>;
}