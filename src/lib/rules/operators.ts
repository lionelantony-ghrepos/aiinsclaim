import type { RuleOperator } from "@/lib/db/schema";

export type ParamRef = { $param: string };

export function isParamRef(value: unknown): value is ParamRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "$param" in value &&
    typeof (value as ParamRef).$param === "string"
  );
}

export async function resolveValueJson(
  valueJson: unknown,
  resolveParam: (key: string) => Promise<unknown>,
): Promise<unknown> {
  if (isParamRef(valueJson)) {
    return resolveParam(valueJson.$param);
  }
  if (Array.isArray(valueJson)) {
    return Promise.all(
      valueJson.map((item) => resolveValueJson(item, resolveParam)),
    );
  }
  if (typeof valueJson === "object" && valueJson !== null) {
    const entries = await Promise.all(
      Object.entries(valueJson).map(async ([key, value]) => [
        key,
        await resolveValueJson(value, resolveParam),
      ]),
    );
    return Object.fromEntries(entries);
  }
  return valueJson;
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "string" && typeof right === "string") {
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (!Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
      return leftNum - rightNum;
    }
    return left.localeCompare(right);
  }
  return String(left).localeCompare(String(right));
}

export async function evaluateCondition(
  inputValue: unknown,
  operator: RuleOperator,
  valueJson: unknown,
  resolveParam: (key: string) => Promise<unknown>,
): Promise<boolean> {
  const resolved = await resolveValueJson(valueJson, resolveParam);

  switch (operator) {
    case "is_null":
      return inputValue === null || inputValue === undefined;
    case "eq":
      return inputValue === resolved;
    case "neq":
      return inputValue !== resolved;
    case "gt":
      return compareValues(inputValue, resolved) > 0;
    case "gte":
      return compareValues(inputValue, resolved) >= 0;
    case "lt":
      return compareValues(inputValue, resolved) < 0;
    case "lte":
      return compareValues(inputValue, resolved) <= 0;
    case "in":
      return Array.isArray(resolved) && resolved.includes(inputValue);
    case "between": {
      if (!Array.isArray(resolved) || resolved.length !== 2) {
        return false;
      }
      const [min, max] = resolved;
      return (
        compareValues(inputValue, min) >= 0 &&
        compareValues(inputValue, max) <= 0
      );
    }
    case "contains": {
      if (typeof inputValue === "string" && typeof resolved === "string") {
        return inputValue.includes(resolved);
      }
      if (Array.isArray(inputValue)) {
        return inputValue.includes(resolved);
      }
      return false;
    }
    default:
      return false;
  }
}
