"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, FileUp, Pencil, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatBytes, monthRange, pluralize, yearRange } from "@/lib/format";
import { notifyDataChanged } from "@/lib/use-async";
import type { CvExperience, CvImportCounts, CvParseResult } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge, ErrorBanner } from "@/components/ui/Primitives";
import { AiWaiting, useAiStatus } from "@/components/ai/AiKit";

const MAX_BYTES = 5 * 1024 * 1024;
const LEVELS = { BASIC: "Basic", CONVERSATIONAL: "Conversational", FLUENT: "Fluent", NATIVE: "Native" };

type Section = "experiences" | "education" | "projects" | "skills" | "languages";
type Picked = Record<Section, Set<number>>;

/** Everything new starts selected; what the profile already has starts unselected. */
function initialPicks(result: CvParseResult): Picked {
  const fresh = (items: { exists: boolean }[]) => new Set(items.flatMap((item, i) => (item.exists ? [] : [i])));
  return {
    experiences: fresh(result.experiences), education: fresh(result.education), projects: fresh(result.projects),
    skills: fresh(result.skills), languages: fresh(result.languages),
  };
}

const toMonth = (date: string | null) => (date ? date.slice(0, 7) : "");
const fromMonth = (month: string) => (month ? `${month}-01` : null);

function Dropzone({ onFile, error }: { onFile: (file: File) => void; error: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
         onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
         className={cn("flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
                       over ? "border-accent-500 bg-accent-50/50" : "border-stone-300 bg-stone-50/60",
                       error && "border-rose-300")}>
      <span className={cn("flex size-10 items-center justify-center rounded-full border bg-white transition-colors",
                          over ? "border-accent-300 text-accent-700" : "border-stone-200 text-stone-500")}>
        <FileUp className="size-5" />
      </span>
      <p className="mt-3 text-sm font-medium text-stone-900">Drop your CV here</p>
      <p className="mt-0.5 text-[13px] text-stone-500">PDF exported from Word, Google Docs or LaTeX · up to 5 MB</p>
      <Button size="sm" className="mt-4" onClick={() => input.current?.click()}>Choose a file</Button>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="CV file (PDF)"
             onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}

function SectionHeader({ title, picked, total, onAll }: { title: string; picked: number; total: number; onAll: (all: boolean) => void }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="text-[13px] font-semibold text-stone-900">
        {title} <span className="font-normal tabular-nums text-stone-500">{picked} of {total}</span>
      </h3>
      <button type="button" onClick={() => onAll(picked < total)} className="text-xs font-medium text-stone-500 hover:text-stone-900">
        {picked < total ? "Select all" : "Clear"}
      </button>
    </div>
  );
}

function Row({ checked, onChange, label, children, exists }: {
  checked: boolean; onChange: () => void; label: string; children: React.ReactNode; exists?: boolean;
}) {
  return (
    <li className={cn("flex gap-3 px-3 py-2.5 transition-colors", checked ? "bg-white" : "bg-stone-50/70")}>
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="mt-0.5 size-4 shrink-0 accent-accent-600" />
      <div className={cn("min-w-0 flex-1", !checked && "opacity-60")}>{children}</div>
      {exists && <Badge className="h-fit shrink-0">In profile</Badge>}
    </li>
  );
}

