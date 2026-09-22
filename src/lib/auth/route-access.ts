import type { UserRole } from "@/lib/db/schema/enums";
import { getRoleHomePath } from "./role-home";

type RouteRule = {
  pattern: RegExp;
  roles: readonly UserRole[];
};

const PROTECTED_ROUTE_RULES: readonly RouteRule[] = [
  {
    pattern: /^\/claims\/?$/,
    roles: ["claimant"],
  },
  {
    pattern: /^\/claims\/new(\/|$)/,
    roles: ["claimant"],
  },
  {
    pattern: /^\/claims\/[^/]+$/,
    roles: ["intake_agent", "adjuster", "supervisor", "siu_analyst", "admin"],
  },
  {
    pattern: /^\/siu(\/|$)/,
    roles: ["siu_analyst", "supervisor"],
  },
  {
    pattern: /^\/intake(\/|$)/,
    roles: ["intake_agent", "adjuster", "supervisor", "admin"],
  },
  {
    pattern: /^\/verify-extraction(\/|$)/,
    roles: ["intake_agent", "adjuster", "supervisor", "admin"],
  },
  {
    pattern: /^\/queue(\/|$)/,
    roles: ["intake_agent", "adjuster", "supervisor", "siu_analyst", "admin"],
  },
  {
    pattern: /^\/dashboard(\/|$)/,
    roles: ["supervisor", "admin"],
  },
  {
    pattern: /^\/rules(\/|$)/,
    roles: ["admin"],
  },
  {
    pattern: /^\/parameters(\/|$)/,
    roles: ["admin"],
  },
];

const PUBLIC_PATHS = new Set(["/login"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export function getAllowedRolesForPath(pathname: string): UserRole[] | null {
  for (const rule of PROTECTED_ROUTE_RULES) {
    if (rule.pattern.test(pathname)) {
      return [...rule.roles];
    }
  }
  return null;
}

export function canRoleAccessPath(role: UserRole, pathname: string): boolean {
  const allowedRoles = getAllowedRolesForPath(pathname);
  if (!allowedRoles) return true;
  return allowedRoles.includes(role);
}

export function resolvePostLoginRedirect(
  role: UserRole,
  nextPath: string | null | undefined,
): string {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    const pathOnly = nextPath.split("?")[0] ?? nextPath;
    if (!isPublicPath(pathOnly) && canRoleAccessPath(role, pathOnly)) {
      return nextPath;
    }
  }
  return getRoleHomePath(role);
}
