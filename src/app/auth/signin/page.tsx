"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail, KeyRound, ArrowLeft, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp-input";

// Self-hosted sign-in: everything happens on our own UI — no redirect to a
// WorkOS-hosted page. Two methods share one card:
//   1. Email code (WorkOS Magic Auth) → /api/auth/magic/{start,verify}
//   2. Password → POST /api/auth/password
// Either can step up to MFA: when the account has TOTP enabled the server
// returns { mfa: true, pendingAuthenticationToken } instead of a session, and we
// advance to a 6-digit authenticator step that POSTs /api/auth/mfa/verify.
// Each server route sets the session cookie, so we hard-navigate on success and
// the server re-reads the cookie while AuthProvider syncs the user. (Passkey is
// planned but deliberately not wired up yet.)

// Shape returned by the email-code / password / mfa routes.
type AuthResponse = {
  ok?: boolean;
  error?: string;
  mfa?: boolean;
  pendingAuthenticationToken?: string;
  challengeId?: string;
};
function SignInForm() {
  const searchParams = useSearchParams();
  const returnToRaw = searchParams.get("return_to") ?? "/";
  const returnTo =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : "/";
  const configError = searchParams.get("error") === "config";

  // Email code defaults; the user can switch to a password at any time.
  const [method, setMethod] = useState<"code" | "password">("code");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA step-up: set once a primary method reports the account needs a TOTP code.
  // The pending token is short-lived and single-use — held here only until the
  // mfa/verify call, never persisted.
  const [mfaPending, setMfaPending] = useState<{ token: string; challengeId?: string } | null>(
    null,
  );
  const [mfaCode, setMfaCode] = useState("");

  // Flip between methods, resetting any transient error/step so neither flow
  // leaks state into the other.
  function switchMethod(next: "code" | "password") {
    setMethod(next);
    setStep("email");
    setCode("");
    setError(null);
    setMfaPending(null);
    setMfaCode("");
  }

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

  async function verifyCode(e?: React.FormEvent, codeOverride?: string) {
    e?.preventDefault();
    // On auto-submit the completed value arrives via `codeOverride` because the
    // `code` state hasn't flushed yet in the same tick.
    const submitCode = codeOverride ?? code;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/magic/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: submitCode }),
      });
      const data = (await res.json().catch(() => ({}))) as AuthResponse;
      if (!res.ok) throw new Error(data.error || "That code didn't work.");
      if (data.mfa && data.pendingAuthenticationToken) {
        // Account has TOTP: advance to the authenticator step instead of navigating.
        setMfaPending({ token: data.pendingAuthenticationToken, challengeId: data.challengeId });
        setLoading(false);
        return;
      }
      // Full navigation so the server picks up the new session cookie.
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as AuthResponse;
      if (data.mfa && data.pendingAuthenticationToken) {
        // Password was correct but the account has TOTP: step up to the code.
        setMfaPending({ token: data.pendingAuthenticationToken, challengeId: data.challengeId });
        setLoading(false);
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data.error || "That email or password is incorrect.");
      // Full navigation so the server picks up the new session cookie.
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function verifyMfa(e?: React.FormEvent, codeOverride?: string) {
    e?.preventDefault();
    if (!mfaPending) return;
    const submitCode = codeOverride ?? mfaCode;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: submitCode,
          pendingAuthenticationToken: mfaPending.token,
          challengeId: mfaPending.challengeId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AuthResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "That code didn't work. Try again.");
      // Full navigation so the server picks up the new session cookie.
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const inCodeEntry = method === "code" && step === "code";

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-104 flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <span className="text-sm font-bold tracking-tight text-primary">nhimbe</span>
        <h1 className="mt-2 text-2xl font-bold">Welcome to nhimbe</h1>
        <p className="mt-2 text-muted-foreground">
          {mfaPending
            ? "Enter the code from your authenticator app."
            : inCodeEntry
              ? `Enter the code we sent to ${email}.`
              : "Sign in to discover and host community events."}
        </p>
      </div>

      {configError && (
        <div
          className="mb-4 flex items-start gap-3 rounded-[var(--radius-lg)] border border-destructive/30 bg-destructive/10 p-4"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <p className="text-sm text-destructive">Sign-in isn&apos;t configured right now.</p>
        </div>
      )}

      {error && (
        <div
          className="mb-4 flex items-start gap-3 rounded-[var(--radius-lg)] border border-destructive/30 bg-destructive/10 p-4"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-sm">
        {mfaPending ? (
          // MFA step-up takes over the card — a primary method already succeeded
          // and we just need the authenticator code to finish.
          <form onSubmit={verifyMfa} className="space-y-4">
            <div className="flex justify-center">
              <ShieldCheck className="h-8 w-8 text-primary" aria-hidden />
            </div>
            <OtpInput
              value={mfaCode}
              onChange={setMfaCode}
              onComplete={(v) => verifyMfa(undefined, v)}
              autoFocus
              disabled={loading}
              ariaLabel="Authenticator code"
            />
            <Button
              type="submit"
              size="lg"
              disabled={loading || !mfaCode}
              className="h-[var(--touch-target-lg)] w-full rounded-[var(--radius-lg)] bg-primary text-primary-foreground"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Verifying…
                </>
              ) : (
                "Verify"
              )}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMfaPending(null);
                setMfaCode("");
                setError(null);
              }}
              className="flex min-h-[var(--touch-target)] w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Start over
            </button>
          </form>
        ) : inCodeEntry ? (
          // Code-entry step takes over the card — the user is mid-flow.
          <form onSubmit={verifyCode} className="space-y-4">
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={(v) => verifyCode(undefined, v)}
              autoFocus
              disabled={loading}
              ariaLabel="One-time code"
            />
            <Button
              type="submit"
              size="lg"
              disabled={loading || !code}
              className="h-[var(--touch-target-lg)] w-full rounded-[var(--radius-lg)] bg-primary text-primary-foreground"
            >
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
              className="flex min-h-[var(--touch-target)] w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Use a different email
            </button>
          </form>
        ) : method === "password" ? (
          <div className="space-y-5">
            <form onSubmit={signInWithPassword} className="space-y-4">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                enterKeyHint="next"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-[var(--touch-target-lg)] text-base text-foreground"
              />
              <Input
                type="password"
                autoComplete="current-password"
                required
                enterKeyHint="go"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                aria-label="Password"
                className="h-[var(--touch-target-lg)] text-base text-foreground"
              />
              <Button
                type="submit"
                size="lg"
                disabled={loading || !email || !password}
                className="h-[var(--touch-target-lg)] w-full rounded-[var(--radius-lg)] bg-primary text-primary-foreground"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            <div className="border-t border-border pt-5">
              <button
                type="button"
                onClick={() => switchMethod("code")}
                disabled={loading}
                className="flex min-h-[var(--touch-target)] w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <Mail className="h-4 w-4" aria-hidden /> Email me a code instead
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <form onSubmit={sendCode} className="space-y-4">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                enterKeyHint="send"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-[var(--touch-target-lg)] text-base text-foreground"
              />
              <Button
                type="submit"
                size="lg"
                disabled={loading || !email}
                className="h-[var(--touch-target-lg)] w-full rounded-[var(--radius-lg)] bg-primary text-primary-foreground"
              >
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

            <div className="border-t border-border pt-5">
              <button
                type="button"
                onClick={() => switchMethod("password")}
                disabled={loading}
                className="flex min-h-[var(--touch-target)] w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" aria-hidden /> Use a password instead
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[70vh] max-w-104 items-center justify-center px-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
