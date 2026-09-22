import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureAppendOnlyTriggers } from "./append-only-triggers";
import { DB_PATH } from "./paths";
import * as schema from "./schema";

function createSqlite() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureAppendOnlyTriggers(sqlite);
  return sqlite;
}

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getSqlite() {
  if (!globalForDb.sqlite) {
    globalForDb.sqlite = createSqlite();
  }
  return globalForDb.sqlite;
}

export function getDb() {
  const sqlite = getSqlite();
  ensureAppendOnlyTriggers(sqlite);
  if (!globalForDb.db) {
    globalForDb.db = drizzle(sqlite, { schema });
  }
  return globalForDb.db;
}

export type Db = ReturnType<typeof getDb>;
