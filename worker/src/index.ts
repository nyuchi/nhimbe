/**
 * nhimbe-mcp — Cloudflare Worker hosting the nhimbe task-based MCP server.
 *
 * This worker is deployed behind the mukoko zone at `events.mukoko.com/mcp/*` (the
 * zone is Cloudflare-proxied in front of Vercel; the Worker route intercepts
 * `/mcp/*` and everything else passes through to the app). It is the ONLY thing
 * that runs on the worker now — the legacy REST API, Supabase reads, Paynow,
 * Resend email and queues were all retired to the Vercel app.
 *
 * Endpoints:
 *   POST /mcp   — MCP JSON-RPC (Streamable HTTP, stateless)
 *   GET  /mcp   — 405 (no SSE stream; the server is stateless POST-only)
 *   GET  /      — human/status JSON
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { handleMcpRequest } from "./mcp/server";

const app = new Hono<{ Bindings: Env }>();

// CORS: the MCP endpoint is a public, credential-less API (auth is a bearer
// token, not a cookie), so reflect any origin and allow the Authorization
// header. Browser-based MCP clients need this; native clients ignore it.
app.use(
  "/mcp",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "MCP-Protocol-Version", "Mcp-Method", "Mcp-Name"],
    maxAge: 86400,
  }),
);

// Status / discovery landing.
app.get("/", (c) =>
  c.json({
    name: c.env.MCP_SERVER_NAME || "nhimbe",
    description: "Nhimbe events — task-based MCP server",
    transport: "streamable-http",
    endpoint: "/mcp",
    protocolVersions: {
      modern: ["2026-07-28"],
      legacy: ["2025-06-18", "2025-03-26", "2024-11-05"],
      note: "2026-07-28 support is beta — built against the release candidate (final spec expected 2026-07-28).",
    },
    environment: c.env.ENVIRONMENT ?? "development",
  }),
);

// MCP JSON-RPC endpoint. The Cloudflare route sends `/mcp` and `/mcp/*` here,
// so match both the bare path and any sub-path (trailing slash included).
app.on("POST", ["/mcp", "/mcp/*"], (c) => handleMcpRequest(c.req.raw, c.env));
app.on("GET", ["/mcp", "/mcp/*"], (c) =>
  c.json({ error: "Use POST for MCP JSON-RPC; this server is stateless (no SSE stream)." }, 405, {
    Allow: "POST",
  }),
);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error(JSON.stringify({ level: "error", module: "nhimbe-mcp", message: err.message }));
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
