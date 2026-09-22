import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  parameters,
  ruleActions,
  ruleConditions,
  ruleAuditLog,
  rules,
  ruleSets,
  ruleSetVersions,
  type RuleActionType,
  type RuleOperator,
} from "@/lib/db/schema";

export async function listRuleSets(db: Db) {
  const sets = await db.select().from(ruleSets).orderBy(asc(ruleSets.code));

  return Promise.all(
    sets.map(async (set) => {
      const [activeVersion] = await db
        .select()
        .from(ruleSetVersions)
        .where(
          and(
            eq(ruleSetVersions.ruleSetId, set.id),
            eq(ruleSetVersions.status, "active"),
          ),
        )
        .orderBy(
          desc(ruleSetVersions.effectiveFrom),
          desc(ruleSetVersions.version),
        )
        .limit(1);

      return {
        ...set,
        activeVersion: activeVersion ?? null,
      };
    }),
  );
}

export async function listVersionsByRuleSet(db: Db, ruleSetId: string) {
  return db
    .select()
    .from(ruleSetVersions)
    .where(eq(ruleSetVersions.ruleSetId, ruleSetId))
    .orderBy(desc(ruleSetVersions.version));
}

export async function getRuleSetByCode(db: Db, code: string) {
  const [row] = await db
    .select()
    .from(ruleSets)
    .where(eq(ruleSets.code, code))
    .limit(1);
  return row ?? null;
}

export async function getVersionDetail(db: Db, versionId: string) {
  const [version] = await db
    .select()
    .from(ruleSetVersions)
    .where(eq(ruleSetVersions.id, versionId))
    .limit(1);

  if (!version) {
    return null;
  }

  const [ruleSet] = await db
    .select()
    .from(ruleSets)
    .where(eq(ruleSets.id, version.ruleSetId))
    .limit(1);

  if (!ruleSet) {
    return null;
  }

  const ruleRows = await db
    .select()
    .from(rules)
    .where(eq(rules.versionId, versionId))
    .orderBy(asc(rules.rowOrder));

  const rows = await Promise.all(
    ruleRows.map(async (rule) => {
      const conditions = await db
        .select()
        .from(ruleConditions)
        .where(eq(ruleConditions.ruleId, rule.id));

      const actions = await db
        .select()
        .from(ruleActions)
        .where(eq(ruleActions.ruleId, rule.id));

      return {
        id: rule.id,
        label: rule.label,
        order: rule.rowOrder,
        conditions: conditions.map((condition) => ({
          id: condition.id,
          inputKey: condition.inputKey,
          operator: condition.operator as RuleOperator,
          value: condition.valueJson,
        })),
        actions: actions.map((action) => ({
          id: action.id,
          actionType: action.actionType as RuleActionType,
          params: action.paramsJson,
        })),
      };
    }),
  );

  return {
    version,
    ruleSet,
    rows,
  };
}

export async function listParameters(db: Db) {
  return db.select().from(parameters).orderBy(asc(parameters.key));
}

export async function getParameterByKey(db: Db, key: string) {
  const [row] = await db
    .select()
    .from(parameters)
    .where(eq(parameters.key, key))
    .limit(1);
  return row ?? null;
}

export async function countRuleAuditLog(db: Db) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ruleAuditLog);
  return row?.count ?? 0;
}
