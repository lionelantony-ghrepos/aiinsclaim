import type { UserRole } from "@/lib/db/schema/enums";
import { ROLE_LABELS } from "@/lib/ui/role-labels";

export const DEMO_PASSWORD = "demo1234";

export const DEMO_ACCOUNT_EMAILS: Record<UserRole, string> = {
  claimant: "claimant@demo.local",
  intake_agent: "intake@demo.local",
  adjuster: "adjuster@demo.local",
  supervisor: "supervisor@demo.local",
  siu_analyst: "siu@demo.local",
  admin: "admin@demo.local",
};

export const DEMO_ACCOUNTS = (Object.entries(DEMO_ACCOUNT_EMAILS) as [
  UserRole,
  string,
][]).map(([role, email]) => ({
  role,
  label: ROLE_LABELS[role],
  email,
}));
