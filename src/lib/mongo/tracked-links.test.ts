import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`) and the Mongo driver layer so the writer's pure
// logic and its DB calls can be unit-tested with fake collections.
vi.mock("server-only", () => ({}));

const trackedLinks = { insertOne: vi.fn(), findOne: vi.fn(), updateOne: vi.fn() };
const linkClicks = { insertOne: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  trackedLinksCollection: vi.fn(async () => trackedLinks),
  linkClicksCollection: vi.fn(async () => linkClicks),
}));

import {
  isHttpUrl,
  buildTrackedLinkDoc,
  createTrackedLink,
  getActiveTrackedLinkBySlug,
  recordTrackedLinkClick,
} from "./tracked-links";

beforeEach(() => {
  vi.clearAllMocks();
  trackedLinks.insertOne.mockResolvedValue({ acknowledged: true });
  trackedLinks.findOne.mockResolvedValue(null);
  trackedLinks.updateOne.mockResolvedValue({ matchedCount: 1 });
  linkClicks.insertOne.mockResolvedValue({ acknowledged: true });
});

describe("isHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("https://example.com/path?x=1")).toBe(true);
  });

  it("rejects other schemes and malformed input", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,x")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("buildTrackedLinkDoc", () => {
  it("produces a v3.1-shaped, camelCase document", () => {
    const doc = buildTrackedLinkDoc(
      {
        destinationUrl: "https://meet.example.com/abc",
        ownerPersonId: "person-1",
        ownerEntityId: "entity-1",
        eventId: "event-1",
        linkType: "meeting_url",
      },
      "abcd2345",
    );

    expect(doc._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(doc._schemaVersion).toBe("v3.1");
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.linkSlug).toBe("abcd2345");
    expect(doc.destinationUrl).toBe("https://meet.example.com/abc");
    expect(doc.ownerPersonId).toBe("person-1");
    expect(doc.ownerEntityId).toBe("entity-1");
    expect(doc.clickCount).toBe(0);
    expect(doc.isActive).toBe(true);
    expect(doc.utm).toEqual({ source: "nhimbe", eventId: "event-1", linkType: "meeting_url" });
  });

  it("omits event/link-type context when absent", () => {
    const doc = buildTrackedLinkDoc(
      { destinationUrl: "https://x.test", ownerPersonId: "p", ownerEntityId: "e" },
      "wxyz2345",
    );
    expect(doc.utm).toEqual({ source: "nhimbe" });
  });
});

describe("createTrackedLink", () => {
  const base = {
    destinationUrl: "https://tickets.example.com",
    ownerPersonId: "p1",
    ownerEntityId: "e1",
    linkType: "ticket" as const,
  };

  it("inserts one document and returns it", async () => {
    const link = await createTrackedLink(base);
    expect(trackedLinks.insertOne).toHaveBeenCalledTimes(1);
    expect(trackedLinks.insertOne).toHaveBeenCalledWith(link);
    expect(link.linkSlug).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);
    expect(link.clickCount).toBe(0);
  });

  it("rejects a non-http(s) destination without touching the DB", async () => {
    await expect(createTrackedLink({ ...base, destinationUrl: "javascript:evil()" })).rejects.toThrow();
    expect(trackedLinks.insertOne).not.toHaveBeenCalled();
  });

  it("retries with a fresh slug on a duplicate-key (11000) collision", async () => {
    trackedLinks.insertOne
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }))
      .mockResolvedValueOnce({ acknowledged: true });

    const link = await createTrackedLink(base);
    expect(trackedLinks.insertOne).toHaveBeenCalledTimes(2);
    expect(link.linkSlug).toHaveLength(8);
  });

  it("propagates a non-collision write error", async () => {
    trackedLinks.insertOne.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: 121 }));
    await expect(createTrackedLink(base)).rejects.toThrow("boom");
  });
});

describe("getActiveTrackedLinkBySlug", () => {
  it("queries by slug + active flag", async () => {
    trackedLinks.findOne.mockResolvedValueOnce({ _id: "l1", linkSlug: "abc23456", isActive: true });
    const link = await getActiveTrackedLinkBySlug("abc23456");
    expect(trackedLinks.findOne).toHaveBeenCalledWith({ linkSlug: "abc23456", isActive: true });
    expect(link?._id).toBe("l1");
  });
});

describe("recordTrackedLinkClick", () => {
  it("bumps the counter and appends a click row", async () => {
    await recordTrackedLinkClick({ _id: "l1" }, { referrer: "https://ref.test" });

    expect(trackedLinks.updateOne).toHaveBeenCalledWith(
      { _id: "l1" },
      expect.objectContaining({ $inc: { clickCount: 1 } }),
    );
    expect(linkClicks.insertOne).toHaveBeenCalledTimes(1);
    const row = linkClicks.insertOne.mock.calls[0][0];
    expect(row.trackedLinkId).toBe("l1");
    expect(row.referrer).toBe("https://ref.test");
    expect(row.clickedAt).toBeInstanceOf(Date);
  });
});
