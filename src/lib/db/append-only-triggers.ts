import type Database from "better-sqlite3";

export const APPEND_ONLY_TABLES = [
  "claim_state_history",
  "rule_audit_log",
  "agent_runs",
  "audit_log",
] as const;

export function ensureAppendOnlyTriggers(sqlite: Database.Database) {
  for (const table of APPEND_ONLY_TABLES) {
    const exists = sqlite
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(table);
    if (!exists) continue;

    sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_no_update
      BEFORE UPDATE ON ${table}
      BEGIN
        SELECT RAISE(ABORT, 'append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_no_delete
      BEFORE DELETE ON ${table}
      BEGIN
        SELECT RAISE(ABORT, 'append-only');
      END;
    `);
  }
}
