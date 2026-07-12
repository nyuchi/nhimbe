import { describe, it, expect, vi } from "vitest";

// `ids.ts` guards itself with `import "server-only"`, which throws outside an
// RSC/server context. Stub it so the pure id helpers can be unit-tested.
vi.mock("server-only", () => ({}));

import { newId, slugify, shortLinkSlug, stampNew, WRITE_SCHEMA_VERSION } from "./ids";

describe("newId", () => {
  it("returns a v4-shaped UUID string", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
  });
});

describe("slugify", () => {
  it("lowercases, strips punctuation, and appends a 6-char suffix", () => {
    const slug = slugify("Harare Jazz Night!");
    expect(slug).toMatch(/^harare-jazz-night-[0-9a-f]{6}$/);
  });

  it("omits the suffix when asked", () => {
    expect(slugify("Harare Jazz Night!", false)).toBe("harare-jazz-night");
  });

  it("falls back to a stable base for empty input", () => {
    expect(slugify("", false)).toBe("item");
  });
});

describe("shortLinkSlug", () => {
  it("defaults to length 8 within the unambiguous alphabet", () => {
    const slug = shortLinkSlug();
    expect(slug).toHaveLength(8);
    expect(slug).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);
  });

  it("honours a custom length", () => {
    expect(shortLinkSlug(12)).toHaveLength(12);
  });

  it("never emits the confusable characters 0 O 1 I l", () => {
    const joined = Array.from({ length: 100 }, () => shortLinkSlug(16)).join("");
    expect(joined).not.toMatch(/[01oil]/);
  });

  it("is effectively unique across many calls", () => {
    const slugs = new Set(Array.from({ length: 500 }, () => shortLinkSlug()));
    expect(slugs.size).toBe(500);
  });
});

describe("stampNew", () => {
  it("stamps id, schema version, and matching timestamps", () => {
    const doc = stampNew();
    expect(doc._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(doc._schemaVersion).toBe(WRITE_SCHEMA_VERSION);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.createdAt.getTime()).toBe(doc.updatedAt.getTime());
  });

  it("honours a caller-supplied id", () => {
    expect(stampNew("fixed-id")._id).toBe("fixed-id");
  });
});
