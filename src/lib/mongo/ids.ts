/**
 * Helpers for writing Mukoko v3.1 documents.
 *
 * Every document on the cluster uses a string UUID `_id` (the same format the
 * `identity.persons._id` uses as an OIDC `sub`) and carries a `_schemaVersion`
 * discriminator plus `createdAt`/`updatedAt` timestamps that the validators
 * require. These helpers keep inserts consistent with the validators.
 */

import "server-only";
import type { SchemaVersion } from "./types";

/** Current write schema version for documents nhimbe creates. */
export const WRITE_SCHEMA_VERSION: SchemaVersion = "v3.1";

/** Generate a fresh string UUID `_id`. */
export function newId(): string {
  return crypto.randomUUID();
}

/** URL-safe slug from a human string, with a short random suffix for uniqueness. */
export function slugify(input: string, withSuffix = true): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!withSuffix) return base || "item";
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base || "item"}-${suffix}`;
}

/**
 * Stamp the common audit/version fields onto a new document body. Spread the
 * result into an insert: `await col.insertOne({ ...stampNew(), name, ... })`.
 */
export function stampNew(id: string = newId()): {
  _id: string;
  _schemaVersion: SchemaVersion;
  createdAt: Date;
  updatedAt: Date;
} {
  const now = new Date();
  return { _id: id, _schemaVersion: WRITE_SCHEMA_VERSION, createdAt: now, updatedAt: now };
}
