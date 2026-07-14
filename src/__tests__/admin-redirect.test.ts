/**
 * /admin redirect stub (#69) — the public app no longer ships an admin
 * surface; next.config must forward the old paths to the standalone admin
 * project (env-configurable, default https://admin.nhimbe.com).
 */

import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

type Redirect = { source: string; destination: string; permanent: boolean };

async function getRedirects(): Promise<Redirect[]> {
  return (await nextConfig.redirects?.()) as Redirect[];
}

describe("/admin → standalone admin app redirect", () => {
  it("redirects /admin to the admin app (temporary, so the URL can move)", async () => {
    const redirects = await getRedirects();
    const root = redirects.find((r) => r.source === "/admin");
    expect(root).toBeDefined();
    expect(root!.destination).toBe("https://admin.nhimbe.com");
    expect(root!.permanent).toBe(false);
  });

  it("maps /admin/users onto the standalone app's /people", async () => {
    const redirects = await getRedirects();
    const users = redirects.find((r) => r.source === "/admin/users");
    expect(users?.destination).toBe("https://admin.nhimbe.com/people");
  });

  it("forwards deep admin paths wholesale", async () => {
    const redirects = await getRedirects();
    const deep = redirects.find((r) => r.source === "/admin/:path*");
    expect(deep?.destination).toBe("https://admin.nhimbe.com/:path*");
    expect(deep?.permanent).toBe(false);
  });

  it("keeps the kraal → circles redirects intact", async () => {
    const redirects = await getRedirects();
    expect(redirects.some((r) => r.source === "/kraal")).toBe(true);
  });
});
