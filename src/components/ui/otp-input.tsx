"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  /** Current value — a compact string of up to `length` digits, no gaps. */
  value: string;
  /** Called with the new digit string on every change. */
  onChange: (value: string) => void;
  /** Called once on the keystroke/paste that fills the field to `length`. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Accessible label for the group (e.g. "One-time code"). */
  ariaLabel?: string;
  className?: string;
}

/**
 * Segmented one-time-code input — `length` square boxes, one digit each.
 *
 * The value is a compact digit string with no interior gaps. Entry is kept
 * sequential: focusing a box past the filled region redirects to the next empty
 * box, typing over a filled box overwrites in place, and backspace removes the
 * trailing digit — so digits never shift or collapse into the wrong slot.
 * Handles paste of a full code and digit-only input. `autoComplete="one-time-code"`
 * on the first box lets iOS/Android offer the SMS/email code.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus,
  ariaLabel = "Verification code",
  className,
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  const digits = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  function focusBox(index: number) {
    const clamped = Math.max(0, Math.min(length - 1, index));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  }

  // Emit the new value, firing onComplete only on the transition INTO a full
  // code (never when editing an already-complete one).
  function commit(next: string) {
    const cleaned = next.replace(/\D/g, "").slice(0, length);
    if (cleaned === value) return;
    const justCompleted = value.length < length && cleaned.length === length;
    onChange(cleaned);
    if (justCompleted) onComplete?.(cleaned);
  }

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, "").slice(-1); // last typed digit wins on overwrite
    if (!char) return;
    // Entry is sequential (focus is redirected below), so index <= value.length:
    // overwrite an existing slot in place, otherwise append at the end.
    const next =
      index < value.length
        ? value.slice(0, index) + char + value.slice(index + 1)
        : (value + char).slice(0, length);
    commit(next);
    focusBox(index + 1);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (index < value.length) {
        // Clear this box (and any trailing) by trimming back to it — no gaps.
        commit(value.slice(0, index));
        focusBox(index);
      } else if (value.length > 0) {
        // On the trailing empty box, delete the previous digit.
        commit(value.slice(0, -1));
        focusBox(value.length - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(Math.min(index + 1, value.length));
    }
  }

  // Keep entry sequential: never let focus land past the next empty box.
  function handleFocus(index: number, el: HTMLInputElement) {
    if (index > value.length) {
      focusBox(value.length);
    } else {
      el.select();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    focusBox(Math.min(pasted.length, length - 1));
    if (pasted.length === length) onComplete?.(pasted);
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex justify-center gap-2", className)}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          maxLength={1}
          value={digit}
          aria-label={`Digit ${i + 1} of ${length}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => handleFocus(i, e.target)}
          onPaste={handlePaste}
          className={cn(
            "h-13 w-11 rounded-[var(--radius-lg)] border border-input bg-transparent text-center text-xl font-semibold text-foreground shadow-xs outline-none transition-[color,box-shadow] dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
