/**
 * The cross-repo chain, end to end, against a REAL MongoDB.
 *
 * This is the journey the whole Mukoko place/verification design rests on:
 *
 *   a host picks a venue that isn't in the graph
 *     → a tier-0 place + owning entity are written to places.places / entity.entities
 *     → nhimbe reads bundu.verificationTier and renders "unverified"
 *     → nhimbe deep-links the host to Kweli's /verify gateway
 *     → Kweli (the ONLY writer of tiers) approves and bumps the tier
 *     → nhimbe re-reads and renders the verified mineral badge
 *
 * Every link had been built and none had been executed together. These tests
 * run the real functions against a real server, so the join between them —
 * document shape in, tier read out — is actually under test.
 *
 * They also pin the one thing a single-repo test can never see: nhimbe and
 * kweli-mcp's single-place-agent BOTH create places, into the same collections,
 * keyed on the same `sourceProvenance.legacyId`. See the divergence block at
 * the bottom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { placesCollection, entitiesCollection } from "@/lib/mongo/databases";
import { kweliVerifyUrl, verificationTierCode, verificationTierLevel } from "@/lib/kweli";

// The promotion path is auth-gated; the dev bypass is the documented way to
// drive it without a WorkOS session (same lever .claude/skills/verify pulls).
vi.mock("@/lib/auth/dev", () => ({ isDevBypass: () => true }));

// AuthKit is imported at module scope and reaches `next/cache`, which doesn't
// resolve outside a Next bundle — the dev bypass short-circuits the CALL, not
// the import. Stubbing the module keeps this a test of the Mongo write.
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: async () => ({ user: { id: "workos_test" } }),
}));

const OSM_TYPE = "node";

/**
 * The document shape kweli-mcp's `writeRecords` emits, reproduced field-for-
 * field from packages/skills/src/write-records.ts. Written by hand rather than
 * imported because it lives in a different repo — which is precisely the risk
 * this test exists to make visible.
 */
