"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail, ArrowLeft, AlertCircle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SocialButtons } from "@/components/auth/social-buttons";

// Unified self-hosted sign-in: everything happens on our own UI — no redirect
// to a WorkOS-hosted page. Three methods share one card:
//   1. Social login (Google / Microsoft) → /api/auth/oauth
//   2. Email code (WorkOS Magic Auth) → /api/auth/magic/{start,verify}
//   3. SSO / organization → POST /api/auth/sso → { url } | { error }
// Each server route sets the session cookie, so we hard-navigate on success and
// the server re-reads the cookie while AuthProvider syncs the user.
function SignInForm() {
  const searchParams = useSearchParams();
  const returnToRaw = searchParams.get("return_to") ?? "/";
  const returnTo =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : "/";
  const configError = searchParams.get("error") === "config";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSO affordance: hidden until requested, then reveals a work-email input.
  const [ssoOpen, setSsoOpen] = useState(false);
  const [ssoEmail, setSsoEmail] = useState("");
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);

  // Set while the browser is mid-navigation to a social provider so we can
  // disable the whole card and avoid a double submit.
  const [redirecting, setRedirecting] = useState(false);

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

  async function startSso(e: React.FormEvent) {
    e.preventDefault();
    setSsoLoading(true);
    setSsoError(null);
    try {
      const res = await fetch("/api/auth/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ssoEmail }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "We couldn't find SSO for that email.");
      }
      if (!data.url) throw new Error("We couldn't start SSO. Please try again.");
      window.location.assign(data.url);
    } catch (err) {
      setSsoError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSsoLoading(false);
    }
  }

  const busy = loading || redirecting;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-104 flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <span className="text-sm font-bold tracking-tight text-primary">nhimbe</span>
        <h1 className="mt-2 text-2xl font-bold">Welcome to nhimbe</h1>
        <p className="mt-2 text-muted-foreground">
          {step === "email"
            ? "Sign in to discover and host community events."
            : `Enter the code we sent to ${email}.`}
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
        {step === "code" ? (
          // Code-entry step takes over the card — the user is mid-flow.
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
              className="h-[var(--touch-target-lg)] text-center text-lg tracking-widest"
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
        ) : (
          <div className="space-y-5">
            <SocialButtons
              returnTo={returnTo}
              disabled={busy}
              onSelect={() => setRedirecting(true)}
            />

            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                or
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

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
                className="h-[var(--touch-target-lg)] text-base"
              />
              <Button
                type="submit"
                size="lg"
                disabled={busy || !email}
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
              {ssoOpen ? (
                <form onSubmit={startSso} className="space-y-3">
                  <label htmlFor="sso-email" className="text-sm font-medium text-foreground">
                    Work email
                  </label>
                  <Input
                    id="sso-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    required
                    enterKeyHint="go"
                    value={ssoEmail}
                    onChange={(e) => setSsoEmail(e.target.value)}
                    placeholder="you@company.com"
                    aria-label="Work email for SSO"
                    className="h-[var(--touch-target-lg)] text-base"
                  />
                  {ssoError && (
                    <div
                      className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-destructive/30 bg-destructive/10 p-3"
                      role="alert"
                    >
                      <AlertCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                        aria-hidden
                      />
                      <p className="text-sm text-destructive">{ssoError}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="outline"
                      size="lg"
                      disabled={ssoLoading || !ssoEmail}
                      className="h-[var(--touch-target-lg)] flex-1 rounded-[var(--radius-lg)]"
                    >
                      {ssoLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Redirecting…
                        </>
                      ) : (
                        "Continue with SSO"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      disabled={ssoLoading}
                      onClick={() => {
                        setSsoOpen(false);
                        setSsoError(null);
                      }}
                      className="h-[var(--touch-target-lg)] rounded-[var(--radius-lg)]"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setSsoOpen(true)}
                  disabled={busy}
                  className="flex min-h-[var(--touch-target)] w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" aria-hidden /> Sign in with SSO
                </button>
              )}
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
