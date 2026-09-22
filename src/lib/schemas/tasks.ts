import { z } from "zod";
import {
  CLAIM_TYPES,
  TASK_QUEUES,
  TASK_TYPES,
} from "@/lib/db/schema/enums";

export const QueueEnum = z.enum(TASK_QUEUES);
export const TaskTypeEnum = z.enum(TASK_TYPES);
export const BreachStateEnum = z.enum(["ok", "warning", "breached"]);

export const ListQueueFiltersSchema = z.object({
  type: TaskTypeEnum.optional(),
  claimType: z.enum(CLAIM_TYPES).optional(),
  breachState: BreachStateEnum.optional(),
});

export const ListQueueSchema = z.object({
  queue: QueueEnum,
  filters: ListQueueFiltersSchema.default({}),
  cursor: z.string().optional(),
  limit: z.int().max(100).default(25),
});

export const ClaimTaskSchema = z.object({
  taskId: z.uuid(),
});

export const ReleaseTaskSchema = z.object({
  taskId: z.uuid(),
});

export const ResolveTaskSchema = z
  .object({
    taskId: z.uuid(),
    resolution: z.enum(["accepted", "overridden", "rejected"]),
    resolutionReason: z.string().min(10).optional(),
    resultPayload: z.json().optional(),
  })
  .refine(
    (value) => value.resolution === "accepted" || Boolean(value.resolutionReason),
    { message: "REASON_REQUIRED", path: ["resolutionReason"] },
  );

export const BulkReassignSchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(50),
  assignTo: z.uuid(),
});

export type ListQueueInput = z.infer<typeof ListQueueSchema>;
export type QueueTaskFilters = z.infer<typeof ListQueueFiltersSchema>;
export type ResolveTaskInput = z.infer<typeof ResolveTaskSchema>;
