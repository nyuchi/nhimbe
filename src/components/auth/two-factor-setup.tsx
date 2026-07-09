"use client";

import { useState } from "react";
import Image from "next/image";
import { ShieldCheck, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Self-hosted authenticator-app (TOTP) enrollment for the signed-in user.
//   1. Enroll  → POST /api/auth/mfa/enroll  → QR data URI + manual secret
//   2. Scan the QR (or key in the secret) in an authenticator app
//   3. Activate → POST /api/auth/mfa/activate { code, factorId } → confirmed
// If MFA isn't enabled for the WorkOS environment the enroll call fails and we
// surface a friendly notice rather than crashing.

type EnrollData = { factorId: string; qrCode: string; secret: string };

type EnrollResponse = {
  factorId?: string;
  qrCode?: string;
  secret?: string;
  error?: string;
};

type ActivateResponse = { ok?: boolean; error?: string };

export function TwoFactorSetup() {
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function startEnroll() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as EnrollResponse;
      if (!res.ok || !data.factorId || !data.qrCode || !data.secret) {
        throw new Error(data.error || "Two-factor isn't available yet.");
      }
      setEnroll({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Two-factor isn't available yet.");
    } finally {
      setLoading(false);
    }
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, factorId: enroll.factorId }),
      });
      const data = (await res.json().catch(() => ({}))) as ActivateResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "That code didn't work. Try again.");
      setDone(true);
      setEnroll(null);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
        Security
      </h2>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="flex-1">
            <p className="font-medium text-foreground">Two-factor authentication</p>
            <p className="text-sm text-muted-foreground">
              Add a code from an authenticator app to protect your account.
            </p>
          </div>
        </div>

        {error && (
          <div
            className="mt-4 flex items-start gap-3 rounded-[var(--radius-lg)] border border-destructive/30 bg-destructive/10 p-3"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {done ? (
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
            <Check className="h-5 w-5" aria-hidden />
            Two-factor authentication is on.
          </div>
        ) : enroll ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <Image
                src={enroll.qrCode}
                alt="Authenticator app QR code"
                width={176}
                height={176}
                unoptimized
                className="h-44 w-44 rounded-[var(--radius-lg)] border border-border bg-white p-2"
              />
              <p className="text-center text-sm text-muted-foreground">
                Scan this with your authenticator app, or enter this key manually:
              </p>
              <code className="break-all rounded-md bg-muted px-2 py-1 text-center text-sm tracking-wide">
                {enroll.secret}
              </code>
            </div>
            <form onSubmit={activate} className="space-y-3">
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                enterKeyHint="go"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                aria-label="Authenticator code"
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
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Verifying…
                  </>
                ) : (
                  "Turn on two-factor"
                )}
              </Button>
            </form>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            onClick={startEnroll}
            disabled={loading}
            className="mt-4 h-[var(--touch-target-lg)] w-full rounded-[var(--radius-lg)]"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Setting up…
              </>
            ) : (
              "Set up authenticator app"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
