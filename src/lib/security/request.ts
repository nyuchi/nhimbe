/**
 * Request-hardening helpers for the same-origin API route handlers
 * (`src/app/api/**`).
 *
 * These are small, dependency-free primitives that make the boundary between
 * untrusted client input and our MongoDB layer explicit:
 *
 *   - `parseBoundedInt`  — parse a query-string number, rejecting NaN/±Infinity
 *                          and clamping to a safe range (stops `?limit=abc`
 *                          reaching the driver as `.limit(NaN)` and stops a
 *                          hostile `?limit=999999999` from scanning a whole
 *                          collection).
 *   - `readJsonBody`     — read a JSON request body behind a byte cap so an
 *                          unbounded payload can't exhaust the function's
 *                          memory, returning a typed result instead of throwing.
 *   - `clampString` /
 *     `clampStringArray` — bound the size/shape of string and string-array
 *                          fields before they are persisted.
 *
 * Everything here is pure and framework-agnostic (`Request` is the WHATWG
 * global), which keeps it unit-testable without a running server.
 */

/** Parse a query-string integer, clamped to `[min, max]`, with a fallback. */
export function parseBoundedInt(
  raw: string | null | undefined,
  opts: { min: number; max: number; fallback: number },
): number {
  if (raw == null) return opts.fallback;
  const trimmed = raw.trim();
  if (trimmed === "") return opts.fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return opts.fallback;
  return Math.min(Math.max(Math.trunc(n), opts.min), opts.max);
}

export type JsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/** Default JSON body cap for the API routes: generous for events, far below
 *  anything that could pressure the serverless function's memory. */
export const DEFAULT_JSON_BODY_LIMIT = 64 * 1024; // 64 KiB

/**
 * Read and parse a JSON request body behind a byte cap.
 *
 * Rejects (without parsing) when the declared `Content-Length` already
 * exceeds the cap, and again after reading in case the header was absent or
 * lied. Returns a discriminated result so callers translate failures into the
 * right HTTP status without a try/catch of their own.
 */
export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT,
): Promise<JsonBodyResult<T>> {
  const declared = request.headers.get("content-length");
  if (declared != null) {
    const len = Number(declared);
    if (Number.isFinite(len) && len > maxBytes) {
      return { ok: false, status: 413, error: "Request body too large." };
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Could not read request body." };
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large." };
  }
  if (text.trim() === "") {
    return { ok: false, status: 400, error: "Request body must be JSON." };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid JSON." };
  }
}

/** Coerce to a string and cap its length; non-strings collapse to "". */
export function clampString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Keep only strings from an array input, cap the number of items and the
 * length of each. Non-arrays collapse to `[]`.
 */
export function clampStringArray(
  value: unknown,
  opts: { maxItems: number; maxItemLength: number },
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    out.push(item.length > opts.maxItemLength ? item.slice(0, opts.maxItemLength) : item);
    if (out.length >= opts.maxItems) break;
  }
  return out;
}
