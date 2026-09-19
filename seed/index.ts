import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  DEMO_ACCOUNT_EMAILS,
  DEMO_PASSWORD,
} from "../src/lib/auth/demo-accounts";
import { users } from "../src/lib/db/schema";
import { DB_PATH } from "../src/lib/db/paths";
import { loadSqliteVec } from "../src/lib/db/vec";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in production");
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("foreign_keys = ON");
  loadSqliteVec(sqlite);
  const db = drizzle(sqlite);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const demoUsers = [
    {
      id: randomUUID(),
      email: DEMO_ACCOUNT_EMAILS.admin,
      displayName: "Demo Admin",
      role: "admin" as const,
      authorityLevel: 4,
    },
    {
      id: randomUUID(),
      email: DEMO_ACCOUNT_EMAILS.supervisor,
      displayName: "Demo Supervisor",
      role: "supervisor" as const,
      authorityLevel: 3,
    },
    {
      id: randomUUID(),
      email: DEMO_ACCOUNT_EMAILS.adjuster,
      displayName: "Demo Adjuster",
      role: "adjuster" as const,
      authorityLevel: 2,
    },
    {
      id: randomUUID(),
      email: DEMO_ACCOUNT_EMAILS.intake_agent,
      displayName: "Demo Intake Agent",
      role: "intake_agent" as const,
      authorityLevel: 1,
    },
    {
      id: randomUUID(),
      email: DEMO_ACCOUNT_EMAILS.siu_analyst,
      displayName: "Demo SIU Analyst",
      role: "siu_analyst" as const,
      authorityLevel: 2,
    },
    {
      id: randomUUID(),
      email: DEMO_ACCOUNT_EMAILS.claimant,
      displayName: "Demo Claimant",
      role: "claimant" as const,
      authorityLevel: 0,
    },
  ];

  for (const user of demoUsers) {
    await db
      .insert(users)
      .values({
        ...user,
        passwordHash,
        specialties: [],
      })
      .onConflictDoNothing({ target: users.email });
  }

  console.log(`Seed complete. Demo password for all accounts: ${DEMO_PASSWORD}`);
  console.log(
    demoUsers.map((user) => `${user.role}: ${user.email}`).join("\n"),
  );
  sqlite.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
