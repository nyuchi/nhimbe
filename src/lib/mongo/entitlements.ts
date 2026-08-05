/**
 * Mukoko Pro — a cross-app subscription entitlement, NOT a nhimbe-local
 * plan. Mukoko Pro is meant to apply the same way across every Mukoko app
 * (this repo, the admin app, sibling products), so the check reads a single
 * shared flag on the person's `identity.persons` document
 * (`mukoko.proPlan`) rather than anything nhimbe owns or writes itself.
 *
 * There is no billing service setting this flag yet — until one exists,
 * `isMukokoPro` returns `false` for everyone, which is the correct default:
 * a feature gated on Mukoko Pro should stay gated until a real subscription
 * says otherwise, not silently unlock because the field is unset.
 */

import "server-only";
import type { PersonDoc } from "./types";

/** Whether this person currently holds an active Mukoko Pro subscription. */
export function isMukokoPro(person: Pick<PersonDoc, "mukoko">): boolean {
  return person.mukoko?.proPlan === true;
}
