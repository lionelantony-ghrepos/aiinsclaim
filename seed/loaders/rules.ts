import type { Db } from "@/lib/db/client";
import {
  parameters,
  ruleActions,
  ruleConditions,
  rules,
  ruleSets,
  ruleSetVersions,
} from "@/lib/db/schema";
import { clearParameterCache } from "@/lib/rules/params";
import { PARAMETER_DEFINITIONS } from "../definitions/parameters";
import { RULE_SET_DEFINITIONS } from "../definitions/rules";
import { deterministicId } from "../lib/deterministic-id";

const EFFECTIVE_FROM = "2026-01-01";

export async function seedRulesAndParameters(db: Db) {
  await db.delete(ruleActions);
  await db.delete(ruleConditions);
  await db.delete(rules);
  await db.delete(ruleSetVersions);
  await db.delete(ruleSets);
  await db.delete(parameters);

  clearParameterCache();

  for (const [paramIndex, param] of PARAMETER_DEFINITIONS.entries()) {
    await db.insert(parameters).values({
      id: deterministicId("parameter", paramIndex),
      key: param.key,
      valueJson: param.valueJson,
      valueType: param.valueType,
      description: param.description,
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      updatedBy: null,
    });
  }

  for (const [setIndex, setDef] of RULE_SET_DEFINITIONS.entries()) {
    const setId = deterministicId("rule-set", setIndex);
    await db.insert(ruleSets).values({
      id: setId,
      code: setDef.code,
      name: setDef.name,
      hitPolicy: setDef.hitPolicy,
    });

    const versionId = deterministicId("rule-set-version", setIndex);
    await db.insert(ruleSetVersions).values({
      id: versionId,
      ruleSetId: setId,
      version: 1,
      status: "active",
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      changeNote: "Initial seed version",
      createdBy: null,
    });

    for (const [index, ruleDef] of setDef.rules.entries()) {
      const ruleId = deterministicId("rule", setIndex * 100 + index);
      await db.insert(rules).values({
        id: ruleId,
        versionId,
        rowOrder: index + 1,
        label: ruleDef.label,
      });

      for (const [conditionIndex, condition] of ruleDef.conditions.entries()) {
        await db.insert(ruleConditions).values({
          id: deterministicId(
            "rule-condition",
            setIndex * 1000 + index * 10 + conditionIndex,
          ),
          ruleId,
          inputKey: condition.inputKey,
          operator: condition.operator,
          valueJson: condition.valueJson,
        });
      }

      for (const [actionIndex, action] of ruleDef.actions.entries()) {
        await db.insert(ruleActions).values({
          id: deterministicId(
            "rule-action",
            setIndex * 1000 + index * 10 + actionIndex,
          ),
          ruleId,
          actionType: action.actionType,
          paramsJson: action.paramsJson,
        });
      }
    }
  }
}
