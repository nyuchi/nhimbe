/**
 * Tests for the Mukoko v3.1 document id / slug helpers.
 *
 * `ids.ts` is marked `import "server-only"`, which throws under the plain Node
 * test runtime, so we stub that marker module to a no-op before importing.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { newId, slugify, shortLinkSlug, stampNew, WRITE_SCHEMA_VERSION } from "./ids";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("newId", () => {
  it("returns a well-formed UUID", () => {
    expect(newId()).toMatch(UUID_RE);
  });

  it("returns a fresh value each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates a human string", () => {
    expect(slugify("Harare Tech Meetup", false)).toBe("harare-tech-meetup");
  });

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(slugify("A  --  B__C!!D", false)).toBe("a-b-c-d");
  });

  it("strips leading and trailing separators", () => {
    expect(slugify("  ...Hello...  ", false)).toBe("hello");
  });

  it("strips diacritics via NFKD normalization", () => {
    expect(slugify("Café Münchën", false)).toBe("cafe-munchen");
  });

  it("falls back to 'item' when nothing survives normalization", () => {
    expect(slugify("!!!", false)).toBe("item");
    expect(slugify("", false)).toBe("item");
  });

  it("caps the base at 60 characters", () => {
    const long = "a".repeat(200);
    expect(slugify(long, false)).toBe("a".repeat(60));
  });

  it("appends a 6-char suffix by default and keeps it unique", () => {
    const s = slugify("Repeat Name");
    expect(s).toMatch(/^repeat-name-[0-9a-f]{6}$/);
    expect(slugify("Repeat Name")).not.toBe(s);
  });

  it("uses 'item' as the base when appending a suffix to empty input", () => {
    expect(slugify("###")).toMatch(/^item-[0-9a-f]{6}$/);
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
  it("stamps a fresh id, schema version, and equal timestamps", () => {
    const doc = stampNew();
    expect(doc._id).toMatch(UUID_RE);
    expect(doc._schemaVersion).toBe(WRITE_SCHEMA_VERSION);
    expect(doc._schemaVersion).toBe("v3.1");
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.createdAt.getTime()).toBe(doc.updatedAt.getTime());
  });

  it("honors an explicit id", () => {
    const doc = stampNew("fixed-id");
    expect(doc._id).toBe("fixed-id");
  });
});
