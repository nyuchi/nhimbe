/**
 * Supabase-backed read/write helpers for nhimbe. These talk directly to
 * nyuchi_platform_db (project tdcpuzqyoodrdsxldgsh). Use them in tandem
 * with the existing worker-backed `src/lib/api.ts` — the Cloudflare worker
 * still owns AI inference, R2 image uploads, kiosk pairing, and queues.
 */

import { getSupabaseBrowserClient } from "./client";
import type {
  CircleMembershipRow,
  CirclePostRow,
  CircleRow,
  EntityRow,
  EventInsert,
  EventRow,
  InterestCategoryRow,
  OrganizationRow,
  PersonAddress,
  PersonRow,
  PlaceRow,
} from "./types";

// ─── Identity (replaces D1 worker /api/auth/sync, /me, PATCH /profile) ──
// The frontend talks directly to identity.person. The worker no longer
// owns user state — it only enforces JWT validity for endpoints that
// still need a Cloudflare-side capability (AI, R2, kiosk pairing, queues).

const PERSON_COLUMNS =
  "id, workos_user_id, name, givenname, familyname, alternatename, email, image, bio, description, address, knowsabout, role, onboarding_completed, profile_completed, email_verified, last_login_at, created_at, updated_at";

export async function getPersonByWorkosId(workosUserId: string): Promise<PersonRow | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("identity")
    .from("person")
    .select(PERSON_COLUMNS)
    .eq("workos_user_id", workosUserId)
    .maybeSingle();
  if (error) {
    console.warn("[mukoko] getPersonByWorkosId failed:", error.message);
    return null;
  }
  return (data as PersonRow | null) ?? null;
}

export async function getPersonByEmail(email: string): Promise<PersonRow | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("identity")
    .from("person")
    .select(PERSON_COLUMNS)
    .eq("email", email)
    .maybeSingle();
  if (error) {
    console.warn("[mukoko] getPersonByEmail failed:", error.message);
    return null;
  }
  return (data as PersonRow | null) ?? null;
}

// Upsert the identity.person row for the signed-in WorkOS user. Mirrors the
// /api/auth/sync semantics from the worker but goes Supabase-direct so we
// don't need the D1 round-trip. Returns the canonical row.
export async function upsertPersonFromWorkos(input: {
  workosUserId: string;
  email: string;
  name: string;
  givenname?: string | null;
  familyname?: string | null;
}): Promise<PersonRow | null> {
  const supabase = getSupabaseBrowserClient();

  // Try to find an existing row by workos_user_id, then by email (handles
  // legacy users that were created before WorkOS was wired up).
  let existing = await getPersonByWorkosId(input.workosUserId);
  if (!existing && input.email) {
    existing = await getPersonByEmail(input.email);
  }

  const nowIso = new Date().toISOString();

  if (existing) {
    const updates: Partial<PersonRow> = {
      workos_user_id: input.workosUserId,
      last_login_at: nowIso,
    };
    // Backfill name only when missing — never overwrite a person's edits.
    if (!existing.name && input.name) updates.name = input.name;
    if (!existing.givenname && input.givenname) updates.givenname = input.givenname;
    if (!existing.familyname && input.familyname) updates.familyname = input.familyname;
    const { data, error } = await supabase
      .schema("identity")
      .from("person")
      .update(updates)
      .eq("id", existing.id)
      .select(PERSON_COLUMNS)
      .single();
    if (error) {
      console.warn("[mukoko] upsertPersonFromWorkos update failed:", error.message);
      return existing;
    }
    return data as PersonRow;
  }

  // First-time sign-in — insert a new identity.person row.
  const insertRow: Partial<PersonRow> = {
    workos_user_id: input.workosUserId,
    email: input.email,
    name: input.name || null,
    givenname: input.givenname ?? null,
    familyname: input.familyname ?? null,
    last_login_at: nowIso,
    onboarding_completed: false,
    role: "user",
  };
  const { data, error } = await supabase
    .schema("identity")
    .from("person")
    .insert(insertRow)
    .select(PERSON_COLUMNS)
    .single();
  if (error) {
    console.warn("[mukoko] upsertPersonFromWorkos insert failed:", error.message);
    return null;
  }
  return data as PersonRow;
}

