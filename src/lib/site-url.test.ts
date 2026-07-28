import { describe, it, expect } from "vitest";
import { SITE_URL, absoluteUrl } from "./site-url";

/**
 * SITE_URL is the single primary/canonical origin for the dual-domain setup
 * (nhimbe.com + events.mukoko.com both serve; canonical/OG/sitemap point here).
 * Tests run with no NEXT_PUBLIC_SITE_URL set, so the default applies.
 */
describe("site-url", () => {
  it("defaults the primary origin to events.mukoko.com", () => {
    expect(SITE_URL).toBe("https://events.mukoko.com");
  });

  it("has no trailing slash", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
  });

  it("absoluteUrl joins a path without doubling the slash", () => {
    expect(absoluteUrl("/events/abc")).toBe("https://events.mukoko.com/events/abc");
    expect(absoluteUrl("events/abc")).toBe("https://events.mukoko.com/events/abc");
    expect(absoluteUrl()).toBe("https://events.mukoko.com/");
  });
});
