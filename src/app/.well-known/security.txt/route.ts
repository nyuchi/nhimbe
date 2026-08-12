// /.well-known/security.txt — RFC 9116 vulnerability-disclosure contact.
//
// A route handler rather than a static file in `public/` on purpose: RFC 9116
// makes `Expires` mandatory and requires it to be less than a year out, so a
// checked-in file quietly becomes non-compliant the moment it ages past that.
// Deriving it per request means it can never expire.

import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** Days ahead to set `Expires`. Well inside RFC 9116's one-year maximum. */
const EXPIRY_DAYS = 180;

export function buildSecurityTxt(now: Date = new Date()): string {
  const expires = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  // Both production origins serve this app, and RFC 9116 §2.5.5 wants every
  // URI the file is reachable at listed — a mismatch is grounds for a scanner
  // to distrust it.
  const canonicals = [SITE_URL, "https://nhimbe.com"]
    .filter((origin, i, all) => all.indexOf(origin) === i)
    .map((origin) => `Canonical: ${origin}/.well-known/security.txt`)
    .join("\n");

  return `# Nhimbe — security contact (RFC 9116)
# Please report vulnerabilities privately; do not open a public GitHub issue.

Contact: mailto:security@nyuchi.com
Expires: ${expires.toISOString()}
Preferred-Languages: en
${canonicals}
Policy: https://github.com/nyuchi/nhimbe/blob/main/SECURITY.md
`;
}

export async function GET() {
  return new Response(buildSecurityTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
