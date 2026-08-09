import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Integration tests run against a REAL MongoDB (mongodb-memory-server), not
// mocked collections.
//
// Kept as a separate suite, and separate from `test:run`, for one practical
// reason: the first run downloads a ~120MB mongod binary. The unit suite is
// ~680 fast tests that should stay fast, so this opts in explicitly and CI
// runs it as its own cached job.
//
// What it buys: hand-rolled cursor stubs will happily accept a query real
// MongoDB rejects — a malformed aggregation stage, an operator that doesn't
// exist, an index-less sort on the wrong field. Those only surface against a
// real server.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["./src/__integration__/global-setup.ts"],
    setupFiles: ["./src/__integration__/setup.ts"],
    // Boot cost is paid once; parallel files would each want their own server.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000, // first run downloads the mongod binary
  },
});
