import bcrypt from "bcryptjs";
import type { UserRole } from "@/lib/db/schema";
import { DEMO_ACCOUNT_EMAILS, DEMO_PASSWORD } from "@/lib/auth/demo-accounts";
import { deterministicId } from "../lib/deterministic-id";

export type SeedUser = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  authorityLevel: number;
  specialties: string[];
  isActive: boolean;
};

const ADJUSTER_SPECIALTIES = [
  ["auto"],
  ["property"],
  ["auto", "property"],
  ["bodily_injury"],
] as const;

export async function generateUsers(): Promise<SeedUser[]> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users: SeedUser[] = [];
  let index = 0;

  const addUser = (
    role: UserRole,
    displayName: string,
    email: string,
    authorityLevel: number,
    specialties: string[] = [],
  ) => {
    users.push({
      id: deterministicId("user", index),
      email,
      passwordHash,
      displayName,
      role,
      authorityLevel,
      specialties,
      isActive: true,
    });
    index += 1;
  };

  addUser("admin", "Demo Admin", DEMO_ACCOUNT_EMAILS.admin, 4);

  addUser("supervisor", "Demo Supervisor", DEMO_ACCOUNT_EMAILS.supervisor, 3);
  addUser(
    "supervisor",
    "Alex Supervisor",
    "supervisor2@demo.local",
    3,
  );

  for (const [i, specialties] of ADJUSTER_SPECIALTIES.entries()) {
    addUser(
      "adjuster",
      i === 0 ? "Demo Adjuster" : `Adjuster ${i + 1}`,
      i === 0 ? DEMO_ACCOUNT_EMAILS.adjuster : `adjuster${i + 1}@demo.local`,
      2,
      [...specialties],
    );
  }

  addUser("intake_agent", "Demo Intake Agent", DEMO_ACCOUNT_EMAILS.intake_agent, 1);
  addUser("siu_analyst", "Demo SIU Analyst", DEMO_ACCOUNT_EMAILS.siu_analyst, 2);

  addUser("claimant", "Demo Claimant", DEMO_ACCOUNT_EMAILS.claimant, 0);
  for (let i = 2; i <= 5; i += 1) {
    addUser("claimant", `Claimant ${i}`, `claimant${i}@demo.local`, 0);
  }

  return users;
}
