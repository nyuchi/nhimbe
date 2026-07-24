/**
 * Protocol-version support matrix for the dual-era nhimbe MCP server.
 *
 * The server speaks two "eras" of the Model Context Protocol on one endpoint
 * (the pattern the 2026-07-28 revision's versioning page calls a "dual-era
 * server"):
 *
 * - MODERN (2026-07-28, BETA): stateless per-request metadata. No initialize
 *   handshake; every request carries its protocol version, client info and
 *   capabilities in `params._meta`, and `server/discover` replaces the
 *   handshake for capability discovery. Built against the 2026-07-28 RELEASE
 *   CANDIDATE (final publication expected 2026-07-28) — treat as beta until
 *   the final spec is verified.
 * - LEGACY (2025-06-18 and earlier): `initialize`/`notifications/initialized`
 *   handshake, `ping`, and the classic tool surface. Kept unchanged for the
 *   12-month deprecation window.
 *
 * A request selects its era by how it presents: modern per-request `_meta`
 * (or a modern `MCP-Protocol-Version` header) → modern semantics; everything
 * else → legacy semantics.
 */

/** Modern (stateless) revisions we implement. First entry is preferred. */
export const MODERN_PROTOCOL_VERSIONS = ["2026-07-28"] as const;

/** Legacy (handshake) revisions we implement. First entry is the newest. */
export const LEGACY_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

/** What legacy `initialize` falls back to when the requested version is unknown. */
export const LATEST_LEGACY_VERSION = LEGACY_PROTOCOL_VERSIONS[0];

/**
 * Server software version. The `-beta` pre-release tag flags that 2026-07-28
 * support is built against the release candidate, not the final publication.
 * Keep in sync with worker/package.json.
 */
export const SERVER_VERSION = "2.0.0-beta.1";

export function isModernVersion(version: string | null | undefined): boolean {
  return !!version && (MODERN_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

/**
 * Legacy `initialize` negotiation (2025-06-18 lifecycle rules): echo the
 * requested version when we support it, otherwise answer with the latest
 * legacy revision we do support.
 */
export function negotiateLegacyVersion(requested: string | undefined): string {
  if (requested && (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) {
    return requested;
  }
  return LATEST_LEGACY_VERSION;
}

/** Well-known `_meta` keys defined by the 2026-07-28 revision. */
export const META_KEYS = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
} as const;

/** JSON-RPC error codes from the MCP-reserved range (-32020..-32099). */
export const MCP_ERROR_CODES = {
  /** HTTP headers missing/malformed or not matching the request body. */
  headerMismatch: -32020,
  /** Requested protocol version is not supported by this server. */
  unsupportedProtocolVersion: -32022,
} as const;
