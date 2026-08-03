import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mongo accessor + auth gate are mocked so the action runs in isolation.
const places = { find: vi.fn(), aggregate: vi.fn() };
const placesGeo = { findOne: vi.fn() };
vi.mock("@/lib/mongo/databases", () => ({
  placesCollection: vi.fn(async () => places),
  placesGeoCollection: vi.fn(async () => placesGeo),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(async () => ({ user: { id: "user_1" } })),
}));
vi.mock("@/lib/auth/dev", () => ({
  isDevBypass: vi.fn(() => true),
}));

import { geocodeAddress, reverseGeocode, resolveCountryTimezone } from "./geocode";

/** Build a chainable find() result (.limit().toArray()). */
function findReturning(docs: unknown[]) {
  return {
    limit: vi.fn(() => ({ toArray: vi.fn(async () => docs) })),
  };
}

/** Build a chainable aggregate() result (.toArray()) — or a rejecting one to simulate a missing/unavailable Atlas Search index. */
function aggregateReturning(docs: unknown[] | Error) {
  return {
    toArray: vi.fn(async () => {
      if (docs instanceof Error) throw docs;
      return docs;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  places.find.mockReturnValue(findReturning([]));
  // Simulate Atlas Search being unavailable by default (e.g. no index on a
  // local/test cluster) so existing regex-path tests keep exercising find().
  places.aggregate.mockReturnValue(aggregateReturning(new Error("no such index")));
  placesGeo.findOne.mockResolvedValue(null);
  global.fetch = vi.fn();
});

describe("geocodeAddress", () => {
  it("returns [] for blank or too-short queries without touching Mongo or the network", async () => {
    expect(await geocodeAddress("")).toEqual([]);
    expect(await geocodeAddress("ab")).toEqual([]);
    expect(places.find).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns DB matches (mapped to GeoJSON coords) and never calls Nominatim", async () => {
    places.find.mockReturnValue(
      findReturning([
        {
          _id: "place-1",
          name: "Rainbow Towers",
          isActive: true,
          address: { streetAddress: "1 Pennefather Ave", addressLocality: "Harare", addressCountry: "Zimbabwe" },
          geo: { type: "Point", coordinates: [31.0522, -17.8306] },
        },
      ]),
    );

    const results = await geocodeAddress("Rainbow");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: "db",
      placeId: "place-1",
      name: "Rainbow Towers",
      city: "Harare",
      country: "Zimbabwe",
      latitude: -17.8306,
      longitude: 31.0522,
    });
  });

  it("prefers the places_search Atlas Search index over the regex scan when available", async () => {
    places.aggregate.mockReturnValue(
      aggregateReturning([
        {
          _id: "place-2",
          name: "National Sports Stadium",
          isActive: true,
          address: { streetAddress: "Rotten Row", addressLocality: "Harare", addressCountry: "Zimbabwe" },
          geo: { type: "Point", coordinates: [31.05, -17.85] },
        },
      ]),
    );

    const results = await geocodeAddress("Stadium");

    expect(places.aggregate).toHaveBeenCalledTimes(1);
    const pipeline = places.aggregate.mock.calls[0][0];
    expect(pipeline[0].$search.index).toBe("places_search");
    expect(places.find).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(results).toMatchObject([{ source: "db", placeId: "place-2", name: "National Sports Stadium" }]);
  });

  it("searches searchKeywords via Atlas Search — the field the OSM ingestion pipeline actually populates", async () => {
    // Real `places.places` docs carry category/city/country terms in
    // `searchKeywords` (e.g. "Accommodation", "Harare") but are effectively
    // never populated on `description`/`tags`/`keywords` — a category query
    // like "Accommodation" must match via searchKeywords, not just name.
    places.aggregate.mockReturnValue(
      aggregateReturning([
        {
          _id: "place-3",
          name: "Kuhudzai",
          isActive: true,
          address: { addressLocality: "Harare", addressCountry: "Zimbabwe" },
          geo: { type: "Point", coordinates: [31.05, -17.83] },
          searchKeywords: ["Accommodation", "Hotels & Stays", "Kuhudzai", "LocalBusiness", "Zimbabwe"],
        },
      ]),
    );

    const results = await geocodeAddress("Accommodation");

    const pipeline = places.aggregate.mock.calls[0][0];
    const should = pipeline[0].$search.compound.should;
    expect(should).toContainEqual({ text: { query: "Accommodation", path: "searchKeywords" } });
    expect(results).toMatchObject([{ source: "db", placeId: "place-3", name: "Kuhudzai" }]);
  });

  it("falls back to the regex scan when the Atlas Search index errors", async () => {
    places.aggregate.mockReturnValue(aggregateReturning(new Error("Atlas Search is not configured")));
    places.find.mockReturnValue(
      findReturning([
        {
          _id: "place-1",
          name: "Rainbow Towers",
          isActive: true,
          address: { streetAddress: "1 Pennefather Ave", addressLocality: "Harare", addressCountry: "Zimbabwe" },
          geo: { type: "Point", coordinates: [31.0522, -17.8306] },
        },
      ]),
    );

    const results = await geocodeAddress("Rainbow");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: "db", placeId: "place-1", name: "Rainbow Towers" });
  });

  it("regex fallback also matches on searchKeywords, not just name/address", async () => {
    places.aggregate.mockReturnValue(aggregateReturning(new Error("Atlas Search is not configured")));
    places.find.mockReturnValue(
      findReturning([
        {
          _id: "place-3",
          name: "Kuhudzai",
          isActive: true,
          address: { addressLocality: "Harare", addressCountry: "Zimbabwe" },
          geo: { type: "Point", coordinates: [31.05, -17.83] },
          searchKeywords: ["Accommodation", "Hotels & Stays", "Kuhudzai", "LocalBusiness", "Zimbabwe"],
        },
      ]),
    );

    const results = await geocodeAddress("Accommodation");

    const filter = places.find.mock.calls[0][0];
    expect(filter.$or).toContainEqual({ searchKeywords: { $regex: "Accommodation", $options: "i" } });
    expect(results).toMatchObject([{ source: "db", placeId: "place-3", name: "Kuhudzai" }]);
  });

  it("skips DB rows without a usable Point geometry", async () => {
    places.find.mockReturnValue(
      findReturning([
        { _id: "no-geo", name: "No Geo", isActive: true, geo: { type: "Polygon", coordinates: [] } },
      ]),
    );
    // With no valid DB coords it falls through to OSM, which we stub empty.
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    const results = await geocodeAddress("No Geo");
    expect(results).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to OSM Nominatim when the DB has no match", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { type: "Point", coordinates: [28.6266, -20.1325] },
            properties: {
              display_name: "Bulawayo, Zimbabwe",
              name: "Bulawayo",
              osm_type: "relation",
              osm_id: 12345,
              address: { city: "Bulawayo", country: "Zimbabwe" },
            },
          },
        ],
      }),
    });

    const results = await geocodeAddress("Bulawayo");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl).toContain("nominatim.openstreetmap.org/search");
    expect(calledUrl).toContain("format=geojson");
    expect(calledUrl).toContain("countrycodes=");
    const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers["User-Agent"]).toContain("nhimbe");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: "osm",
      placeId: "osm:relation/12345",
      city: "Bulawayo",
      country: "Zimbabwe",
      latitude: -20.1325,
      longitude: 28.6266,
    });
  });

  it("returns [] (no throw) when both DB is empty and Nominatim errors", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    await expect(geocodeAddress("anywhere")).resolves.toEqual([]);
  });
});

