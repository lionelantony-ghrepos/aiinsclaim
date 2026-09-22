"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";
import { canAccessClaim } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { runIntakeAgent } from "@/lib/agents/intake";
import { runTriageOnSubmit } from "@/lib/agents/triage";
import { getDb } from "@/lib/db";
import { documents, parties, policies } from "@/lib/db/schema";
import {
  createDraftClaim,
  getDraftClaimDetail,
  insertClaimNotification,
  searchPoliciesForStaff,
  updateDraftClaim,
  uploadDraftDocument,
} from "@/lib/db/queries/intake";
import { validateUploadFile } from "@/lib/documents/validate-upload";
import { processDocumentExtraction } from "@/lib/extraction/pipeline";
import { getFnolChecklist } from "@/lib/intake/checklist";
import type { FnolClaimType } from "@/lib/intake/constants";
import {
  ClaimDocumentUploadSchema,
  createDraftClaimSchema,
  runIntakeCopilotSchema,
  submitClaimSchema,
  updateDraftClaimSchema,
  type CreateDraftClaimInput,
  type RunIntakeCopilotInput,
  type SubmitClaimInput,
  type UpdateDraftClaimInput,
} from "@/lib/schemas/claims";
import {
  GuardFailedError,
  IllegalTransitionError,
  transitionClaim,
} from "@/lib/state-machine";
import type { ClaimActionResult } from "@/app/(app)/(claimant)/claims/new/actions";

function validationError(error: ZodError): ClaimActionResult<never> {
  return {
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    },
  };
}

function actionError(error: unknown): ClaimActionResult<never> {
  if (error instanceof ZodError) {
    return validationError(error);
  }
  if (error instanceof GuardFailedError) {
    if (error.guardCode === "BR-DOC-001") {
      return {
        ok: false,
        error: {
          code: "INCOMPLETE_FNOL",
          message: error.message,
          missing: error.details?.missing,
        },
      };
    }
    return {
      ok: false,
      error: { code: "GUARD_FAILED", message: error.message },
    };
  }
  if (error instanceof IllegalTransitionError) {
    return {
      ok: false,
      error: { code: "ILLEGAL_TRANSITION", message: error.message },
    };
  }
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      };
    }
    if (error.message === "NOT_FOUND") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      };
    }
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    };
  }
  return {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Unknown error" },
  };
}

