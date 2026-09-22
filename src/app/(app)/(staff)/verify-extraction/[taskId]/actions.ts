"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { canAccessClaim } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { updateTask } from "@/lib/db/queries/tasks";
import { tasks } from "@/lib/db/schema";
import { verifyAndApplyExtraction } from "@/lib/extraction/pipeline";
import { VerifyExtractionSchema } from "@/lib/schemas/agents/extract";

export type VerifyActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export async function verifyExtractionAction(
  input: unknown,
): Promise<
  VerifyActionResult<{
    applied: boolean;
    documentStatus: string;
  }>
> {
  try {
    const user = await requireRole(
      "intake_agent",
      "adjuster",
      "supervisor",
      "admin",
    );
    const parsed = VerifyExtractionSchema.parse(input);
    const db = getDb();

    const [taskRow] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, parsed.taskId))
      .limit(1);

    if (!taskRow || taskRow.type !== "verify_extraction") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Verification task not found" },
      };
    }

    const allowed = await canAccessClaim(db, user, taskRow.claimId);
    if (!allowed) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Forbidden" },
      };
    }

    const payload = (taskRow.payloadJson ?? {}) as Record<string, unknown>;
    const baseFields = (payload.fields ?? {}) as Record<string, unknown>;
    const mergedFields = parsed.corrections
      ? { ...baseFields, ...parsed.corrections }
      : baseFields;

    const result = await verifyAndApplyExtraction(db, {
      extractionId: parsed.extractionId,
      verifiedBy: user.id,
      fields: mergedFields,
      decision: parsed.decision,
    });

    await updateTask(db, taskRow.id, {
      status: "done",
      resolution: parsed.decision === "accept" ? "accepted" : "rejected",
      resolutionReason:
        parsed.decision === "reject"
          ? "Extraction rejected during verification"
          : undefined,
    });

    revalidatePath(`/verify-extraction/${taskRow.id}`);
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Validation failed" },
      };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      };
    }
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
