import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

/**
 * Guards the security posture declared in next.config.ts so a future edit
 * can't silently drop the CSP or a hardening header.
 */
describe("next.config security headers", () => {
  it("does not advertise the framework via X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applies the header set to every path", async () => {
    const groups = await nextConfig.headers!();
    const root = groups.find((g) => g.source === "/:path*");
    expect(root).toBeDefined();
  });

  it("sets a Content-Security-Policy that locks down the key directives", async () => {
    const groups = await nextConfig.headers!();
    const root = groups.find((g) => g.source === "/:path*")!;
    const csp = root.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    // The third parties the app legitimately talks to must remain allow-listed.
    expect(csp).toContain("https://api.workos.com");
    expect(csp).toContain("https://maps.googleapis.com");
    expect(csp).toContain("https://*.mukoko.com");
  });

  it("sets the transport, framing and isolation headers", async () => {
    const groups = await nextConfig.headers!();
    const root = groups.find((g) => g.source === "/:path*")!;
    const byKey = Object.fromEntries(root.headers.map((h) => [h.key, h.value]));

    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    expect(byKey["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(byKey["X-Permitted-Cross-Domain-Policies"]).toBe("none");
    expect(byKey["Strict-Transport-Security"]).toContain("max-age=");
    expect(byKey["Strict-Transport-Security"]).toContain("includeSubDomains");
  });

  it("denies powerful browser features via Permissions-Policy", async () => {
    const groups = await nextConfig.headers!();
    const root = groups.find((g) => g.source === "/:path*")!;
    const pp = root.headers.find((h) => h.key === "Permissions-Policy")?.value ?? "";

    for (const feature of ["camera=()", "microphone=()", "geolocation=()", "browsing-topics=()"]) {
      expect(pp).toContain(feature);
    }
  });
});