export async function searchPoliciesAction(
  query: string,
): Promise<ClaimActionResult<Awaited<ReturnType<typeof searchPoliciesForStaff>>>> {
  try {
    await requireRole("intake_agent", "admin", "supervisor");
    const db = getDb();
    const data = await searchPoliciesForStaff(db, query);
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function createDraftForPolicyholderAction(
  input: CreateDraftClaimInput,
): Promise<
  ClaimActionResult<
    Awaited<ReturnType<typeof createDraftClaim>> & { holderUserId: string | null }
  >
> {
  try {
    const user = await requireRole("intake_agent", "admin", "supervisor");
    const parsed = createDraftClaimSchema.parse(input);
    const db = getDb();

    const [policy] = await db
      .select()
      .from(policies)
      .where(eq(policies.id, parsed.policyId))
      .limit(1);
    if (!policy) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Policy not found" },
      };
    }

    const [holder] = await db
      .select({ userId: parties.userId })
      .from(parties)
      .where(eq(parties.id, policy.holderPartyId))
      .limit(1);

    const data = await createDraftClaim(db, {
      policyId: parsed.policyId,
      lob: parsed.lob,
      claimType: parsed.claimType,
      actorUserId: user.id,
      claimantPartyId: policy.holderPartyId,
    });

    revalidatePath("/intake/new");
    revalidatePath("/claims");

    return {
      ok: true,
      data: {
        ...data,
        holderUserId: holder?.userId ?? null,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateDraftClaimAction(
  input: UpdateDraftClaimInput,
): Promise<ClaimActionResult<Awaited<ReturnType<typeof updateDraftClaim>>>> {
  try {
    const user = await requireRole("intake_agent", "admin", "supervisor");
    const parsed = updateDraftClaimSchema.parse(input);
    const db = getDb();

    const allowed = await canAccessClaim(db, user, parsed.claimId);
    if (!allowed) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Forbidden" },
      };
    }

    const data = await updateDraftClaim(db, {
      claimId: parsed.claimId,
      incident: parsed.incident,
      parties: parsed.parties,
      items: parsed.items,
    });

    revalidatePath("/intake/new");
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitClaimAction(
  input: SubmitClaimInput,
): Promise<
  ClaimActionResult<{
    claimId: string;
    claimNumber: string;
    status: string;
  }>
> {
  try {
    const user = await requireRole("intake_agent", "admin", "supervisor");
    const parsed = submitClaimSchema.parse(input);
    const db = getDb();

    const allowed = await canAccessClaim(db, user, parsed.claimId);
    if (!allowed) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Forbidden" },
      };
    }

    const detail = await getDraftClaimDetail(db, parsed.claimId);
    if (!detail) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Claim not found" },
      };
    }

    try {
      await transitionClaim(db, {
        claimId: parsed.claimId,
        toStatus: "submitted",
        actorId: user.id,
        reason: "Intake agent submitted FNOL on behalf of policyholder",
        triggeredBy: "user",
        guardContext: { actor: user.id },
      });
    } catch (error) {
      if (error instanceof GuardFailedError && error.guardCode === "BR-DOC-001") {
        return {
          ok: false,
          error: {
            code: "INCOMPLETE_FNOL",
            message: error.message,
            missing: error.details?.missing,
          },
        };
      }
      throw error;
    }

    const triage = await runTriageOnSubmit(db, parsed.claimId, user.id);

    const claimantParty = detail.parties.find((party) => party.role === "claimant");
    if (claimantParty) {
      const [partyUser] = await db
        .select({ userId: parties.userId })
        .from(parties)
        .where(eq(parties.id, claimantParty.partyId))
        .limit(1);

      if (partyUser?.userId) {
        await insertClaimNotification(db, {
          userId: partyUser.userId,
          claimId: parsed.claimId,
          kind: "claim_submitted",
          title: "Claim submitted on your behalf",
          bodyMd: `Claim **${detail.claim.claimNumber}** was submitted by intake. We will review it shortly.`,
        });
      }
    }

    revalidatePath("/claims");
    revalidatePath(`/claims/${parsed.claimId}`);

    return {
      ok: true,
      data: {
        claimId: parsed.claimId,
        claimNumber: detail.claim.claimNumber,
        status: triage.status,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function runIntakeCopilotAction(
  input: RunIntakeCopilotInput,
): Promise<ClaimActionResult<Awaited<ReturnType<typeof runIntakeAgent>>>> {
  try {
    const user = await requireRole("intake_agent", "admin", "supervisor");
    const parsed = runIntakeCopilotSchema.parse(input);
    const db = getDb();

    const allowed = await canAccessClaim(db, user, parsed.claimId);
    if (!allowed) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Forbidden" },
      };
    }

    const detail = await getDraftClaimDetail(db, parsed.claimId);
    if (!detail) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Claim not found" },
      };
    }

    const data = await runIntakeAgent(db, {
      claimType: detail.claim.claimType as FnolClaimType,
      lob: detail.claim.lineOfBusiness,
      narrative: parsed.narrative,
      enteredFields: { ...parsed.enteredFields, claimId: parsed.claimId },
      checklistState: parsed.checklistState ?? [],
    });

    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function getFnolChecklistAction(
  claimId: string,
): Promise<
  ClaimActionResult<Awaited<ReturnType<typeof getFnolChecklist>>>
> {
  try {
    const user = await requireRole("intake_agent", "admin", "supervisor");
    const db = getDb();

    const allowed = await canAccessClaim(db, user, claimId);
    if (!allowed) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Forbidden" },
      };
    }

    const data = await getFnolChecklist(db, claimId, { actor: user.id });
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function uploadDocumentAction(
  formData: FormData,
): Promise<
  ClaimActionResult<
    Awaited<ReturnType<typeof uploadDraftDocument>> & {
      extractionOutcome: string | null;
      extractionSkipped: boolean;
    }
  >
> {
  try {
    const user = await requireRole("intake_agent", "admin", "supervisor");
    const claimId = String(formData.get("claimId") ?? "");
    const docType = String(formData.get("docType") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "File is required" },
      };
    }

    const parsedMeta = ClaimDocumentUploadSchema.parse({
      claimId,
      docType,
      file: {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });

    const db = getDb();
    const allowed = await canAccessClaim(db, user, parsedMeta.claimId);
    if (!allowed) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Forbidden" },
      };
    }

    const uploadCheck = await validateUploadFile(db, {
      mimeType: parsedMeta.file.mimeType,
      sizeBytes: parsedMeta.file.sizeBytes,
    });
    if (!uploadCheck.ok) {
      return {
        ok: false,
        error: {
          code: uploadCheck.code,
          message: uploadCheck.message,
        },
      };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const data = await uploadDraftDocument(db, {
      claimId: parsedMeta.claimId,
      docType: parsedMeta.docType,
      fileName: parsedMeta.file.fileName,
      mimeType: parsedMeta.file.mimeType,
      sizeBytes: parsedMeta.file.sizeBytes,
      bytes,
      uploadedBy: user.id,
    });

    const extraction = await processDocumentExtraction(db, data.id);
    const [updatedDoc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, data.id))
      .limit(1);

    revalidatePath("/intake/new");
    return {
      ok: true,
      data: {
        ...(updatedDoc ?? data),
        extractionOutcome:
          "outcome" in extraction ? (extraction.outcome ?? null) : null,
        extractionSkipped: extraction.skipped,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}
