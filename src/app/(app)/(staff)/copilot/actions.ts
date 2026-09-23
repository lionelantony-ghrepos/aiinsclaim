"use server";

import { ZodError } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { runCopilot } from "@/lib/agents/copilot";
import type { UserRole } from "@/lib/db/schema/enums";

const COPILOT_ROLES = [
  "intake_agent",
  "adjuster",
  "supervisor",
  "siu_analyst",
  "admin",
] as const satisfies readonly UserRole[];

export type CopilotActionResult =
  | {
      ok: true;
      data: Awaited<ReturnType<typeof runCopilot>>;
    }
  | { ok: false; error: { code: string; message: string } };

export async function askCopilotAction(
  question: string,
): Promise<CopilotActionResult> {
  try {
    await requireRole(...COPILOT_ROLES);
    return { ok: true, data: await runCopilot(getDb(), question) };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Enter a shorter question." },
      };
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "You cannot use the claims copilot." },
      };
    }
    if (error instanceof Error && "code" in error) {
      return {
        ok: false,
        error: { code: String(error.code), message: error.message },
      };
    }
    console.error("[copilot-action] error:", error);
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "The copilot could not answer that question." },
    };
  }
}
