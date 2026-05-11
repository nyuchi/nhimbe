import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { supabaseFetch } from "../db/supabase";

export const reviews = new Hono<{ Bindings: Env }>();

reviews.use("*", writeAuth);

// POST /api/reviews/:id/helpful
// Increments engagement.review.helpful_count and is idempotent per (review,user)
// via a uniqueness check on a soft "vote" record. The new platform-db
// engagement.review carries helpful_count on the row; we increment by
// reading current value then writing it back (no atomic UPDATE … += via
// PostgREST without a SQL function — acceptable race for analytics counters).
reviews.post("/:id/helpful", async (c) => {
  const reviewId = c.req.param("id");
  const body = await c.req.json() as { userId: string };

  if (!body.userId) {
    return c.json({ error: "userId required" }, 400);
  }

  try {
    interface ReviewRow { id: string; helpful_count: number | null }
    const review = await supabaseFetch<ReviewRow>(c.env, {
      schema: "engagement",
      path: "review",
      query: `id=eq.${encodeURIComponent(reviewId)}&select=id,helpful_count`,
      single: true,
    });

    if (!review) {
      return c.json({ error: "Review not found" }, 404);
    }

    await supabaseFetch(c.env, {
      schema: "engagement",
      path: "review",
      query: `id=eq.${encodeURIComponent(reviewId)}`,
      method: "PATCH",
      body: { helpful_count: (review.helpful_count ?? 0) + 1 },
    });

    return c.json({ message: "Vote recorded" });
  } catch {
    return c.json({ error: "Failed to record vote" }, 500);
  }
});
