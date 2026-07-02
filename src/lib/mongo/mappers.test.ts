import { describe, it, expect } from "vitest";
import { initialsFromName, mapEventDocToApi, mapOrganizer } from "./mappers";
import type { EntityDoc, EventDoc, PersonDoc, PlaceDoc } from "./types";

function baseEvent(overrides: Partial<EventDoc> = {}): EventDoc {
  return {
    _id: "evt-1",
    _schemaVersion: "v3.1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-02-01T00:00:00Z"),
    iCalUid: "ical-1",
    slug: "harare-jazz-night",
    name: "Harare Jazz Night",
    description: "An evening of jazz.",
    schemaOrgType: "MusicEvent",
    attendanceMode: "OfflineEventAttendanceMode",
    eventStatus: "EventScheduled",
    status: "published",
    startDate: new Date("2026-06-20T18:00:00Z"),
    endDate: new Date("2026-06-20T22:00:00Z"),
    primaryHostEntityId: "ent-1",
    hostEntityIds: ["ent-1"],
    isAccessibleForFree: false,
    totalAttendeeCount: 42,
    surfaceContext: "mukoko_events",
    tags: ["Music", "Jazz"],
    image: ["https://cdn.example/jazz.jpg"],
    offers: [{ price: 10, priceCurrency: "USD", availability: "InStock" }],
    maximumAttendeeCapacity: 100,
    placeId: "place-1",
    circleId: "circle-1",
    ...overrides,
  };
}

describe("initialsFromName", () => {
  it("takes first letters of up to two words", () => {
    expect(initialsFromName("Tariro Moyo")).toBe("TM");
    expect(initialsFromName("Nyuchi")).toBe("N");
    expect(initialsFromName("a b c d")).toBe("AB");
    expect(initialsFromName("")).toBe("");
    expect(initialsFromName(null)).toBe("");
  });
});

describe("mapOrganizer (entity-centric host)", () => {
  const entity: EntityDoc = {
    _id: "ent-1",
    _schemaVersion: "v3.1",
    createdAt: new Date(),
    updatedAt: new Date(),
    entityType: "organization",
    ecosystemRole: "external",
    schemaOrgType: "Organization",
    slug: "harare-jazz-club",
    name: "Harare Jazz Club",
    isActive: true,
    isPrivateByDefault: false,
  };

  it("prefers the host entity's identity and slug", () => {
    const org = mapOrganizer({ hostEntity: entity, hostEventCount: 7 });
    expect(org.name).toBe("Harare Jazz Club");
    expect(org.identifier).toBe("harare-jazz-club");
    expect(org.initials).toBe("HJ");
    expect(org.eventCount).toBe(7);
  });

  it("falls back to the attributed person when no entity is resolved", () => {
    const person: PersonDoc = {
      _id: "p-1",
      _schemaVersion: "v3.1",
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
      phoneNumberVerified: false,
      isActive: true,
      name: "Tariro Moyo",
      preferredUsername: "tariro",
    };
    const org = mapOrganizer({ hostPerson: person });
    expect(org.name).toBe("Tariro Moyo");
    expect(org.identifier).toBe("p-1");
    expect(org.alternateName).toBe("tariro");
    expect(org.eventCount).toBe(0);
  });
});

