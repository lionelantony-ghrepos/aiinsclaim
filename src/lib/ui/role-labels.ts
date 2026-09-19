import type { UserRole } from "@/lib/db/schema/enums";

export const ROLE_LABELS: Record<UserRole, string> = {
  claimant: "Claimant",
  intake_agent: "Intake agent",
  adjuster: "Adjuster",
  supervisor: "Supervisor",
  siu_analyst: "SIU analyst",
  admin: "Admin",
};
