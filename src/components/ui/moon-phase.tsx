/**
 * MoonPhase — small SVG indicator of lunar phase for a given date.
 *
 * Signature visual from the Nhimbe.html design — sub-Saharan gathering
 * traditions often plan by moonlight, so the calendar surfaces phase as
 * an ambient cue (top-right of each day cell + a "Lunar" tag in the
 * month header). 8px is the calendar-cell scale.
 *
 * Algorithm: simple synodic-month approximation against a known new moon.
 * Anchored to 2000-01-06 (Jan 6 2000 ≈ new moon UTC). 29.530588 d cycle.
 * Good enough for "ambient cue" precision; not an ephemeris.
 *
 * Phase buckets:
 *   < 0.03 or > 0.97  →  new (faint outlined disc)
 *   0.03 – 0.22       →  waxing crescent
 *   0.22 – 0.28       →  first quarter
 *   0.28 – 0.47       →  waxing gibbous
 *   0.47 – 0.53       →  full (filled gold disc)
 *   0.53 – 0.72       →  waning gibbous
 *   0.72 – 0.78       →  last quarter
 *   0.78 – 0.97       →  waning crescent
 */

const SYNODIC_DAYS = 29.530588;
const ANCHOR_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC

export function getMoonPhase(date: Date): number {
  const ms = date.getTime() - ANCHOR_NEW_MOON_UTC;
  const days = ms / 86_400_000;
  const fraction = (days % SYNODIC_DAYS) / SYNODIC_DAYS;
  return fraction < 0 ? fraction + 1 : fraction;
}

interface MoonPhaseProps {
  /** Date to render the phase for. */
  date: Date;
  /** Pixel size of the SVG (square). Default 10. */
  size?: number;
  /** Override foreground colour. Default uses --foreground / --nh-accent. */
  className?: string;
}

export function MoonPhase({ date, size = 10, className }: MoonPhaseProps) {
  const phase = getMoonPhase(date);
  const r = size / 2 - 0.5;
  const cx = size / 2;
  const cy = size / 2;
  const label = phaseLabel(phase);
  const fill = "var(--foreground)";
  const dim = "color-mix(in srgb, var(--foreground) 35%, transparent)";
  const fullFill = "var(--nh-accent, var(--foreground))";

  let content: React.ReactNode;
  if (phase < 0.03 || phase > 0.97) {
    // new moon — empty outline
    content = <circle cx={cx} cy={cy} r={r} fill="none" stroke={dim} strokeWidth={0.8} />;
  } else if (phase >= 0.47 && phase <= 0.53) {
    // full moon — filled gold disc
    content = <circle cx={cx} cy={cy} r={r} fill={fullFill} />;
  } else {
    // crescent / quarter / gibbous — half disc + ellipse for lit portion
    const waxing = phase < 0.5;
    const lit = waxing ? 1 - phase * 2 : (phase - 0.5) * 2; // 0..1, terminator x-radius
    const litRx = Math.abs(lit) * r;
    const litFill = waxing ? fill : dim;
    const baseFill = waxing ? dim : fill;
    content = (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={baseFill} />
        <ellipse cx={cx} cy={cy} rx={litRx} ry={r} fill={litFill} />
      </g>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={label}
      role="img"
      className={className}
    >
      {content}
    </svg>
  );
}

function phaseLabel(phase: number): string {
  if (phase < 0.03 || phase > 0.97) return "New moon";
  if (phase < 0.22) return "Waxing crescent";
  if (phase < 0.28) return "First quarter";
  if (phase < 0.47) return "Waxing gibbous";
  if (phase <= 0.53) return "Full moon";
  if (phase < 0.72) return "Waning gibbous";
  if (phase < 0.78) return "Last quarter";
  return "Waning crescent";
}
