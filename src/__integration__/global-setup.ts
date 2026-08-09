// Boots one in-memory MongoDB for the whole integration run and exposes its
// URI to the test processes. Torn down afterwards so no stray mongod survives.

import { MongoMemoryServer } from "mongodb-memory-server-core";

let server: MongoMemoryServer | undefined;

export async function setup() {
  server = await MongoMemoryServer.create();
  // Read by src/__integration__/setup.ts in each test process. `provide` isn't
  // used because the app's Mongo client reads process.env at module load.
  process.env.MONGODB_URI = server.getUri();
}

export async function teardown() {
  await server?.stop();
}
