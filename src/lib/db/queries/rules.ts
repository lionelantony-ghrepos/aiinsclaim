import { asc, eq, inArray } from "drizzle-orm";
import { assertCanWriteRules } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import {
  parameters,
  ruleActions,
  ruleConditions,
  rules,
  ruleSets,
  ruleSetVersions,
  type HitPolicy,
  type ParameterValueType,
  type RuleActionType,
  type RuleOperator,
  type RuleVersionStatus,
} from "@/lib/db/schema";
import { ImmutableVersionError } from "@/lib/rules/admin-errors";

export type DraftRowInput = {
  label: string;
  order: number;
  conditions: {
    inputKey: string;
    operator: RuleOperator;
    value: unknown;
  }[];
  actions: {
    actionType: RuleActionType;
    params: unknown;
  }[];
};

export async function insertRuleSet(
  db: Db,
  user: SessionUser,
  values: {
    id?: string;
    code: string;
    name: string;
    hitPolicy?: HitPolicy;
  },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .insert(ruleSets)
    .values({
      id: values.id ?? crypto.randomUUID(),
      code: values.code,
      name: values.name,
      hitPolicy: values.hitPolicy ?? "first",
    })
    .returning();
  return row;
}

export async function updateRuleSet(
  db: Db,
  user: SessionUser,
  id: string,
  values: { code?: string; name?: string; hitPolicy?: HitPolicy },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .update(ruleSets)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(ruleSets.id, id))
    .returning();
  return row ?? null;
}

export async function deleteRuleSet(db: Db, user: SessionUser, id: string) {
  assertCanWriteRules(user);
  const [row] = await db
    .delete(ruleSets)
    .where(eq(ruleSets.id, id))
    .returning();
  return row ?? null;
}

export async function insertRuleSetVersion(
  db: Db,
  user: SessionUser,
  values: {
    id?: string;
    ruleSetId: string;
    version: number;
    status?: RuleVersionStatus;
    effectiveFrom: string;
    effectiveTo?: string | null;
    changeNote?: string | null;
    createdBy?: string | null;
  },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .insert(ruleSetVersions)
    .values({
      id: values.id ?? crypto.randomUUID(),
      ruleSetId: values.ruleSetId,
      version: values.version,
      status: values.status ?? "draft",
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo,
      changeNote: values.changeNote,
      createdBy: values.createdBy,
    })
    .returning();
  return row;
}

export async function insertParameter(
  db: Db,
  user: SessionUser,
  values: {
    id?: string;
    key: string;
    valueJson: unknown;
    valueType: ParameterValueType;
    description?: string | null;
    effectiveFrom: string;
    effectiveTo?: string | null;
    updatedBy?: string | null;
  },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .insert(parameters)
    .values({
      id: values.id ?? crypto.randomUUID(),
      key: values.key,
      valueJson: values.valueJson,
      valueType: values.valueType,
      description: values.description,
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo,
      updatedBy: values.updatedBy,
    })
    .returning();
  return row;
}

export async function insertRule(
  db: Db,
  user: SessionUser,
  values: {
    id?: string;
    versionId: string;
    rowOrder: number;
    label: string;
  },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .insert(rules)
    .values({
      id: values.id ?? crypto.randomUUID(),
      versionId: values.versionId,
      rowOrder: values.rowOrder,
      label: values.label,
    })
    .returning();
  return row;
}

export async function insertRuleCondition(
  db: Db,
  user: SessionUser,
  values: {
    id?: string;
    ruleId: string;
    inputKey: string;
    operator: RuleOperator;
    valueJson: unknown;
  },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .insert(ruleConditions)
    .values({
      id: values.id ?? crypto.randomUUID(),
      ruleId: values.ruleId,
      inputKey: values.inputKey,
      operator: values.operator,
      valueJson: values.valueJson,
    })
    .returning();
  return row;
}

