import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Db } from "@/lib/db/client";
import { ensureAppendOnlyTriggers } from "@/lib/db/append-only-triggers";
import { DB_PATH } from "@/lib/db/paths";
import * as schema from "@/lib/db/schema";
import { assertNotProduction } from "./index";
import { seedRulesAndParameters } from "./loaders/rules";

function openSeedDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureAppendOnlyTriggers(sqlite);
  return drizzle(sqlite, { schema }) as Db;
}

async function main() {
  assertNotProduction();
  const db = openSeedDb();
  await seedRulesAndParameters(db);
  console.log("Rules and parameters seed complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
