/**
 * Free-plan usage caps — a stopgap ahead of real billing.
 *
 * Nhimbe has two cost centers that scale directly with a real per-use bill
 * (Resend email sends on host blasts, Cloudflare AI Gateway calls on the
 * description wizard) and, until now, no limit on either. This tracks a
 * simple daily per-subject counter in `system.usageCounters` (nhimbe-owned
 * config, not a shared Mukoko substrate) and throws a friendly
 * `UsageLimitExceededError` once the free-tier limit for the day is hit.
 *
 * Deliberately NOT a billing system: there is no "Pro" plan to check against
 * yet, so every caller is on the free limit. The check happens BEFORE the
 * counter increments, so a denied attempt never burns quota — only actually
 * completed actions count.
 */

import "server-only";
import { getCollection, DB } from "./databases";
import { WRITE_SCHEMA_VERSION } from "./ids";
import type { BaseDoc } from "./types";

export type UsageCounterType = "aiGeneration" | "blast";

interface UsageCounterDoc extends BaseDoc {
  subjectId: string;
  counterType: UsageCounterType;
  /** UTC calendar day the counter resets on, e.g. "2026-08-05". */
  dayKey: string;
  count: number;
}

const usageCountersCollection = () => getCollection<UsageCounterDoc>(DB.system, "usageCounters");

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export class UsageLimitExceededError extends Error {
  constructor(
    public readonly counterType: UsageCounterType,
    public readonly limit: number,
  ) {
    super(
      `You've reached today's free-plan limit (${limit}) for this feature. Upgrade to Pro for unlimited access.`,
    );
    this.name = "UsageLimitExceededError";
  }
}

/**
 * Check-then-increment a daily per-subject counter. Returns the count after
 * this call when under the limit; throws {@link UsageLimitExceededError}
 * (without incrementing) once the subject has hit `limit` uses today. A
 * `limit <= 0` disables the cap entirely (unlimited) — the escape hatch a
 * future Pro-plan check can use without touching call sites.
 */
export async function consumeDailyUsage(params: {
  subjectId: string;
  counterType: UsageCounterType;
  limit: number;
}): Promise<number> {
  if (params.limit <= 0) return 0;

  const dayKey = todayKey();
  const id = `${params.counterType}:${params.subjectId}:${dayKey}`;
  const col = await usageCountersCollection();

  const existing = await col.findOne({ _id: id });
  const current = existing?.count ?? 0;
  if (current >= params.limit) {
    throw new UsageLimitExceededError(params.counterType, params.limit);
  }

  const now = new Date();
  const updated = await col.findOneAndUpdate(
    { _id: id },
    {
      $inc: { count: 1 },
      $set: { updatedAt: now },
      $setOnInsert: {
        _id: id,
        _schemaVersion: WRITE_SCHEMA_VERSION,
        subjectId: params.subjectId,
        counterType: params.counterType,
        dayKey,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  return updated?.count ?? current + 1;
}
