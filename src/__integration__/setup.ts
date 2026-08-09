// Per-test-process setup for the integration suite.
//
// `global-setup.ts` boots the in-memory server and sets MONGODB_URI before
// any worker spawns, so workers inherit it. That ordering matters: the app's
// Mongo client reads `process.env.MONGODB_URI` at MODULE LOAD, so setting it
// later — from inside a test — would be too late and the client would already
// have decided it was unconfigured.

import { beforeAll, vi } from "vitest";

// `server-only` throws outside an RSC bundle; the Mongo layer is guarded with
// it by design, and unit tests stub it the same way.
vi.mock("server-only", () => ({}));

beforeAll(() => {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is unset — global-setup.ts should have booted an in-memory " +
        "MongoDB before workers spawned. Run via `npm run test:integration`.",
    );
  }
});
