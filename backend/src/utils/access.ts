import type { AuthUserContext } from "../types/auth.js";

export type DataScope = "own" | "all";

export function isAdmin(user: AuthUserContext) {
  return user.role === "admin";
}

export function resolveDataScope(user: AuthUserContext, scope?: unknown): DataScope {
  if (isAdmin(user) && scope === "all") {
    return "all";
  }
  return "own";
}

export function requireAdmin(user: AuthUserContext) {
  if (!isAdmin(user)) {
    throw new Error("Admin access required");
  }
}

export function canAccessOtherUsersData(user: AuthUserContext) {
  return isAdmin(user);
}
