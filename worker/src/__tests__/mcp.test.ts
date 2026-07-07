import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleMcpRequest } from "../mcp/server";
import type { Env } from "../types";

const env: Env = { APP_API_URL: "https://app.test", MCP_SERVER_NAME: "nhimbe" };

function rpc(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://nhimbe.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  return JSON.parse(await res.text());
}

describe("MCP server — handshake", () => {
  it("responds to initialize with serverInfo + tools capability", async () => {
    const res = await handleMcpRequest(
      rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
      env,
    );
    const body = await json(res);
    expect(body.result.serverInfo.name).toBe("nhimbe");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("lists the task tools", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }), env);
    const body = await json(res);
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("events_near_me");
    expect(names).toContain("events_matching_interests");
    expect(names).toContain("get_event");
    expect(names).toContain("create_event");
    expect(names).toContain("update_event");
  });

  it("answers ping", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 3, method: "ping" }), env);
    expect((await json(res)).result).toEqual({});
  });

  it("returns 202 with no body for a notification", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }), env);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("returns method-not-found for an unknown request", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 9, method: "does/notExist" }), env);
    expect((await json(res)).error.code).toBe(-32601);
  });

  it("rejects GET with 405", async () => {
    const res = await handleMcpRequest(new Request("https://nhimbe.com/mcp", { method: "GET" }), env);
    expect(res.status).toBe(405);
  });
});

describe("MCP server — tools/call", () => {
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

  it("events_near_me returns text + an HTML resource", async () => {
    const res = await handleMcpRequest(
      rpc({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "events_near_me", arguments: { city: "Harare" } },
      }),
      env,
    );
    const body = await json(res);
    const content = body.result.content;
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Sunset Sessions");
    const resource = content.find((c: { type: string }) => c.type === "resource");
    expect(resource.resource.mimeType).toBe("text/html");
    expect(resource.resource.text).toContain("Sunset Sessions");
  });

  it("create_event without a bearer token is an auth error, not a crash", async () => {
    const res = await handleMcpRequest(
      rpc({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "create_event", arguments: { name: "X", startDate: "2026-08-01T18:00:00Z" } },
      }),
      env,
    );
    const body = await json(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/signed in/i);
  });
});
