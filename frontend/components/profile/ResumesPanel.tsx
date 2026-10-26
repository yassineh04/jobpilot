"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, FileUp, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { Resume } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/Button";
import { FormError, Input, Textarea } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Card, CardHeader, EmptyState, ErrorBanner, LimitedData, Note, Skeleton } from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { CvImportDialog } from "./CvImport";

interface ResumeStats { resume_id: string | null; applications: number; responses: number; response_rate: number | null; limited_data: boolean }

function ResumeForm({ resume, onClose, onSaved }: { resume?: Resume; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: resume?.name ?? "", target_role: resume?.target_role ?? "", version: resume?.version ?? "", notes: resume?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Give this resume a name.");
    setSaving(true);
    const payload = { name: form.name.trim(), target_role: form.target_role.trim() || null,
                      version: form.version.trim() || null, notes: form.notes.trim() || null };
    try {
      if (resume) await api.updateResume(resume.id, payload);
      else await api.createResume(payload);
      toast(resume ? "Resume updated" : "Resume added");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the resume.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={resume ? "Edit resume" : "New resume"} onClose={onClose}
           footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="resume-form" loading={saving}>Save</Button></>}>
      <form id="resume-form" onSubmit={submit} className="space-y-3.5">
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Backend Engineer" />
          <Input label="Version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="v2" />
        </div>
        <Input label="Target role" optional value={form.target_role} onChange={(e) => setForm({ ...form, target_role: e.target.value })} />
        <Textarea label="What changed?" optional rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. Rewrote bullets with measurable impact" />
        <FormError message={error} />
      </form>
    </Modal>
  );
}

/** Opens the stored PDF in a new tab. The tab opens first so popup blockers allow it. */
async function openPdf(resume: Resume, onError: (message: string) => void) {
  const tab = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await api.resumeFile(resume.id));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    onError(err instanceof Error ? err.message : "Could not open the PDF.");
  }
}

