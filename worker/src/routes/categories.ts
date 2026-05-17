import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { supabaseFetch } from "../db/supabase";

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