export async function updatePersonProfile(
  personId: string,
  patch: {
    name?: string;
    addressLocality?: string;
    addressCountry?: string;
    interests?: string[];
  },
): Promise<PersonRow | null> {
  const supabase = getSupabaseBrowserClient();

  const updates: Partial<PersonRow> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.interests !== undefined) updates.knowsabout = patch.interests;

  if (patch.addressLocality !== undefined || patch.addressCountry !== undefined) {
    // Need the existing address blob first so we don't clobber other keys.
    const { data: row } = await supabase
      .schema("identity")
      .from("person")
      .select("address")
      .eq("id", personId)
      .maybeSingle();
    const existingAddr = ((row as { address: PersonAddress | null } | null)?.address ?? {}) as PersonAddress;
    const merged: PersonAddress = { ...existingAddr };
    if (patch.addressLocality !== undefined) merged.addressLocality = patch.addressLocality;
    if (patch.addressCountry !== undefined) merged.addressCountry = patch.addressCountry;
    updates.address = merged;
  }

  if (Object.keys(updates).length === 0) {
    // No-op patch — return the current row so callers can refresh state.
    const { data } = await supabase
      .schema("identity")
      .from("person")
      .select(PERSON_COLUMNS)
      .eq("id", personId)
      .maybeSingle();
    return (data as PersonRow | null) ?? null;
  }

  const { data, error } = await supabase
    .schema("identity")
    .from("person")
    .update(updates)
    .eq("id", personId)
    .select(PERSON_COLUMNS)
    .single();
  if (error) {
    console.warn("[mukoko] updatePersonProfile failed:", error.message);
    return null;
  }
  return data as PersonRow;
}

// ─── Categories ───────────────────────────────────────────────────────────
// 40 canonical categories live in engagement.interest_category. They're
// broad (technology, music, business, sports, education, food, faith,
// culture, family, governance, …) — no longer the events-only narrow set.

export async function getInterestCategories(): Promise<InterestCategoryRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("engagement")
    .from("interest_category")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.warn("[mukoko] getInterestCategories failed:", error.message);
    return [];
  }
  return (data ?? []) as InterestCategoryRow[];
}

// ─── Venues ──────────────────────────────────────────────────────────────
// `places.places` is the unified venue/place table. Use this for the
// debounced venue picker in the creation wizard — typing "harare" returns
// venues whose name OR address_locality matches.

export async function searchVenues(query: string, limit = 8): Promise<PlaceRow[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("places")
    .from("places")
    .select("id, schema_type, name, slug, latitude, longitude, address_locality, address_region, street_address, country_id, province_id, image, cover_image")
    .or(`name.ilike.%${trimmed}%,address_locality.ilike.%${trimmed}%`)
    .limit(limit);
  if (error) {
    console.warn("[mukoko] searchVenues failed:", error.message);
    return [];
  }
  return (data ?? []) as PlaceRow[];
}

// ─── Entities the current person belongs to ──────────────────────────────
// Used by the 3-way host picker on step 3 of the creation wizard.
// Returns all active entity memberships (families + organisations) via
// entity.membership → identity.entity.
// Falls back to the legacy business.membership query if entity.membership
// returns nothing, so the picker degrades gracefully during the migration.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getEntitiesForPerson(personId: string): Promise<EntityRow[]> {
  if (!UUID_RE.test(personId)) return [];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("entity")
    .from("membership")
    .select("entity:entity_id(id, entity_type, name, alternatename, description, logo, slug, url, verification_status, verification_tier_level, member_count)")
    .eq("person_id", personId)
    .eq("status", "active");
  if (error) {
    console.warn("[mukoko] getEntitiesForPerson failed:", error.message);
  }
  type Row = { entity: EntityRow | null };
  const entities = ((data as unknown as Row[]) ?? [])
    .map((r) => r.entity)
    .filter((e): e is EntityRow => e !== null && e.entity_type !== "person");

  if (entities.length > 0) return entities;

  // Legacy fallback — business.membership (deprecated path)
  return getOrgsForPerson(personId).then((orgs) =>
    orgs.map((o) => ({
      id: o.id,
      entity_type: "organization" as const,
      name: o.name,
      alternatename: null,
      description: o.description,
      logo: o.logo,
      slug: o.slug,
      url: o.url,
      verification_status: o.verified ? "verified" : null,
      verification_tier_level: null,
      member_count: null,
    })),
  );
}

// ─── Organisations the current person belongs to (legacy) ────────────────
// Kept for backwards compat. Prefer getEntitiesForPerson for new code.

export async function getOrgsForPerson(personId: string): Promise<OrganizationRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("business")
    .from("membership")
    .select("organization_id, organization:business_organization!inner(id, name, slug, description, logo, url, verified)")
    .eq("person_id", personId);
  if (error) {
    console.warn("[mukoko] getOrgsForPerson failed:", error.message);
    return [];
  }
  type Row = { organization: OrganizationRow | null };
  return ((data as unknown as Row[]) ?? [])
    .map((r) => r.organization)
    .filter((o): o is OrganizationRow => Boolean(o));
}

// ─── Event host info ─────────────────────────────────────────────────────
// Reads owner_type / owner_id from events.event then resolves the host from
// either identity.entity (organisation / family) or identity.person.

export type EventHostInfo = {
  ownerType: "person" | "organization" | "family";
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  slug: string | null;
  verificationStatus: string | null;
};

