/**
 * nhimbe-mcp — environment + shared types.
 *
 * The worker is now a single-purpose, task-based MCP server (see `src/mcp/`).
 * It owns no data: every tool reads and writes through the nhimbe app API at
 * `APP_API_URL` (`https://nhimbe.com/api`). Auth for write tools is a WorkOS
 * access token that the MCP client presents as `Authorization: Bearer …`; the
 * worker forwards it to the app, which is the trust boundary.
 */

export interface Env {
  /** "development" | "staging" | "production". */
  ENVIRONMENT?: string;
  /** Comma-separated extra CORS origins (in addition to the *.nhimbe.com/etc allowlist). */
  ALLOWED_ORIGINS?: string;
  /** Base origin of the nhimbe app, e.g. https://nhimbe.com. Tools call `${APP_API_URL}/api/...`. */
  APP_API_URL?: string;
  /** Display name advertised in the MCP `initialize` handshake. */
  MCP_SERVER_NAME?: string;
}
