"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/Button";
import { FormError, Input } from "@/components/ui/Field";

function LoginForm() {
  const params = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("expired") ? "Your session expired. Please sign in again." : null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password, params.get("next") ?? "/dashboard");
    } catch (err) {
      setError(err instanceof Error && err.message !== "Request failed." ? err.message : "Incorrect email or password.");
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Pick up where you left off."
                footer={<>No account yet? <Link href="/register" className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-700">Create one</Link></>}>
      {/* method="post": if submitted before hydration, credentials never end up in the URL */}
      <form method="post" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={error} />
        <Button type="submit" variant="primary" className="h-9 w-full" loading={submitting}>Sign in</Button>
        {process.env.NODE_ENV !== "production" && (
          <button type="button" onClick={() => { setEmail("alex@jobpilot.dev"); setPassword("Demo1234!"); }}
                  className="w-full text-center text-xs text-stone-500 hover:text-stone-800">
            Fill in the demo account (after running the seed script)
          </button>
        )}
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
