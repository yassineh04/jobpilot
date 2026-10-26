"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, ExternalLink, Mail, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { RELATIONSHIP_LABELS, enumOptions } from "@/lib/constants";
import { cn, daysUntil, formatShortDate, initials, relativeTime } from "@/lib/format";
import { useAsync, useDebounced } from "@/lib/use-async";
import type { Application, Contact } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/Button";
import { FormError, Input, Select, Textarea, controlClass } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import {
  Badge, Card, EmptyState, ErrorBanner, PageHeader, SegmentedControl, Skeleton, StatusBadge,
} from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";

function ContactForm({ contact, apps, onClose, onSaved }: {
  contact?: Contact; apps: Application[]; onClose: () => void; onSaved: (c: Contact) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: contact?.name ?? "", company_name: contact?.company_name ?? "", role: contact?.role ?? "",
    email: contact?.email ?? "", linkedin_url: contact?.linkedin_url ?? "",
    relationship_type: contact?.relationship_type ?? "", notes: contact?.notes ?? "",
    last_interaction_at: contact?.last_interaction_at ?? "", next_follow_up_at: contact?.next_follow_up_at ?? "",
  });
  const [linked, setLinked] = useState<Set<string>>(new Set(contact?.applications.map((a) => a.id)));
  const [appFilter, setAppFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Suggest the applications at the contact's company first
  const sortedApps = useMemo(() => {
    const company = form.company_name.trim().toLowerCase();
    return [...apps]
      .filter((a) => !appFilter || `${a.company_name} ${a.position_title}`.toLowerCase().includes(appFilter.toLowerCase()))
      .sort((a, b) => Number(b.company_name.toLowerCase() === company) - Number(a.company_name.toLowerCase() === company));
  }, [apps, appFilter, form.company_name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required.");
    setSaving(true);
    setError(null);
    const payload = {
      ...form, name: form.name.trim(), relationship_type: form.relationship_type || null,
      last_interaction_at: form.last_interaction_at || null, next_follow_up_at: form.next_follow_up_at || null,
      application_ids: [...linked],
    };
    try {
      const saved = contact ? await api.updateContact(contact.id, payload) : await api.createContact(payload);
      toast(contact ? "Contact updated" : "Contact added");
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the contact.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={contact ? "Edit contact" : "New contact"} size="lg" onClose={onClose}
           footer={<><Button onClick={onClose}>Cancel</Button>
             <Button variant="primary" type="submit" form="contact-form" loading={saving}>Save</Button></>}>
      <form id="contact-form" onSubmit={submit} className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          <Select label="Relationship" value={form.relationship_type} placeholder="—"
                  onChange={(e) => set("relationship_type", e.target.value)} options={enumOptions(RELATIONSHIP_LABELS)} />
          <Input label="Company" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
          <Input label="Role" value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Technical recruiter" />
          <Input label="Email" type="email" optional value={form.email} onChange={(e) => set("email", e.target.value)} />
          <Input label="LinkedIn URL" optional value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} />
          <Input label="Last interaction" type="date" value={form.last_interaction_at} onChange={(e) => set("last_interaction_at", e.target.value)} />
          <Input label="Next follow-up" type="date" value={form.next_follow_up_at} onChange={(e) => set("next_follow_up_at", e.target.value)} />
        </div>
        <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)}
                  placeholder="How you met, what you talked about…" />
        <div>
          <p className="mb-1 text-[13px] font-medium text-stone-700">Related applications</p>
          <input value={appFilter} onChange={(e) => setAppFilter(e.target.value)} placeholder="Filter applications"
                 aria-label="Filter applications" className={cn(controlClass, "mb-1.5 h-8")} />
          <div className="max-h-40 overflow-y-auto rounded-md border border-stone-200 scroll-thin">
            {sortedApps.length === 0 && <p className="px-3 py-2 text-xs text-stone-500">No applications.</p>}
            {sortedApps.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2.5 border-b border-stone-100 px-3 py-1.5 text-[13px] last:border-0 hover:bg-stone-50">
                <input type="checkbox" checked={linked.has(a.id)} className="accent-accent-600"
                       onChange={(e) => setLinked((s) => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
                <span className="min-w-0 flex-1 truncate">{a.company_name} · <span className="text-stone-500">{a.position_title}</span></span>
              </label>
            ))}
          </div>
        </div>
        <FormError message={error} />
      </form>
    </Modal>
  );
}

function FollowUp({ date }: { date: string | null }) {
  if (!date) return <span className="text-stone-500">—</span>;
  const d = daysUntil(date);
  return <span className={cn("tabular-nums", d < 0 ? "font-medium text-rose-700" : d === 0 ? "font-medium text-amber-700" : "text-stone-600")}>
    {d < 0 ? `Overdue · ${formatShortDate(date)}` : d === 0 ? "Today" : formatShortDate(date)}
  </span>;
}

function ContactsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "due">("all");
  const [editing, setEditing] = useState<Contact | "new" | null>(params.get("new") === "1" ? "new" : null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("focus"));
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const debounced = useDebounced(search);

  const { data: contacts, error, loading, reload } = useAsync(
    () => api.listContacts({ search: debounced || undefined, follow_up_due: filter === "due" ? "true" : undefined }),
    [debounced, filter]);
  const { data: apps } = useAsync(() => api.listApplications(), []);
  const selected = contacts?.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && contacts?.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- select the first contact once loaded
      setSelectedId(contacts[0].id);
    }
  }, [contacts, selectedId]);

  const logInteraction = async (c: Contact) => {
    try {
      await api.logInteraction(c.id);
      toast(`Interaction with ${c.name} logged`);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not log the interaction.", "error");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.deleteContact(deleting.id);
      toast("Contact deleted");
      setSelectedId(null);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete the contact.", "error");
    }
    setDeleting(null);
  };

  return (
    <>
      <PageHeader title="Contacts" description="Recruiters, referrals and people in your network"
                  actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>New contact</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, company, notes"
                 aria-label="Search contacts" className={cn(controlClass, "h-8 pl-8")} />
        </div>
        <SegmentedControl value={filter} onChange={setFilter}
                          options={[{ id: "all", label: "All" }, { id: "due", label: "Follow-up due" }]} />
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}

      {loading && !contacts ? <Skeleton className="h-80" /> : contacts && contacts.length === 0 ? (
        <Card>
          <EmptyState icon={<Users className="size-5" />}
                      title={filter === "due" ? "No follow-ups due" : search ? "No contacts match" : "No contacts yet"}
                      action={!search && filter === "all" && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Add a contact</Button>}>
            {filter === "all" && !search && "Keep track of recruiters and referrals, link them to applications, and set a follow-up date so nobody falls through the cracks."}
          </EmptyState>
        </Card>
      ) : contacts && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="border-b border-stone-200 bg-stone-50/70 text-left text-xs text-stone-500">
                <tr>
                  <th className="py-2 pl-4 pr-3 font-medium">Name</th>
                  <th className="px-3 font-medium">Relationship</th>
                  <th className="px-3 font-medium">Last contact</th>
                  <th className="pl-3 pr-4 font-medium">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {contacts.map((c) => (
                  <tr key={c.id} onClick={() => setSelectedId(c.id)}
                      className={cn("cursor-pointer", c.id === selectedId ? "bg-accent-50/50" : "hover:bg-stone-50/70")}>
                    <td className="py-2.5 pl-4 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[11px] font-semibold text-stone-700">{initials(c.name)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-stone-900">{c.name}</p>
                          <p className="truncate text-xs text-stone-500">{[c.role, c.company_name].filter(Boolean).join(" · ") || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 text-stone-600">{c.relationship_type ? RELATIONSHIP_LABELS[c.relationship_type] : "—"}</td>
                    <td className="px-3 text-stone-600">{c.last_interaction_at ? relativeTime(c.last_interaction_at) : "—"}</td>
                    <td className="pl-3 pr-4"><FollowUp date={c.next_follow_up_at} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {selected && (
            <Card className="h-fit lg:sticky lg:top-6">
              <div className="flex items-start justify-between gap-3 border-b border-stone-100 p-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-stone-900">{selected.name}</p>
                  <p className="text-[13px] text-stone-500">{[selected.role, selected.company_name].filter(Boolean).join(" at ") || "—"}</p>
                  {selected.relationship_type && <Badge className="mt-1.5">{RELATIONSHIP_LABELS[selected.relationship_type]}</Badge>}
                </div>
                <div className="flex">
                  <IconButton label="Edit contact" onClick={() => setEditing(selected)}><Pencil className="size-3.5" /></IconButton>
                  <IconButton label="Delete contact" onClick={() => setDeleting(selected)} className="hover:text-rose-700"><Trash2 className="size-3.5" /></IconButton>
                </div>
              </div>
              <div className="space-y-3 p-4 text-[13px]">
                <div className="flex flex-wrap gap-2">
                  {selected.email && (
                    <a href={`mailto:${selected.email}`} className="inline-flex items-center gap-1.5 text-stone-700 hover:text-stone-900">
                      <Mail className="size-3.5 text-stone-500" />{selected.email}
                    </a>
                  )}
                  {selected.linkedin_url && (
                    <a href={selected.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-stone-700 hover:text-stone-900">
                      <ExternalLink className="size-3.5 text-stone-500" />LinkedIn
                    </a>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-xs text-stone-500">Last interaction</dt><dd className="text-stone-900">{selected.last_interaction_at ? formatShortDate(selected.last_interaction_at) : "—"}</dd></div>
                  <div><dt className="text-xs text-stone-500">Next follow-up</dt><dd><FollowUp date={selected.next_follow_up_at} /></dd></div>
                </dl>
                <Button size="sm" className="w-full" icon={<CalendarCheck className="size-3.5" />} onClick={() => logInteraction(selected)}>
                  Log an interaction today
                </Button>
                {selected.notes && <p className="whitespace-pre-line rounded-md bg-stone-50 px-3 py-2 text-stone-700">{selected.notes}</p>}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-stone-500">Applications</p>
                  {selected.applications.length === 0 ? <p className="text-xs text-stone-500">None linked.</p> : (
                    <ul className="space-y-1.5">
                      {selected.applications.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2">
                          <Link href={`/applications/${a.id}`} className="min-w-0 truncate text-stone-800 hover:underline">{a.position_title}</Link>
                          <StatusBadge status={a.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {editing && apps && (
        <ContactForm contact={editing === "new" ? undefined : editing} apps={apps}
                     onClose={() => { setEditing(null); if (params.get("new")) router.replace("/contacts"); }}
                     onSaved={(c) => { setEditing(null); setSelectedId(c.id); reload(); }} />
      )}
      {deleting && (
        <ConfirmDialog title="Delete contact?" onCancel={() => setDeleting(null)} onConfirm={remove}
                       message={<>{deleting.name} and their follow-up tasks will be removed. Applications are kept.</>} />
      )}
    </>
  );
}

export default function ContactsPage() {
  return <Suspense><ContactsInner /></Suspense>;
}
