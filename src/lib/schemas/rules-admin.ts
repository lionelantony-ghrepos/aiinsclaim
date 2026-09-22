import { z } from "zod";
import {
  PARAMETER_VALUE_TYPES,
  RULE_ACTION_TYPES,
  RULE_OPERATORS,
} from "@/lib/db/schema";
import { BR_CODES } from "@/lib/rules/schemas";

export const BrCodeEnum = z.enum(BR_CODES);
export const OperatorEnum = z.enum(RULE_OPERATORS);
export const ActionTypeEnum = z.enum(RULE_ACTION_TYPES);
export const ParameterValueTypeEnum = z.enum(PARAMETER_VALUE_TYPES);

export const RuleConditionSchema = z.object({
  inputKey: z.string(),
  operator: OperatorEnum,
  value: z.json(),
});

export const RuleActionSchema = z.object({
  actionType: ActionTypeEnum,
  params: z.json(),
});

export const RuleRowSchema = z.object({
  label: z.string(),
  order: z.int(),
  conditions: z.array(RuleConditionSchema),
  actions: z.array(RuleActionSchema),
});

export const createDraftVersionSchema = z.object({
  ruleSetCode: BrCodeEnum,
  fromVersionId: z.uuid(),
});

export const updateDraftRowsSchema = z.object({
  versionId: z.uuid(),
  rows: z.array(RuleRowSchema),
});

export const simulateVersionSchema = z.object({
  versionId: z.uuid(),
  sampleInputs: z.json(),
});

export const activateVersionSchema = z.object({
  versionId: z.uuid(),
  changeNote: z.string().min(10),
  effectiveFrom: z.iso.date(),
});

export const upsertParameterSchema = z.object({
  key: z.string().regex(/^[a-z0-9_.]+$/),
  valueJson: z.json(),
  valueType: ParameterValueTypeEnum,
  effectiveFrom: z.iso.date(),
});

export type BrCodeInput = z.infer<typeof BrCodeEnum>;
export type RuleConditionInput = z.infer<typeof RuleConditionSchema>;
export type RuleActionInput = z.infer<typeof RuleActionSchema>;
export type RuleRowInput = z.infer<typeof RuleRowSchema>;
export type CreateDraftVersionInput = z.infer<typeof createDraftVersionSchema>;
export type UpdateDraftRowsInput = z.infer<typeof updateDraftRowsSchema>;
export type SimulateVersionInput = z.infer<typeof simulateVersionSchema>;
export type ActivateVersionInput = z.infer<typeof activateVersionSchema>;
export type UpsertParameterInput = z.infer<typeof upsertParameterSchema>;
