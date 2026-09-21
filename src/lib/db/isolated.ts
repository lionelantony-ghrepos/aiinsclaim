import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Db } from "./client";
import * as schema from "./schema";

export type IsolatedDb = {
  sqlite: Database.Database;
  db: Db;
  close: () => void;
};

export function openIsolatedDb(filePath?: string): IsolatedDb {
  const sqlite = new Database(filePath ?? ":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema }) as Db;
  return {
    sqlite,
    db,
    close() {
      sqlite.close();
    },
  };
}
