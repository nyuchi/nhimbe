"use client";

import { useEffect, useState } from "react";
import { Loader2, Monitor, CheckCircle2, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCode } from "@/components/ui/qr-code";
import { confirmKioskPairingAction } from "@/app/actions/kiosk";

interface PairKioskProps {
  eventId: string;
}

export function PairKiosk({ eventId }: PairKioskProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Absolute kiosk-display URL, resolved after mount to avoid a hydration
  // mismatch (window is undefined during SSR).
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const kioskUrl = origin ? `${origin}/events/${eventId}/kiosk` : "";

  const copyKioskUrl = async () => {
    if (!kioskUrl) return;
    try {
      await navigator.clipboard.writeText(kioskUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the visible link is still selectable */
    }
  };

  const handlePair = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Enter a 6-character code");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await confirmKioskPairingAction(trimmed, eventId);
      setSuccess(result.eventName);
      setCode("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.includes("expired")
            ? "Code expired. Generate a new one on the kiosk."
            : err.message.includes("already")
              ? "Code already used."
              : "Pairing failed. Try again."
          : "Pairing failed."
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-surface rounded-xl p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-primary mx-auto mb-3" />
        <h3 className="font-semibold mb-1">Kiosk Paired!</h3>
        <p className="text-sm text-text-secondary">
          The kiosk screen is now connected to <strong>{success}</strong>
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => setSuccess(null)}
        >
          Pair another
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Monitor className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">Pair Check-In Kiosk</h3>
          <p className="text-xs text-text-tertiary">Open the kiosk on a tablet, then enter its code below</p>
        </div>
      </div>

      {/* Step 1 — open the kiosk display on a tablet/phone. Scan the QR or use
          the link; the kiosk screen then shows a 6-digit code to pair below. */}
      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center">
        <div className="mx-auto shrink-0 rounded-lg bg-white p-2 sm:mx-0">
          <QRCode
            value={kioskUrl || `${eventId}/kiosk`}
            size={112}
            ariaLabel="QR code to open the check-in kiosk on a tablet"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-sm font-medium text-foreground">Scan to open the kiosk</p>
          <p className="mb-2 text-xs text-text-tertiary">
            Point an iPad or phone camera at the code, or copy the link:
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
              {kioskUrl || "…"}
            </span>
            <button
              type="button"
              onClick={copyKioskUrl}
              aria-label="Copy kiosk link"
              className="shrink-0 text-text-secondary hover:text-foreground"
            >
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {kioskUrl && (
            <a
              href={kioskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open kiosk in a new tab
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 6));
            setError(null);
          }}
          placeholder="6-digit code"
          className="font-mono text-lg tracking-widest text-center uppercase"
          maxLength={6}
          onKeyDown={(e) => e.key === "Enter" && handlePair()}
        />
        <Button onClick={handlePair} disabled={loading || code.length < 6}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pair"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}
