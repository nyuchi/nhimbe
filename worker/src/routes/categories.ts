import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { supabaseFetch } from "../db/supabase";
import { writeAuth } from "../middleware/auth";
import { getAuthenticatedUser } from "../auth/workos";
import { badRequest, unauthorized, notFound, conflict } from "../utils/response";

export const categories = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Hardcoded fallback ensures the events form is usable if the categories
// query fails (auth / connectivity). engagement.interest_category is the
// real source of truth on platform-db.
const FALLBACK_CATEGORIES = [
  { id: "tech", name: "Technology", group: "Technology & Innovation", sort_order: 0 },
  { id: "ai-ml", name: "AI & Machine Learning", group: "Technology & Innovation", sort_order: 1 },
  { id: "business", name: "Business", group: "Business & Economy", sort_order: 4 },
  { id: "music", name: "Music", group: "Entertainment & Media", sort_order: 8 },
  { id: "film-tv", name: "Film & TV", group: "Entertainment & Media", sort_order: 9 },
  { id: "football", name: "Football", group: "Sports", sort_order: 12 },
  { id: "fitness", name: "Fitness & Wellness", group: "Sports", sort_order: 14 },
  { id: "culture", name: "Culture & Society", group: "Culture & Society", sort_order: 15 },
  { id: "food", name: "Food & Drink", group: "Culture & Society", sort_order: 17 },
  { id: "education", name: "Education", group: "Education & Knowledge", sort_order: 22 },
  { id: "art", name: "Art", group: "Creative Arts", sort_order: 28 },
  { id: "comedy", name: "Comedy", group: "Creative Arts", sort_order: 30 },
];

interface InterestCategoryRow {
  id: string;
  name: string;
  group_name: string | null;
  sort_order: number | null;
}

// GET /api/categories — engagement.interest_category with hardcoded fallback.
//
// On error we log a structured entry that includes the full Supabase error
// message, request id, and which env piece (URL / secret) is missing — this
// is the exact diagnostic data we lacked when "Failed to load categories"
// surfaced in production without ever telling us *why* (turned out to be a
// missing SUPABASE_SECRET_KEY env var that was the OLD SUPABASE_SERVICE_ROLE_KEY name).
categories.get("/categories", async (c) => {
  try {
    const rows = await supabaseFetch<InterestCategoryRow[]>(c.env, {
      schema: "engagement",
      path: "interest_category",
      query: "select=id,name,group_name,sort_order&is_active=eq.true&order=sort_order.asc,name.asc",
    });
    return c.json({
      categories: (rows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        group: r.group_name,
        sort_order: r.sort_order ?? 0,
      })),
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      module: "categories",
      message: "Failed to load categories from Supabase, returning fallback",
      error: err instanceof Error ? err.message : String(err),
      error_name: err instanceof Error ? err.name : undefined,
      // Surface env-state checks so a missing-env vs. transient-network vs.
      // RLS-block can be told apart at a glance.
      supabase_url_set: !!c.env.SUPABASE_URL,
      supabase_secret_key_set: !!c.env.SUPABASE_SECRET_KEY,
      request_id: c.get("requestId"),
    }));
    return c.json({ categories: FALLBACK_CATEGORIES });
  }
});

interface PlacesGeoRow {
  name: string;
  country_id: string;
}
interface CountryRow {
  id: string;
  name: string;
}

// GET /api/cities — places.places_geo joined to countries for the country label.
categories.get("/cities", async (c) => {
  try {
    const [places, countries] = await Promise.all([
      supabaseFetch<PlacesGeoRow[]>(c.env, {
        schema: "places",
        path: "places_geo",
        query: "select=name,country_id&order=country_id.asc,name.asc",
      }),
      supabaseFetch<CountryRow[]>(c.env, {
        schema: "places",
        path: "countries",
        query: "select=id,name",
      }),
    ]);
    const countryById = new Map((countries ?? []).map((c) => [c.id, c.name]));
    const cities = (places ?? []).map((p) => ({
      addressLocality: p.name,
      addressCountry: countryById.get(p.country_id) ?? null,
    }));
    return c.json({ cities });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      module: "cities",
      message: "Failed to load cities from Supabase",
      error: err instanceof Error ? err.message : String(err),
      error_name: err instanceof Error ? err.name : undefined,
      supabase_url_set: !!c.env.SUPABASE_URL,
      supabase_secret_key_set: !!c.env.SUPABASE_SECRET_KEY,
      request_id: c.get("requestId"),
    }));
    return c.json({ cities: [] });
  }
});

