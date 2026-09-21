import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  ruleActions,
  ruleConditions,
  ruleSets,
  ruleSetVersions,
  rules,
  type HitPolicy,
  type RuleActionType,
  type RuleOperator,
} from "@/lib/db/schema";
import { insertRuleAuditLog } from "@/lib/db/queries/append-only";
import {
  applyActions,
  collectScoreActions,
  type RuleActionRow,
} from "./actions";
import { NoActiveVersionError, RuleValidationError } from "./errors";
import { evaluateCondition, resolveValueJson } from "./operators";
import { resolveParameterValue } from "./params";
import { type BrCode, validateRuleInputs } from "./schemas";

export type EvaluateOptions = {
  asOf?: Date | string;
  dryRun?: boolean;
  claimId?: string;
  actor?: string;
};

export type EvaluateResult = {
  outputs: Record<string, unknown>;
  matchedRuleIds: string[];
  versionId: string;
  auditId?: string;
};

type LoadedRule = {
  id: string;
  rowOrder: number;
  label: string;
  conditions: {
    inputKey: string;
    operator: RuleOperator;
    valueJson: unknown;
  }[];
  actions: RuleActionRow[];
};

function formatAsOf(asOf?: Date | string): string {
  if (!asOf) {
    return new Date().toISOString().slice(0, 10);
  }
  if (typeof asOf === "string") {
    return asOf.slice(0, 10);
  }
  return asOf.toISOString().slice(0, 10);
}

async function loadActiveVersion(db: Db, code: string, asOfStr: string) {
  const [set] = await db
    .select()
    .from(ruleSets)
    .where(eq(ruleSets.code, code))
    .limit(1);

  if (!set) {
    throw new NoActiveVersionError(code, asOfStr);
  }

  const [version] = await db
    .select()
    .from(ruleSetVersions)
    .where(
      and(
        eq(ruleSetVersions.ruleSetId, set.id),
        inArray(ruleSetVersions.status, ["active", "retired"]),
        lte(ruleSetVersions.effectiveFrom, asOfStr),
        or(
          isNull(ruleSetVersions.effectiveTo),
          gt(ruleSetVersions.effectiveTo, asOfStr),
        ),
      ),
    )
    .orderBy(
      desc(ruleSetVersions.effectiveFrom),
      desc(ruleSetVersions.version),
    )
    .limit(1);

  if (!version) {
    throw new NoActiveVersionError(code, asOfStr);
  }

  return { set, version };
}

async function loadRules(db: Db, versionId: string): Promise<LoadedRule[]> {
  const ruleRows = await db
    .select()
    .from(rules)
    .where(eq(rules.versionId, versionId))
    .orderBy(asc(rules.rowOrder));

  const loaded: LoadedRule[] = [];
  for (const rule of ruleRows) {
    const conditions = await db
      .select()
      .from(ruleConditions)
      .where(eq(ruleConditions.ruleId, rule.id));

    const actions = await db
      .select()
      .from(ruleActions)
      .where(eq(ruleActions.ruleId, rule.id));

    loaded.push({
      id: rule.id,
      rowOrder: rule.rowOrder,
      label: rule.label,
      conditions: conditions.map((row) => ({
        inputKey: row.inputKey,
        operator: row.operator,
        valueJson: row.valueJson,
      })),
      actions: actions.map((row) => ({
        actionType: row.actionType as RuleActionType,
        paramsJson: row.paramsJson,
      })),
    });
  }

  return loaded;
}

async function ruleMatches(
  rule: LoadedRule,
  context: Record<string, unknown>,
  asOf: string | undefined,
  db: Db,
): Promise<boolean> {
  if (rule.conditions.length === 0) {
    return true;
  }

  const resolveParam = (key: string) => resolveParameterValue(db, key, asOf);

  for (const condition of rule.conditions) {
    const inputValue = context[condition.inputKey];
    const matches = await evaluateCondition(
      inputValue,
      condition.operator,
      condition.valueJson,
      resolveParam,
    );
    if (!matches) {
      return false;
    }
  }

  return true;
}

async function resolveActions(
  actions: RuleActionRow[],
  asOf: string | undefined,
  db: Db,
): Promise<RuleActionRow[]> {
  const resolveParam = (key: string) => resolveParameterValue(db, key, asOf);
  return Promise.all(
    actions.map(async (action) => ({
      ...action,
      paramsJson: (await resolveValueJson(
        action.paramsJson,
        resolveParam,
      )) as Record<string, unknown>,
    })),
  );
}

async function evaluateFirst(
  loadedRules: LoadedRule[],
  context: Record<string, unknown>,
  asOf: string | undefined,
  db: Db,
): Promise<{ matchedRuleIds: string[]; actions: RuleActionRow[] }> {
  for (const rule of loadedRules) {
    if (await ruleMatches(rule, context, asOf, db)) {
      return { matchedRuleIds: [rule.id], actions: rule.actions };
    }
  }
  return { matchedRuleIds: [], actions: [] };
}

async function evaluateAll(
  loadedRules: LoadedRule[],
  context: Record<string, unknown>,
  asOf: string | undefined,
  db: Db,
): Promise<{ matchedRuleIds: string[]; actions: RuleActionRow[] }> {
  const matchedRuleIds: string[] = [];
  const actions: RuleActionRow[] = [];

  for (const rule of loadedRules) {
    if (await ruleMatches(rule, context, asOf, db)) {
      matchedRuleIds.push(rule.id);
      actions.push(...rule.actions);
    }
  }

  return { matchedRuleIds, actions };
}