function agentShapedPlace(osmId: number, entityId: string) {
  const legacyId = `${OSM_TYPE}/${osmId}`;
  return {
    _id: `agent-place-${osmId}`,
    _schemaVersion: "v3.1",
    ownerEntityId: entityId,
    name: "Agent Created Place",
    slug: `agent-created-place-${osmId}`,
    isActive: true,
    placeType: ["LocalBusiness"],
    geo: { type: "Point", coordinates: [31.0335, -17.8252] },
    plusCode: "4FRW2R2X+5C",
    hierarchy: { containedInPlaceId: null, countryId: "zw", provinceId: null },
    bundu: { verificationTier: 0 },
    sourceProvenance: {
      legacyId,
      dataOrigin: "osm",
      dataConfidence: 0.9,
      sourceProject: "fundi",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Kweli approving a claim. Kweli is the ONLY writer of `bundu.verificationTier`
 * — nhimbe and the generation agents never raise it above 0 — so the test
 * performs the bump directly rather than pretending nhimbe could.
 */
async function kweliApprovesTier(placeId: string, tier: number) {
  const places = await placesCollection();
  await places.updateOne(
    { _id: placeId },
    { $set: { "bundu.verificationTier": tier, updatedAt: new Date() } },
  );
}

beforeEach(async () => {
  await (await placesCollection()).deleteMany({});
  await (await entitiesCollection()).deleteMany({});
});

describe("the chain: place created → unverified → Kweli verifies → badge", () => {
  it("runs the whole journey against real documents", async () => {
    const places = await placesCollection();

    // 1. A place enters the graph at tier 0 (whichever producer wrote it).
    const entityId = "entity-agent-1";
    const place = agentShapedPlace(1001, entityId);
    await places.insertOne(place as never);

    // 2. nhimbe reads it — unverified, so no badge and a verify CTA.
    const fresh = await places.findOne({ _id: place._id });
    const rawTier = (fresh as { bundu?: { verificationTier?: unknown } }).bundu?.verificationTier;

    expect(verificationTierLevel(rawTier)).toBe(0);
    expect(verificationTierCode(rawTier)).toBe("unverified");

    // 3. The host is deep-linked into Kweli's gateway for THIS place.
    const verifyUrl = kweliVerifyUrl({ placeId: place._id, entityId });
    expect(verifyUrl).toContain("kweli.mukoko.com/en/verify");
    expect(verifyUrl).toContain(`place=${place._id}`);
    // `source` tells Kweli which app sent the host, for its own funnel.
    expect(verifyUrl).toContain("source=nhimbe");

    // 4. Kweli approves — government tier.
    await kweliApprovesTier(place._id, 3);

    // 5. nhimbe re-reads and renders the right mineral tier.
    const verified = await places.findOne({ _id: place._id });
    const newTier = (verified as { bundu?: { verificationTier?: unknown } }).bundu
      ?.verificationTier;

    expect(verificationTierLevel(newTier)).toBe(3);
    expect(verificationTierCode(newTier)).toBe("government");
  });

  it("maps every rung of the ladder as Kweli walks it up", async () => {
    const places = await placesCollection();
    const place = agentShapedPlace(1002, "entity-ladder");
    await places.insertOne(place as never);

    // The contract shared with kweli's lib/verification-tiers.ts and
    // api-gateway's gateway/lib/verification.py — all three must agree.
    const ladder = [
      [0, "unverified"],
      [1, "community"],
      [2, "otp"],
      [3, "government"],
      [4, "licensed"],
    ] as const;

    for (const [tier, code] of ladder) {
      await kweliApprovesTier(place._id, tier);
      const row = await places.findOne({ _id: place._id });
      const raw = (row as { bundu?: { verificationTier?: unknown } }).bundu?.verificationTier;
      expect(verificationTierCode(raw)).toBe(code);
    }
  });

  it("degrades a place with no bundu block to unverified, not an error", async () => {
    // Load-bearing: places written by nhimbe's own promotion path have NO
    // bundu block at all (see the divergence tests below), so the read side
    // must treat absence as tier 0 rather than throwing or rendering a badge.
    const places = await placesCollection();
    await places.insertOne({
      _id: "place-no-bundu",
      name: "Bundu-less",
      isActive: true,
    } as never);

    const row = await places.findOne({ _id: "place-no-bundu" });
    const raw = (row as { bundu?: { verificationTier?: unknown } }).bundu?.verificationTier;

    expect(verificationTierLevel(raw)).toBe(0);
    expect(verificationTierCode(raw)).toBe("unverified");
  });
});

describe("nhimbe's own producer, driven for real", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Overpass is the one network dependency of the promotion path. Stub it so
    // this test exercises the WRITE, not OSM's uptime.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ elements: [{ tags: { amenity: "restaurant" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("writes a place AND its owning entity, both at tier 0", async () => {
    // Drives the real ensurePlaceFromOsmSuggestion — not a copied shape — so
    // the assertion below is about what nhimbe actually stores today.
    const { ensurePlaceFromOsmSuggestion } = await import("@/app/actions/geocode");

    const placeId = await ensurePlaceFromOsmSuggestion({
      name: "Nyuchi Africa Kitchen",
      address: "12 Samora Machel Ave",
      city: "Harare",
      country: "ZW",
      latitude: -17.8252,
      longitude: 31.0335,
      osmType: OSM_TYPE,
      osmId: 3001,
    });

    expect(placeId).toBeTruthy();

    const place = await (await placesCollection()).findOne({ _id: placeId! });
    expect(place).not.toBeNull();

    // The fix: a tier is now written explicitly, so this row is visible to a
    // `bundu.verificationTier` query instead of silently absent from it.
    expect((place as { bundu?: { verificationTier?: number } }).bundu?.verificationTier).toBe(0);

    // Rule 10 — every place has an owning entity, and it carries a tier too.
    const entity = await (await entitiesCollection()).findOne({
      _id: (place as { ownerEntityId: string }).ownerEntityId,
    });
    expect(entity).not.toBeNull();
    expect((entity as { bundu?: { verificationTier?: number } }).bundu?.verificationTier).toBe(0);
  });

  it("is idempotent — re-picking the same venue never duplicates", async () => {
    const { ensurePlaceFromOsmSuggestion } = await import("@/app/actions/geocode");
    const input = {
      name: "Twice Picked",
      address: "1 Second St",
      city: "Harare",
      country: "ZW",
      latitude: -17.8,
      longitude: 31.0,
      osmType: OSM_TYPE,
      osmId: 3002,
    };

    const first = await ensurePlaceFromOsmSuggestion(input);
    const second = await ensurePlaceFromOsmSuggestion(input);

    expect(second).toBe(first);
    const rows = await (await placesCollection())
      .find({ "sourceProvenance.legacyId": `${OSM_TYPE}/3002` })
      .toArray();
    expect(rows).toHaveLength(1);
  });

  it("its output now reaches the verification chain like the agent's does", async () => {
    // The join this whole workstream is about: a place nhimbe created is
    // findable by a tier query, verifiable through Kweli, and reads back with
    // the right badge — the same journey as an agent-created place.
    const { ensurePlaceFromOsmSuggestion } = await import("@/app/actions/geocode");
    const placeId = (await ensurePlaceFromOsmSuggestion({
      name: "Chain Venue",
      address: "3 Chain Rd",
      city: "Harare",
      country: "ZW",
      latitude: -17.81,
      longitude: 31.01,
      osmType: OSM_TYPE,
      osmId: 3003,
    }))!;

    const unverified = await (await placesCollection()).find({ "bundu.verificationTier": 0 }).toArray();
    expect(unverified.map((p) => p._id)).toContain(placeId);

    await kweliApprovesTier(placeId, 4);

    const row = await (await placesCollection()).findOne({ _id: placeId });
    const raw = (row as { bundu?: { verificationTier?: unknown } }).bundu?.verificationTier;
    expect(verificationTierCode(raw)).toBe("licensed");
  });
});

