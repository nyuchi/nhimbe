"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  /** Current value — a string of up to `length` digits. */
  value: string;
  /** Called with the new digit string on every change. */
  onChange: (value: string) => void;
  /** Called once the field fills to `length` digits. */
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
 * Controlled via a single `value` string so callers keep one piece of state.
 * Handles auto-advance, backspace-to-previous, arrow navigation, and pasting a
 * full code into any box. Digits only. `autoComplete="one-time-code"` on the
 * first box lets iOS/Android offer the SMS/email code.
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

  function setValue(next: string) {
    const cleaned = next.replace(/\D/g, "").slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length) onComplete?.(cleaned);
  }

  function focusBox(index: number) {
    const clamped = Math.max(0, Math.min(length - 1, index));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  }

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, "").slice(-1); // last typed digit wins on overwrite
    if (!char) return;
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    arr[index] = char;
    setValue(arr.join(""));
    if (index < length - 1) focusBox(index + 1);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = value.split("").slice(0, length);
      while (arr.length < length) arr.push("");
      if (arr[index]) {
        arr[index] = "";
        setValue(arr.join("").replace(/\s+$/, ""));
      } else if (index > 0) {
        arr[index - 1] = "";
        setValue(arr.join("").replace(/\s+$/, ""));
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    setValue(pasted);
    focusBox(Math.min(pasted.length, length - 1));
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
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
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
