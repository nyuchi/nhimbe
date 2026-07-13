/**
 * Clamp a caller-supplied `return_to` to a safe local path. Anything that
 * isn't a plain absolute path (external URLs, protocol-relative `//host`,
 * backslash tricks like `/\`) falls back to the home page — never an open
 * redirect.
 *
 * This is a pure, dependency-free helper so it can be shared by the hosted
 * AuthKit route handler and client-side entry points alike.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
