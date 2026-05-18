/**
 * Tracked links — short URL redirect with click analytics.
 *
 * Backed by engagement.tracked_link + engagement.link_click on platform-db.
 * Cross-schema via context_* edges (every tracked link knows what entity it
 * redirects on behalf of — events.event for nhimbe, places.places for the
 * places app, etc.).
 *
 * POST /api/links — create a tracked link
 * GET  /api/links/:code — redirect + record click
 * GET  /api/links/event/:eventId — list tracked links for an event
 */
import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { generateShortCode } from "../utils/ids";
import { writeAuth } from "../middleware/auth";
import { requireRequesterPersonId } from "../auth/identity";
import { supabaseFetch } from "../db/supabase";

const links = new Hono<{ Bindings: Env; Variables: AppVariables }>();
links.use("*", writeAuth);

// POST /api/links — create a tracked link. Requires a valid JWT;
// created_by is derived from the requester's person id.
links.post("/", async (c) => {
  const body = await c.req.json<{
    targetUrl: string;
    eventId: string;
    linkType: string;
  }>();

  if (!body.targetUrl || !body.eventId || !body.linkType) {
    return c.json({ error: "targetUrl, eventId, and linkType are required" }, 400);
  }
  try { new URL(body.targetUrl); } catch { return c.json({ error: "Invalid target URL" }, 400); }

  const r = await requireRequesterPersonId(c);
  if (typeof r !== "string") return r;
  const createdBy = r;

  // Idempotent: existing (event,url,type) tuple wins.
  const existing = await supabaseFetch<{ code: string }>(c.env, {
    schema: "engagement",
    path: "tracked_link",
    query: `context_entity_id=eq.${encodeURIComponent(body.eventId)}&target_url=eq.${encodeURIComponent(body.targetUrl)}&link_type=eq.${encodeURIComponent(body.linkType)}&select=code&limit=1`,
    single: true,
  });
  if (existing) {
    return c.json({ code: existing.code, url: `/r/${existing.code}` });
  }

  const code = generateShortCode();
  await supabaseFetch(c.env, {
    schema: "engagement",
    path: "tracked_link",
    method: "POST",
    body: {
      code,
      target_url: body.targetUrl,
      link_type: body.linkType,
      context_schema: "events",
      context_entity_type: "events.event",
      context_entity_id: body.eventId,
      created_by: createdBy,
    },
  });

  return c.json({ code, url: `/r/${code}` }, 201);
});

links.get("/:code", async (c) => {
  const code = c.req.param("code");

  interface LinkRow { id: string; target_url: string; context_entity_id: string | null }
  const link = await supabaseFetch<LinkRow>(c.env, {
    schema: "engagement",
    path: "tracked_link",
    query: `code=eq.${encodeURIComponent(code)}&select=id,target_url,context_entity_id`,
    single: true,
  });
  if (!link) {
    return c.json({ error: "Link not found" }, 404);
  }

  c.executionCtx.waitUntil(
    (async () => {
      try {
        const userAgent = c.req.header("user-agent") || "";
        const referrer = c.req.header("referer") || "";
        // Atomic increment via SECURITY DEFINER function — concurrent clicks
        // don't lose increments to the read-modify-write race.
        await Promise.all([
          supabaseFetch(c.env, {
            schema: "engagement",
            path: "link_click",
            method: "POST",
            body: {
              link_id: link.id,
              context_entity_id: link.context_entity_id,
              referrer_url: referrer,
              user_agent: userAgent,
            },
          }),
          supabaseFetch(c.env, {
            schema: "engagement",
            path: "rpc/increment_link_clicks",
            method: "POST",
            body: { p_link_id: link.id },
          }),
        ]);
      } catch (err) {
        console.error("[mukoko] link click tracking failed:", err);
      }
    })(),
  );

  return c.redirect(link.target_url, 302);
});

links.get("/event/:eventId", async (c) => {
  const eventId = c.req.param("eventId");

  interface LinkRow {
    code: string;
    target_url: string;
    link_type: string;
    click_count: number | null;
    created_at: string | null;
  }
  const rows = await supabaseFetch<LinkRow[]>(c.env, {
    schema: "engagement",
    path: "tracked_link",
    query: `context_entity_id=eq.${encodeURIComponent(eventId)}&select=code,target_url,link_type,click_count,created_at&order=created_at.desc`,
  }) ?? [];

  return c.json({ links: rows });
});

export { links };
