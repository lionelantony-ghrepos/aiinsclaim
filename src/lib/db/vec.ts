import * as sqliteVec from "sqlite-vec";
import type Database from "better-sqlite3";

export function loadSqliteVec(sqlite: Database.Database) {
  sqliteVec.load(sqlite);
}

export function getVecVersion(sqlite: Database.Database): string {
  const row = sqlite.prepare("SELECT vec_version() AS version").get() as {
    version: string;
  };
  return row.version;
}