// ─── Event types (formats) ────────────────────────────────────────────────
// engagement.interest_category covers the *topic* axis (Music / Football /
// Tech / Spirituality). Events also need a *format* axis — Workshop /
// Festival / Hackathon — which is held by the schema.org event-type enum on
// events.event.eventtype. There is no separate catalogue table in the DB;
// the CHECK constraint on the column is the source of truth. We mirror it
// here as a static list with friendly labels + groups + a synopsis of what
// each format implies, so the wizard's "what kind of event" picker can
// render without a Supabase round-trip.
//
// Keep this list in lockstep with the platform-db CHECK constraint
// `event_eventtype_check` (verified via Supabase MCP). When a new type is
// added there, mirror it here so the picker reflects it.

interface EventTypeRow {
  /** Exact value stored in events.event.eventtype (schema.org @type) */
  id: string;
  /** Display label for the picker */
  name: string;
  /** Loose grouping for sectioning the picker */
  group: string;
  /** One-line description shown under the option */
  description: string;
}

const EVENT_TYPES: EventTypeRow[] = [
  // Catch-all
  { id: "Event",            name: "General gathering",  group: "General",        description: "Any community gathering that doesn't fit a more specific kind." },
  { id: "SocialEvent",      name: "Social",             group: "General",        description: "Meetups, parties, networking, get-togethers." },
  // Culture & arts
  { id: "MusicEvent",       name: "Music",              group: "Culture & Arts", description: "Concerts, gigs, live performances, listening sessions." },
  { id: "TheaterEvent",     name: "Theater",            group: "Culture & Arts", description: "Plays, performance art, staged readings." },
  { id: "DanceEvent",       name: "Dance",              group: "Culture & Arts", description: "Dance performances, classes, social dances." },
  { id: "ComedyEvent",      name: "Comedy",             group: "Culture & Arts", description: "Stand-up, improv, comedy nights." },
  { id: "VisualArtsEvent",  name: "Visual arts",        group: "Culture & Arts", description: "Painting, sculpture, installation showings." },
  { id: "ExhibitionEvent",  name: "Exhibition",         group: "Culture & Arts", description: "Galleries, museum openings, curated shows." },
  { id: "ScreeningEvent",   name: "Film screening",     group: "Culture & Arts", description: "Cinema, film festivals, watch parties." },
  { id: "LiteraryEvent",    name: "Literary",           group: "Culture & Arts", description: "Book launches, readings, poetry slams." },
  { id: "Festival",         name: "Festival",           group: "Culture & Arts", description: "Multi-day, multi-stage, multi-format celebrations." },
  // Knowledge
  { id: "EducationEvent",   name: "Education",          group: "Knowledge",      description: "Talks, lectures, panels, learning sessions." },
  { id: "CourseInstance",   name: "Course / class",     group: "Knowledge",      description: "Workshops, structured classes, training sessions." },
  { id: "Hackathon",        name: "Hackathon",          group: "Knowledge",      description: "Build sprints, jams, fix-it events." },
  // Sports & active
  { id: "SportsEvent",      name: "Sports",             group: "Sports",         description: "Tournaments, matches, races, outdoor activities." },
  // Family
  { id: "ChildrensEvent",   name: "Children's",         group: "Family",         description: "Family-friendly events designed for kids." },
  // Food & retail
  { id: "FoodEvent",        name: "Food & drink",       group: "Food & Retail",  description: "Tastings, dinners, food festivals, pop-ups." },
  { id: "SaleEvent",        name: "Sale / market",      group: "Food & Retail",  description: "Markets, craft fairs, sample sales." },
  { id: "DeliveryEvent",    name: "Delivery / drop",    group: "Food & Retail",  description: "Scheduled drop-offs, drop-ins, kits." },
  // Business
  { id: "BusinessEvent",    name: "Business",           group: "Business",       description: "Conferences, summits, networking mixers." },
  // Publishing
  { id: "PublicationEvent", name: "Publication",        group: "Media",          description: "Launches, releases, premieres." },
];

