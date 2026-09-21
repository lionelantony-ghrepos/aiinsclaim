import type { RuleActionType } from "@/lib/db/schema";

export type RuleActionRow = {
  actionType: RuleActionType;
  paramsJson: Record<string, unknown>;
};

export type ScoreContribution = {
  points: number;
  reasonCode?: string;
};

export function applyActions(actions: RuleActionRow[]): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};

  for (const action of actions) {
    switch (action.actionType) {
      case "set_output":
      case "route":
        Object.assign(outputs, action.paramsJson);
        break;
      case "create_task": {
        const tasks = (outputs.tasks as Record<string, unknown>[]) ?? [];
        tasks.push(action.paramsJson);
        outputs.tasks = tasks;
        break;
      }
      case "set_flag": {
        const flags = {
          ...((outputs.flags as Record<string, unknown> | undefined) ?? {}),
          ...action.paramsJson,
        };
        outputs.flags = flags;
        Object.assign(outputs, action.paramsJson);
        break;
      }
      case "require_approval":
        outputs.require_approval = action.paramsJson;
        break;
      case "add_score":
        break;
    }
  }

  return outputs;
}

export function collectScoreActions(actions: RuleActionRow[]): ScoreContribution[] {
  return actions
    .filter((action) => action.actionType === "add_score")
    .map((action) => ({
      points: Number(action.paramsJson.points ?? 0),
      reasonCode:
        typeof action.paramsJson.reason_code === "string"
          ? action.paramsJson.reason_code
          : undefined,
    }));
}
