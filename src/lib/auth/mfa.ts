/**
 * Shared helper for the self-hosted MFA (TOTP) step-up flow.
 *
 * WorkOS's headless User Management API signals "MFA required" by having
 * `authenticateWithPassword` / `authenticateWithMagicAuth` **throw** an
 * `AuthenticationException`. That exception is a plain `Error` subclass carrying:
 *   - `code`                       → "mfa_challenge" when a factor must be verified
 *   - `pendingAuthenticationToken` → short-lived, single-use token for the next step
 *   - `rawData.authentication_challenge_id` → the challenge id `authenticateWithTotp` needs
 *
 * We narrow the thrown `unknown` structurally (rather than `instanceof`) so the
 * routes stay decoupled from the SDK's class export.
 */

export type MfaChallenge = {
  pendingAuthenticationToken: string;
  challengeId?: string;
};

/**
 * Returns the pending challenge details when `err` is WorkOS's "MFA required"
 * signal, or `null` for any other failure (genuine bad credentials, network
 * errors, …) so callers keep their existing error handling untouched.
 */
export function mfaChallengeFromError(err: unknown): MfaChallenge | null {
  if (typeof err !== "object" || err === null) return null;

  const e = err as {
    code?: unknown;
    pendingAuthenticationToken?: unknown;
    rawData?: unknown;
  };

  // Only "mfa_challenge" is a step-up we can complete with a TOTP code. Other
  // codes (e.g. "mfa_enrollment") mean the user has no factor yet — not our
  // step-up path — so we leave them to the caller's normal error handling.
  if (e.code !== "mfa_challenge") return null;

  const token =
    typeof e.pendingAuthenticationToken === "string" ? e.pendingAuthenticationToken : null;
  if (!token) return null;

  let challengeId: string | undefined;
  if (typeof e.rawData === "object" && e.rawData !== null) {
    const raw = e.rawData as Record<string, unknown>;
    if (typeof raw.authentication_challenge_id === "string") {
      challengeId = raw.authentication_challenge_id;
    }
  }

  return { pendingAuthenticationToken: token, challengeId };
}
