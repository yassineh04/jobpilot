"use client";
import { useState } from "react";
import { CheckCircle2, Cloud, Cpu, Eye, EyeOff } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/format";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { FormError, Input } from "@/components/ui/Field";
import { Badge, Card, CardHeader, PageHeader, Skeleton } from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { useAiStatus } from "@/components/ai/AiKit";

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5">
      <span>
        <span className="block text-[13px] font-medium text-stone-900">{label}</span>
        <span className="block text-xs text-stone-500">{description}</span>
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
              className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent-600" : "bg-stone-300")}>
        <span className={cn("absolute left-0 top-0.5 size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

function strength(password: string) {
  let score = password.length >= 8 ? 1 : 0;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) score++;
  return score;
}

function PasswordForm() {
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const score = strength(form.next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.current) next.current = "Enter your current password";
    if (form.next.length < 8) next.next = "Use at least 8 characters";
    else if (form.next === form.current) next.next = "Choose a different password";
    if (form.confirm !== form.next) next.confirm = "The passwords don't match";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setError(null);
    try {
      const { access_token } = await api.changePassword(form.current, form.next);
      setToken(access_token);  // this session continues; every other session is signed out
      setForm({ current: "", next: "", confirm: "" });
      toast("Password changed. Other devices were signed out.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setSaving(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <form method="post" onSubmit={submit} className="space-y-3.5 p-4" noValidate>
      <Input label="Current password" type={type} autoComplete="current-password" value={form.current} error={errors.current}
             onChange={(e) => setForm({ ...form, current: e.target.value })} />
      <div>
        <Input label="New password" type={type} autoComplete="new-password" value={form.next} error={errors.next}
               onChange={(e) => setForm({ ...form, next: e.target.value })} hint={!errors.next ? "At least 8 characters" : undefined} />
        {form.next && (
          <div className="mt-2 flex items-center gap-2" aria-hidden>
            <div className="flex flex-1 gap-1">
              {[1, 2, 3].map((i) => (
                <span key={i} className={cn("h-1 flex-1 rounded-full", i <= score ? (score === 1 ? "bg-amber-500" : "bg-accent-500") : "bg-stone-200")} />
              ))}
            </div>
            <span className="w-14 text-right text-xs text-stone-500">{["Too short", "Fair", "Good", "Strong"][score]}</span>
          </div>
        )}
      </div>
      <Input label="Confirm new password" type={type} autoComplete="new-password" value={form.confirm} error={errors.confirm}
             onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={saving}>Change password</Button>
        <Button variant="ghost" size="sm" onClick={() => setShow((s) => !s)}
                icon={show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}>{show ? "Hide" : "Show"}</Button>
      </div>
      <p className="text-xs text-stone-500">Changing your password signs you out on every other device.</p>
    </form>
  );
}

const PROVIDERS = [
  { icon: Cpu, name: "Ollama (local)", note: "Free, no account. Runs on your computer; your data never leaves it. Slower on laptops.",
    setup: "Included in docker compose. Set AI_PROVIDER=ollama." },
  { icon: Cloud, name: "Groq", note: "Free API key, no credit card. Very fast, best quality of the free options.",
    setup: "Create a key at console.groq.com, then set AI_PROVIDER=groq and AI_API_KEY." },
  { icon: Cloud, name: "Google Gemini", note: "Free tier with an API key.",
    setup: "Create a key at aistudio.google.com, then set AI_PROVIDER=gemini and AI_API_KEY." },
];

function AiSection() {
  const status = useAiStatus();
  return (
    <Card id="ai" className="scroll-mt-6">
      <CardHeader title="AI"
                  description="Every AI answer is checked: quotes against the posting, suggestions against your own records." />
      {status && (
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5 text-[13px]">
          {status.enabled ? (
            <><CheckCircle2 className="size-4 text-accent-600" /><span className="text-stone-700">Active:</span>
              <span className="font-medium text-stone-900">{status.provider}</span><Badge>{status.model}</Badge></>
          ) : <span className="text-stone-600">AI is off. Pick one of the free options below.</span>}
        </div>
      )}
      <ul className="divide-y divide-stone-100">
        {PROVIDERS.map((p) => (
          <li key={p.name} className="flex gap-3 px-4 py-3">
            <p.icon className="mt-0.5 size-4 shrink-0 text-stone-500" />
            <div className="text-[13px]">
              <p className="font-medium text-stone-900">{p.name}</p>
              <p className="text-stone-600">{p.note}</p>
              <p className="mt-0.5 text-xs text-stone-500">{p.setup}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-stone-100 px-4 py-2.5 text-xs text-stone-500">
        Settings live in <code className="rounded bg-stone-100 px-1 text-stone-800">backend/.env</code>; restart the API after changing them.
      </p>
    </Card>
  );
}

function AccountForm({ user }: { user: User }) {
  const { refreshUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.full_name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (data: Record<string, unknown>, message: string) => {
    setSaving(true);
    try {
      await api.updateMe(data);
      await refreshUser();
      toast(message);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader title="Account" />
        <form className="space-y-3.5 p-4" onSubmit={(e) => { e.preventDefault(); save({ full_name: name.trim() }, "Name updated"); }}>
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <Input label="Email" value={user.email} disabled hint="Your email is used to sign in." />
          <Button type="submit" variant="primary" loading={saving} disabled={!name.trim() || name.trim() === (user.full_name ?? "")}>Save</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Notifications" description="JobPilot only emails you about things you scheduled yourself." />
        <Toggle checked={user.email_reminders} label="Interview reminders"
                description="An email about 24 hours before each scheduled interview."
                onChange={(v) => save({ email_reminders: v }, v ? "Interview reminders on" : "Interview reminders off")} />
      </Card>
    </>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {user ? <AccountForm user={user} /> : <Skeleton className="h-64" />}
          <Card>
            <CardHeader title="Password" />
            <PasswordForm />
          </Card>
        </div>
        <div className="space-y-6">
          <AiSection />
          <Card>
            <CardHeader title="Session" />
            <div className="flex items-center justify-between gap-4 px-4 py-3.5 text-[13px] text-stone-600">
              Sign out of JobPilot on this device.
              <Button onClick={logout}>Log out</Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
