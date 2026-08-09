import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const getMongoClient = vi.fn();
vi.mock("@/lib/mongo/client", () => ({ getMongoClient: () => getMongoClient() }));

/** A client whose admin ping resolves. */
function healthyClient() {
  return { db: () => ({ command: vi.fn().mockResolvedValue({ ok: 1 }) }) };
}

const ORIGINAL_URI = process.env.MONGODB_URI;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONGODB_URI = "mongodb://localhost:27017";
});

afterEach(() => {
  if (ORIGINAL_URI === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = ORIGINAL_URI;
});

describe("GET /api/health", () => {
  it("reports ok and 200 when Mongo answers", async () => {
    getMongoClient.mockResolvedValue(healthyClient());
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Health-Status")).toBe("ok");
    expect(body.status).toBe("ok");
    expect(body.checks.mongodb.status).toBe("ok");
    expect(body.checks.mongodb.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports down and 503 when Mongo is unreachable", async () => {
    // The case that matters: the app still renders (every read degrades to
    // empty by contract), so a 200 on `/` is not evidence of health. This
    // endpoint is what tells the difference.
    getMongoClient.mockRejectedValue(new Error("connection refused"));
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Health-Status")).toBe("down");
    expect(body.checks.mongodb.status).toBe("down");
  });

  it("never leaks the connection string in an error", async () => {
    // Driver errors routinely carry the full URI, credentials included, and
    // this endpoint is public and unauthenticated.
    const uri = "mongodb+srv://user:hunter2@cluster.example.net";
    getMongoClient.mockRejectedValue(new Error(`failed to connect to ${uri}`));
    const { GET } = await import("./route");

    const serialised = JSON.stringify(await (await GET()).json());
    expect(serialised).not.toContain("hunter2");
    expect(serialised).not.toContain("cluster.example.net");
  });

  it("reports skipped, not down, when MONGODB_URI is unset", async () => {
    // Unconfigured is a deployment fact, not a fault to page someone about.
    delete process.env.MONGODB_URI;
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.mongodb.status).toBe("skipped");
    expect(getMongoClient).not.toHaveBeenCalled();
  });

  it("is never cached", async () => {
    getMongoClient.mockResolvedValue(healthyClient());
    const { GET } = await import("./route");
    expect((await GET()).headers.get("Cache-Control")).toContain("no-store");
  });

  it("answers HEAD with a status code and no body", async () => {
    getMongoClient.mockResolvedValue(healthyClient());
    const { HEAD } = await import("./route");

    const response = await HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Health-Status")).toBe("ok");
    expect(await response.text()).toBe("");
  });

  it("is force-dynamic, so a probe reflects now and not build time", async () => {
    const route = await import("./route");
    expect(route.dynamic).toBe("force-dynamic");
  });
});
