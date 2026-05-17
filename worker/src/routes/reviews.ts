import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { requireRequesterPersonId } from "../auth/identity";
import { supabaseFetch } from "../db/supabase";

export const reviews = new Hono<{ Bindings: Env }>();

reviews.use("*", writeAuth);

// POST /api/reviews/:id/helpful
// Bumps engagement.review.helpful_count via the SECURITY DEFINER function
// so concurrent votes don't lose increments. Returns 404 if the function's
// conditional UPDATE matched no rows (review missing).
//
// Identity is derived from the WorkOS JWT; the request body is ignored.
// (When the underlying review table grows a one-vote-per-person constraint
// we'll thread `requesterPersonId` into the RPC — for now it's a guard that
// the caller is signed in.)
reviews.post("/:id/helpful", async (c) => {
  const reviewId = c.req.param("id");

  const r = await requireRequesterPersonId(c);
  if (typeof r !== "string") return r;

  try {
    const newCount = await supabaseFetch<number | null>(c.env, {
      schema: "engagement",
      path: "rpc/increment_review_helpful_count",
      method: "POST",
      body: { p_review_id: reviewId },
    });

    if (newCount === null) {
      return c.json({ error: "Review not found" }, 404);
    }

    return c.json({ message: "Vote recorded" });
  } catch {
    return c.json({ error: "Failed to record vote" }, 500);
  }
});
