/**
 * MongoDB connection for the nhimbe full-stack app (Vercel, Node runtime).
 *
 * nhimbe runs as a Vercel-first Next.js app: RSC, Route Handlers and Server
 * Actions talk to the Mukoko MongoDB cluster directly via the official driver.
 * The browser NEVER connects to Mongo — `import "server-only"` makes a build
 * fail loudly if this module is ever pulled into a client bundle, since the
 * connection string is a server-only secret.
 *
 * Serverless connection reuse: each warm lambda instance keeps the same
 * `MongoClient` (and its connection pool) alive across invocations by stashing
 * the connect() promise on `globalThis`. Without this, every cold-ish
 * invocation would open a brand-new pool and we'd exhaust the cluster's
 * connection limit under load. This is the pattern Vercel + MongoDB recommend.
 */

import "server-only";
import { MongoClient, type MongoClientOptions } from "mongodb";

const uri = process.env.MONGODB_URI;

// Conservative pool sizing for serverless: many short-lived lambda instances,
// each holding a small pool, summing to the cluster's connection ceiling.
const options: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  // Fail fast instead of hanging a request when the cluster is unreachable.
  serverSelectionTimeoutMS: 8_000,
  retryWrites: true,
  appName: "nhimbe-web",
};

// Cache the connect() promise on globalThis so it survives module re-evaluation
// (dev HMR) and is shared across warm serverless invocations in the same
// instance. Typed via a module-scoped global declaration.
declare global {
  var __nhimbeMongoClientPromise: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  if (!uri) {
    throw new Error(
      "[mukoko] Missing MONGODB_URI — the MongoDB connection string must be " +
        "set as a server-only env var on Vercel (and in .env.local for dev).",
    );
  }
  return new MongoClient(uri, options).connect();
}

/**
 * Resolve the shared, connected MongoClient. Always `await` this at the call
 * site — it returns the cached connection on warm invocations.
 *
 * The connection is established lazily on the first call (not at module load)
 * so that merely importing a route handler during `next build` — where
 * MONGODB_URI is absent — never triggers a connection or throws.
 */
export function getMongoClient(): Promise<MongoClient> {
  if (!globalThis.__nhimbeMongoClientPromise) {
    // Never cache a *rejected* connection. If the very first connect() fails
    // (a transient Atlas blip during a cold start, a brief network hiccup),
    // a cached rejected promise would poison this serverless instance — every
    // later request would re-await the same rejection and fast-fail until the
    // instance is recycled. Clearing the cache on failure lets the next
    // request retry with a fresh connection.
    globalThis.__nhimbeMongoClientPromise = connect().catch((err) => {
      globalThis.__nhimbeMongoClientPromise = undefined;
      throw err;
    });
  }
  return globalThis.__nhimbeMongoClientPromise;
}
