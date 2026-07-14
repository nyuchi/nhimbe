import { describe, it, expect } from "vitest";
import {
  PUBLISHED_STATUSES,
  CITY_LOCALITY_PATH,
  CITY_LOCALITY_PATH_LEGACY,
  publishedVisibleMatch,
  cityLocalityExpr,
  cityLocalityFilter,
  resolveEventCity,
  resolveEventCountry,
  eventMatchesCity,
  isPublishedVisibleUpcoming,
} from "./event-filters";
import type { EventDoc } from "./types";

/** Build an event doc with a NESTED schema.org address (what createEvent writes). */
function nestedEvent(city: string, extra: Partial<EventDoc> = {}): EventDoc {
  return {
    status: "published",
    startDate: new Date("2999-01-01T00:00:00Z"),
    location: { "@type": "Place", address: { addressLocality: city, addressCountry: "ZW" } },
    ...extra,
  } as unknown as EventDoc;
}

/** Build an event doc with a FLAT locality (legacy shape). */
function flatEvent(city: string, extra: Partial<EventDoc> = {}): EventDoc {
  return {
    status: "published",
    startDate: new Date("2999-01-01T00:00:00Z"),
    location: { "@type": "Place", addressLocality: city, addressCountry: "ZW" },
    ...extra,
  } as unknown as EventDoc;
}

/**
 * The count aggregation groups by `resolveEventCity`; the `/events?city=`
 * drill-down selects with `eventMatchesCity` + `isPublishedVisibleUpcoming`.
 * These JS mirrors are what the parity tests below exercise; the Mongo builders
 * are asserted structurally to reference the same paths, so production stays in
 * lock-step (there is no in-memory Mongo in this suite).
 */
function countByCity(docs: EventDoc[], from: Date): Map<string, number> {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    if (!isPublishedVisibleUpcoming(doc, from)) continue;
    const city = resolveEventCity(doc);
    if (!city) continue;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return counts;
}

function drillDown(docs: EventDoc[], city: string, from: Date): EventDoc[] {
  return docs.filter((d) => isPublishedVisibleUpcoming(d, from) && eventMatchesCity(d, city));
}

const NOW = new Date("2026-07-14T00:00:00Z");

describe("city count ↔ drill-down parity (M3)", () => {
  it("agrees for both the flat and the nested location shapes", () => {
    const docs = [
      nestedEvent("Harare"),
      nestedEvent("Harare"),
      flatEvent("Harare"), // legacy shape, same city
      nestedEvent("Bulawayo"),
      flatEvent("Bulawayo"),
      flatEvent("Gweru"),
    ];

    const counts = countByCity(docs, NOW);
    expect(counts.get("Harare")).toBe(3);
    expect(counts.get("Bulawayo")).toBe(2);
    expect(counts.get("Gweru")).toBe(1);

    // Every city's count equals the number of events its drill-down returns.
    for (const [city, count] of counts) {
      expect(drillDown(docs, city, NOW).length).toBe(count);
    }
  });

  it("a nested-shape event is reachable by its city drill-down", () => {
    const docs = [nestedEvent("Mutare")];
    expect(drillDown(docs, "Mutare", NOW)).toHaveLength(1);
    expect(countByCity(docs, NOW).get("Mutare")).toBe(1);
  });

  it("a flat-shape (legacy) event is reachable by its city drill-down", () => {
    const docs = [flatEvent("Mutare")];
    expect(drillDown(docs, "Mutare", NOW)).toHaveLength(1);
    expect(countByCity(docs, NOW).get("Mutare")).toBe(1);
  });
});

describe("private events excluded from counts (L1)", () => {
  it("drops private events from both the count and the drill-down, identically", () => {
    const docs = [
      nestedEvent("Harare"),
      nestedEvent("Harare", { mukoko: { visibility: "private" } } as Partial<EventDoc>),
      flatEvent("Harare", { mukoko: { visibility: "public" } } as Partial<EventDoc>),
    ];

    // One private event is excluded on both sides — count stays 2, drill-down 2.
    expect(countByCity(docs, NOW).get("Harare")).toBe(2);
    expect(drillDown(docs, "Harare", NOW)).toHaveLength(2);
  });

  it("treats a missing visibility as public (admitted)", () => {
    const docs = [nestedEvent("Harare")]; // no mukoko.visibility
    expect(isPublishedVisibleUpcoming(docs[0], NOW)).toBe(true);
    expect(countByCity(docs, NOW).get("Harare")).toBe(1);
  });

  it("excludes past and non-published events too", () => {
    const past = nestedEvent("Harare", { startDate: new Date("2000-01-01T00:00:00Z") });
    const draft = nestedEvent("Harare", { status: "draft" } as Partial<EventDoc>);
    expect(isPublishedVisibleUpcoming(past, NOW)).toBe(false);
    expect(isPublishedVisibleUpcoming(draft, NOW)).toBe(false);
  });
});

describe("the Mongo builders mirror the JS predicates (lock-step)", () => {
  it("publishedVisibleMatch carries the status, upcoming and visibility guards", () => {
    const match = publishedVisibleMatch(NOW) as Record<string, unknown>;
    expect(match.status).toEqual({ $in: [...PUBLISHED_STATUSES] });
    expect(match.startDate).toEqual({ $gte: NOW });
    // L1: the visibility guard the count aggregations previously omitted.
    expect(match["mukoko.visibility"]).toEqual({ $ne: "private" });
  });

  it("the city group expression and the drill-down filter reference the same two paths", () => {
    // Symmetry: the coalescing count expression and the either-path drill-down
    // filter resolve over the identical canonical-then-legacy path pair.
    expect(cityLocalityExpr.$ifNull).toEqual([`$${CITY_LOCALITY_PATH}`, `$${CITY_LOCALITY_PATH_LEGACY}`]);
    expect(cityLocalityFilter("Harare")).toEqual({
      $or: [{ [CITY_LOCALITY_PATH]: "Harare" }, { [CITY_LOCALITY_PATH_LEGACY]: "Harare" }],
    });
    // The canonical path is the NESTED schema.org address (what createEvent writes).
    expect(CITY_LOCALITY_PATH).toBe("location.address.addressLocality");
    expect(CITY_LOCALITY_PATH_LEGACY).toBe("location.addressLocality");
  });

  it("resolveEventCity/Country prefer the canonical nested path", () => {
    const doc = {
      location: {
        address: { addressLocality: "Harare", addressCountry: "ZW" },
        addressLocality: "STALE",
      },
    } as unknown as EventDoc;
    expect(resolveEventCity(doc)).toBe("Harare");
    expect(resolveEventCountry(doc)).toBe("ZW");
    expect(resolveEventCity(flatEvent("Kadoma"))).toBe("Kadoma");
    expect(resolveEventCity({ location: { "@type": "VirtualLocation" } } as unknown as EventDoc)).toBeNull();
  });
});