export async function getEventHostInfo(eventId: string): Promise<EventHostInfo | null> {
  const supabase = getSupabaseBrowserClient();

  const { data: event, error: evtErr } = await supabase
    .schema("events")
    .from("event")
    .select("id, owner_type, owner_id")
    .eq("id", eventId)
    .maybeSingle();

  if (evtErr || !event || !event.owner_id) return null;

  const ownerType = event.owner_type as string;
  const ownerId = event.owner_id as string;

  if (ownerType === "person") {
    const { data: person, error } = await supabase
      .schema("identity")
      .from("person")
      .select("id, name, givenname, familyname, image")
      .eq("id", ownerId)
      .maybeSingle();
    if (error || !person) return null;
    const p = person as Pick<PersonRow, "id" | "name" | "givenname" | "familyname" | "image">;
    return {
      ownerType: "person",
      id: p.id,
      name: p.name || `${p.givenname ?? ""} ${p.familyname ?? ""}`.trim() || "Unknown",
      description: null,
      avatar: p.image,
      slug: null,
      verificationStatus: null,
    };
  }

  const { data: entity, error: entityErr } = await supabase
    .schema("entity")
    .from("entity")
    .select("id, entity_type, name, description, logo, slug, verification_status")
    .eq("id", ownerId)
    .maybeSingle();
  if (entityErr || !entity) return null;
  const e = entity as Pick<EntityRow, "id" | "entity_type" | "name" | "description" | "logo" | "slug" | "verification_status">;
  return {
    ownerType: e.entity_type === "family" ? "family" : "organization",
    id: e.id,
    name: e.name,
    description: e.description,
    avatar: e.logo,
    slug: e.slug,
    verificationStatus: e.verification_status,
  };
}

// ─── Create Event ────────────────────────────────────────────────────────
// Inserts into events.event with the schema.org-aligned column shape.

export type CreateEventOnSupabaseInput = {
  ownerPersonId: string;
  /** Org-hosted (business.organization FK) — use organizationId for legacy org path */
  organizationId: string | null;
  /** Entity-hosted (identity.entity FK) — covers families + new-path orgs */
  hostEntityId?: string | null;
  /** Entity type for the host entity (used to set owner_type correctly) */
  hostEntityType?: "organization" | "family" | null;
  name: string;
  description: string;
  startdate: string;
  enddate: string | null;
  timezone: string;
  category: string | null;
  keywords: string[];
  image: string[] | null;
  placeId: string | null;
  virtualLocation: { url: string; platform?: string } | null;
  attendanceMode: "OnlineEventAttendanceMode" | "OfflineEventAttendanceMode" | "MixedEventAttendanceMode";
  maximumAttendeeCapacity: number | null;
  requiresApproval: boolean;
  visibility: "public" | "private" | "unlisted";
};

export async function createEventOnSupabase(input: CreateEventOnSupabaseInput): Promise<EventRow> {
  const supabase = getSupabaseBrowserClient();

  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);

  const isEntityHosted = Boolean(input.hostEntityId);
  const isOrgHosted = !isEntityHosted && Boolean(input.organizationId);

  const ownerType = isEntityHosted
    ? (input.hostEntityType ?? "organization")
    : isOrgHosted
      ? "organization"
      : "person";
  const ownerId = isEntityHosted
    ? (input.hostEntityId as string)
    : isOrgHosted
      ? (input.organizationId as string)
      : input.ownerPersonId;

  const row: Partial<EventInsert> = {
    name: input.name,
    slug: slug || null,
    description: input.description,
    eventtype: "Event",
    // events.event CHECK constraint requires fully-qualified schema.org URLs
    // for eventstatus and eventattendancemode.
    eventstatus: "https://schema.org/EventScheduled",
    eventattendancemode: `https://schema.org/${input.attendanceMode}`,
    startdate: input.startdate,
    enddate: input.enddate,
    timezone: input.timezone,
    location: input.placeId ? { "@type": "Place", placeId: input.placeId } : { "@type": "VirtualLocation" },
    place_id: input.placeId,
    virtuallocation: input.virtualLocation,
    image: input.image,
    organizer: isEntityHosted
      ? { "@type": "Organization", id: input.hostEntityId }
      : isOrgHosted
        ? { "@type": "Organization", id: input.organizationId }
        : { "@type": "Person", id: input.ownerPersonId },
    organizer_person_id: isEntityHosted || isOrgHosted ? null : input.ownerPersonId,
    organization_id: isOrgHosted ? input.organizationId : null,
    category: input.category,
    keywords: input.keywords,
    maximumattendeecapacity: input.maximumAttendeeCapacity,
    requires_approval: input.requiresApproval,
    visibility: input.visibility,
    // events.event.calendar_type CHECK constraint: personal | business | circle | nhimbe.
    calendar_type: "nhimbe",
    owner_type: ownerType,
    owner_id: ownerId,
  };

  const { data, error } = await supabase
    .schema("events")
    .from("event")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    throw new Error(`[mukoko] createEventOnSupabase failed: ${error.message}`);
  }
  return data as EventRow;
}

