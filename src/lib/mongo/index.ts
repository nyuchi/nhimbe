/**
 * Barrel for the nhimbe MongoDB data layer (Vercel server runtime only).
 *
 * Usage from RSC / Route Handlers / Server Actions:
 *   import { eventsCollection, newId, stampNew } from "@/lib/mongo";
 */

export { getMongoClient } from "./client";
export * from "./databases";
export * from "./ids";
export type * from "./types";
