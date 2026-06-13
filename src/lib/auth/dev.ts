import "server-only";

/**
 * Local-only auth bypass for development.
 *
 * When enabled we treat a fixed "Dev User" as the signed-in person so the team
 * can exercise authenticated flows (create event, RSVP, etc.) without going
 * through WorkOS + MFA on every local run.
 *
 * Safety: this is gated on BOTH `NODE_ENV !== "production"` AND an explicit
 * `DEV_AUTH_BYPASS=1` flag. Vercel builds every environment (including Preview)
 * as production, so `NODE_ENV` is "production" there — the bypass is impossible
 * on any deployed environment even if the flag is accidentally set. It only
 * activates under local `next dev`.
 */

export const DEV_WORKOS_ID = "dev-local-bypass";
export const DEV_EMAIL = "dev@nhimbe.local";
export const DEV_NAME = "Dev User";

export function isDevBypass(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";
}
