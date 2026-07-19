import "server-only";

import { personsCollection } from "@/lib/mongo/databases";
import { verifyBearer } from "@/lib/auth/workos-token";
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
  return person;
}
