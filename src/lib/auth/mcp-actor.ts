import "server-only";

import { personsCollection } from "@/lib/mongo/databases";
import { verifyBearer } from "@/lib/auth/workos-token";
import { consumeDailyUsage, UsageLimitExceededError } from "@/lib/mongo/usage-limits";
import { getPlatformSettings } from "@/lib/mongo/settings";
import { getMukokoPlan } from "@/lib/mongo/entitlements";
import type { PersonDoc } from "@/lib/mongo/types";

/**
 * Resolve the acting `identity.persons` doc for a bearer-authenticated request
 * (the nhimbe MCP write endpoints). Throws `ActorError` with an HTTP status so
 * the route handler can map it to a clean JSON response.
 *
 * Unlike the cookie-session path, a bearer WorkOS access token carries only the
 * user id (`sub`) — not their email — so we can't lazily create a fresh person
 * here. The caller must have signed into nhimbe at least once (which mirrors
 * their WorkOS profile into `identity.persons`). If no person exists yet we ask
 * them to do that, rather than guessing an identity.
 */
export class ActorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ActorError";
  }
}

export async function resolveActorFromBearer(authorization: string | null): Promise<PersonDoc> {
  let verified;
  try {
    verified = await verifyBearer(authorization);
  } catch {
    throw new ActorError("Your session token is invalid or has expired. Sign in again.", 401);
  }
  if (!verified) {
    throw new ActorError("Authentication required. Present a WorkOS bearer token.", 401);
  }

  const persons = await personsCollection();
  const person = await persons.findOne({ workosUserId: verified.workosUserId });
  if (!person) {
    throw new ActorError(
      "Sign in to Nhimbe once to set up your profile before hosting via the MCP.",
      403,
    );
  }

  await enforceApiRateLimit(person);
  return person;
}

/**
 * Tiered metering for the bearer-authenticated write surface (the Mukoko
 * Events MCP's create/update tools), mirroring the Claude API / Google Maps
 * Platform shape: free and pro both carry a real daily ceiling — pro is
 * materially higher, never unlimited — and custom (usage-based billing,
 * metered/invoiced outside this repo) isn't capped here at all. Once past
 * the ceiling the caller gets a 429, never a silent/permanent block.
 */
async function enforceApiRateLimit(person: PersonDoc): Promise<void> {
  const plan = getMukokoPlan(person);
  if (plan === "custom") return;

  const settings = await getPlatformSettings();
  const limit = plan === "pro" ? settings.proApiWritesPerDayPerCaller : settings.freeApiWritesPerDayPerCaller;
  try {
    await consumeDailyUsage({
      subjectId: person._id,
      counterType: "apiWrite",
      limit,
    });
  } catch (err) {
    if (err instanceof UsageLimitExceededError) {
      throw new ActorError(err.message, 429);
    }
    throw err;
  }
}