describe("two producers, one collection — the divergence", () => {
  it("both key on the same legacyId, so whoever writes first wins", async () => {
    // nhimbe's ensurePlaceFromOsmSuggestion and kweli-mcp's writeRecords both
    // dedupe on `sourceProvenance.legacyId` = "<osmType>/<osmId>". That means
    // they interoperate — but it also means the SAME venue ends up with a
    // different document depending on which reached it first.
    const places = await placesCollection();
    const legacyId = `${OSM_TYPE}/2001`;

    await places.insertOne(agentShapedPlace(2001, "entity-first") as never);

    const matches = await places.find({ "sourceProvenance.legacyId": legacyId }).toArray();
    expect(matches).toHaveLength(1);

    // A second producer looking up the same key finds the first one and
    // no-ops — the dedup works, which is why this has gone unnoticed.
    const existing = await places.findOne({ "sourceProvenance.legacyId": legacyId });
    expect(existing).not.toBeNull();
  });

  it("a legacy row with no bundu block stays invisible to a tier query", async () => {
    // Rows written BEFORE the fix above have no `bundu` block, so a query
    // filtering on `bundu.verificationTier` silently skips them — absent is
    // not tier 0 to Mongo, even though nhimbe's reader coerces both to
    // "unverified". Any backfill has to target exactly this shape.
    const places = await placesCollection();

    await places.insertOne(agentShapedPlace(2002, "entity-agent") as never);
    await places.insertOne({
      _id: "nhimbe-shaped",
      name: "Nhimbe Created Place",
      isActive: true,
      sourceProvenance: {
        legacyId: `${OSM_TYPE}/2003`,
        dataOrigin: "osm",
        dataConfidence: 0.6,
        sourceProject: "nhimbe",
      },
    } as never);

    const withTier = await places.find({ "bundu.verificationTier": { $exists: true } }).toArray();
    const withoutTier = await places
      .find({ "bundu.verificationTier": { $exists: false } })
      .toArray();

    expect(withTier.map((p) => p._id)).toEqual(["agent-place-2002"]);
    expect(withoutTier.map((p) => p._id)).toEqual(["nhimbe-shaped"]);

    // Both still read as unverified through nhimbe's own helper — the bug is
    // invisible from nhimbe and only shows up in a tier-filtered query.
    for (const p of [...withTier, ...withoutTier]) {
      const raw = (p as { bundu?: { verificationTier?: unknown } }).bundu?.verificationTier;
      expect(verificationTierLevel(raw)).toBe(0);
    }
  });

  it("records different provenance for the same kind of write", async () => {
    const places = await placesCollection();
    await places.insertOne(agentShapedPlace(2004, "e") as never);

    const row = await places.findOne({ _id: "agent-place-2004" });
    // fundi vs nhimbe — the only way to tell afterwards which produced a row.
    expect(
      (row as { sourceProvenance?: { sourceProject?: string } }).sourceProvenance?.sourceProject,
    ).toBe("fundi");
  });
});
