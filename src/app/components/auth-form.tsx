"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedEmail = email.trim();
    if (!EMAIL_PATTERN.test(submittedEmail)) {
      setError("Enter a valid email address, such as name@example.com.");
      return;
    }
    if (isSignup && password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: submittedEmail, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string; details?: Record<string, string> };
        } | null;
        const code = body?.error?.code;
        const details = Object.entries(body?.error?.details ?? {});
        const detailMessage = details.length > 0
          ? ` ${details.map(([field, detail]) => `${field}: ${detail}`).join(" · ")}`
          : "";
        setError(
          code === "EMAIL_ALREADY_REGISTERED"
            ? "That email is already registered. Try signing in instead."
            : code === "INVALID_REQUEST"
              ? isSignup
                ? "Check your email address and make sure your password is at least 8 characters."
                : "Enter a valid email address."
            : `${body?.error?.message ?? "Those credentials could not be accepted."}${detailMessage}`,
        );
        return;
      }
      router.push("/orders");
      router.refresh();
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent)]">CrossVal</Link>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight">{isSignup ? "Create your workspace" : "Welcome back"}</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">{isSignup ? "Start tracking orders and settlements with a clean financial history." : "Sign in to view your orders and record settlements."}</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-semibold">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" autoComplete="email" /></label>
          <label className="block text-sm font-semibold">Password<input required minLength={isSignup ? 8 : 1} maxLength={128} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" autoComplete={isSignup ? "new-password" : "current-password"} /></label>
          {error ? <p role="alert" className="rounded-xl bg-[#fff0ee] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</p> : null}
          <button disabled={busy} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white transition hover:bg-[var(--accent-dark)] disabled:cursor-wait disabled:opacity-60">{busy ? "Working…" : isSignup ? "Create workspace" : "Sign in"}</button>
        </form>
        <p className="mt-7 text-center text-sm text-[var(--muted)]">{isSignup ? "Already have an account?" : "New to CrossVal?"}{" "}<Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-[var(--accent)] hover:underline">{isSignup ? "Sign in" : "Create one"}</Link></p>
      </section>
    </main>
  );
}
