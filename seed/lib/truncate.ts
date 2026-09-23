import type Database from "better-sqlite3";
import type { Db } from "@/lib/db/client";
import {
  APPEND_ONLY_TABLES,
  ensureAppendOnlyTriggers,
} from "@/lib/db/append-only-triggers";
import {
  agentRuns,
  auditLog,
  claimItems,
  claimParties,
  claimStateHistory,
  claimTransitions,
  claims,
  documents,
  extractions,
  fraudScores,
  notifications,
  parameters,
  parties,
  payments,
  policies,
  reserves,
  ruleActions,
  ruleAuditLog,
  ruleConditions,
  ruleSetVersions,
  ruleSets,
  rules,
  sequences,
  settlements,
  slaTimers,
  tasks,
  users,
} from "@/lib/db/schema";
import { clearParameterCache } from "@/lib/rules/params";

function dropAppendOnlyTriggers(sqlite: Database.Database) {
  for (const table of APPEND_ONLY_TABLES) {
    sqlite.exec(`DROP TRIGGER IF EXISTS ${table}_no_update`);
    sqlite.exec(`DROP TRIGGER IF EXISTS ${table}_no_delete`);
  }
}

export async function truncateAll(db: Db, sqlite: Database.Database) {
  dropAppendOnlyTriggers(sqlite);

  const tables = [
    auditLog,
    notifications,
    payments,
    settlements,
    reserves,
    fraudScores,
    ruleAuditLog,
    extractions,
    agentRuns,
    documents,
    tasks,
    slaTimers,
    claimStateHistory,
    claimTransitions,
    claimItems,
    claimParties,
    claims,
    policies,
    parties,
    ruleActions,
    ruleConditions,
    rules,
    ruleSetVersions,
    ruleSets,
    parameters,
    users,
    sequences,
  ];

  for (const table of tables) {
    await db.delete(table);
  }

  clearParameterCache();
  ensureAppendOnlyTriggers(sqlite);
}