// ─── Kraal (circles.* schema) ────────────────────────────────────────────
// Kraal is the user-facing name; the schema stays `circles`. Each circle
// can be linked to a parent event via circles.circle.linked_event_id, and
// each event references its kraal via events.event.event_circle_id.

export async function getCirclesForPerson(personId: string): Promise<CircleRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("circles")
    .from("circle_membership")
    .select("circle:circle_id(id, name, description, avatar_url, circle_purpose, circle_type, visibility, member_count, post_count, linked_event_id, organization_id, created_at)")
    .eq("person_id", personId)
    .eq("status", "active");
  if (error) {
    console.warn("[mukoko] getCirclesForPerson failed:", error.message);
    return [];
  }
  type Row = { circle: CircleRow | null };
  return ((data as unknown as Row[]) ?? [])
    .map((r) => r.circle)
    .filter((c): c is CircleRow => Boolean(c));
}

export async function getCircle(circleId: string): Promise<CircleRow | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("circles")
    .from("circle")
    .select("*")
    .eq("id", circleId)
    .single();
  if (error) {
    console.warn("[mukoko] getCircle failed:", error.message);
    return null;
  }
  return data as CircleRow;
}

export type KraalPostWithAuthor = CirclePostRow & {
  author: Pick<PersonRow, "id" | "name" | "givenname" | "familyname" | "image"> | null;
};

export async function getCirclePosts(circleId: string, limit = 20, archived = false): Promise<KraalPostWithAuthor[]> {
  const supabase = getSupabaseBrowserClient();
  const query = supabase
    .schema("circles")
    .from("post")
    .select("*, author:author_id(id, name, givenname, familyname, image)")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (archived) {
    query.eq("moderation_status", "archived");
  } else {
    query.neq("moderation_status", "archived");
  }
  const { data, error } = await query;
  if (error) {
    console.warn("[mukoko] getCirclePosts failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as KraalPostWithAuthor[];
}

export type KraalMember = CircleMembershipRow & {
  person: Pick<PersonRow, "id" | "name" | "givenname" | "familyname" | "image"> | null;
};

export async function getCircleMembers(circleId: string, limit = 50): Promise<KraalMember[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("circles")
    .from("circle_membership")
    .select("circle_id, person_id, role, status, joined_at, notification_pref, person:person_id(id, name, givenname, familyname, image)")
    .eq("circle_id", circleId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("[mukoko] getCircleMembers failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as KraalMember[];
}

export async function createCirclePost(input: {
  circleId: string;
  authorId: string;
  text: string;
  postType?: string;
}): Promise<CirclePostRow> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("circles")
    .from("post")
    .insert({
      circle_id: input.circleId,
      author_id: input.authorId,
      text: input.text,
      post_type: input.postType ?? "text",
      moderation_status: "approved",
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(`[mukoko] createCirclePost failed: ${error.message}`);
  }
  return data as CirclePostRow;
}

// circles.post_reaction column is `reaction_type`, not `reaction`. Audited
// against the live DB via Supabase MCP — the previous code path silently
// failed because PostgREST returned 400 on the unknown column.
export async function togglePostReaction(input: {
  postId: string;
  personId: string;
  reaction?: string;
}): Promise<"added" | "removed"> {
  const supabase = getSupabaseBrowserClient();
  const reaction_type = input.reaction ?? "like";
  const { data: existing } = await supabase
    .schema("circles")
    .from("post_reaction")
    .select("post_id")
    .eq("post_id", input.postId)
    .eq("person_id", input.personId)
    .eq("reaction_type", reaction_type)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .schema("circles")
      .from("post_reaction")
      .delete()
      .eq("post_id", input.postId)
      .eq("person_id", input.personId)
      .eq("reaction_type", reaction_type);
    if (error) throw new Error(`[mukoko] togglePostReaction remove failed: ${error.message}`);
    return "removed";
  }

  const { error } = await supabase
    .schema("circles")
    .from("post_reaction")
    .insert({ post_id: input.postId, person_id: input.personId, reaction_type });
  if (error) throw new Error(`[mukoko] togglePostReaction add failed: ${error.message}`);
  return "added";
}

export async function joinCircle(input: { circleId: string; personId: string }): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .schema("circles")
    .from("circle_membership")
    .upsert(
      {
        circle_id: input.circleId,
        person_id: input.personId,
        role: "member",
        status: "active",
      },
      { onConflict: "circle_id,person_id" },
    );
  if (error) throw new Error(`[mukoko] joinCircle failed: ${error.message}`);
}
