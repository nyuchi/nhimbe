import * as React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI AVATAR STACK — overlapping +N social-proof stack.

   Ring-separated avatars overlap with a negative margin, each an
   image or an initials fallback, showing up to `max` before a +N
   overflow bubble, with an optional trailing "<total> <label>"
   (e.g. "128 going") in 13px muted.

   Purely presentational and server-safe (no harness, no "use
   client") so it renders inside React Server Components. The group
   exposes an accessible summary label; the avatars themselves are
   decorative (aria-hidden).
   ═══════════════════════════════════════════════════════════════ */

interface AvatarPerson {
  name: string;
  src?: string;
}

interface NyuchiAvatarStackProps {
  people: AvatarPerson[];
  /** Max avatars before collapsing into a +N bubble. */
  max?: number;
  /** Total count for the +N bubble and summary label (defaults to people.length). */
  total?: number;
  /** Trailing label after the count, e.g. "going". Omit to hide the label. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NyuchiAvatarStack({
  people,
  max = 4,
  total,
  label = "going",
  size = "md",
  className,
}: NyuchiAvatarStackProps) {
  const shown = people.slice(0, max);
  const count = total ?? people.length;
  const overflow = count - shown.length;
  const summary = label ? `${count} ${label}` : `${count}`;
  const avatarSize = size === "sm" ? "size-6 text-[10px]" : "size-8 text-[11px]";
  const bubble = cn(
    "inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card",
    avatarSize,
  );

  return (
    <div
      data-slot="nyuchi-avatar-stack"
      role="group"
      aria-label={summary}
      className={cn("flex items-center gap-2", className)}
    >
      <div className="flex -space-x-2" aria-hidden>
        {shown.map((person, i) =>
          person.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={person.src}
              alt=""
              className={cn("rounded-full object-cover ring-2 ring-card", avatarSize)}
            />
          ) : (
            <span key={i} className={bubble}>
              {initials(person.name)}
            </span>
          ),
        )}
        {overflow > 0 && <span className={bubble}>+{overflow}</span>}
      </div>
      {label && (
        <span className="text-[13px] text-muted-foreground" aria-hidden>
          {summary}
        </span>
      )}
    </div>
  );
}

export { NyuchiAvatarStack };
export type { NyuchiAvatarStackProps, AvatarPerson };
