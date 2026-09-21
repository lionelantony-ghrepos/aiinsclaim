import { eq } from "drizzle-orm";
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
