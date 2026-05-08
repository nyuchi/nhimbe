import { Hono } from "hono";
import type { Env } from "../types";
import { getAuthenticatedUser } from "../auth/workos";
import { safeParseJSON } from "../utils/validation";
import { generateId } from "../utils/ids";

export const auth = new Hono<{ Bindings: Env }>();

// The users.stytch_user_id column stores the WorkOS user id post-migration.
// Column rename to external_user_id is tracked separately so we don't ship
// a breaking D1 schema change in this PR.

// POST /api/auth/sync
auth.post("/sync", async (c) => {
  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    console.error("[mukoko:auth] sync failed:", authResult.failureReason, authResult.detail);
    return c.json({ error: "Unauthorized", reason: authResult.failureReason }, 401);
  }
  const authUser = authResult.user;

  const body = (await c.req.json()) as {
    workos_user_id?: string;
    /** @deprecated kept for one release while clients still send it */
    stytch_user_id?: string;
    email: string;
    name: string;
  };

  const externalUserId = body.workos_user_id ?? body.stytch_user_id ?? authUser.userId;
  const email = body.email ?? authUser.email ?? "";

  if (!externalUserId || !email) {
    return c.json({ error: "workos_user_id and email are required" }, 400);
  }

  interface DbUser {
    _id: string;
    email: string;
    name: string | null;
    image: string | null;
    address_locality: string | null;
    address_country: string | null;
    interests: string | null;
    onboarding_completed: number | null;
    stytch_user_id: string | null;
    role: string | null;
    deleted_at: string | null;
  }

  const existingUser = (await c.env.DB.prepare(
    "SELECT * FROM users WHERE stytch_user_id = ? OR email = ?",
  )
    .bind(externalUserId, email)
    .first()) as DbUser | null;

  if (existingUser?.deleted_at) {
    return c.json({ error: "Account suspended", reason: "account_suspended" }, 403);
  }

  if (existingUser) {
    await c.env.DB.prepare(
      "UPDATE users SET last_login_at = datetime('now'), stytch_user_id = ?, date_modified = datetime('now') WHERE _id = ?",
    )
      .bind(externalUserId, existingUser._id)
      .run();

    const user = {
      id: existingUser._id,
      email: existingUser.email,
      name: existingUser.name || body.name,
      image: existingUser.image,
      addressLocality: existingUser.address_locality,
      addressCountry: existingUser.address_country,
      interests: safeParseJSON(existingUser.interests, []) as string[],
      onboardingCompleted: !!existingUser.onboarding_completed,
      personId: existingUser._id,
      workosUserId: externalUserId,
      role: existingUser.role || "user",
    };

    return c.json({ user });
  }

  const newId = generateId();
  await c.env.DB.prepare(`
    INSERT INTO users (_id, email, name, stytch_user_id, last_login_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `)
    .bind(newId, email, body.name || "", externalUserId)
    .run();

  const user = {
    id: newId,
    email,
    name: body.name || "",
    image: null,
    addressLocality: null,
    addressCountry: null,
    interests: [],
    onboardingCompleted: false,
    personId: newId,
    workosUserId: externalUserId,
    role: "user",
  };

  return c.json({ user });
});

// GET /api/auth/me
auth.get("/me", async (c) => {
  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    console.error("[mukoko:auth] me failed:", authResult.failureReason, authResult.detail);
    return c.json({ error: "Unauthorized", reason: authResult.failureReason }, 401);
  }
  const authUser = authResult.user;

  interface DbUserRow {
    _id: string;
    email: string;
    name: string;
    image: string | null;
    address_locality: string | null;
    address_country: string | null;
    interests: string | null;
    onboarding_completed: number | null;
    stytch_user_id: string | null;
    role: string | null;
    deleted_at: string | null;
  }
  const result = (await c.env.DB.prepare(
    "SELECT * FROM users WHERE stytch_user_id = ?",
  )
    .bind(authUser.userId)
    .first()) as DbUserRow | null;

  if (!result) {
    return c.json({ error: "User not found" }, 404);
  }

  if (result.deleted_at) {
    return c.json({ error: "Account suspended", reason: "account_suspended" }, 403);
  }

  const user = {
    id: result._id,
    email: result.email,
    name: result.name,
    image: result.image,
    addressLocality: result.address_locality,
    addressCountry: result.address_country,
    interests: safeParseJSON(result.interests, []) as string[],
    onboardingCompleted: !!result.onboarding_completed,
    personId: result._id,
    workosUserId: result.stytch_user_id,
    role: result.role || "user",
  };

  return c.json({ user });
});

// PATCH /api/auth/profile — progressive profile updates (UPSERT)
auth.patch("/profile", async (c) => {
  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    console.error("[mukoko:auth] profile failed:", authResult.failureReason, authResult.detail);
    return c.json({ error: "Unauthorized", reason: authResult.failureReason }, 401);
  }
  const authUser = authResult.user;

  const body = (await c.req.json()) as {
    name?: string;
    email?: string;
    addressLocality?: string;
    addressCountry?: string;
    interests?: string[];
  };

  if (!body.name && !body.addressLocality && !body.addressCountry && !body.interests) {
    return c.json({ error: "At least one field is required" }, 400);
  }

  interface DbUser {
    _id: string;
    email: string;
    name: string | null;
    image: string | null;
    address_locality: string | null;
    address_country: string | null;
    interests: string | null;
    stytch_user_id: string | null;
    role: string | null;
    onboarding_completed: number | null;
  }

  const existingUser = (await c.env.DB.prepare(
    "SELECT * FROM users WHERE stytch_user_id = ?",
  )
    .bind(authUser.userId)
    .first()) as DbUser | null;

  if (!existingUser) {
    return c.json({ error: "User not found. Please sign out and sign in again." }, 404);
  }

  const userId = existingUser._id;
  const setClauses: string[] = [];
  const values: (string | number)[] = [];

  if (body.name !== undefined) {
    setClauses.push("name = ?");
    values.push(body.name);
  }
  if (body.addressLocality !== undefined) {
    setClauses.push("address_locality = ?");
    values.push(body.addressLocality);
  }
  if (body.addressCountry !== undefined) {
    setClauses.push("address_country = ?");
    values.push(body.addressCountry);
  }
  if (body.interests !== undefined) {
    setClauses.push("interests = ?");
    values.push(JSON.stringify(body.interests));
  }
  setClauses.push("date_modified = datetime('now')");

  await c.env.DB.prepare(`UPDATE users SET ${setClauses.join(", ")} WHERE _id = ?`)
    .bind(...values, userId)
    .run();

  const result = (await c.env.DB.prepare("SELECT * FROM users WHERE _id = ?")
    .bind(userId)
    .first()) as DbUser | null;

  if (!result) {
    return c.json({ error: "User not found" }, 404);
  }

  const user = {
    id: result._id,
    email: result.email,
    name: result.name,
    image: result.image,
    addressLocality: result.address_locality,
    addressCountry: result.address_country,
    interests: safeParseJSON(result.interests, []) as string[],
    onboardingCompleted: !!result.onboarding_completed,
    personId: result._id,
    workosUserId: result.stytch_user_id,
    role: result.role || "user",
  };

  return c.json({ user });
});
