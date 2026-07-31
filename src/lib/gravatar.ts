/**
 * Gravatar lookup — lets a person adopt their existing Gravatar as their
 * Nhimbe avatar without an upload. Server-only: hashing runs here so the
 * existence check (a plain HTTPS GET) isn't subject to browser CORS, and the
 * email never needs to leave the server to resolve the avatar URL.
 */

import "server-only";
import { createHash } from "node:crypto";

/** Gravatar's algorithm: trim, lowercase, then SHA-256 the email. */
export function gravatarHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function gravatarUrl(hash: string, size = 256): string {
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/**
 * Resolve `email` to a Gravatar image URL, or null if that email has no
 * Gravatar set (the `d=404` param makes Gravatar 404 instead of falling back
 * to a generated placeholder, so a plain status check tells us which case
 * we're in).
 */
export async function findGravatarUrl(email: string): Promise<string | null> {
  const url = gravatarUrl(gravatarHash(email));
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}
