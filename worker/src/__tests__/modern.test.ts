/**
 * Tests for the MODERN era (protocol revision 2026-07-28, BETA — built against
 * the release candidate): stateless per-request `_meta`, `server/discover`,
 * request-metadata header validation, and modern result shapes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleMcpRequest } from "../mcp/server";
import type { Env } from "../types";

const env: Env = { APP_API_URL: "https://app.test", MCP_SERVER_NAME: "nhimbe" };

const VERSION = "2026-07-28";
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

function meta(overrides: Record<string, unknown> = {}) {
  return {
    [META_VERSION]: VERSION,
    "io.modelcontextprotocol/clientInfo": { name: "TestClient", version: "1.0.0" },
    "io.modelcontextprotocol/clientCapabilities": {},
    ...overrides,
  };
}

function modernRpc(
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Request {
  return new Request("https://events.mukoko.com/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": VERSION,
      "Mcp-Method": method,
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: { _meta: meta(), ...params },
    }),
  });
}

async function json(res: Response) {
  return JSON.parse(await res.text());
}

describe("modern era — server/discover", () => {
  it("advertises supported versions, capabilities and serverInfo", async () => {
    const res = await handleMcpRequest(modernRpc("server/discover"), env);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.result.resultType).toBe("complete");
    expect(body.result.supportedVersions).toEqual([VERSION]);
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result._meta[META_SERVER_INFO].name).toBe("nhimbe");
    expect(body.result._meta[META_SERVER_INFO].version).toMatch(/beta/);
    expect(body.result.instructions).toMatch(/BETA/);
    expect(body.result.ttlMs).toBeGreaterThan(0);
    expect(body.result.cacheScope).toBe("public");
  });
});

describe("modern era — version negotiation", () => {
  it("rejects an unsupported modern version with UnsupportedProtocolVersionError", async () => {
    const res = await handleMcpRequest(
      new Request("https://events.mukoko.com/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-11-25",
          "Mcp-Method": "tools/list",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: meta({ [META_VERSION]: "2025-11-25" }) },
        }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.code).toBe(-32022);
    expect(body.error.data.supported).toEqual([VERSION]);
    expect(body.error.data.requested).toBe("2025-11-25");
  });

  it("rejects a header/_meta version mismatch with HeaderMismatch", async () => {
    const res = await handleMcpRequest(
      modernRpc("tools/list", {}, { "MCP-Protocol-Version": "1900-01-01" }),
      env,
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32020);
  });

  it("rejects a modern header with no _meta version as HeaderMismatch", async () => {
    const res = await handleMcpRequest(
      new Request("https://events.mukoko.com/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": VERSION,
          "Mcp-Method": "tools/list",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32020);
  });
});

describe("modern era — request metadata headers", () => {
  it("rejects a missing Mcp-Method header", async () => {
    const req = new Request("https://events.mukoko.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "MCP-Protocol-Version": VERSION },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: meta() },
      }),
    });
    const res = await handleMcpRequest(req, env);
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32020);
  });

  it("rejects an Mcp-Method header that does not match the body method", async () => {
    const res = await handleMcpRequest(
      modernRpc("tools/list", {}, { "Mcp-Method": "tools/call" }),
      env,
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32020);
  });

  it("rejects tools/call without an Mcp-Name header", async () => {
    const res = await handleMcpRequest(
      modernRpc("tools/call", { name: "get_event", arguments: { eventId: "x" } }),
      env,
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32020);
  });

  it("rejects an Mcp-Name header that does not match params.name", async () => {
    const res = await handleMcpRequest(
      modernRpc(
        "tools/call",
        { name: "get_event", arguments: { eventId: "x" } },
        { "Mcp-Name": "events_near_me" },
      ),
      env,
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32020);
  });

  it("decodes a Base64-sentinel Mcp-Name header before comparing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ events: [] }), { status: 200 })),
    );
    try {
      // "events_near_me" in the =?base64?...?= sentinel format.
      const encoded = `=?base64?${btoa("events_near_me")}?=`;
      const res = await handleMcpRequest(
        modernRpc("tools/call", { name: "events_near_me", arguments: {} }, { "Mcp-Name": encoded }),
        env,
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.result.resultType).toBe("complete");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("modern era — methods", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            events: [
              {
                id: "evt_1",
                slug: "sunset",
                name: "Sunset Sessions",
                startDate: "2026-08-01T18:00:00Z",
                location: { name: "Harare Gardens", addressLocality: "Harare" },
                category: "Music",
                attendeeCount: 42,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tools/list carries resultType, cache hints and deterministic order", async () => {
    const first = await json(await handleMcpRequest(modernRpc("tools/list"), env));
    const second = await json(await handleMcpRequest(modernRpc("tools/list"), env));
    expect(first.result.resultType).toBe("complete");
    expect(first.result.ttlMs).toBeGreaterThan(0);
    expect(first.result.cacheScope).toBe("public");
    const names = first.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("events_near_me");
    expect(names).toEqual(second.result.tools.map((t: { name: string }) => t.name));
  });

  it("tools/call returns a modern-shaped result with content", async () => {
    const res = await handleMcpRequest(
      modernRpc(
        "tools/call",
        { name: "events_near_me", arguments: { city: "Harare" } },
        { "Mcp-Name": "events_near_me" },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.result.resultType).toBe("complete");
    expect(body.result._meta[META_SERVER_INFO].name).toBe("nhimbe");
    expect(body.result.content[0].text).toContain("Sunset Sessions");
  });

  it("removed legacy methods (ping, initialize) are 404 method-not-found under modern semantics", async () => {
    for (const method of ["ping", "initialize"]) {
      const res = await handleMcpRequest(modernRpc(method), env);
      expect(res.status).toBe(404);
      expect((await json(res)).error.code).toBe(-32601);
    }
  });

  it("rejects a batch under modern semantics", async () => {
    const req = new Request("https://events.mukoko.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "MCP-Protocol-Version": VERSION },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta() } },
      ]),
    });
    const res = await handleMcpRequest(req, env);
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32600);
  });
});
