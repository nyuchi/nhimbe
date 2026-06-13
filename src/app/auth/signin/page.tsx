"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Embedded (in-app) sign-in: WorkOS Magic Auth (passwordless email code),
// driven by /api/auth/magic/{start,verify}. On success the session cookie is
// set server-side and we hard-navigate so the server re-reads it and
// AuthProvider syncs the user. A hosted-AuthKit link stays as a fallback.
function SignInForm() {
  const searchParams = useSearchParams();
  const returnToRaw = searchParams.get("return_to") ?? "/";
  const returnTo =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : "/";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/magic/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't send a sign-in code.");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/magic/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "That code didn't work.");
      // Full navigation so the server picks up the new session cookie.
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-100 flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">Welcome to nhimbe</h1>
        <p className="mt-2 text-text-secondary">
          {step === "email"
            ? "Sign in with your email — we'll send you a one-time code."
            : `Enter the code we sent to ${email}.`}
        </p>
      </div>

      {error && (
        <div
          className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            enterKeyHint="send"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="h-12 text-base"
          />
          <Button type="submit" size="lg" disabled={loading || !email} className="w-full rounded-xl">
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Sending code…
              </>
            ) : (
              <>
                <Mail className="h-5 w-5" aria-hidden /> Email me a code
              </>
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            enterKeyHint="go"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            aria-label="One-time code"
            className="h-12 text-center text-lg tracking-widest"
          />
          <Button type="submit" size="lg" disabled={loading || !code} className="w-full rounded-xl">
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="flex w-full items-center justify-center gap-1 text-sm text-text-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Use a different email
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-text-tertiary">
        Having trouble?{" "}
        <a
          href={`/auth/hosted?return_to=${encodeURIComponent(returnTo)}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          Use the secure hosted sign-in
        </a>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[70vh] max-w-100 items-center justify-center px-6">
          <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" aria-hidden />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
