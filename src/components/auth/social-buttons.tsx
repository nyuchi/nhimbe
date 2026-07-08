"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Inline, brand-appropriate provider marks. No external assets or network
// fetch — the full-colour Google "G" and the four-square Microsoft logo are
// rendered as inline SVG so they work offline and in both themes.
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.2-2.36H12v4.46h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.75Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.12A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.26a7.2 7.2 0 0 1 0-4.52V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.12Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.28 6.62l3.99 3.12C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden focusable="false">
      <path fill="#F25022" d="M1 1h10.2v10.2H1z" />
      <path fill="#7FBA00" d="M12.8 1H23v10.2H12.8z" />
      <path fill="#00A4EF" d="M1 12.8h10.2V23H1z" />
      <path fill="#FFB900" d="M12.8 12.8H23V23H12.8z" />
    </svg>
  );
}

type Provider = "google" | "microsoft";

const PROVIDERS: ReadonlyArray<{
  provider: Provider;
  label: string;
  Mark: () => React.ReactElement;
}> = [
  { provider: "google", label: "Continue with Google", Mark: GoogleMark },
  { provider: "microsoft", label: "Continue with Microsoft", Mark: MicrosoftMark },
];

export function SocialButtons({
  returnTo,
  disabled,
  onSelect,
}: {
  returnTo: string;
  disabled?: boolean;
  /** Notifies the parent so it can show a spinner while the browser navigates. */
  onSelect?: (provider: Provider) => void;
}) {
  function go(provider: Provider) {
    onSelect?.(provider);
    const params = new URLSearchParams({ provider, return_to: returnTo });
    window.location.assign(`/api/auth/oauth?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      {PROVIDERS.map(({ provider, label, Mark }) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          size="lg"
          disabled={disabled}
          onClick={() => go(provider)}
          className={cn(
            "h-[var(--touch-target-lg)] w-full justify-center gap-3 rounded-[var(--radius-lg)] text-base font-medium"
          )}
        >
          <Mark />
          {label}
        </Button>
      ))}
    </div>
  );
}
