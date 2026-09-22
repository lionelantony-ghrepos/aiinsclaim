import type Database from "better-sqlite3";

export const APPEND_ONLY_TABLES = [
  "claim_state_history",
  "rule_audit_log",
  "agent_runs",
  "audit_log",
] as const;

function ensureTableTrigger(
  sqlite: Database.Database,
  table: (typeof APPEND_ONLY_TABLES)[number],
) {
  const exists = sqlite
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  if (!exists) return;

  if (table === "agent_runs") {
    sqlite.exec(`
      DROP TRIGGER IF EXISTS agent_runs_no_update;
      CREATE TRIGGER agent_runs_no_update
      BEFORE UPDATE ON agent_runs
      WHEN
        NEW.id != OLD.id OR
        NEW.agent_id != OLD.agent_id OR
        NEW.claim_id IS NOT OLD.claim_id OR
        NEW.document_id IS NOT OLD.document_id OR
        NEW.prompt_version IS NOT OLD.prompt_version OR
        NEW.model IS NOT OLD.model OR
        NEW.input_json IS NOT OLD.input_json OR
        NEW.output_json IS NOT OLD.output_json OR
        NEW.confidence IS NOT OLD.confidence OR
        NEW.status != OLD.status OR
        NEW.latency_ms IS NOT OLD.latency_ms OR
        NEW.created_at != OLD.created_at
      BEGIN
        SELECT RAISE(ABORT, 'append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS agent_runs_no_delete
      BEFORE DELETE ON agent_runs
      BEGIN
        SELECT RAISE(ABORT, 'append-only');
      END;
    `);
    return;
  }

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

export function ensureAppendOnlyTriggers(sqlite: Database.Database) {
  for (const table of APPEND_ONLY_TABLES) {
    ensureTableTrigger(sqlite, table);
  }
}
