import { describe, expect, it } from "vitest";
import { buildSecurityTxt } from "@/app/.well-known/security.txt/route";

// Cloudflare's security-insights scan flags nhimbe.com for "Security.txt not
// configured". RFC 9116 makes `Expires` mandatory and caps it at a year out,
// which is why this is generated per request rather than checked in — these
// assertions are what stop it regressing to a file that silently expires.

describe("security.txt", () => {
  const txt = buildSecurityTxt();

  it("carries the fields RFC 9116 requires", () => {
    expect(txt).toContain("Contact: mailto:security@nyuchi.com");
    expect(txt).toMatch(/^Expires: /m);
    expect(txt).toContain("Policy: https://github.com/nyuchi/nhimbe/blob/main/SECURITY.md");
    expect(txt).toContain("Preferred-Languages: en");
  });

  it("lists both origins this app is served from", () => {
    // Either host can serve the file, and RFC 9116 wants every URI it is
    // reachable at listed — a scanner may distrust a mismatch.
    expect(txt).toContain("Canonical: https://events.mukoko.com/.well-known/security.txt");
    expect(txt).toContain("Canonical: https://nhimbe.com/.well-known/security.txt");
  });

  it("expires in the future and within RFC 9116's one-year maximum", () => {
    const now = new Date("2030-06-15T12:00:00Z");
    const expires = new Date(buildSecurityTxt(now).match(/^Expires: (.+)$/m)![1]);
    expect(expires.getTime()).toBeGreaterThan(now.getTime());
    const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    expect(expires.getTime()).toBeLessThan(oneYear.getTime());
  });

  it("is a single Expires field — duplicates make the file invalid", () => {
    expect(txt.match(/^Expires: /gm)).toHaveLength(1);
  });
});
