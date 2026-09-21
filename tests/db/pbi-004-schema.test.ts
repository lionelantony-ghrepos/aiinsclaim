import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import {
  createTempSqlitePath,
  removeTempDir,
  runDrizzlePush,
} from "../helpers/isolated-db";

const REQUIRED_TABLES = [
  "users",
  "parties",
  "policies",
  "sequences",
  "claims",
  "claim_parties",
  "claim_items",
  "claim_state_history",
  "documents",
  "agent_runs",
  "extractions",
  "sla_timers",
  "tasks",
  "rule_sets",
  "rule_set_versions",
  "rules",
  "rule_conditions",
  "rule_actions",
  "rule_audit_log",
  "parameters",
  "fraud_scores",
  "reserves",
  "payments",
  "notifications",
  "audit_log",
] as const;

const temp = createTempSqlitePath();

describe("TC-004-01 schema push", () => {
  afterAll(() => {
    removeTempDir(temp.dir);
  });

  it(
    "pushes all DATA-DICTIONARY tables on a fresh SQLite file and is a no-op on the second run",
    () => {
      const first = runDrizzlePush(temp.file);
      expect(first.status, `${first.error ?? ""}\n${first.stderr}\n${first.stdout}`).toBe(0);

      const second = runDrizzlePush(temp.file);
      expect(second.status, `${second.stderr}\n${second.stdout}`).toBe(0);

      const sqlite = new Database(temp.file, { readonly: true, fileMustExist: true });
      try {
        const rows = sqlite
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
          )
          .all() as { name: string }[];
        const names = new Set(rows.map((row) => row.name));
        for (const table of REQUIRED_TABLES) {
          expect(names.has(table), `missing table ${table}`).toBe(true);
        }
      } finally {
        sqlite.close();
      }
    },
    60_000,
  );
});
