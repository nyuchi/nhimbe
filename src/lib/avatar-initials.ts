/**
 * Initials-from-name for avatar fallbacks — the shared implementation nine
 * components each reimplemented slightly differently (some skipped
 * `.trim()`/`.toUpperCase()`, split on a literal space instead of `/\s+/`,
 * or ordered slice/uppercase differently). One source of truth here.
 */

/** First letters of up to `max` words in `name`, uppercased. Whitespace-safe
 *  (trims, collapses runs of whitespace) and null-safe (returns ""). */
export function getInitials(name: string | null | undefined, max = 2): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
