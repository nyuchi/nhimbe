// MCP Server Card for nhimbe, served at /.well-known/mcp/server-card.json.
// Implements the SEP-1649 MCP Server Card discovery document so agents and
// scanners can discover the MCP tools associated with nhimbe.
//
// Note: nhimbe does NOT host its own MCP server. The `transport.endpoint`
// below points at the shared Mukoko tools MCP gateway
// (https://tools.nyuchi.com/mcp), a real WorkOS-protected resource that
// exposes the ecosystem's agent tools. The `tools` list here mirrors the
// nhimbe-relevant tools available through that gateway (and via WebMCP on
// nhimbe.com).

export const dynamic = "force-static";

const serverCard = {
  serverInfo: { name: "nhimbe", version: "1.0.0" },
  name: "nhimbe",
  description:
    "African community events discovery and management. Agent tools for searching, listing and inspecting events are exposed via the Mukoko tools gateway and via WebMCP on nhimbe.com.",
  transport: { type: "streamable-http", endpoint: "https://tools.nyuchi.com/mcp" },
  capabilities: ["tools"],
  authorization: {
    type: "oauth2",
    resource_metadata: "https://nhimbe.com/.well-known/oauth-protected-resource",
    authorization_servers: ["https://api.workos.com"],
  },
  tools: [
    {
      name: "search_events",
      description:
        "Semantic search over published nhimbe events by free-text query, optional city and category.",
    },
    {
      name: "list_events",
      description:
        "List upcoming published nhimbe events, optionally filtered by city or category.",
    },
    {
      name: "get_event",
      description: "Fetch a single nhimbe event by id, slug or short code.",
    },
  ],
} as const;

export async function GET() {
  return new Response(JSON.stringify(serverCard), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
