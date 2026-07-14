/**
 * Role hierarchy shared by the server gate (require-admin.ts) and the client
 * shell (locked nav affordances). Client-safe — no server-only import.
 *
 * Mirrors the UserRole hierarchy from the public app's auth-context; the
 * hierarchy MUST match. Widen here if you widen there.
 */

export type UserRole = "user" | "moderator" | "admin" | "super_admin";

export const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

export function hasRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function normaliseRole(value: string | null | undefined): UserRole {
  switch (value) {
    case "super_admin":
    case "admin":
    case "moderator":
    case "user":
      return value;
    default:
      return "user";
  }
}