export async function insertRuleAction(
  db: Db,
  user: SessionUser,
  values: {
    id?: string;
    ruleId: string;
    actionType: RuleActionType;
    paramsJson: Record<string, unknown>;
  },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .insert(ruleActions)
    .values({
      id: values.id ?? crypto.randomUUID(),
      ruleId: values.ruleId,
      actionType: values.actionType,
      paramsJson: values.paramsJson,
    })
    .returning();
  return row;
}

export async function updateRuleSetVersion(
  db: Db,
  user: SessionUser,
  id: string,
  values: {
    status?: RuleVersionStatus;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    changeNote?: string | null;
  },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .update(ruleSetVersions)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(ruleSetVersions.id, id))
    .returning();
  return row ?? null;
}

async function deleteRulesForVersion(db: Db, versionId: string) {
  const ruleRows = await db
    .select({ id: rules.id })
    .from(rules)
    .where(eq(rules.versionId, versionId));
  const ruleIds = ruleRows.map((row) => row.id);

  if (ruleIds.length > 0) {
    await db
      .delete(ruleConditions)
      .where(inArray(ruleConditions.ruleId, ruleIds));
    await db.delete(ruleActions).where(inArray(ruleActions.ruleId, ruleIds));
  }

  await db.delete(rules).where(eq(rules.versionId, versionId));
}

export async function replaceDraftRows(
  db: Db,
  user: SessionUser,
  versionId: string,
  rows: DraftRowInput[],
) {
  assertCanWriteRules(user);

  const [version] = await db
    .select()
    .from(ruleSetVersions)
    .where(eq(ruleSetVersions.id, versionId))
    .limit(1);

  if (!version || version.status !== "draft") {
    throw new ImmutableVersionError(versionId);
  }

  await deleteRulesForVersion(db, versionId);

  for (const row of rows) {
    const rule = await insertRule(db, user, {
      versionId,
      rowOrder: row.order,
      label: row.label,
    });

    for (const condition of row.conditions) {
      await insertRuleCondition(db, user, {
        ruleId: rule.id,
        inputKey: condition.inputKey,
        operator: condition.operator,
        valueJson: condition.value,
      });
    }

    for (const action of row.actions) {
      await insertRuleAction(db, user, {
        ruleId: rule.id,
        actionType: action.actionType,
        paramsJson: action.params as Record<string, unknown>,
      });
    }
  }
}

export async function cloneVersionRows(
  db: Db,
  user: SessionUser,
  fromVersionId: string,
  toVersionId: string,
) {
  assertCanWriteRules(user);

  const sourceRules = await db
    .select()
    .from(rules)
    .where(eq(rules.versionId, fromVersionId))
    .orderBy(asc(rules.rowOrder));

  for (const sourceRule of sourceRules) {
    const newRule = await insertRule(db, user, {
      versionId: toVersionId,
      rowOrder: sourceRule.rowOrder,
      label: sourceRule.label,
    });

    const conditions = await db
      .select()
      .from(ruleConditions)
      .where(eq(ruleConditions.ruleId, sourceRule.id));

    for (const condition of conditions) {
      await insertRuleCondition(db, user, {
        ruleId: newRule.id,
        inputKey: condition.inputKey,
        operator: condition.operator,
        valueJson: condition.valueJson,
      });
    }

    const actions = await db
      .select()
      .from(ruleActions)
      .where(eq(ruleActions.ruleId, sourceRule.id));

    for (const action of actions) {
      await insertRuleAction(db, user, {
        ruleId: newRule.id,
        actionType: action.actionType,
        paramsJson: action.paramsJson,
      });
    }
  }
}

export async function updateParameterByKey(
  db: Db,
  user: SessionUser,
  key: string,
  values: {
    valueJson: unknown;
    valueType: ParameterValueType;
    effectiveFrom: string;
    updatedBy?: string | null;
  },
) {
  assertCanWriteRules(user);
  const [row] = await db
    .update(parameters)
    .set({
      valueJson: values.valueJson,
      valueType: values.valueType,
      effectiveFrom: values.effectiveFrom,
      updatedBy: values.updatedBy ?? user.id,
      updatedAt: new Date(),
    })
    .where(eq(parameters.key, key))
    .returning();
  return row ?? null;
}
