import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { parameters, type ParameterValueType } from "@/lib/db/schema";

export type ParsedDuration = {
  value: number;
  unit: "h" | "d" | "m";
  totalMs: number;
};

const DURATION_RE = /^(\d+(?:\.\d+)?)(h|d|m)$/;

export function parseDuration(raw: string): ParsedDuration {
  const match = DURATION_RE.exec(raw.trim());
  if (!match) {
    throw new Error(`Invalid duration string: ${raw}`);
  }
  const value = Number(match[1]);
  const unit = match[2] as ParsedDuration["unit"];
  const multiplier = unit === "h" ? 3_600_000 : unit === "d" ? 86_400_000 : 60_000;
  return { value, unit, totalMs: value * multiplier };
}

function formatAsOf(asOf?: Date | string): string {
  if (!asOf) {
    return new Date().toISOString().slice(0, 10);
  }
  if (typeof asOf === "string") {
    return asOf.slice(0, 10);
  }
  return asOf.toISOString().slice(0, 10);
}

type CacheEntry = {
  valueJson: unknown;
  valueType: ParameterValueType;
};

const parameterCache = new Map<string, CacheEntry>();

export function clearParameterCache() {
  parameterCache.clear();
}

export async function getParameter(
  db: Db,
  key: string,
  asOf?: Date | string,
): Promise<{ valueJson: unknown; valueType: ParameterValueType }> {
  const asOfStr = formatAsOf(asOf);
  const cacheKey = `${asOfStr}:${key}`;
  const cached = parameterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const [row] = await db
    .select()
    .from(parameters)
    .where(
      and(
        eq(parameters.key, key),
        lte(parameters.effectiveFrom, asOfStr),
        or(isNull(parameters.effectiveTo), gt(parameters.effectiveTo, asOfStr)),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(`Parameter not found: ${key} as of ${asOfStr}`);
  }

  const entry = { valueJson: row.valueJson, valueType: row.valueType };
  parameterCache.set(cacheKey, entry);
  return entry;
}

export async function resolveParameterValue(
  db: Db,
  key: string,
  asOf?: Date | string,
): Promise<unknown> {
  const param = await getParameter(db, key, asOf);
  if (param.valueType === "duration" && typeof param.valueJson === "string") {
    return parseDuration(param.valueJson);
  }
  return param.valueJson;
}
