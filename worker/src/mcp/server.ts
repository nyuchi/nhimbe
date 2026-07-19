/**
 * Stateless Streamable-HTTP MCP endpoint (JSON-RPC 2.0).
 *
 * The nhimbe MCP is task-based and stateless: every `tools/call` is a
 * self-contained request that fans out to the app API, so we don't need SSE
 * streaming or per-session Durable Objects. A single POST carries one JSON-RPC
 * message (or a batch); we answer with `application/json`. This keeps the
 * worker fetch-native and dependency-free.
 *
 * Implements the handshake + tool surface of the MCP spec: `initialize`,
 * `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
 */

import type { Env } from "../types";
import { callTool, listToolDescriptors, type ToolContext } from "./tools";

/** Latest MCP protocol revision we implement; echoed back if the client omits one. */
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SERVER_VERSION = "1.0.0";

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

function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

/** True for a JSON-RPC notification (a call with no `id` → no response expected). */
function isNotification(msg: JsonRpcRequest): boolean {
  return msg.id === undefined;
}

async function handleMessage(msg: JsonRpcRequest, ctx: ToolContext, env: Env) {
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize": {
      const requested = (msg.params?.protocolVersion as string | undefined) ?? DEFAULT_PROTOCOL_VERSION;
      return result(id, {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: env.MCP_SERVER_NAME || "nhimbe",
          version: SERVER_VERSION,
        },
        instructions:
          "Nhimbe events. Use events_near_me and events_matching_interests to discover events, " +
          "get_event to look one up, and create_event/update_event to host (sign-in required).",
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

/**
 * Handle a POST to the MCP endpoint. Accepts a single JSON-RPC message or a
 * batch array. Returns `application/json`, or `202 Accepted` with no body when
 * the request contained only notifications.
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
    return new Response(JSON.stringify(error(null, -32700, "Parse error")), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Bearer token (if any) authorizes the write tools; forwarded to the app.
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() || undefined : undefined;
  const ctx: ToolContext = { env, token };

  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = [];
  for (const raw of messages) {
    const msg = raw as JsonRpcRequest;
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      responses.push(error((msg && msg.id) ?? null, -32600, "Invalid Request"));
      continue;
    }
    const response = await handleMessage(msg, ctx, env);
    if (response) responses.push(response);
  }

  if (responses.length === 0) {
    return new Response(null, { status: 202 });
  }

  const body = Array.isArray(payload) ? responses : responses[0];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
