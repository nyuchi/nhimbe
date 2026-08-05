import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mongo accessor + auth gate are mocked so the action runs in isolation.
const places = { find: vi.fn(), aggregate: vi.fn(), findOne: vi.fn(), insertOne: vi.fn() };
const placesGeo = { findOne: vi.fn() };
const entities = { insertOne: vi.fn() };
vi.mock("@/lib/mongo/databases", () => ({
  placesCollection: vi.fn(async () => places),
  placesGeoCollection: vi.fn(async () => placesGeo),
  entitiesCollection: vi.fn(async () => entities),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(async () => ({ user: { id: "user_1" } })),
}));
vi.mock("@/lib/auth/dev", () => ({
  isDevBypass: vi.fn(() => true),
}));

import { geocodeAddress, reverseGeocode, resolveCountryTimezone, ensurePlaceFromOsmSuggestion } from "./geocode";

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
  places.findOne.mockResolvedValue(null);
  places.insertOne.mockResolvedValue({ acknowledged: true });
  entities.insertOne.mockResolvedValue({ acknowledged: true });
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

describe("geocodeAddress — reporting a catalogue miss to fundi-ingestion", () => {
  const ORIGINAL_TOKEN = process.env.FUNDI_API_TOKEN;

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.FUNDI_API_TOKEN;
    else process.env.FUNDI_API_TOKEN = ORIGINAL_TOKEN;
  });

  function mockNominatimHit() {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).includes("nominatim.openstreetmap.org")) {
        return {
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
        };
      }
      return { ok: true, text: async () => "" };
    });
  }

  it("does not call fundi-ingestion when FUNDI_API_TOKEN is unset", async () => {
    delete process.env.FUNDI_API_TOKEN;
    mockNominatimHit();

    await geocodeAddress("Bulawayo");

    expect(global.fetch).toHaveBeenCalledTimes(1); // Nominatim only
  });

  it("reports a search_miss task with the first result's location once a token is set", async () => {
    process.env.FUNDI_API_TOKEN = "test-token";
    mockNominatimHit();

    await geocodeAddress("Bulawayo");

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(String(url)).toBe("https://fundi-ingestion.nyuchi.dev/tasks");
    expect(init.headers.authorization).toBe("Bearer test-token");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      region: { kind: "point_radius", center: [28.6266, -20.1325], radiusMeters: 3000 },
      categories: "all",
      source: { kind: "search_miss", surface: "geocode-address", query: "Bulawayo" },
    });
  });

  it("never reports when the DB already had a match", async () => {
    process.env.FUNDI_API_TOKEN = "test-token";
    places.find.mockReturnValue(
      findReturning([
        {
          _id: "place-1",
          name: "Rainbow Towers",
          isActive: true,
          geo: { type: "Point", coordinates: [31.05, -17.83] },
        },
      ]),
    );

    await geocodeAddress("Rainbow");

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("swallows a reporting failure without affecting the returned suggestions", async () => {
    process.env.FUNDI_API_TOKEN = "test-token";
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).includes("nominatim.openstreetmap.org")) {
        return {
          ok: true,
          json: async () => ({
            features: [
              {
                geometry: { type: "Point", coordinates: [28.6266, -20.1325] },
                properties: { name: "Bulawayo", osm_type: "relation", osm_id: 12345 },
              },
            ],
          }),
        };
      }
      throw new Error("fundi-ingestion is down");
    });

    const results = await geocodeAddress("Bulawayo");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: "osm", name: "Bulawayo" });
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

describe("ensurePlaceFromOsmSuggestion", () => {
  const input = {
    name: "Miekles Hotel",
    address: "Jason Moyo Avenue",
    city: "Harare",
    country: "Zimbabwe",
    latitude: -17.8303379,
    longitude: 31.0527331,
    osmType: "way",
    osmId: 136597457,
  };

  it("is a no-op (returns the existing id) when the OSM element is already catalogued", async () => {
    places.findOne.mockResolvedValue({ _id: "existing-place-1" });

    const id = await ensurePlaceFromOsmSuggestion(input);

    expect(places.findOne).toHaveBeenCalledWith({ "sourceProvenance.legacyId": "way/136597457" });
    expect(id).toBe("existing-place-1");
    expect(places.insertOne).not.toHaveBeenCalled();
    expect(entities.insertOne).not.toHaveBeenCalled();
  });

  it("creates a paired external entity + place, inferring placeType from Overpass tags", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [{ type: "way", id: 136597457, tags: { tourism: "hotel", name: "Miekles Hotel" } }] }),
    });

    const id = await ensurePlaceFromOsmSuggestion(input);

    expect(id).toEqual(expect.any(String));
    expect(entities.insertOne).toHaveBeenCalledTimes(1);
    const entityDoc = entities.insertOne.mock.calls[0][0];
    expect(entityDoc).toMatchObject({
      entityType: "organization",
      ecosystemRole: "external",
      name: "Miekles Hotel",
      primaryPlaceId: id,
      sourceProvenance: { legacyId: "way/136597457", mirroredFrom: "osm" },
    });

    expect(places.insertOne).toHaveBeenCalledTimes(1);
    const placeDoc = places.insertOne.mock.calls[0][0];
    expect(placeDoc).toMatchObject({
      _id: id,
      ownerEntityId: entityDoc._id,
      name: "Miekles Hotel",
      placeType: ["Accommodation"],
      geo: { type: "Point", coordinates: [31.0527331, -17.8303379] },
      sourceProvenance: { legacyId: "way/136597457", dataOrigin: "osm" },
    });
  });

  it("falls back to a generic LocalBusiness placeType when Overpass is unreachable", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    await ensurePlaceFromOsmSuggestion(input);

    const placeDoc = places.insertOne.mock.calls[0][0];
    expect(placeDoc.placeType).toEqual(["LocalBusiness"]);
  });

  it("never throws — swallows a Mongo write failure and returns null", async () => {
    places.insertOne.mockRejectedValue(new Error("insert failed"));
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });

    await expect(ensurePlaceFromOsmSuggestion(input)).resolves.toBeNull();
  });
});