async function evaluateCollectSum(
  loadedRules: LoadedRule[],
  context: Record<string, unknown>,
  asOf: string | undefined,
  db: Db,
): Promise<{ matchedRuleIds: string[]; actions: RuleActionRow[] }> {
  const matchedRuleIds: string[] = [];
  const actions: RuleActionRow[] = [];

  for (const rule of loadedRules) {
    if (await ruleMatches(rule, context, asOf, db)) {
      matchedRuleIds.push(rule.id);
      actions.push(...rule.actions);
    }
  }

  return { matchedRuleIds, actions };
}

function isScoringRule(rule: LoadedRule): boolean {
  return rule.actions.some((action) => action.actionType === "add_score");
}

async function evaluateFraudRuleSet(
  db: Db,
  loadedRules: LoadedRule[],
  inputs: Record<string, unknown>,
  asOf: string | undefined,
): Promise<{ matchedRuleIds: string[]; outputs: Record<string, unknown> }> {
  const scoringRules = loadedRules.filter(isScoringRule);
  const bandingRules = loadedRules.filter((rule) => !isScoringRule(rule));

  const scoring = await evaluateCollectSum(scoringRules, inputs, asOf, db);
  const scoreContributions = scoring.actions.flatMap((action) =>
    collectScoreActions([action]),
  );
  const totalScore = scoreContributions.reduce(
    (sum, item) => sum + item.points,
    0,
  );
  const reasonCodes = scoreContributions
    .map((item) => item.reasonCode)
    .filter((code): code is string => Boolean(code));

  const bandContext = { ...inputs, total_score: totalScore };
  const banding = await evaluateFirst(bandingRules, bandContext, asOf, db);
  const resolvedBandingActions = await resolveActions(
    banding.actions,
    asOf,
    db,
  );
  const outputs = applyActions(resolvedBandingActions);

  outputs.fraud_score = totalScore;
  outputs.reason_codes = reasonCodes;
  if (!("fraud_band" in outputs)) {
    outputs.fraud_band = "low";
  }

  return {
    matchedRuleIds: [...scoring.matchedRuleIds, ...banding.matchedRuleIds],
    outputs,
  };
}

async function evaluateWithHitPolicy(
  hitPolicy: HitPolicy,
  loadedRules: LoadedRule[],
  context: Record<string, unknown>,
  asOf: string | undefined,
  db: Db,
): Promise<{ matchedRuleIds: string[]; outputs: Record<string, unknown> }> {
  switch (hitPolicy) {
    case "first": {
      const result = await evaluateFirst(loadedRules, context, asOf, db);
      const resolvedActions = await resolveActions(result.actions, asOf, db);
      return {
        matchedRuleIds: result.matchedRuleIds,
        outputs: applyActions(resolvedActions),
      };
    }
    case "all": {
      const result = await evaluateAll(loadedRules, context, asOf, db);
      const resolvedActions = await resolveActions(result.actions, asOf, db);
      return {
        matchedRuleIds: result.matchedRuleIds,
        outputs: applyActions(resolvedActions),
      };
    }
    case "collect_sum": {
      const result = await evaluateCollectSum(loadedRules, context, asOf, db);
      const scoreContributions = result.actions.flatMap((action) =>
        collectScoreActions([action]),
      );
      const totalScore = scoreContributions.reduce(
        (sum, item) => sum + item.points,
        0,
      );
      const resolvedActions = await resolveActions(result.actions, asOf, db);
      const outputs = applyActions(resolvedActions);
      outputs.total_score = totalScore;
      outputs.reason_codes = scoreContributions
        .map((item) => item.reasonCode)
        .filter((code): code is string => Boolean(code));
      return { matchedRuleIds: result.matchedRuleIds, outputs };
    }
    default:
      return { matchedRuleIds: [], outputs: {} };
  }
}

export async function evaluateRuleSet(
  db: Db,
  code: BrCode,
  inputs: unknown,
  opts: EvaluateOptions = {},
): Promise<EvaluateResult> {
  const asOfStr = formatAsOf(opts.asOf);
  const actor = opts.actor ?? "system";

  let validated: Record<string, unknown>;
  try {
    validated = validateRuleInputs(code, inputs);
  } catch (error) {
    throw new RuleValidationError(
      `Invalid inputs for ${code}`,
      error,
    );
  }

  const { set, version } = await loadActiveVersion(db, code, asOfStr);
  const loadedRules = await loadRules(db, version.id);

  let matchedRuleIds: string[];
  let outputs: Record<string, unknown>;

  if (code === "BR-FRAUD-001") {
    const fraudResult = await evaluateFraudRuleSet(
      db,
      loadedRules,
      validated,
      asOfStr,
    );
    matchedRuleIds = fraudResult.matchedRuleIds;
    outputs = fraudResult.outputs;
  } else {
    const result = await evaluateWithHitPolicy(
      set.hitPolicy,
      loadedRules,
      validated,
      asOfStr,
      db,
    );
    matchedRuleIds = result.matchedRuleIds;
    outputs = result.outputs;
  }

  let auditId: string | undefined;
  if (!opts.dryRun) {
    const auditRow = await insertRuleAuditLog(db, {
      versionId: version.id,
      claimId: opts.claimId ?? null,
      inputsJson: validated,
      outputsJson: outputs,
      matchedRuleIds,
      actor,
    });
    auditId = auditRow.id;
  }

  return {
    outputs,
    matchedRuleIds,
    versionId: version.id,
    auditId,
  };
}
