import type { Db } from "@/lib/db/client";
import type { TaskType } from "@/lib/db/schema";
import {
  parseDuration,
  resolveParameterValue,
  type ParsedDuration,
} from "@/lib/rules/params";

export function durationTotalMs(duration: unknown): number {
  if (
    typeof duration === "object" &&
    duration !== null &&
    "totalMs" in duration &&
    typeof (duration as ParsedDuration).totalMs === "number"
  ) {
    return (duration as ParsedDuration).totalMs;
  }
  if (typeof duration === "string") {
    return parseDuration(duration).totalMs;
  }
  throw new Error("Unable to resolve SLA duration");
}

export async function resolveTaskDurationMs(
  db: Db,
  taskType: TaskType,
  asOf?: Date | string,
): Promise<number> {
  const resolved = await resolveParameterValue(
    db,
    `sla.task.${taskType}`,
    asOf,
  );
  return durationTotalMs(resolved);
}

export async function resolveSlaDurationMs(
  db: Db,
  outputs: Record<string, unknown>,
  taskType?: TaskType,
  asOf?: Date | string,
): Promise<number> {
  if (outputs.duration_from_task_type === true) {
    if (!taskType) {
      throw new Error("task_type required for duration_from_task_type");
    }
    return resolveTaskDurationMs(db, taskType, asOf);
  }
  return durationTotalMs(outputs.duration);
}