interface FrontendEventType {
  id: string;
  name: string;
  group: string;
  description: string;
}

// GET /api/event-types — static schema.org event-type catalogue (mirror of
// the events.event.eventtype CHECK constraint). 21 entries grouped into
// 7 sections. Doesn't touch Supabase — no env requirements.
categories.get("/event-types", (c) => {
  const types: FrontendEventType[] = EVENT_TYPES.map((t) => ({
    id: t.id,
    name: t.name,
    group: t.group,
    description: t.description,
  }));
  return c.json({ eventTypes: types });
});

// ─── Event categories (community-driven L2 catalogue) ────────────────────
// engagement.interest_category (40 frozen rows) is the L1 "topic" axis. Each
// event also links to one or more rows in events.event_category, an L2
// catalogue that hosts can extend organically — "Sungura music", "Mbira
// listening session", "Afrobeats night", etc. The trust model is:
//   - Anyone authenticated can propose. Admins/superadmins/moderators (per
//     identity.person.role) and members of a verified organisation get
//     auto-approved by an INSERT trigger; everyone else lands in 'community'.
//   - Community rows auto-promote to 'established' once trust signals stack
//     up (3+ vouches OR 5+ uses across 3+ distinct hosts).
//   - Open flags ≥ 5 auto-hide a community row pending human moderation.
// All trust logic lives in the DB triggers; the worker just maps WorkOS →
// identity.person.id and forwards the write.

// Map a WorkOS user_id (from the JWT) to identity.person.id. Returns null
// when no row exists or the account is soft-deleted. supabaseFetch uses the
// service-role key, so this bypasses RLS — safe for trusted lookups.
async function resolvePersonId(
  env: Env,
  workosUserId: string,
): Promise<string | null> {
  const rows = await supabaseFetch<{ id: string }[]>(env, {
    schema: "identity",
    path: "person",
    query: `workos_user_id=eq.${encodeURIComponent(workosUserId)}&deleted_at=is.null&select=id&limit=1`,
  });
  return rows?.[0]?.id ?? null;
}

interface EventCategoryRow {
  id: string;
  name: string;
  code_value: string | null;
  parent_id: string | null;
  interest_category_id: string | null;
  description: string | null;
  status: string;
  usage_count: number;
  distinct_hosts_count: number;
  vouch_count: number;
  flag_count: number;
  is_active: boolean;
  country_id: string | null;
}

interface FrontendEventCategory {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  interestCategoryId: string | null;
  description: string | null;
  status: string;
  usageCount: number;
  vouchCount: number;
}

// GET /api/event-categories — list visible (active + community/established)
// rows. Optional ?interest=<uuid> narrows to one L1 bucket; ?q=<text> does
// a prefix match on name (PostgREST `ilike`).
categories.get("/event-categories", async (c) => {
  const interest = c.req.query("interest");
  const q = c.req.query("q");

  const filters = [
    "is_active=eq.true",
    "status=in.(community,established)",
  ];
  if (interest) {
    filters.push(`interest_category_id=eq.${encodeURIComponent(interest)}`);
  }
  if (q && q.length >= 2) {
    filters.push(`name=ilike.${encodeURIComponent(q + "%")}`);
  }

  try {
    const rows = await supabaseFetch<EventCategoryRow[]>(c.env, {
      schema: "events",
      path: "event_category",
      query: [
        "select=id,name,code_value,parent_id,interest_category_id,description,status,usage_count,distinct_hosts_count,vouch_count,flag_count,is_active,country_id",
        ...filters,
        // Established first, then by usage so the most-used community rows
        // float to the top of the dropdown.
        "order=status.asc,usage_count.desc,name.asc",
        "limit=500",
      ].join("&"),
    });

    const eventCategories: FrontendEventCategory[] = (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code_value,
      parentId: r.parent_id,
      interestCategoryId: r.interest_category_id,
      description: r.description,
      status: r.status,
      usageCount: r.usage_count,
      vouchCount: r.vouch_count,
    }));
    return c.json({ eventCategories });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      module: "event_categories",
      message: "Failed to list event_category rows",
      error: err instanceof Error ? err.message : String(err),
      request_id: c.get("requestId"),
    }));
    return c.json({ eventCategories: [] });
  }
});