function ExperienceRow({ item, checked, onToggle, onChange }: {
  item: CvExperience; checked: boolean; onToggle: () => void; onChange: (next: CvExperience) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const bullets = (item.achievements ?? "").split("\n").filter(Boolean);
  return (
    <Row checked={checked} onChange={onToggle} label={`${item.title} at ${item.company}`} exists={item.exists}>
      {editing ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label="Title" value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })} />
          <Input label="Company" value={item.company} onChange={(e) => onChange({ ...item, company: e.target.value })} />
          <Input label="Start" type="month" value={toMonth(item.start_date)} onChange={(e) => onChange({ ...item, start_date: fromMonth(e.target.value) })} />
          <Input label="End" type="month" hint="Empty for a current role" value={toMonth(item.end_date)}
                 onChange={(e) => onChange({ ...item, end_date: fromMonth(e.target.value) })} />
          <div className="sm:col-span-2"><Button size="sm" onClick={() => setEditing(false)}>Done</Button></div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-medium text-stone-900">{item.title} <span className="font-normal text-stone-500">· {item.company}</span></p>
            <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${item.title}`}
                    className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><Pencil className="size-3.5" /></button>
          </div>
          <p className="text-xs text-stone-500">{monthRange(item.start_date, item.end_date)}{item.location && ` · ${item.location}`}</p>
          {bullets.length > 0 && (
            <>
              <ul className="mt-1.5 space-y-0.5 text-xs text-stone-600">
                {(open ? bullets : bullets.slice(0, 2)).map((b, i) => <li key={i} className="line-clamp-2">{b}</li>)}
              </ul>
              {bullets.length > 2 && (
                <button type="button" onClick={() => setOpen(!open)} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-stone-500 hover:text-stone-800">
                  {open ? "Show less" : `${bullets.length - 2} more`}<ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
                </button>
              )}
            </>
          )}
        </>
      )}
    </Row>
  );
}

function Review({ result, setResult, picked, setPicked }: {
  result: CvParseResult; setResult: (r: CvParseResult) => void; picked: Picked; setPicked: (p: Picked) => void;
}) {
  const toggle = (section: Section, i: number) => {
    const next = new Set(picked[section]);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setPicked({ ...picked, [section]: next });
  };
  const all = (section: Section, total: number, on: boolean) =>
    setPicked({ ...picked, [section]: on ? new Set(Array.from({ length: total }, (_, i) => i)) : new Set() });

  const found = [
    result.experiences.length && pluralize(result.experiences.length, "role"),
    result.education.length && pluralize(result.education.length, "school"),
    result.projects.length && pluralize(result.projects.length, "project"),
    result.skills.length && pluralize(result.skills.length, "skill"),
    result.languages.length && pluralize(result.languages.length, "language"),
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-stone-200 bg-stone-50/70 px-3.5 py-3 text-[13px]">
        {(result.full_name || result.headline) && (
          <p className="font-medium text-stone-900">{[result.full_name, result.headline].filter(Boolean).join(" · ")}</p>
        )}
        <p className="text-stone-600">
          {found.length ? `Found ${found.join(", ")}.` : "Nothing could be extracted from this CV."}
          {result.resume && <> Saved as the resume <span className="font-medium text-stone-800">{result.resume.name}</span>.</>}
        </p>
        {result.removed > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
            <ShieldCheck className="size-3.5 text-accent-600" />
            {pluralize(result.removed, "item")} left out because {result.removed === 1 ? "it does" : "they do"} not appear in the PDF text.
          </p>
        )}
        {result.notice && <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-800"><TriangleAlert className="size-3.5" />{result.notice}</p>}
      </div>

      {result.experiences.length > 0 && (
        <section>
          <SectionHeader title="Experience" picked={picked.experiences.size} total={result.experiences.length}
                         onAll={(on) => all("experiences", result.experiences.length, on)} />
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-md border border-stone-200">
            {result.experiences.map((e, i) => (
              <ExperienceRow key={i} item={e} checked={picked.experiences.has(i)} onToggle={() => toggle("experiences", i)}
                             onChange={(next) => setResult({ ...result, experiences: result.experiences.map((x, j) => (j === i ? next : x)) })} />
            ))}
          </ul>
        </section>
      )}

      {result.education.length > 0 && (
        <section>
          <SectionHeader title="Education" picked={picked.education.size} total={result.education.length}
                         onAll={(on) => all("education", result.education.length, on)} />
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-md border border-stone-200">
            {result.education.map((e, i) => (
              <Row key={i} checked={picked.education.has(i)} onChange={() => toggle("education", i)} label={`${e.degree}, ${e.institution}`} exists={e.exists}>
                <p className="text-[13px] font-medium text-stone-900">{e.degree}{e.field && ` in ${e.field}`}</p>
                <p className="text-xs text-stone-500">{[e.institution, yearRange(e.start_date, e.end_date), e.gpa && `GPA ${e.gpa}`].filter(Boolean).join(" · ")}</p>
              </Row>
            ))}
          </ul>
        </section>
      )}

      {result.projects.length > 0 && (
        <section>
          <SectionHeader title="Projects" picked={picked.projects.size} total={result.projects.length}
                         onAll={(on) => all("projects", result.projects.length, on)} />
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-md border border-stone-200">
            {result.projects.map((p, i) => (
              <Row key={i} checked={picked.projects.has(i)} onChange={() => toggle("projects", i)} label={p.name} exists={p.exists}>
                <p className="text-[13px] font-medium text-stone-900">{p.name}</p>
                {p.description && <p className="line-clamp-2 text-xs text-stone-500">{p.description}</p>}
              </Row>
            ))}
          </ul>
        </section>
      )}

      {result.skills.length > 0 && (
        <section>
          <SectionHeader title="Skills" picked={picked.skills.size} total={result.skills.length}
                         onAll={(on) => all("skills", result.skills.length, on)} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Skills to import">
            {result.skills.map((s, i) => {
              const on = picked.skills.has(i);
              return (
                <button key={s.name} type="button" aria-pressed={on} onClick={() => toggle("skills", i)}
                        title={s.exists ? "Already in your profile" : s.category ?? undefined}
                        className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
                                      on ? "border-accent-600 bg-accent-600 text-on-accent hover:bg-accent-500"
                                         : "border-stone-300 bg-white text-stone-600 hover:border-stone-400",
                                      s.exists && !on && "border-dashed text-stone-400")}>
                  {on && <Check className="size-3" />}{s.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {result.languages.length > 0 && (
        <section>
          <SectionHeader title="Languages" picked={picked.languages.size} total={result.languages.length}
                         onAll={(on) => all("languages", result.languages.length, on)} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Languages to import">
            {result.languages.map((l, i) => {
              const on = picked.languages.has(i);
              return (
                <button key={l.language} type="button" aria-pressed={on} onClick={() => toggle("languages", i)}
                        className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                                      on ? "border-accent-600 bg-accent-600 text-on-accent hover:bg-accent-500"
                                         : "border-stone-300 bg-white text-stone-600 hover:border-stone-400")}>
                  {on && <Check className="size-3" />}{l.language}
                  <span className={on ? "text-on-accent/75" : "text-stone-400"}>{LEVELS[l.proficiency]}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Done({ counts, onClose }: { counts: CvImportCounts; onClose: () => void }) {
  const parts = [
    counts.experiences && pluralize(counts.experiences, "role"),
    counts.education && pluralize(counts.education, "school"),
    counts.projects && pluralize(counts.projects, "project"),
    counts.skills && pluralize(counts.skills, "skill"),
    counts.languages && pluralize(counts.languages, "language"),
  ].filter(Boolean);
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-600 text-on-accent"><Check className="size-5" /></span>
      <p className="mt-3 text-sm font-semibold text-stone-900">{parts.length ? `Added ${parts.join(", ")}` : "Nothing new to add"}</p>
      {counts.evidence > 0 && (
        <p className="mt-1 max-w-sm text-[13px] text-stone-600">
          {pluralize(counts.evidence, "bullet point")} from your CV now back{counts.evidence === 1 ? "s" : ""} up a skill as evidence.
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Link href="/profile?tab=experience" onClick={onClose}
              className="inline-flex h-8.5 items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50">
          Review experience
        </Link>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

export function CvImportDialog({ onClose }: { onClose: () => void }) {
  const status = useAiStatus();
  const [step, setStep] = useState<"pick" | "reading" | "review" | "saving" | "done">("pick");
  const [file, setFile] = useState<File | null>(null);
  const [keepPdf, setKeepPdf] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CvParseResult | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [counts, setCounts] = useState<CvImportCounts | null>(null);

  const read = async (chosen: File) => {
    setError(null);
    if (!chosen.name.toLowerCase().endsWith(".pdf") && chosen.type !== "application/pdf") return setError("Choose a PDF file.");
    if (chosen.size > MAX_BYTES) return setError("This file is larger than 5 MB.");
    setFile(chosen);
    setStep("reading");
    try {
      const parsed = await api.parseCv(chosen, keepPdf);
      setResult(parsed);
      setPicked(initialPicks(parsed));
      setStep("review");
      if (parsed.resume) notifyDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "This CV could not be read.");
      setStep("pick");
    }
  };

  const total = picked ? Object.values(picked).reduce((n, s) => n + s.size, 0) : 0;

  const save = async () => {
    if (!result || !picked) return;
    const take = <T,>(items: T[], section: Section) => items.filter((_, i) => picked[section].has(i));
    setStep("saving");
    setError(null);
    try {
      const done = await api.importCv({
        experiences: take(result.experiences, "experiences").map((e) => ({
          title: e.title, company: e.company, start_date: e.start_date, end_date: e.end_date, achievements: e.achievements,
        })),
        education: take(result.education, "education").map((e) => ({
          institution: e.institution, degree: e.degree, field: e.field, start_date: e.start_date, end_date: e.end_date, gpa: e.gpa,
        })),
        projects: take(result.projects, "projects").map((p) => ({
          name: p.name, description: p.description, repository_url: p.repository_url, demo_url: p.demo_url,
        })),
        skills: take(result.skills, "skills").map((s) => s.name),
        languages: take(result.languages, "languages").map(({ language, proficiency }) => ({ language, proficiency })),
      });
      setCounts(done);
      setStep("done");
      notifyDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import failed.");
      setStep("review");
    }
  };

  const reviewing = step === "review" || step === "saving";
  return (
    <Modal title="Import from your CV" size="lg" onClose={onClose}
           description={reviewing ? "Keep what is right. Nothing is added until you import." : "Fill your profile from a PDF in a few seconds."}
           footer={reviewing && (
             <>
               <Button onClick={() => { setStep("pick"); setResult(null); }} disabled={step === "saving"}>Use another file</Button>
               <Button variant="primary" onClick={save} loading={step === "saving"} disabled={total === 0}>
                 {total ? `Import ${pluralize(total, "item")}` : "Nothing selected"}
               </Button>
             </>
           )}>
      {step === "pick" && (
        <div className="space-y-4">
          <Dropzone onFile={read} error={error} />
          {error && <ErrorBanner message={error} />}
          <label className="flex items-start gap-2.5 text-[13px] text-stone-700">
            <input type="checkbox" checked={keepPdf} onChange={(e) => setKeepPdf(e.target.checked)} className="mt-0.5 size-4 accent-accent-600" />
            <span>
              Keep this PDF as a resume version
              <span className="block text-xs text-stone-500">You can open it later and check job postings against it.</span>
            </span>
          </label>
          <p className="flex items-start gap-2 border-t border-stone-100 pt-3 text-xs text-stone-500">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-accent-600" />
            {status?.enabled
              ? `The PDF text is sent to ${status.provider} to be structured. Every item is then checked against your CV, and you choose what to keep.`
              : "AI is off on this server: skills and languages are detected, and you add roles by hand."}
          </p>
        </div>
      )}
      {step === "reading" && file && (
        <div className="space-y-3 py-2">
          <p className="text-[13px] text-stone-700"><span className="font-medium text-stone-900">{file.name}</span> · {formatBytes(file.size)}</p>
          <AiWaiting running local={status?.local} what="Reading your CV" />
        </div>
      )}
      {reviewing && result && picked && (
        <>
          {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
          <Review result={result} setResult={setResult} picked={picked} setPicked={setPicked} />
        </>
      )}
      {step === "done" && counts && <Done counts={counts} onClose={onClose} />}
    </Modal>
  );
}
