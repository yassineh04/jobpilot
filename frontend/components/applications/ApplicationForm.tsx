"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  CURRENCIES, EMPLOYMENT_LABELS, REJECTION_LABELS, SENIORITY_LABELS, STATUS_META, STATUSES,
  WORK_MODE_LABELS, enumOptions,
} from "@/lib/constants";
import type { Application, ParsedJob, Resume, Status } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { FormError, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";

const empty = {
  company_name: "", position_title: "", job_description: "", job_url: "", salary_min: "", salary_max: "",
  currency: "CAD", location: "", work_mode: "", employment_type: "", seniority: "", source: "",
  notes: "", status: "SAVED" as Status, rejection_reason: "", tags: "", resume_id: "", deadline: "",
};
type FormState = typeof empty;

function fromApplication(app: Application): FormState {
  return {
    company_name: app.company_name, position_title: app.position_title,
    job_description: app.job_description ?? "", job_url: app.job_url ?? "",
    salary_min: app.salary_min?.toString() ?? "", salary_max: app.salary_max?.toString() ?? "",
    currency: app.currency || "CAD", location: app.location ?? "", work_mode: app.work_mode ?? "",
    employment_type: app.employment_type ?? "", seniority: app.seniority ?? "", source: app.source ?? "",
    notes: app.notes ?? "", status: app.status, rejection_reason: app.rejection_reason ?? "",
    tags: app.tags.join(", "), resume_id: app.resume_id ?? "", deadline: app.deadline ?? "",
  };
}

interface Props {
  application?: Application;
  initialStatus?: Status;
  onClose: () => void;
  onSaved: (app: Application) => void;
}

export function ApplicationForm({ application, initialStatus, onClose, onSaved }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() =>
    application ? { ...fromApplication(application), status: initialStatus ?? application.status }
                : { ...empty, status: initialStatus ?? "SAVED" });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [showPaste, setShowPaste] = useState(!application);
  const [posting, setPosting] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ job: ParsedJob; method: string; notice: string | null } | null>(null);

  useEffect(() => {
    api.listResumes().then(setResumes).catch(() => {});
    api.listCompanies().then(setCompanies).catch(() => {});
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const extract = async () => {
    if (posting.trim().length < 20) {
      setFormError("Paste the full job posting (at least a few sentences).");
      return;
    }
    setParsing(true);
    setFormError(null);
    try {
      const result = await api.parseJob(posting.trim());
      const j = result.job;
      // Only fill fields the posting actually contained; never overwrite with blanks
      setForm((f) => ({
        ...f,
        position_title: j.title ?? f.position_title,
        company_name: j.company ?? f.company_name,
        location: j.location ?? f.location,
        work_mode: j.work_mode ?? f.work_mode,
        employment_type: j.employment_type ?? f.employment_type,
        seniority: j.seniority ?? f.seniority,
        salary_min: j.salary.min?.toString() ?? f.salary_min,
        salary_max: j.salary.max?.toString() ?? f.salary_max,
        currency: j.salary.currency && CURRENCIES.includes(j.salary.currency) ? j.salary.currency : f.currency,
        job_description: posting.trim(),
      }));
      setParsed(result);
      setShowPaste(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not analyze this posting.");
    } finally {
      setParsing(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!form.company_name.trim()) nextErrors.company_name = "Company is required";
    if (!form.position_title.trim()) nextErrors.position_title = "Position is required";
    if (form.status === "REJECTED" && !form.rejection_reason) nextErrors.rejection_reason = "Pick a reason (Unknown is fine)";
    if (form.salary_min && form.salary_max && Number(form.salary_min) > Number(form.salary_max)) {
      nextErrors.salary_max = "Max must be greater than min";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = {
      company_name: form.company_name.trim(),
      position_title: form.position_title.trim(),
      job_description: form.job_description.trim() || null,
      job_url: form.job_url.trim() || null,
      salary_min: form.salary_min ? Number(form.salary_min) : null,
      salary_max: form.salary_max ? Number(form.salary_max) : null,
      currency: form.currency,
      location: form.location.trim() || null,
      work_mode: form.work_mode || null,
      employment_type: form.employment_type || null,
      seniority: form.seniority || null,
      source: form.source.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
      rejection_reason: form.status === "REJECTED" ? form.rejection_reason || null : null,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      resume_id: form.resume_id || null,
      deadline: form.deadline || null,
    };
    setSaving(true);
    setFormError(null);
    try {
      const saved = application
        ? await api.updateApplication(application.id, payload)
        : await api.createApplication(payload);
      toast(application ? "Application updated" : "Application added");
      onSaved(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the application.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={application ? "Edit application" : "New application"} size="lg" onClose={onClose}
           footer={<>
             <Button onClick={onClose}>Cancel</Button>
             <Button variant="primary" type="submit" form="application-form" loading={saving}>
               {application ? "Save changes" : "Add application"}
             </Button>
           </>}>
      <form id="application-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="rounded-md border border-stone-200 bg-stone-50/70">
          <button type="button" onClick={() => setShowPaste((s) => !s)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-stone-700">
            {showPaste ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <Wand2 className="size-4 text-accent-600" />
            Fill from a job posting
            <span className="font-normal text-stone-500">· paste the text, review the result</span>
          </button>
          {showPaste && (
            <div className="space-y-2 border-t border-stone-200 p-3">
              <Textarea value={posting} onChange={(e) => setPosting(e.target.value)} rows={6}
                        placeholder="Paste the full job description here…" aria-label="Job posting" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-stone-500">Only details stated in the posting are filled in. Nothing is guessed.</p>
                <Button size="sm" variant="primary" onClick={extract} loading={parsing}>Extract details</Button>
              </div>
            </div>
          )}
          {parsed && !showPaste && (
            <div className="space-y-1.5 border-t border-stone-200 px-3 py-2.5 text-xs text-stone-600">
              <p>
                Extracted {parsed.method === "ai" ? "with AI" : "with the built-in parser"}. Review the fields below.
                {parsed.notice && <span className="text-amber-700"> {parsed.notice}</span>}
              </p>
              {(parsed.job.required_skills.length > 0 || parsed.job.preferred_skills.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  {parsed.job.required_skills.map((s) => <Badge key={s} tone="bg-white text-stone-700 ring-1 ring-stone-200">{s}</Badge>)}
                  {parsed.job.preferred_skills.map((s) => <Badge key={s} tone="border border-dashed border-stone-300 bg-white text-stone-500">{s} · nice to have</Badge>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Company" value={form.company_name} list="company-options" error={errors.company_name}
                 onChange={(e) => set("company_name", e.target.value)} placeholder="Shopify" />
          <datalist id="company-options">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          <Input label="Position" value={form.position_title} error={errors.position_title}
                 onChange={(e) => set("position_title", e.target.value)} placeholder="Backend Developer" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Status" value={form.status} onChange={(e) => set("status", e.target.value as Status)}
                  options={STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
          {form.status === "REJECTED" ? (
            <Select label="Rejection reason" value={form.rejection_reason} error={errors.rejection_reason}
                    onChange={(e) => set("rejection_reason", e.target.value)} placeholder="Select…"
                    options={enumOptions(REJECTION_LABELS).filter((o) => o.value !== "NOT_RECORDED")} />
          ) : (
            <Input label="Deadline" type="date" optional value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
          )}
          <Select label="Resume sent" value={form.resume_id} onChange={(e) => set("resume_id", e.target.value)} placeholder="None"
                  options={resumes.map((r) => ({ value: r.id, label: r.version ? `${r.name} · ${r.version}` : r.name }))} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Work mode" value={form.work_mode} onChange={(e) => set("work_mode", e.target.value)}
                  placeholder="—" options={enumOptions(WORK_MODE_LABELS)} />
          <Select label="Employment" value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)}
                  placeholder="—" options={enumOptions(EMPLOYMENT_LABELS)} />
          <Select label="Seniority" value={form.seniority} onChange={(e) => set("seniority", e.target.value)}
                  placeholder="—" options={enumOptions(SENIORITY_LABELS)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
          <Input label="Salary min" type="number" min={0} value={form.salary_min} onChange={(e) => set("salary_min", e.target.value)} placeholder="90000" />
          <Input label="Salary max" type="number" min={0} value={form.salary_max} error={errors.salary_max}
                 onChange={(e) => set("salary_max", e.target.value)} placeholder="120000" />
          <Select label="Currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Montreal, QC" />
          <Input label="Source" value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="LinkedIn, referral…" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Posting URL" type="url" value={form.job_url} onChange={(e) => set("job_url", e.target.value)} placeholder="https://…" />
          <Input label="Tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="fintech, dream-job" hint="Comma-separated" />
        </div>

        <Textarea label="Job description" rows={4} value={form.job_description}
                  onChange={(e) => set("job_description", e.target.value)}
                  hint="Used for the compatibility review and market insights." />
        <Textarea label="Notes" optional rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />

        <FormError message={formError} />
      </form>
    </Modal>
  );
}
