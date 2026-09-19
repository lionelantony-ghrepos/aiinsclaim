import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { users } from "../src/lib/db/schema";
import { DB_PATH } from "../src/lib/db/paths";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in production");
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const demoUsers = [
    {
      id: randomUUID(),
      email: "admin@demo.local",
      displayName: "Demo Admin",
      role: "admin" as const,
      authorityLevel: 4,
    },
    {
      id: randomUUID(),
      email: "adjuster@demo.local",
      displayName: "Demo Adjuster",
      role: "adjuster" as const,
      authorityLevel: 2,
    },
    {
      id: randomUUID(),
      email: "claimant@demo.local",
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

  console.log("Seed complete. Demo password for all accounts: demo1234");
  console.log(
    demoUsers.map((u) => `${u.role}: ${u.email}`).join("\n"),
  );
  sqlite.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