export function ResumesPanel() {
  const toast = useToast();
  const { data: resumes, error, loading, reload } = useAsync(() => api.listResumes(), []);
  const { data: comparison } = useAsync(() => api.getResumeComparison(), []);
  const [editing, setEditing] = useState<Resume | "new" | null>(null);
  const [deleting, setDeleting] = useState<Resume | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<Resume | null>(null);

  const pickFile = (resume: Resume) => {
    target.current = resume;
    fileInput.current?.click();
  };
  const attach = async (file: File) => {
    const resume = target.current;
    if (!resume) return;
    setUploadingId(resume.id);
    try {
      await api.attachResumeFile(resume.id, file);
      toast(`PDF attached to ${resume.name}`);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not attach the PDF.", "error");
    } finally {
      setUploadingId(null);
    }
  };
  const stats = new Map<string, ResumeStats>((comparison?.resumes ?? []).map((r: ResumeStats) => [r.resume_id ?? "none", r]));

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.deleteResume(deleting.id);
      toast("Resume deleted");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete the resume.", "error");
    }
    setDeleting(null);
  };

  return (
    <>
      <Card className="mb-4">
        <CardHeader title="Resumes" description="Every version you send, and the response rate observed for each"
                    action={
                      <div className="flex gap-2">
                        <Button size="sm" icon={<FileUp className="size-3.5" />} onClick={() => setImporting(true)}>Upload a CV</Button>
                        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>New resume</Button>
                      </div>
                    } />
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden
               onChange={(e) => { if (e.target.files?.[0]) attach(e.target.files[0]); e.target.value = ""; }} />
      </Card>
      {error && <ErrorBanner message={error} onRetry={reload} />}

      {loading && !resumes ? <Skeleton className="h-48" /> : resumes && resumes.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText className="size-5" />} title="No resumes yet"
                      action={
                        <div className="flex gap-2">
                          <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => setImporting(true)}>Upload your CV</Button>
                          <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Add without a file</Button>
                        </div>
                      }>
            Upload the PDF you send to employers. JobPilot fills your profile from it, keeps each version, and checks
            postings against the words actually in it. Over time you&apos;ll see the response rate of each version.
          </EmptyState>
        </Card>
      ) : resumes && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resumes.map((r) => {
              const s = stats.get(r.id);
              return (
                <Card key={r.id} className="group flex flex-col">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="flex min-w-0 gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-stone-500">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-stone-900">
                          {r.name}{r.version && <span className="font-normal text-stone-500"> · {r.version}</span>}
                        </p>
                        <p className="truncate text-xs text-stone-500">{r.target_role || "No target role"}</p>
                      </div>
                    </div>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton label="Edit resume" onClick={() => setEditing(r)}><Pencil className="size-3.5" /></IconButton>
                      <IconButton label="Delete resume" onClick={() => setDeleting(r)} className="hover:text-rose-700"><Trash2 className="size-3.5" /></IconButton>
                    </div>
                  </div>
                  {r.notes && <p className="line-clamp-2 px-4 pb-3 text-xs text-stone-600">{r.notes}</p>}
                  <div className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-stone-200 px-2.5 py-1.5 text-xs">
                    {r.file_name ? (
                      <>
                        <Paperclip className="size-3.5 shrink-0 text-stone-500" />
                        <span className="min-w-0 flex-1 truncate text-stone-700" title={r.file_name}>{r.file_name}</span>
                        <span className="shrink-0 tabular-nums text-stone-500">{formatBytes(r.file_size ?? 0)}</span>
                        <button type="button" onClick={() => openPdf(r, (m) => toast(m, "error"))} aria-label={`Open the PDF of ${r.name}`}
                                className="inline-flex shrink-0 items-center gap-1 font-medium text-stone-700 hover:text-stone-900">
                          Open<ExternalLink className="size-3" />
                        </button>
                        <button type="button" onClick={() => pickFile(r)} disabled={uploadingId === r.id}
                                className="shrink-0 font-medium text-stone-500 hover:text-stone-900">
                          {uploadingId === r.id ? "Uploading…" : "Replace"}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-stone-500">No PDF attached</span>
                        <button type="button" onClick={() => pickFile(r)} disabled={uploadingId === r.id}
                                className="inline-flex shrink-0 items-center gap-1 font-medium text-stone-700 hover:text-stone-900">
                          <Paperclip className="size-3" />{uploadingId === r.id ? "Uploading…" : "Attach PDF"}
                        </button>
                      </>
                    )}
                  </div>
                  <dl className="mt-auto grid grid-cols-3 divide-x divide-stone-100 border-t border-stone-100 text-center">
                    <div className="py-2.5">
                      <dt className="text-[11px] text-stone-500">Used in</dt>
                      <dd className="text-sm font-semibold tabular-nums text-stone-900">
                        <Link href={`/applications?resume_id=${r.id}`} className="hover:underline">{r.application_count}</Link>
                      </dd>
                    </div>
                    <div className="py-2.5">
                      <dt className="text-[11px] text-stone-500">Responses</dt>
                      <dd className="text-sm font-semibold tabular-nums text-stone-900">{s?.responses ?? 0}</dd>
                    </div>
                    <div className="py-2.5">
                      <dt className="text-[11px] text-stone-500">Response rate</dt>
                      <dd className="text-sm font-semibold tabular-nums text-stone-900">{s?.response_rate != null ? `${s.response_rate}%` : "—"}</dd>
                    </div>
                  </dl>
                  <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2 text-[11px] text-stone-500">
                    <span>Updated {formatDate(r.updated_at)}</span>
                    {s?.limited_data && <LimitedData />}
                  </div>
                </Card>
              );
            })}
          </div>
          {comparison && (
            <div className="mt-6 space-y-2">
              <p className="text-[13px] text-stone-700">{comparison.comparison}</p>
              <Note>{comparison.label} <Link href="/analytics?tab=works" className="text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">See the comparison</Link></Note>
            </div>
          )}
        </>
      )}

      {importing && <CvImportDialog onClose={() => { setImporting(false); reload(); }} />}
      {editing && <ResumeForm resume={editing === "new" ? undefined : editing} onClose={() => setEditing(null)}
                              onSaved={() => { setEditing(null); reload(); }} />}
      {deleting && (
        <ConfirmDialog title="Delete resume?" onCancel={() => setDeleting(null)} onConfirm={remove}
                       message={<>“{deleting.name}” will be removed. Its {deleting.application_count} application(s) are kept without a resume.</>} />
      )}
    </>
  );
}
