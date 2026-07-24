/**
 * Stateless Streamable-HTTP MCP endpoint (JSON-RPC 2.0) — dual-era.
 *
 * The nhimbe MCP is task-based and stateless: every `tools/call` is a
 * self-contained request that fans out to the app API, so we don't need SSE
 * streaming or per-session Durable Objects. A single POST carries one JSON-RPC
 * message; we answer with `application/json`. This keeps the worker
 * fetch-native and dependency-free.
 *
 * Two protocol eras are served on the same endpoint (see versions.ts):
 *
 * - MODERN (2026-07-28, BETA — built against the release candidate):
 *   `server/discover`, `tools/list`, `tools/call`. Every request carries its
 *   protocol version, client info and capabilities in `params._meta`; results
 *   carry `resultType: "complete"` and server identity in `_meta`. The
 *   `MCP-Protocol-Version`, `Mcp-Method` and (for tools/call) `Mcp-Name`
 *   headers are validated against the body per the transport spec.
 * - LEGACY (2025-06-18): `initialize`, `notifications/initialized`, `ping`,
 *   `tools/list`, `tools/call` — unchanged behavior for existing clients.
 *
 * A request is served under modern semantics when its `_meta` declares a
 * modern protocol version (or its MCP-Protocol-Version header names one);
 * everything else — including `initialize` — takes the legacy path.
 */

import type { Env } from "../types";
import { callTool, listToolDescriptors, type ToolContext } from "./tools";
import {
  isModernVersion,
  MCP_ERROR_CODES,
  META_KEYS,
  MODERN_PROTOCOL_VERSIONS,
  negotiateLegacyVersion,
  SERVER_VERSION,
} from "./versions";

const INSTRUCTIONS =
  "Nhimbe events. Use events_near_me and events_matching_interests to discover events, " +
  "get_event to look one up, and create_event/update_event to host (sign-in required).";

/** Freshness hint for cacheable list/discover results (1 hour). */
const CACHE_TTL_MS = 3_600_000;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcId = string | number | null;

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: "2.0" as const, id, result: value };
}

function error(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

/** True for a JSON-RPC notification (a call with no `id` → no response expected). */
function isNotification(msg: JsonRpcRequest): boolean {
  return msg.id === undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serverInfo(env: Env) {
  return { name: env.MCP_SERVER_NAME || "nhimbe", version: SERVER_VERSION };
}

// ---------------------------------------------------------------------------
// Legacy era (2025-06-18): initialize handshake + classic tool surface.
// ---------------------------------------------------------------------------

async function handleLegacyMessage(msg: JsonRpcRequest, ctx: ToolContext, env: Env) {
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion as string | undefined;
      return result(id, {
        protocolVersion: negotiateLegacyVersion(requested),
        capabilities: { tools: { listChanged: false } },
        serverInfo: serverInfo(env),
        instructions: INSTRUCTIONS,
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // notification — no response
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: listToolDescriptors() });
    case "tools/call": {
      const name = msg.params?.name as string | undefined;
      const args = (msg.params?.arguments as Record<string, unknown> | undefined) ?? {};
      if (!name) return error(id, -32602, "Invalid params: tool name is required");
      const toolResult = await callTool(name, args, ctx);
      return result(id, toolResult);
    }
    default:
      // Unknown notification → swallow; unknown request → method-not-found.
      if (isNotification(msg)) return null;
      return error(id, -32601, `Method not found: ${msg.method}`);
  }
}

// ---------------------------------------------------------------------------
// Modern era (2026-07-28, BETA): stateless per-request metadata.
// ---------------------------------------------------------------------------

/**
 * Decode a header value that may use the transport spec's Base64 sentinel
 * format (`=?base64?<value>?=`) for non-header-safe strings.
 */
function decodeHeaderValue(value: string): string {
  if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
  const encoded = value.slice("=?base64?".length, -"?=".length);
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value; // malformed encoding → will fail the equality check downstream
  }
}

interface ModernOutcome {
  body: unknown | null; // null → notification, answer 202
  status: number;
}

