/**
 * nhimbe-mcp — Cloudflare Worker hosting the nhimbe task-based MCP server.
 *
 * This worker is deployed behind the nhimbe zone at `nhimbe.com/mcp/*` (the
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
    allowHeaders: ["Content-Type", "Authorization", "MCP-Protocol-Version"],
    maxAge: 86400,
  }),
);

// Status / discovery landing.
app.get("/", (c) =>
  c.json({
    name: c.env.MCP_SERVER_NAME || "nhimbe",
    description: "nhimbe events — task-based MCP server",
    transport: "streamable-http",
    endpoint: "/mcp",
    environment: c.env.ENVIRONMENT ?? "development",
  }),
);

// MCP JSON-RPC endpoint.
app.post("/mcp", (c) => handleMcpRequest(c.req.raw, c.env));
app.get("/mcp", (c) =>
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
