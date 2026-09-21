import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Db } from "@/lib/db/client";
import { ensureAppendOnlyTriggers } from "@/lib/db/append-only-triggers";
import { DB_PATH } from "@/lib/db/paths";
import * as schema from "@/lib/db/schema";
import { DEMO_PASSWORD } from "@/lib/auth/demo-accounts";
import { runFullSeed } from "./loaders/full-seed";

export function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in production");
  }
}

export async function runSeed(db: Db, sqlite: Database.Database) {
  assertNotProduction();
  return runFullSeed(db, sqlite);
}

function openSeedDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureAppendOnlyTriggers(sqlite);
  return { db: drizzle(sqlite, { schema }) as Db, sqlite };
}

async function main() {
  assertNotProduction();
  const { db, sqlite } = openSeedDb();
  const result = await runSeed(db, sqlite);
  console.log("Seed complete.", result);
  console.log(`Demo password for all accounts: ${DEMO_PASSWORD}`);
}

const entryScript = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entryScript.endsWith("seed/index.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