async function handleModernMessage(
  msg: JsonRpcRequest,
  request: Request,
  ctx: ToolContext,
  env: Env,
): Promise<ModernOutcome> {
  const id = msg.id ?? null;
  const meta = (msg.params?._meta ?? {}) as Record<string, unknown>;
  const metaVersion = meta[META_KEYS.protocolVersion];
  const headerVersion = request.headers.get("MCP-Protocol-Version");

  const mismatch = (message: string): ModernOutcome => ({
    body: error(id, MCP_ERROR_CODES.headerMismatch, message),
    status: 400,
  });

  if (typeof metaVersion !== "string") {
    return mismatch(
      "Header mismatch: MCP-Protocol-Version header names a modern revision but the request " +
        `body carries no "${META_KEYS.protocolVersion}" in params._meta`,
    );
  }
  if (!isModernVersion(metaVersion)) {
    return {
      body: error(
        id,
        MCP_ERROR_CODES.unsupportedProtocolVersion,
        "Unsupported protocol version (legacy revisions are served via the initialize handshake)",
        { supported: [...MODERN_PROTOCOL_VERSIONS], requested: metaVersion },
      ),
      status: 400,
    };
  }
  if (headerVersion !== metaVersion) {
    return mismatch(
      `Header mismatch: MCP-Protocol-Version header value '${headerVersion ?? ""}' does not ` +
        `match body value '${metaVersion}'`,
    );
  }
  const mcpMethod = request.headers.get("Mcp-Method");
  if (mcpMethod !== msg.method) {
    return mismatch(
      `Header mismatch: Mcp-Method header value '${mcpMethod ?? ""}' does not match body ` +
        `method '${msg.method}'`,
    );
  }

  // The 2026-07-28 core defines no client-to-server notifications on
  // Streamable HTTP; accept and ignore any that arrive.
  if (isNotification(msg)) return { body: null, status: 202 };

  const resultMeta = { [META_KEYS.serverInfo]: serverInfo(env) };

  switch (msg.method) {
    case "server/discover":
      return {
        body: result(id, {
          resultType: "complete",
          supportedVersions: [...MODERN_PROTOCOL_VERSIONS],
          capabilities: { tools: { listChanged: false } },
          instructions:
            `${INSTRUCTIONS} Note: 2026-07-28 protocol support is BETA — built against the ` +
            "release candidate; the final revision is expected 2026-07-28.",
          ttlMs: CACHE_TTL_MS,
          cacheScope: "public",
          _meta: resultMeta,
        }),
        status: 200,
      };
    case "tools/list":
      // Descriptors come from a static array, so the order is deterministic
      // as the spec asks (stable client caching / prompt-cache hits).
      return {
        body: result(id, {
          resultType: "complete",
          tools: listToolDescriptors(),
          ttlMs: CACHE_TTL_MS,
          cacheScope: "public",
          _meta: resultMeta,
        }),
        status: 200,
      };
    case "tools/call": {
      const name = msg.params?.name as string | undefined;
      if (!name) {
        return { body: error(id, -32602, "Invalid params: tool name is required"), status: 200 };
      }
      const rawName = request.headers.get("Mcp-Name");
      if (rawName === null || decodeHeaderValue(rawName) !== name) {
        return mismatch(
          `Header mismatch: Mcp-Name header value '${rawName ?? ""}' does not match body ` +
            `value '${name}'`,
        );
      }
      const args = (msg.params?.arguments as Record<string, unknown> | undefined) ?? {};
      const toolResult = await callTool(name, args, ctx);
      return {
        body: result(id, { ...toolResult, resultType: "complete", _meta: resultMeta }),
        status: 200,
      };
    }
    default:
      // Modern revision: unknown method → 404 with -32601 (per the transport
      // spec, the JSON-RPC body distinguishes this from a legacy 404).
      return {
        body: error(id, -32601, `Method not found: ${msg.method}`),
        status: 404,
      };
  }
}

// ---------------------------------------------------------------------------
// Entry point + era dispatch.
// ---------------------------------------------------------------------------

function declaresModernMeta(msg: JsonRpcRequest): boolean {
  const meta = msg.params?._meta;
  if (!meta || typeof meta !== "object") return false;
  return META_KEYS.protocolVersion in (meta as Record<string, unknown>);
}

/**
 * Handle a POST to the MCP endpoint. Accepts a single JSON-RPC message (either
 * era) or — legacy leniency — a batch array. Returns `application/json`, or
 * `202 Accepted` with no body for notifications.
 */
export async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify(error(null, -32600, "The MCP endpoint accepts POST JSON-RPC only")), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" },
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(error(null, -32700, "Parse error"), 400);
  }

  // Bearer token (if any) authorizes the write tools; forwarded to the app.
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() || undefined : undefined;
  const ctx: ToolContext = { env, token };

  const headerVersion = request.headers.get("MCP-Protocol-Version");

  if (Array.isArray(payload)) {
    // The modern revision requires one JSON-RPC message per POST.
    const modernBatch =
      isModernVersion(headerVersion) ||
      payload.some((m) => declaresModernMeta(m as JsonRpcRequest));
    if (modernBatch) {
      return jsonResponse(
        error(null, -32600, "Invalid Request: revision 2026-07-28 requires a single JSON-RPC message per POST"),
        400,
      );
    }
    // Legacy batch leniency (pre-2025-06-18 clients).
    const responses = [];
    for (const raw of payload) {
      const msg = raw as JsonRpcRequest;
      if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
        responses.push(error((msg && msg.id) ?? null, -32600, "Invalid Request"));
        continue;
      }
      const response = await handleLegacyMessage(msg, ctx, env);
      if (response) responses.push(response);
    }
    if (responses.length === 0) return new Response(null, { status: 202 });
    return jsonResponse(responses);
  }

  const msg = payload as JsonRpcRequest;
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return jsonResponse(error((msg && msg.id) ?? null, -32600, "Invalid Request"));
  }

  if (declaresModernMeta(msg) || isModernVersion(headerVersion)) {
    const outcome = await handleModernMessage(msg, request, ctx, env);
    if (outcome.body === null) return new Response(null, { status: outcome.status });
    return jsonResponse(outcome.body, outcome.status);
  }

  const response = await handleLegacyMessage(msg, ctx, env);
  if (!response) return new Response(null, { status: 202 });
  return jsonResponse(response);
}
