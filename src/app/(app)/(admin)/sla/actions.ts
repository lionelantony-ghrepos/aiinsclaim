"use server";

import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { runSlaSweep, type SlaSweepSummary } from "@/lib/sla";

export type SlaActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function actionError(error: unknown): SlaActionResult<never> {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Unknown error" };
}

export async function runSlaSweepAction(): Promise<
  SlaActionResult<SlaSweepSummary>
> {
  try {
    await requireRole("admin");
    const db = getDb();
    const data = await runSlaSweep(db);
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}
