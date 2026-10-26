"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import type { Application } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { FormError, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { AiButton, AiNotConfigured, AiWaiting, useAiStatus } from "./AiKit";

const KINDS = [
  { value: "thank_you", label: "Thank-you after an interview" },
  { value: "follow_up", label: "Follow-up on my application" },
  { value: "networking", label: "Networking message to a contact" },
  { value: "cover_letter", label: "Cover letter" },
] as const;
type Kind = (typeof KINDS)[number]["value"];

export function DraftDialog({ app, onClose }: { app: Application; onClose: () => void }) {
  const status = useAiStatus();
  const { data: contacts } = useAsync(() => api.applicationContacts(app.id), [app.id]);
  const [kind, setKind] = useState<Kind>(app.interviews.length ? "thank_you" : "follow_up");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setRunning(true);
    setError(null);
    try {
      setDraft(await api.draftMessage(app.id, kind, contactId, notes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the draft.");
    } finally {
      setRunning(false);
    }
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft.subject ? `Subject: ${draft.subject}\n\n${draft.body}` : draft.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal title="Draft a message" description={`${app.position_title} · ${app.company_name}`} size="lg" onClose={onClose}
           footer={draft ? <>
             <Button onClick={() => setDraft(null)}>Start over</Button>
             <Button variant="primary" onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
               {copied ? "Copied" : "Copy"}
             </Button>
           </> : <Button onClick={onClose}>Close</Button>}>
      {status && !status.enabled ? <AiNotConfigured /> : draft ? (
        <div className="space-y-3">
          {draft.subject && <Input label="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />}
          <Textarea label="Message" rows={kind === "cover_letter" ? 16 : 10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    hint="Written from your application details. Fill in anything in [brackets] before sending." />
        </div>
      ) : (
        <div className="space-y-3.5">
          <Select label="Type of message" value={kind} onChange={(e) => setKind(e.target.value as Kind)} options={[...KINDS]} />
          {kind === "cover_letter" ? (
            <p className="rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">
              Written from the job description and the achievements in your profile. Nothing else is added.
            </p>
          ) : (
            <Select label="To" value={contactId} onChange={(e) => setContactId(e.target.value)} placeholder="The recruiter (name unknown)"
                    options={(contacts ?? []).map((c) => ({ value: c.id, label: c.role ? `${c.name} · ${c.role}` : c.name }))} />
          )}
          <Textarea label="Anything to mention" optional rows={2} value={notes} maxLength={500}
                    onChange={(e) => setNotes(e.target.value)} placeholder="e.g. enjoyed the discussion about their data pipeline" />
          <AiWaiting running={running} local={status?.local} what="Writing your draft" />
          <FormError message={error} />
          {!running && <AiButton running={running} onClick={generate}>Write the draft</AiButton>}
        </div>
      )}
    </Modal>
  );
}
