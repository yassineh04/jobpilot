"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { INTERVIEW_TYPES } from "@/lib/constants";
import { parseDate, toDateInput } from "@/lib/format";
import type { Application, Interview } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { FormError, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

const OUTCOMES = [
  { value: "PENDING", label: "Waiting" }, { value: "PASSED", label: "Passed" },
  { value: "FAILED", label: "Not passed" }, { value: "UNKNOWN", label: "Unknown" },
];

function pad(n: number) { return String(n).padStart(2, "0"); }

interface Props {
  interview?: Interview;
  applications?: Pick<Application, "id" | "position_title" | "company_name">[];
  applicationId?: string;
  defaultDate?: Date;
  onClose: () => void;
  onSaved: () => void;
}

export function InterviewForm({ interview, applications, applicationId, defaultDate, onClose, onSaved }: Props) {
  const toast = useToast();
  const start = interview ? parseDate(interview.scheduled_at) : defaultDate ?? new Date();
  const [form, setForm] = useState({
    application_id: interview?.application_id ?? applicationId ?? applications?.[0]?.id ?? "",
    date: toDateInput(start),
    time: interview ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : "10:00",
    interview_type: interview?.interview_type ?? "Technical",
    duration_minutes: interview?.duration_minutes?.toString() ?? "45",
    interviewer: interview?.interviewer ?? "",
    location_or_link: interview?.location_or_link ?? "",
    notes: interview?.notes ?? "",
    outcome: interview?.outcome ?? "PENDING",
    self_assessment: interview?.self_assessment?.toString() ?? "",
    follow_up: interview?.follow_up ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const isPast = new Date(`${form.date}T${form.time}`) < new Date();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const when = new Date(`${form.date}T${form.time}`);
    if (!form.application_id) return setError("Choose the application this interview belongs to.");
    if (Number.isNaN(when.getTime())) return setError("Enter a valid date and time.");
    const payload = {
      scheduled_at: when.toISOString(),
      interview_type: form.interview_type || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      interviewer: form.interviewer.trim() || null,
      location_or_link: form.location_or_link.trim() || null,
      notes: form.notes.trim() || null,
      outcome: form.outcome || null,
      self_assessment: form.self_assessment ? Number(form.self_assessment) : null,
      follow_up: form.follow_up.trim() || null,
    };
    setSaving(true);
    setError(null);
    try {
      if (interview) await api.updateInterview(interview.id, payload);
      else await api.addInterview(form.application_id, payload);
      toast(interview ? "Interview updated" : "Interview scheduled");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the interview.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={interview ? "Edit interview" : "Schedule an interview"} onClose={onClose}
           footer={<>
             <Button onClick={onClose}>Cancel</Button>
             <Button variant="primary" type="submit" form="interview-form" loading={saving}>{interview ? "Save" : "Schedule"}</Button>
           </>}>
      <form id="interview-form" onSubmit={submit} className="space-y-3.5">
        {applications && !interview && (
          <Select label="Application" value={form.application_id} onChange={(e) => set("application_id", e.target.value)}
                  options={applications.map((a) => ({ value: a.id, label: `${a.position_title} · ${a.company_name}` }))} />
        )}
        <div className="grid grid-cols-3 gap-3">
          <Input label="Date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          <Input label="Time" type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
          <Input label="Minutes" type="number" min={5} max={480} value={form.duration_minutes}
                 onChange={(e) => set("duration_minutes", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Type" value={form.interview_type} onChange={(e) => set("interview_type", e.target.value)}
                  options={INTERVIEW_TYPES.map((t) => ({ value: t, label: t }))} />
          <Input label="Interviewer" optional value={form.interviewer} onChange={(e) => set("interviewer", e.target.value)} />
        </div>
        <Input label="Location or meeting link" optional value={form.location_or_link}
               onChange={(e) => set("location_or_link", e.target.value)} placeholder="https://meet.google.com/…" />
        <Textarea label="Preparation notes" optional rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        {(interview || isPast) && (
          <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">After the interview</p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Outcome" value={form.outcome} onChange={(e) => set("outcome", e.target.value)} options={OUTCOMES} />
              <Select label="How did it go? (1–5)" value={form.self_assessment} placeholder="—"
                      onChange={(e) => set("self_assessment", e.target.value)}
                      options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
            </div>
            <Textarea label="Follow-up" optional rows={2} value={form.follow_up} onChange={(e) => set("follow_up", e.target.value)}
                      placeholder="Thank-you email sent, next steps…" />
          </div>
        )}
        <FormError message={error} />
      </form>
    </Modal>
  );
}
