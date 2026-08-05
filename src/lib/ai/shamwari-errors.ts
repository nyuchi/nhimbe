/**
 * Thrown by the Shamwari server actions when the caller isn't on Mukoko Pro.
 * Kept out of `src/app/actions/ai.ts` because a "use server" module may only
 * export async functions — a class export there breaks Next's server-action
 * transform for the whole file.
 */
export class ShamwariProRequiredError extends Error {
  constructor() {
    super("Shamwari AI is a Mukoko Pro feature. Upgrade to Mukoko Pro to generate and rewrite descriptions.");
    this.name = "ShamwariProRequiredError";
  }
}