describe("mapEventDocToApi", () => {
  it("maps core fields, counts and ISO dates", () => {
    const e = mapEventDocToApi(baseEvent());
    expect(e.id).toBe("evt-1");
    expect(e.slug).toBe("harare-jazz-night");
    expect(e.shortCode).toBe("harare-j");
    expect(e.name).toBe("Harare Jazz Night");
    expect(e.startDate).toBe("2026-06-20T18:00:00.000Z");
    expect(e.endDate).toBe("2026-06-20T22:00:00.000Z");
    expect(e.attendeeCount).toBe(42);
    expect(e.maximumAttendeeCapacity).toBe(100);
    expect(e.eventStatus).toBe("EventScheduled");
    expect(e.eventAttendanceMode).toBe("OfflineEventAttendanceMode");
    expect(e.isPublished).toBe(true);
    expect(e.category).toBe("Music");
    expect(e.keywords).toEqual(["Music", "Jazz"]);
    expect(e.image).toBe("https://cdn.example/jazz.jpg");
    expect(e.placeId).toBe("place-1");
    expect(e.eventCircleId).toBe("circle-1");
  });

  it("maps the first embedded offer", () => {
    const e = mapEventDocToApi(baseEvent());
    expect(e.offers).toEqual({ price: 10, priceCurrency: "USD", url: undefined, availability: "InStock" });
  });

  it("treats free events without offers as price 0", () => {
    const e = mapEventDocToApi(baseEvent({ offers: [], isAccessibleForFree: true }));
    expect(e.offers).toEqual({ price: 0 });
  });

  it("draft events are not published", () => {
    expect(mapEventDocToApi(baseEvent({ status: "draft" })).isPublished).toBe(false);
    expect(mapEventDocToApi(baseEvent({ status: "live" })).isPublished).toBe(true);
  });

  it("prefers a resolved place document over the embedded location", () => {
    const place: PlaceDoc = {
      _id: "place-1",
      _schemaVersion: "v3.1",
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "City Sports Centre",
      slug: "city-sports-centre",
      isActive: true,
      ownerEntityId: "ent-9",
      placeType: ["Place"],
      geo: { type: "Point", coordinates: [31.05, -17.83] },
      address: { addressLocality: "Harare", addressCountry: "ZW", streetAddress: "5th St" },
      url: "https://maps.example/csc",
    };
    const e = mapEventDocToApi(baseEvent(), { place });
    expect(e.location.name).toBe("City Sports Centre");
    expect(e.location.addressLocality).toBe("Harare");
    expect(e.location.addressCountry).toBe("ZW");
    expect(e.location.streetAddress).toBe("5th St");
    expect(e.location.url).toBe("https://maps.example/csc");
  });

  it("prefers the chosen category (mukoko.category) over tags[0]", () => {
    const e = mapEventDocToApi(baseEvent({ mukoko: { category: "music" } }));
    expect(e.category).toBe("music");
    // Without the explicit choice, the first tag wins.
    expect(mapEventDocToApi(baseEvent()).category).toBe("Music");
  });

  it("surfaces the meeting link for online events from the VirtualLocation", () => {
    const doc = baseEvent({
      attendanceMode: "OnlineEventAttendanceMode",
      location: { "@type": "VirtualLocation", name: "Online", url: "https://zoom.us/j/123", platform: "zoom" },
    });
    const e = mapEventDocToApi(doc);
    expect(e.meetingUrl).toBe("https://zoom.us/j/123");
    expect(e.meetingPlatform).toBe("zoom");
    // Physical events expose no meeting link.
    expect(mapEventDocToApi(baseEvent()).meetingUrl).toBeUndefined();
  });

  it("surfaces the chosen cover gradient from mukoko metadata", () => {
    const e = mapEventDocToApi(baseEvent({ mukoko: { coverGradient: "malachite-gradient" } }));
    expect(e.coverGradient).toBe("malachite-gradient");
  });

  it("falls back to the embedded location when no place is resolved", () => {
    const doc = baseEvent({
      location: { "@type": "Place", name: "Backyard", addressLocality: "Bulawayo", addressCountry: "ZW" },
    });
    const e = mapEventDocToApi(doc);
    expect(e.location.name).toBe("Backyard");
    expect(e.location.addressLocality).toBe("Bulawayo");
  });

  it("reconstructs the organizer from the host entity", () => {
    const entity: EntityDoc = {
      _id: "ent-1",
      _schemaVersion: "v3.1",
      createdAt: new Date(),
      updatedAt: new Date(),
      entityType: "organization",
      ecosystemRole: "external",
      schemaOrgType: "Organization",
      slug: "harare-jazz-club",
      name: "Harare Jazz Club",
      isActive: true,
      isPrivateByDefault: false,
    };
    const e = mapEventDocToApi(baseEvent(), { hostEntity: entity, hostEventCount: 3 });
    expect(e.organizer.name).toBe("Harare Jazz Club");
    expect(e.organizer.identifier).toBe("harare-jazz-club");
    expect(e.organizer.eventCount).toBe(3);
  });
});