// All write routes share the same origin/API-key guard as the rest of the
// worker. writeAuth is a no-op on GET so the public listing endpoint passes
// through unchanged. Auth (WorkOS JWT) is also required and is resolved
// per-handler so the propose flow can map WorkOS → identity.person.id
// before insert. The "*" matches both /event-categories and sub-paths.
categories.use("/event-categories", writeAuth);
categories.use("/event-categories/*", writeAuth);

interface ProposeBody {
  name?: string;
  description?: string;
  interestCategoryId?: string | null;
  parentId?: string | null;
  countryId?: string | null;
}

// POST /api/event-categories — propose a new category. The auto-approve
// trigger inspects identity.person.role for created_by and bumps the row to
// 'established' for admins/superadmins/moderators (and verified-org members).
// Everyone else's proposal lands as 'community' and earns its way to
// 'established' via vouches and usage.
categories.post("/event-categories", async (c) => {
  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    return unauthorized(c);
  }

  let body: ProposeBody;
  try {
    body = (await c.req.json()) as ProposeBody;
  } catch {
    return badRequest(c, "Invalid JSON body");
  }

  const name = (body.name ?? "").trim();
  if (name.length < 2 || name.length > 80) {
    return badRequest(c, "name must be 2–80 characters");
  }

  const personId = await resolvePersonId(c.env, authResult.user.userId);
  if (!personId) {
    // The JWT was valid but no identity.person row exists yet — the user
    // hasn't completed onboarding. Surface a clear 401 instead of letting
    // the FK constraint reject the insert with a 5xx.
    return unauthorized(c, "onboarded user");
  }

  // Duplicate guard: case-insensitive name match in the same interest bucket
  // (or globally if no bucket given). Returns 409 with the existing row so
  // the wizard can offer "did you mean…?" instead of creating a near-dupe.
  const dupFilters = [
    `name=ilike.${encodeURIComponent(name)}`,
    "is_active=eq.true",
  ];
  if (body.interestCategoryId) {
    dupFilters.push(`interest_category_id=eq.${encodeURIComponent(body.interestCategoryId)}`);
  }
  const existing = await supabaseFetch<{ id: string; name: string; status: string }[]>(c.env, {
    schema: "events",
    path: "event_category",
    query: `select=id,name,status&${dupFilters.join("&")}&limit=1`,
  });
  if (existing && existing.length > 0) {
    return conflict(c, "A category with that name already exists", { match: existing[0] });
  }

  interface InsertedRow {
    id: string;
    name: string;
    status: string;
    interest_category_id: string | null;
    parent_id: string | null;
  }
  let inserted: InsertedRow[] | null = null;
  try {
    inserted = await supabaseFetch<InsertedRow[]>(c.env, {
      schema: "events",
      path: "event_category",
      method: "POST",
      body: {
        name,
        description: body.description?.trim() || null,
        interest_category_id: body.interestCategoryId ?? null,
        parent_id: body.parentId ?? null,
        country_id: body.countryId ?? null,
        created_by: personId,
        // status is set by the BEFORE-INSERT trigger; passing nothing keeps
        // the column DEFAULT 'community' for non-privileged proposers.
      },
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      module: "event_categories",
      message: "Failed to insert event_category",
      error: err instanceof Error ? err.message : String(err),
      request_id: c.get("requestId"),
    }));
    return c.json({ error: "Failed to create category" }, 500);
  }

  const row = inserted?.[0];
  if (!row) {
    return c.json({ error: "Insert returned no row" }, 500);
  }
  return c.json(
    {
      id: row.id,
      name: row.name,
      status: row.status,
      interestCategoryId: row.interest_category_id,
      parentId: row.parent_id,
    },
    201,
  );
});

