import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  agentRuns,
  ruleAuditLog,
  ruleSetVersions,
  ruleSets,
} from "@/lib/db/schema";

export async function getLatestTriageAgentRun(db: Db, claimId: string) {
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.claimId, claimId), eq(agentRuns.agentId, "AGT-TRIAGE")),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listTriageRuleAudits(db: Db, claimId: string) {
  const codes = ["BR-TRIAGE-001", "BR-FRAUD-001", "BR-STP-001"] as const;
  const audits: Record<
    string,
    {
      outputs: Record<string, unknown>;
      matchedRuleIds: string[];
      evaluatedAt: Date;
    } | null
  > = {};

  for (const code of codes) {
    const [setRow] = await db
      .select({ id: ruleSets.id })
      .from(ruleSets)
      .where(eq(ruleSets.code, code))
      .limit(1);

    if (!setRow) {
      audits[code] = null;
      continue;
    }

    const versions = await db
      .select({ id: ruleSetVersions.id })
      .from(ruleSetVersions)
      .where(eq(ruleSetVersions.ruleSetId, setRow.id));

    const versionIds = versions.map((version) => version.id);
    if (versionIds.length === 0) {
      audits[code] = null;
      continue;
    }

    const rows = await db
      .select()
      .from(ruleAuditLog)
      .where(eq(ruleAuditLog.claimId, claimId))
      .orderBy(desc(ruleAuditLog.evaluatedAt));

    const latest = rows.find((row) => versionIds.includes(row.versionId));
    audits[code] = latest
      ? {
          outputs: latest.outputsJson as Record<string, unknown>,
          matchedRuleIds: latest.matchedRuleIds,
          evaluatedAt: latest.evaluatedAt,
        }
      : null;
  }

  return audits;
}

export async function getTriageSummary(db: Db, claimId: string) {
  const agentRun = await getLatestTriageAgentRun(db, claimId);
  const ruleAudits = await listTriageRuleAudits(db, claimId);

  const output = agentRun?.outputJson as
    | {
        severityScore?: number;
        complexityScore?: number;
        reasonCodes?: string[];
        keyRisks?: string[];
        confidence?: number;
      }
    | undefined;

  return {
    agentRun,
    severityScore: output?.severityScore ?? null,
    complexityScore: output?.complexityScore ?? null,
    reasonCodes: output?.reasonCodes ?? [],
    keyRisks: output?.keyRisks ?? [],
    confidence: output?.confidence ?? null,
    triageAudit: ruleAudits["BR-TRIAGE-001"],
    fraudAudit: ruleAudits["BR-FRAUD-001"],
    stpAudit: ruleAudits["BR-STP-001"],
  };
}
