"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { canAccessClaim } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { insertAuditLog } from "@/lib/db/queries/append-only";
import { claims } from "@/lib/db/schema";
import { SetSiuDispositionSchema } from "@/lib/schemas/agents/fraud";

export type SiuActionResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } };

export async function setSiuDisposition(
  input: unknown,
): Promise<SiuActionResult> {
  try {
    const user = await requireRole("siu_analyst", "supervisor");
    const parsed = SetSiuDispositionSchema.parse(input);
    const db = getDb();

    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, parsed.claimId))
      .limit(1);

    if (!claim) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Claim not found" },
      };
    }

    const allowed = await canAccessClaim(db, user, parsed.claimId);
    if (!allowed) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Forbidden" },
      };
    }

    const before = {
      siuDisposition: claim.siuDisposition,
      siuReferred: claim.siuReferred,
    };

    const updates: {
      siuDisposition: typeof parsed.disposition;
      siuReferred?: boolean;
      updatedAt: Date;
    } = {
      siuDisposition: parsed.disposition,
      updatedAt: new Date(),
    };

    if (parsed.disposition === "cleared") {
      updates.siuReferred = false;
    }

    await db.update(claims).set(updates).where(eq(claims.id, parsed.claimId));

    await insertAuditLog(db, {
      actor: user.id,
      action: "siu_disposition_set",
      entity: "claim",
      entityId: parsed.claimId,
      beforeJson: before,
      afterJson: {
        siuDisposition: parsed.disposition,
        siuReferred: updates.siuReferred ?? claim.siuReferred,
        reason: parsed.reason ?? null,
      },
    });

    revalidatePath("/siu");
    revalidatePath(`/claims/${parsed.claimId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Validation failed" },
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