// POST /api/event-categories/:id/vouch — endorse a community-status category.
// One vouch per (category, person) — repeats return 409. Three distinct
// vouches trips auto-promotion to 'established' via DB trigger.
categories.post("/event-categories/:id/vouch", async (c) => {
  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    return unauthorized(c);
  }

  const categoryId = c.req.param("id");
  const personId = await resolvePersonId(c.env, authResult.user.userId);
  if (!personId) {
    return unauthorized(c, "onboarded user");
  }

  // Confirm the category exists and is visible before recording the vouch.
  const cat = await supabaseFetch<{ id: string; status: string }>(c.env, {
    schema: "events",
    path: "event_category",
    query: `id=eq.${encodeURIComponent(categoryId)}&select=id,status`,
    single: true,
  });
  if (!cat) {
    return notFound(c, "Category");
  }

  let body: { note?: string } = {};
  try {
    body = (await c.req.json()) as { note?: string };
  } catch {
    // Empty body is fine — vouch is the signal, note is optional.
  }

  try {
    await supabaseFetch(c.env, {
      schema: "events",
      path: "event_category_vouch",
      method: "POST",
      body: {
        category_id: categoryId,
        person_id: personId,
        note: body.note?.trim() || null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // PostgREST surfaces unique violations as 409 in the response body. The
    // wrapped Error contains "(409)" — translate to a clean conflict.
    if (msg.includes("(409)") || msg.includes("duplicate")) {
      return conflict(c, "Already vouched for this category");
    }
    console.error(JSON.stringify({
      level: "error",
      module: "event_categories",
      message: "Failed to insert vouch",
      error: msg,
      request_id: c.get("requestId"),
    }));
    return c.json({ error: "Failed to record vouch" }, 500);
  }

  return c.json({ message: "Vouch recorded" }, 201);
});

interface FlagBody {
  reason?: string;
  note?: string;
}

const FLAG_REASONS = ["duplicate", "spam", "offensive", "miscategorised", "other"] as const;

// POST /api/event-categories/:id/flag — report a category. Five open flags
// (distinct persons × reasons) trips auto-hide of a community-status row.
categories.post("/event-categories/:id/flag", async (c) => {
  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    return unauthorized(c);
  }

  const categoryId = c.req.param("id");
  const personId = await resolvePersonId(c.env, authResult.user.userId);
  if (!personId) {
    return unauthorized(c, "onboarded user");
  }

  let body: FlagBody;
  try {
    body = (await c.req.json()) as FlagBody;
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  const reason = (body.reason ?? "").trim() as (typeof FLAG_REASONS)[number];
  if (!FLAG_REASONS.includes(reason)) {
    return badRequest(c, `reason must be one of: ${FLAG_REASONS.join(", ")}`);
  }

  const cat = await supabaseFetch<{ id: string }>(c.env, {
    schema: "events",
    path: "event_category",
    query: `id=eq.${encodeURIComponent(categoryId)}&select=id`,
    single: true,
  });
  if (!cat) {
    return notFound(c, "Category");
  }

  try {
    await supabaseFetch(c.env, {
      schema: "events",
      path: "event_category_flag",
      method: "POST",
      body: {
        category_id: categoryId,
        person_id: personId,
        reason,
        note: body.note?.trim() || null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("(409)") || msg.includes("duplicate")) {
      return conflict(c, "Already flagged this category with that reason");
    }
    console.error(JSON.stringify({
      level: "error",
      module: "event_categories",
      message: "Failed to insert flag",
      error: msg,
      request_id: c.get("requestId"),
    }));
    return c.json({ error: "Failed to record flag" }, 500);
  }

  return c.json({ message: "Flag recorded" }, 201);
});