describe("reverseGeocode", () => {
  it("rejects out-of-range coordinates without a network call", async () => {
    expect(await reverseGeocode(999, 999)).toBeNull();
    expect(await reverseGeocode(NaN, 0)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("resolves a coordinate to its city via Nominatim reverse", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              display_name: "Harare, Zimbabwe",
              address: { city: "Harare", country: "Zimbabwe" },
            },
          },
        ],
      }),
    });

    const result = await reverseGeocode(-17.8252, 31.0335);

    const calledUrl = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl).toContain("nominatim.openstreetmap.org/reverse");
    expect(result).toMatchObject({ city: "Harare", country: "Zimbabwe" });
  });

  it("returns null when the reverse lookup yields no city", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ properties: { address: {} } }] }),
    });
    expect(await reverseGeocode(0, 0)).toBeNull();
  });
});

describe("resolveCountryTimezone", () => {
  it("returns undefined for a blank country without touching Mongo", async () => {
    expect(await resolveCountryTimezone("  ")).toBeUndefined();
    expect(placesGeo.findOne).not.toHaveBeenCalled();
  });

  it("resolves a country's timezone from its placesGeo centroid", async () => {
    placesGeo.findOne.mockResolvedValue({
      _id: "zw",
      geoType: "country",
      name: "Zimbabwe",
      geo: { type: "Point", coordinates: [29.85, -19.02] },
    });

    const tz = await resolveCountryTimezone("Zimbabwe");

    expect(placesGeo.findOne).toHaveBeenCalledWith({
      geoType: "country",
      name: { $regex: "^Zimbabwe$", $options: "i" },
    });
    expect(tz).toBe("Africa/Harare");
  });

  it("returns undefined when no matching country doc exists", async () => {
    placesGeo.findOne.mockResolvedValue(null);
    expect(await resolveCountryTimezone("Atlantis")).toBeUndefined();
  });

  it("returns undefined when the matched doc has no usable Point geometry", async () => {
    placesGeo.findOne.mockResolvedValue({ geoType: "country", name: "Nowhere", geo: { type: "Polygon", coordinates: [] } });
    expect(await resolveCountryTimezone("Nowhere")).toBeUndefined();
  });
});
