"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/format";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/Button";
import { FormError, Input } from "@/components/ui/Field";

type Errors = Partial<Record<"fullName" | "email" | "password", string>>;

function strength(password: string) {
  if (!password) return { level: 0, label: "" };
  let score = password.length >= 8 ? 1 : 0;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) score++;
  return { level: score, label: ["Too short", "Fair", "Good", "Strong"][score] };
}

export default function RegisterPage() {
  const { login } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const s = strength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!fullName.trim()) next.fullName = "Tell us your name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid email address";
    if (password.length < 8) next.password = "Use at least 8 characters";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setError(null);
    try {
      await api.register(email.trim(), password, fullName.trim());
      await login(email.trim(), password, "/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("already")) setErrors({ email: "This email already has an account" });
      else setError(message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Free, private, and ready in a minute."
                footer={<>Already have an account? <Link href="/login" className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">Sign in</Link></>}>
      {/* method="post": if submitted before hydration, the password never ends up in the URL */}
      <form method="post" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input label="Full name" autoComplete="name" value={fullName} error={errors.fullName}
               onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
        <Input label="Email" type="email" autoComplete="email" value={email} error={errors.email}
               onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <div>
          <Input label="Password" type="password" autoComplete="new-password" value={password} error={errors.password}
                 onChange={(e) => setPassword(e.target.value)} hint={!errors.password ? "At least 8 characters" : undefined} />
          {password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={cn("h-1 flex-1 rounded-full",
                    i <= s.level ? (s.level === 1 ? "bg-amber-500" : "bg-accent-500") : "bg-stone-200")} />
                ))}
              </div>
              <span className="w-14 text-right text-xs text-stone-500">{s.label}</span>
            </div>
          )}
        </div>
        <FormError message={error} />
        <Button type="submit" variant="primary" className="h-9 w-full" loading={submitting}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
