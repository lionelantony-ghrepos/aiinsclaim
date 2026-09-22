import type { UserRole } from "@/lib/db/schema/enums";

const ROLE_HOME: Record<UserRole, string> = {
  claimant: "/claims",
  intake_agent: "/intake/new",
  adjuster: "/queue",
  supervisor: "/dashboard",
  siu_analyst: "/queue",
  admin: "/rules",
};

export function getRoleHomePath(role: UserRole): string {
  return ROLE_HOME[role];
}
