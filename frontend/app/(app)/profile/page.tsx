"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- profile entities are loosely typed API payloads */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Circle, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { EMPLOYMENT_LABELS, WORK_MODE_LABELS, enumOptions } from "@/lib/constants";
import { cn, formatDate } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { Button, IconButton } from "@/components/ui/Button";
import { FormError, Input, Select, Textarea } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import {
  Badge, Card, CardHeader, EmptyState, ErrorBanner, Meter, Note, PageHeader, Skeleton, Tabs,
} from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { ResumesPanel } from "@/components/profile/ResumesPanel";

type Tab = "overview" | "experience" | "education" | "projects" | "skills" | "languages" | "preferences" | "resumes";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "experience", label: "Experience" },
  { id: "education", label: "Education" }, { id: "projects", label: "Projects" },
  { id: "skills", label: "Skills & evidence" }, { id: "languages", label: "Languages" },
  { id: "preferences", label: "Preferences" }, { id: "resumes", label: "Resumes" },
];

const PROFICIENCY = { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced", EXPERT: "Expert" };
const LANG_PROFICIENCY = { BASIC: "Basic", CONVERSATIONAL: "Conversational", FLUENT: "Fluent", NATIVE: "Native" };
const EVIDENCE_TYPES = { EXPERIENCE: "Work experience", PROJECT: "Project", EDUCATION: "Education", CERTIFICATION: "Certification", OTHER: "Other" };
const CONFIDENCE = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

function useSaver() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      toast(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, run };
}

function FormModal({ title, onClose, onSubmit, saving, error, children }: {
  title: string; onClose: () => void; onSubmit: (e: React.FormEvent) => void; saving: boolean; error: string | null; children: React.ReactNode;
}) {
  return (
    <Modal title={title} onClose={onClose}
           footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="profile-form" loading={saving}>Save</Button></>}>
      <form id="profile-form" onSubmit={onSubmit} className="space-y-3.5">
        {children}
        <FormError message={error} />
      </form>
    </Modal>
  );
}

