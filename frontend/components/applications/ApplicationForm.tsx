"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardPaste, FileDown, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  CURRENCIES, EMPLOYMENT_LABELS, REJECTION_LABELS, SENIORITY_LABELS, STATUS_META, STATUSES,
  WORK_MODE_LABELS, enumOptions,
} from "@/lib/constants";
import { cn } from "@/lib/format";
import type { Application, ParsedJob, Resume, Status } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { FormError, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge, SegmentedControl } from "@/components/ui/Primitives";
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
  const [mode, setMode] = useState<"link" | "text">("link");
  const [posting, setPosting] = useState("");
  const [link, setLink] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ job: ParsedJob; method: string; notice: string | null; source?: string } | null>(null);
  // Fields filled from the posting stay highlighted until the user edits them
  const [filled, setFilled] = useState<Set<keyof FormState>>(new Set());

  useEffect(() => {
    api.listResumes().then(setResumes).catch(() => {});
    api.listCompanies().then(setCompanies).catch(() => {});
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };
  const hl = (key: keyof FormState) => filled.has(key) && "border-accent-400 bg-accent-50/40";

  /** Fills only what the posting states; never overwrites a field with a blank. */
  const apply = (j: ParsedJob, description: string, url?: string) => {
    const values: Partial<FormState> = {
      position_title: j.title ?? undefined, company_name: j.company ?? undefined, location: j.location ?? undefined,
      work_mode: j.work_mode ?? undefined, employment_type: j.employment_type ?? undefined, seniority: j.seniority ?? undefined,
      salary_min: j.salary.min?.toString(), salary_max: j.salary.max?.toString(),
      currency: j.salary.currency && CURRENCIES.includes(j.salary.currency) ? j.salary.currency : undefined,
      job_description: description, job_url: url,
    };
    const present = Object.fromEntries(Object.entries(values).filter(([, v]) => v)) as Partial<FormState>;
    setForm((f) => ({ ...f, ...present }));
    setFilled(new Set(Object.keys(present).filter((k) => k !== "job_description") as (keyof FormState)[]));
  };

  const extract = async () => {
    if (mode === "text" && posting.trim().length < 20) {
      setFormError("Paste the full job posting (at least a few sentences).");
      return;
    }
    if (mode === "link" && !link.trim()) {
      setFormError("Paste the link to the job posting.");
      return;
    }
    setParsing(true);
    setFormError(null);
    try {
      if (mode === "link") {
        const result = await api.importJobUrl(link.trim());
        apply(result.job, result.text, result.url);
        setParsed(result);
      } else {
        const result = await api.parseJob(posting.trim());
        apply(result.job, posting.trim());
        setParsed(result);
      }
      setShowPaste(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not read this posting.");
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
            <FileDown className="size-4 text-accent-600" />
            Fill from a job posting
            <span className="font-normal text-stone-500">· from its link or its text</span>
          </button>
          {showPaste && (
            <div className="space-y-2.5 border-t border-stone-200 p-3">
              <SegmentedControl value={mode} onChange={(m) => { setMode(m); setFormError(null); }} options={[
                { id: "link", label: "Link", icon: <Link2 className="size-3.5" /> },
                { id: "text", label: "Paste text", icon: <ClipboardPaste className="size-3.5" /> },
              ]} />
              {mode === "link" ? (
                <div className="flex gap-2">
                  <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Job posting link"
                         placeholder="https://jobs.lever.co/company/…" wrapperClassName="flex-1"
                         onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); extract(); } }} />
                  <Button variant="primary" onClick={extract} loading={parsing}>Import</Button>
                </div>
              ) : (
                <Textarea value={posting} onChange={(e) => setPosting(e.target.value)} rows={6}
                          placeholder="Paste the full job description here…" aria-label="Job posting" />
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-stone-500">
                  {mode === "link"
                    ? "Greenhouse, Lever, Ashby and most career sites. For LinkedIn, paste the text."
                    : "Only details stated in the posting are filled in. Nothing is guessed."}
                </p>
                {mode === "text" && <Button size="sm" variant="primary" onClick={extract} loading={parsing}>Extract details</Button>}
              </div>
            </div>
          )}
          {parsed && !showPaste && (
            <div className="space-y-1.5 border-t border-stone-200 px-3 py-2.5 text-xs text-stone-600">
              <p>
                {parsed.source ? `Imported from ${parsed.source}` : "Extracted"} {parsed.method === "ai" ? "with AI" : "with the built-in parser"}.
                {filled.size > 0 && <> Fields filled from the posting are <span className="rounded-sm bg-accent-50 px-1 text-accent-800 ring-1 ring-accent-300">highlighted</span>.</>}
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
          <Input label="Company" value={form.company_name} list="company-options" error={errors.company_name} className={cn(hl("company_name"))}
                 onChange={(e) => set("company_name", e.target.value)} placeholder="Shopify" />
          <datalist id="company-options">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          <Input label="Position" value={form.position_title} error={errors.position_title} className={cn(hl("position_title"))}
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
          <Select label="Work mode" value={form.work_mode} onChange={(e) => set("work_mode", e.target.value)} className={cn(hl("work_mode"))}
                  placeholder="—" options={enumOptions(WORK_MODE_LABELS)} />
          <Select label="Employment" value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)} className={cn(hl("employment_type"))}
                  placeholder="—" options={enumOptions(EMPLOYMENT_LABELS)} />
          <Select label="Seniority" value={form.seniority} onChange={(e) => set("seniority", e.target.value)} className={cn(hl("seniority"))}
                  placeholder="—" options={enumOptions(SENIORITY_LABELS)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
          <Input label="Salary min" type="number" min={0} value={form.salary_min} onChange={(e) => set("salary_min", e.target.value)} placeholder="90000" className={cn(hl("salary_min"))} />
          <Input label="Salary max" type="number" min={0} value={form.salary_max} error={errors.salary_max} className={cn(hl("salary_max"))}
                 onChange={(e) => set("salary_max", e.target.value)} placeholder="120000" />
          <Select label="Currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Montreal, QC" className={cn(hl("location"))} />
          <Input label="Source" value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="LinkedIn, referral…" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Posting URL" type="url" value={form.job_url} onChange={(e) => set("job_url", e.target.value)} placeholder="https://…" className={cn(hl("job_url"))} />
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
