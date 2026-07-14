/**
 * Redirect tests (NYU-24 IA refresh).
 *
 * The Kraal → Circles rename must keep every old /kraal link working with
 * permanent redirects so search engines and shared links transfer.
 */

import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

describe("next.config redirects", () => {
  it("permanently redirects /kraal to /circles", async () => {
    const redirects = await nextConfig.redirects!();
    const index = redirects.find((r) => r.source === "/kraal");
    expect(index).toBeDefined();
    expect(index!.destination).toBe("/circles");
    expect(index!.permanent).toBe(true);
  });

  it("permanently redirects /kraal/:id to /circles/:id", async () => {
    const redirects = await nextConfig.redirects!();
    const detail = redirects.find((r) => r.source === "/kraal/:id");
    expect(detail).toBeDefined();
    expect(detail!.destination).toBe("/circles/:id");
    expect(detail!.permanent).toBe(true);
  });

  it("does not redirect any of the live IA routes", async () => {
    const redirects = await nextConfig.redirects!();
    const sources = redirects.map((r) => r.source);
    for (const live of ["/", "/discover", "/events", "/circles"]) {
      expect(sources).not.toContain(live);
    }
  });
});
