/**
 * Mukoko Pro — a cross-app subscription entitlement, NOT a nhimbe-local
 * plan. Mukoko Pro is meant to apply the same way across every Mukoko app
 * (this repo, the admin app, sibling products), so the check reads a single
 * shared field on the person's `identity.persons` document (`mukoko.plan`)
 * rather than anything nhimbe owns or writes itself.
 *
 * Three tiers, mirroring how Claude/Anthropic API and Google Maps Platform
 * both structure this: a free tier with a real daily ceiling, a Pro tier
 * that raises the ceiling substantially (never "unlimited" — Luma Plus
 * still caps invite sends at 5,000/week, it just isn't the free 0%), and a
 * custom tier for usage-based billing beyond Pro (that metering/invoicing
 * lives outside this repo; here it just means "don't enforce a daily cap").
 *
 * There is no billing service setting this field yet — until one exists,
 * every person reads as "free", which is the correct default: a feature
 * gated on a paid tier should stay gated until a real subscription says
 * otherwise, not silently unlock because the field is unset.
 */

import "server-only";
import type { PersonDoc } from "./types";

export type MukokoPlan = "free" | "pro" | "custom";

/** The person's current Mukoko subscription tier. Unset/unknown → "free". */
export function getMukokoPlan(person: Pick<PersonDoc, "mukoko">): MukokoPlan {
  const plan = person.mukoko?.plan;
  return plan === "pro" || plan === "custom" ? plan : "free";
}

/** Whether this person holds at least a Mukoko Pro subscription (pro or custom). */
export function isMukokoPro(person: Pick<PersonDoc, "mukoko">): boolean {
  return getMukokoPlan(person) !== "free";
}