/** Generic list section with add/edit/delete; each tab supplies its row and form. */
function Collection<T extends { id: string }>({ title, description, load, remove, emptyTitle, emptyText, renderItem, renderForm }: {
  title: string; description: string; load: () => Promise<T[]>; remove: (id: string) => Promise<unknown>;
  emptyTitle: string; emptyText: string;
  renderItem: (item: T) => React.ReactNode;
  renderForm: (item: T | undefined, close: () => void, saved: () => void) => React.ReactNode;
}) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(load, []);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const close = () => setEditing(null);
  const saved = () => { setEditing(null); reload(); };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove(deleting.id);
      toast("Deleted");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete.", "error");
    }
    setDeleting(null);
  };

  return (
    <Card>
      <CardHeader title={title} description={description}
                  action={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>Add</Button>} />
      {error && <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      {loading && !data ? <div className="p-4"><Skeleton className="h-20" /></div> : data && data.length === 0 ? (
        <EmptyState title={emptyTitle}>{emptyText}</EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100">
          {data?.map((item) => (
            <li key={item.id} className="group flex items-start gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">{renderItem(item)}</div>
              <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <IconButton label="Edit" onClick={() => setEditing(item)}><Pencil className="size-3.5" /></IconButton>
                <IconButton label="Delete" onClick={() => setDeleting(item)} className="hover:text-rose-600"><Trash2 className="size-3.5" /></IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && renderForm(editing === "new" ? undefined : editing, close, saved)}
      {deleting && <ConfirmDialog title="Delete this item?" message="Skill evidence that points to it will lose its source."
                                  onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
    </Card>
  );
}

const range = (start?: string | null, end?: string | null) =>
  `${start ? formatDate(start, { day: undefined }) : "—"} – ${end ? formatDate(end, { day: undefined }) : "Present"}`;

// ---------------- Experience / Education / Projects ----------------
function ExperienceForm({ item, onClose, onSaved }: { item?: any; onClose: () => void; onSaved: () => void }) {
  const { saving, error, setError, run } = useSaver();
  const [f, setF] = useState({ company: item?.company ?? "", title: item?.title ?? "", start_date: item?.start_date ?? "",
                               end_date: item?.end_date ?? "", description: item?.description ?? "", achievements: item?.achievements ?? "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.company.trim() || !f.title.trim()) return setError("Company and title are required.");
    const payload = { ...f, start_date: f.start_date || null, end_date: f.end_date || null };
    if (await run(() => item ? api.updateExperience(item.id, payload) : api.createExperience(payload), "Experience saved")) onSaved();
  };
  return (
    <FormModal title={item ? "Edit experience" : "Add experience"} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Input label="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
        <Input label="Start" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
        <Input label="End" type="date" hint="Leave empty if current" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
      </div>
      <Textarea label="Description" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <Textarea label="Achievements" rows={3} value={f.achievements} onChange={(e) => setF({ ...f, achievements: e.target.value })}
                placeholder="- Cut p95 latency by 38%" />
    </FormModal>
  );
}

function EducationForm({ item, onClose, onSaved }: { item?: any; onClose: () => void; onSaved: () => void }) {
  const { saving, error, setError, run } = useSaver();
  const [f, setF] = useState({ institution: item?.institution ?? "", degree: item?.degree ?? "", field: item?.field ?? "",
                               start_date: item?.start_date ?? "", end_date: item?.end_date ?? "", gpa: item?.gpa?.toString() ?? "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.institution.trim() || !f.degree.trim()) return setError("Institution and degree are required.");
    const payload = { ...f, field: f.field || null, start_date: f.start_date || null, end_date: f.end_date || null, gpa: f.gpa ? Number(f.gpa) : null };
    if (await run(() => item ? api.updateEducation(item.id, payload) : api.createEducation(payload), "Education saved")) onSaved();
  };
  return (
    <FormModal title={item ? "Edit education" : "Add education"} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <Input label="Institution" value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Degree" value={f.degree} onChange={(e) => setF({ ...f, degree: e.target.value })} placeholder="B.Sc." />
        <Input label="Field" value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })} placeholder="Computer Science" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Start" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
        <Input label="End" type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
        <Input label="GPA" optional type="number" step="0.01" value={f.gpa} onChange={(e) => setF({ ...f, gpa: e.target.value })} />
      </div>
    </FormModal>
  );
}

function ProjectForm({ item, onClose, onSaved }: { item?: any; onClose: () => void; onSaved: () => void }) {
  const { saving, error, setError, run } = useSaver();
  const [f, setF] = useState({ name: item?.name ?? "", description: item?.description ?? "",
                               repository_url: item?.repository_url ?? "", demo_url: item?.demo_url ?? "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setError("Name is required.");
    const payload = { name: f.name.trim(), description: f.description || null, repository_url: f.repository_url || null, demo_url: f.demo_url || null };
    if (await run(() => item ? api.updateProject(item.id, payload) : api.createProject(payload), "Project saved")) onSaved();
  };
  return (
    <FormModal title={item ? "Edit project" : "Add project"} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Textarea label="Description" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
                placeholder="What it does, the stack, your role" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Repository" optional value={f.repository_url} onChange={(e) => setF({ ...f, repository_url: e.target.value })} />
        <Input label="Demo" optional value={f.demo_url} onChange={(e) => setF({ ...f, demo_url: e.target.value })} />
      </div>
    </FormModal>
  );
}

// ---------------- Skills & evidence ----------------
function SkillsTab() {
  const toast = useToast();
  const { data: skills, error, loading, reload } = useAsync(() => api.listSkills(), []);
  const { data: sources } = useAsync(() => Promise.all([api.listExperiences(), api.listProjects(), api.listEducation()]), []);
  const [adding, setAdding] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const removeEvidence = async (skillId: string, evidenceId: string) => {
    await api.deleteSkillEvidence(skillId, evidenceId).catch(() => toast("Could not remove the evidence.", "error"));
    reload();
  };
  const removeSkill = async () => {
    await api.deleteSkill(deleting.id).catch(() => toast("Could not delete the skill.", "error"));
    setDeleting(null);
    reload();
  };

  return (
    <Card>
      <CardHeader title="Skills & evidence"
                  description="Back each skill with where you used it. Evidence is what the compatibility review relies on."
                  action={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Add skill</Button>} />
      {error && <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      {loading && !skills ? <div className="p-4"><Skeleton className="h-32" /></div> : skills?.length === 0 ? (
        <EmptyState title="No skills yet">Add a skill, then attach evidence: an internship, a project, a course or a certification.</EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100">
          {skills?.map((s: any) => (
            <li key={s.id} className="group px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-stone-900">{s.name}</span>
                  {s.category && <Badge>{s.category}</Badge>}
                  <span className="text-xs text-stone-500">
                    {s.proficiency ? PROFICIENCY[s.proficiency as keyof typeof PROFICIENCY] : "Not self-rated"}
                    {s.years_experience ? ` · ${s.years_experience} yr${s.years_experience === 1 ? "" : "s"}` : ""}
                  </span>
                  {s.evidences.length === 0 && <Badge tone="bg-amber-50 text-amber-800">No evidence</Badge>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setEvidenceFor(s)}>Evidence</Button>
                  <IconButton label="Delete skill" onClick={() => setDeleting(s)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-600">
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>
              {s.evidences.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {s.evidences.map((ev: any) => (
                    <li key={ev.id} className="group/ev flex items-start gap-2 text-xs text-stone-600">
                      <span className="mt-0.5 text-stone-500">↳</span>
                      <span className="flex-1">
                        <span className="font-medium text-stone-700">{EVIDENCE_TYPES[ev.evidence_type as keyof typeof EVIDENCE_TYPES]}</span>
                        {" · "}{ev.description}
                        <span className="text-stone-500"> · {CONFIDENCE[ev.confidence as keyof typeof CONFIDENCE].toLowerCase()} confidence</span>
                      </span>
                      <button onClick={() => removeEvidence(s.id, ev.id)} aria-label="Remove evidence"
                              className="text-stone-300 opacity-0 hover:text-rose-600 group-hover/ev:opacity-100 focus:opacity-100">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <SkillForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {evidenceFor && sources && (
        <EvidenceForm skill={evidenceFor} experiences={sources[0]} projects={sources[1]} education={sources[2]}
                      onClose={() => setEvidenceFor(null)} onSaved={() => { setEvidenceFor(null); reload(); }} />
      )}
      {deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} message="Its evidence will be deleted too."
                                  onCancel={() => setDeleting(null)} onConfirm={removeSkill} />}
    </Card>
  );
}

function SkillForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { saving, error, setError, run } = useSaver();
  const [f, setF] = useState({ name: "", category: "", proficiency: "", years_experience: "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setError("Skill name is required.");
    const payload = { name: f.name.trim(), category: f.category.trim() || null, proficiency: f.proficiency || null,
                      years_experience: f.years_experience ? Number(f.years_experience) : null };
    if (await run(() => api.createSkill(payload), "Skill added")) onSaved();
  };
  return (
    <FormModal title="Add skill" onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Skill" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="PostgreSQL" />
        <Input label="Category" optional value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}
               placeholder="Backend, Data, Cloud…" hint="Detected automatically for common skills" />
        <Select label="Self-rated level" optional value={f.proficiency} placeholder="—" onChange={(e) => setF({ ...f, proficiency: e.target.value })}
                options={enumOptions(PROFICIENCY)} />
        <Input label="Years" optional type="number" step="0.5" min={0} value={f.years_experience}
               onChange={(e) => setF({ ...f, years_experience: e.target.value })} />
      </div>
    </FormModal>
  );
}

function EvidenceForm({ skill, experiences, projects, education, onClose, onSaved }: {
  skill: any; experiences: any[]; projects: any[]; education: any[]; onClose: () => void; onSaved: () => void;
}) {
  const { saving, error, setError, run } = useSaver();
  const [f, setF] = useState({ evidence_type: experiences.length ? "EXPERIENCE" : projects.length ? "PROJECT" : "OTHER",
                               source_id: "", description: "", confidence: "MEDIUM" });
  const sources = f.evidence_type === "EXPERIENCE" ? experiences.map((e) => ({ value: e.id, label: `${e.title} · ${e.company}` }))
    : f.evidence_type === "PROJECT" ? projects.map((p) => ({ value: p.id, label: p.name }))
    : f.evidence_type === "EDUCATION" ? education.map((e) => ({ value: e.id, label: `${e.degree} · ${e.institution}` })) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.description.trim()) return setError("Describe how you used this skill.");
    if (sources && !f.source_id) return setError("Pick the source, or choose “Other”.");
    const payload = {
      evidence_type: f.evidence_type, description: f.description.trim(), confidence: f.confidence,
      source_experience_id: f.evidence_type === "EXPERIENCE" ? f.source_id : null,
      source_project_id: f.evidence_type === "PROJECT" ? f.source_id : null,
      source_education_id: f.evidence_type === "EDUCATION" ? f.source_id : null,
    };
    if (await run(() => api.addSkillEvidence(skill.id, payload), "Evidence added")) onSaved();
  };
  return (
    <FormModal title={`Evidence for ${skill.name}`} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Type" value={f.evidence_type} onChange={(e) => setF({ ...f, evidence_type: e.target.value, source_id: "" })}
                options={enumOptions(EVIDENCE_TYPES)} />
        <Select label="Confidence" value={f.confidence} onChange={(e) => setF({ ...f, confidence: e.target.value })} options={enumOptions(CONFIDENCE)} />
      </div>
      {sources && (sources.length ? (
        <Select label="Source" value={f.source_id} placeholder="Select…" onChange={(e) => setF({ ...f, source_id: e.target.value })} options={sources} />
      ) : <Note>Add an item in the matching profile tab first, or choose “Other”.</Note>)}
      <Textarea label="How you used it" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
                placeholder="Built the reporting API used by 40 analysts" />
    </FormModal>
  );
}

// ---------------- Languages / Preferences ----------------
function LanguagesTab() {
  const toast = useToast();
  const { data, reload } = useAsync(() => api.listLanguages(), []);
  const [f, setF] = useState({ language: "", proficiency: "FLUENT" });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.language.trim()) return;
    try {
      await api.createLanguage({ language: f.language.trim(), proficiency: f.proficiency });
      setF({ language: "", proficiency: "FLUENT" });
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add the language.", "error");
    }
  };
  return (
    <Card>
      <CardHeader title="Languages" />
      <div className="flex flex-wrap gap-2 p-4">
        {data?.length === 0 && <p className="text-[13px] text-stone-500">No languages yet.</p>}
        {data?.map((l: any) => (
          <span key={l.id} className="inline-flex items-center gap-2 rounded-md border border-stone-200 py-1 pl-2.5 pr-1 text-[13px]">
            {l.language} <span className="text-xs text-stone-500">{LANG_PROFICIENCY[l.proficiency as keyof typeof LANG_PROFICIENCY]}</span>
            <button aria-label={`Remove ${l.language}`} onClick={() => api.deleteLanguage(l.id).then(reload)}
                    className="rounded p-0.5 text-stone-500 hover:bg-stone-100 hover:text-rose-600"><X className="size-3.5" /></button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-stone-100 p-4">
        <Input label="Language" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} wrapperClassName="w-48" />
        <Select label="Level" value={f.proficiency} onChange={(e) => setF({ ...f, proficiency: e.target.value })}
                options={enumOptions(LANG_PROFICIENCY)} wrapperClassName="w-44" />
        <Button type="submit" icon={<Plus className="size-4" />}>Add</Button>
      </form>
    </Card>
  );
}

function PreferencesTab() {
  const { data, loading } = useAsync(() => api.getPreferences(), []);
  if (loading || !data) return <Skeleton className="h-64" />;
  return <PreferencesForm initial={data} />;
}

function PreferencesForm({ initial }: { initial: any }) {
  const { saving, error, run } = useSaver();
  const [f, setF] = useState({
    remote_preference: initial.remote_preference ?? "", desired_employment_type: initial.desired_employment_type ?? "",
    salary_expectation_min: initial.salary_expectation_min?.toString() ?? "", salary_expectation_max: initial.salary_expectation_max?.toString() ?? "",
    currency: initial.currency ?? "CAD", locations: initial.locations.join(", "), desired_roles: initial.desired_roles.join(", "),
  });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(() => api.updatePreferences({
      remote_preference: f.remote_preference || null, desired_employment_type: f.desired_employment_type || null,
      salary_expectation_min: f.salary_expectation_min ? Number(f.salary_expectation_min) : null,
      salary_expectation_max: f.salary_expectation_max ? Number(f.salary_expectation_max) : null,
      currency: f.currency || "CAD",
      locations: f.locations.split(",").map((s: string) => s.trim()).filter(Boolean),
      desired_roles: f.desired_roles.split(",").map((s: string) => s.trim()).filter(Boolean),
    }), "Preferences saved");
  };
  return (
    <Card>
      <CardHeader title="Job search preferences" description="Used to flag constraints (location, salary, work mode) in the compatibility review" />
      <form onSubmit={submit} className="max-w-2xl space-y-3.5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Work mode" value={f.remote_preference} placeholder="No preference" onChange={(e) => setF({ ...f, remote_preference: e.target.value })}
                  options={enumOptions(WORK_MODE_LABELS)} />
          <Select label="Employment type" value={f.desired_employment_type} placeholder="No preference"
                  onChange={(e) => setF({ ...f, desired_employment_type: e.target.value })} options={enumOptions(EMPLOYMENT_LABELS)} />
        </div>
        <div className="grid grid-cols-[1fr_1fr_6rem] gap-3">
          <Input label="Salary min" type="number" value={f.salary_expectation_min} onChange={(e) => setF({ ...f, salary_expectation_min: e.target.value })} />
          <Input label="Salary max" type="number" value={f.salary_expectation_max} onChange={(e) => setF({ ...f, salary_expectation_max: e.target.value })} />
          <Input label="Currency" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} />
        </div>
        <Input label="Preferred locations" hint="Comma-separated" value={f.locations} onChange={(e) => setF({ ...f, locations: e.target.value })}
               placeholder="Montreal, Toronto, Remote" />
        <Input label="Desired roles" hint="Comma-separated" value={f.desired_roles} onChange={(e) => setF({ ...f, desired_roles: e.target.value })}
               placeholder="Backend Engineer, Platform Engineer" />
        <FormError message={error} />
        <Button type="submit" variant="primary" loading={saving}>Save preferences</Button>
      </form>
    </Card>
  );
}

// ---------------- Overview ----------------
function Overview({ goTo }: { goTo: (tab: Tab) => void }) {
  const { data, error, loading, reload } = useAsync(() => api.profileSummary(), []);
  if (loading && !data) return <Skeleton className="h-72" />;
  if (error || !data) return <ErrorBanner message={error ?? "Could not load the profile."} onRetry={reload} />;
  const tabFor: Record<string, Tab> = { experiences: "experience", skills: "skills", evidence: "skills", education: "education", preferences: "preferences" };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader title="Skills by area" description={`${data.totals.skills} skills · ${data.totals.evidenced_skills} backed by evidence`} />
        {data.categories.length === 0 ? (
          <EmptyState title="No skills yet" action={<Button size="sm" onClick={() => goTo("skills")}>Add skills</Button>}>
            Your profile map appears once you list skills.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.categories.map((c: any) => (
              <li key={c.category} className="px-4 py-3">
                <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                  <span className="font-medium text-stone-900">{c.category}</span>
                  <span className="text-xs tabular-nums text-stone-500">{c.evidenced} of {c.skills.length} with evidence</span>
                </div>
                <Meter value={(c.evidenced / c.skills.length) * 100} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.skills.map((s: any) => (
                    <span key={s.name} title={`${s.evidence_count} evidence item(s)`}
                          className={cn("rounded px-1.5 py-0.5 text-xs", s.evidence_count ? "bg-accent-50 text-accent-800" : "border border-dashed border-stone-300 text-stone-500")}>
                      {s.name}{s.evidence_count > 1 && <span className="ml-1 text-accent-700">×{s.evidence_count}</span>}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-stone-100 px-4 py-2.5"><Note>{data.label}</Note></div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Profile completeness" description={`${data.completeness}% of the basics`} />
          <div className="px-4 pt-3"><Meter value={data.completeness} /></div>
          <ul className="space-y-0.5 p-2">
            {data.checklist.map((c: any) => (
              <li key={c.key}>
                <button onClick={() => goTo(tabFor[c.key])} className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] hover:bg-stone-50">
                  {c.done ? <Check className="size-4 text-accent-600" /> : <Circle className="size-4 text-stone-300" />}
                  <span className={c.done ? "text-stone-500" : "text-stone-900"}>{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="grid grid-cols-2 divide-x divide-stone-100 text-center">
          {[["Experiences", data.totals.experiences], ["Projects", data.totals.projects]].map(([label, n]) => (
            <div key={label} className="py-3"><p className="text-xl font-semibold tabular-nums">{n}</p><p className="text-xs text-stone-500">{label}</p></div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function ProfileInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "overview") as Tab;
  const goTo = (t: Tab) => router.replace(`/profile?tab=${t}`, { scroll: false });

  return (
    <>
      <PageHeader title="Profile & resumes" description="What JobPilot compares job postings against. Only what you enter, nothing inferred." />
      <Tabs className="mb-5" value={tab} onChange={goTo} tabs={TABS} />
      {tab === "overview" && <Overview goTo={goTo} />}
      {tab === "experience" && (
        <Collection title="Work experience" description="Roles, internships and co-ops" load={api.listExperiences} remove={api.deleteExperience}
                    emptyTitle="No experience yet" emptyText="Add your roles. They count toward years of experience and can serve as skill evidence."
                    renderItem={(e: any) => (<>
                      <p className="text-[13px] font-medium text-stone-900">{e.title} <span className="font-normal text-stone-500">· {e.company}</span></p>
                      <p className="text-xs text-stone-500">{range(e.start_date, e.end_date)}</p>
                      {e.description && <p className="mt-1.5 text-[13px] text-stone-600">{e.description}</p>}
                      {e.achievements && <p className="mt-1 whitespace-pre-line text-xs text-stone-500">{e.achievements}</p>}
                    </>)}
                    renderForm={(item, close, saved) => <ExperienceForm item={item} onClose={close} onSaved={saved} />} />
      )}
      {tab === "education" && (
        <Collection title="Education" description="Degrees, diplomas and programs" load={api.listEducation} remove={api.deleteEducation}
                    emptyTitle="No education yet" emptyText="Used when a posting mentions a degree requirement."
                    renderItem={(e: any) => (<>
                      <p className="text-[13px] font-medium text-stone-900">{e.degree}{e.field && ` in ${e.field}`}</p>
                      <p className="text-xs text-stone-500">{e.institution} · {range(e.start_date, e.end_date)}{e.gpa ? ` · GPA ${e.gpa}` : ""}</p>
                    </>)}
                    renderForm={(item, close, saved) => <EducationForm item={item} onClose={close} onSaved={saved} />} />
      )}
      {tab === "projects" && (
        <Collection title="Projects" description="Personal, school or open-source work" load={api.listProjects} remove={api.deleteProject}
                    emptyTitle="No projects yet" emptyText="Projects are great evidence for skills you haven't used at work yet."
                    renderItem={(p: any) => (<>
                      <p className="text-[13px] font-medium text-stone-900">{p.name}</p>
                      {p.description && <p className="mt-0.5 text-[13px] text-stone-600">{p.description}</p>}
                      <div className="mt-1 flex gap-3 text-xs">
                        {p.repository_url && <a href={p.repository_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">Repository<ExternalLink className="size-3" /></a>}
                        {p.demo_url && <a href={p.demo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">Demo<ExternalLink className="size-3" /></a>}
                      </div>
                    </>)}
                    renderForm={(item, close, saved) => <ProjectForm item={item} onClose={close} onSaved={saved} />} />
      )}
      {tab === "skills" && <SkillsTab />}
      {tab === "languages" && <LanguagesTab />}
      {tab === "preferences" && <PreferencesTab />}
      {tab === "resumes" && <ResumesPanel />}
    </>
  );
}

export default function ProfilePage() {
  return <Suspense><ProfileInner /></Suspense>;
}
