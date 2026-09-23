import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  ExtractAgentUnavailableError,
  ExtractSchemaError,
  runExtractAgent,
} from "@/lib/agents/extract";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import { getDocumentById, updateDocumentStatus } from "@/lib/db/queries/documents-mutate";
import { insertExtraction } from "@/lib/db/queries/extractions";
import { insertTask } from "@/lib/db/queries/tasks";
import { claims, extractions } from "@/lib/db/schema";
import type { ClaimStatus, DocStatus, TaskQueue } from "@/lib/db/schema/enums";
import {
  flattenExtractionFields,
  isExtractableDocType,
  parseExtractionFields,
  schemaIdForDocType,
} from "@/lib/schemas/agents/extract";
import { getParameter } from "@/lib/rules/params";
import { retriageClaim } from "@/lib/agents/triage";
import { applyExtractionFields } from "./apply";

function queueForClaimStatus(status: ClaimStatus): TaskQueue {
  if (status === "draft" || status === "submitted") {
    return "intake";
  }
  return "adjusting";
}

function buildPreviewRef(documentId: string): string {
  return `/api/documents/${documentId}/preview`;
}

export async function processDocumentExtraction(db: Db, documentId: string) {
  const document = await getDocumentById(db, documentId);
  if (!document) {
    throw new Error("NOT_FOUND");
  }

  if (!isExtractableDocType(document.docType)) {
    return { documentId, skipped: true as const, reason: "non_extractable_doc_type" };
  }

  await updateDocumentStatus(db, documentId, "extracting");

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, document.claimId))
    .limit(1);

  if (!claim) {
    throw new Error("NOT_FOUND");
  }

  const autoAcceptParam = await getParameter(db, "doc.autoaccept_confidence");
  const autoAcceptThreshold = Number(autoAcceptParam.valueJson);

  try {
    const { output, agentRunId } = await runExtractAgent(
      db,
      {
        docType: document.docType,
        claimType: claim.claimType,
        fileRef: buildPreviewRef(documentId),
        expectedFieldsSchemaId: schemaIdForDocType(document.docType),
      },
      { claimId: claim.id, documentId },
    );

    const parsedFields = parseExtractionFields(document.docType, output.fields);
    const { values, confidences } = flattenExtractionFields(parsedFields);

    const extraction = await insertExtraction(db, {
      documentId,
      agentRunId,
      fieldsJson: values,
      confidenceJson: confidences,
      minConfidence: output.minConfidence,
      applied: false,
    });

    if (output.minConfidence >= autoAcceptThreshold) {
      const previousAmount = Number(claim.estimatedAmount ?? 0);
      await applyExtractionFields(db, {
        claimId: claim.id,
        docType: document.docType,
        fields: values,
      });

      await db
        .update(extractions)
        .set({ applied: true, updatedAt: new Date() })
        .where(eq(extractions.id, extraction.id));

      await updateDocumentStatus(db, documentId, "verified");

      await retriageClaim(db, claim.id, {
        previousAmount,
        trigger: "doc_applied",
      });

      return {
        documentId,
        skipped: false as const,
        outcome: "auto_applied" as const,
        extractionId: extraction.id,
        minConfidence: output.minConfidence,
      };
    }

    await updateDocumentStatus(db, documentId, "verification_pending");

    const task = await insertTask(db, {
      claimId: claim.id,
      type: "verify_extraction",
      queue: queueForClaimStatus(claim.status),
      priority: 4,
      payloadJson: {
        extractionId: extraction.id,
        documentId,
        docType: document.docType,
        fields: values,
        confidences,
        anomalies: output.anomalies,
        previewUrl: buildPreviewRef(documentId),
      },
    });

    return {
      documentId,
      skipped: false as const,
      outcome: "verify_task" as const,
      extractionId: extraction.id,
      taskId: task.id,
      minConfidence: output.minConfidence,
    };
  } catch (error) {
    return createManualFallback(db, {
      documentId,
      claimId: claim.id,
      claimStatus: claim.status,
      docType: document.docType,
      error,
    });
  }
}

async function createManualFallback(
  db: Db,
  params: {
    documentId: string;
    claimId: string;
    claimStatus: ClaimStatus;
    docType: string;
    error: unknown;
  },
) {
  const isAgentFailure =
    params.error instanceof ExtractSchemaError ||
    params.error instanceof ExtractAgentUnavailableError;

  const fallbackFields: Record<string, unknown> = {};
  const fallbackConfidences: Record<string, number> = {};

  const failedRun = await insertAgentRun(db, {
    agentId: "AGT-EXTRACT",
    claimId: params.claimId,
    documentId: params.documentId,
    promptVersion: "v1",
    model: "mock:agt-extract-v1",
    inputJson: { docType: params.docType, fileRef: "[REDACTED]" },
    outputJson: { error: isAgentFailure ? "agent_unavailable" : "unknown" },
    confidence: "0",
    status: "failed",
    latencyMs: 0,
  });

  const extraction = await insertExtraction(db, {
    documentId: params.documentId,
    agentRunId: failedRun.id,
    fieldsJson: fallbackFields,
    confidenceJson: fallbackConfidences,
    minConfidence: 0,
    applied: false,
  });

  await updateDocumentStatus(db, params.documentId, "verification_pending");

  const task = await insertTask(db, {
    claimId: params.claimId,
    type: "verify_extraction",
    queue: queueForClaimStatus(params.claimStatus),
    priority: 5,
    payloadJson: {
      extractionId: extraction.id,
      documentId: params.documentId,
      docType: params.docType,
      fields: fallbackFields,
      confidences: fallbackConfidences,
      fallback: "manual_entry",
      previewUrl: buildPreviewRef(params.documentId),
      failureReason: isAgentFailure ? "agent_unavailable" : "unknown",
    },
  });

  return {
    documentId: params.documentId,
    skipped: false as const,
    outcome: "manual_fallback" as const,
    extractionId: extraction.id,
    taskId: task.id,
    minConfidence: 0,
  };
}

export async function verifyAndApplyExtraction(
  db: Db,
  params: {
    extractionId: string;
    verifiedBy: string;
    fields: Record<string, unknown>;
    decision: "accept" | "reject";
  },
) {
  const { getExtractionWithDocument } = await import("@/lib/db/queries/extractions");
  const row = await getExtractionWithDocument(db, params.extractionId);
  if (!row) {
    throw new Error("NOT_FOUND");
  }

  const { extraction, document } = row;

  if (params.decision === "reject") {
    await updateDocumentStatus(db, document.id, "rejected");
    return { applied: false, documentStatus: "rejected" as DocStatus };
  }

  const { markExtractionVerified } = await import("@/lib/db/queries/extractions");
  await markExtractionVerified(db, extraction.id, {
    verifiedBy: params.verifiedBy,
    fieldsJson: params.fields,
    applied: true,
  });

  const [claimBeforeApply] = await db
    .select({ estimatedAmount: claims.estimatedAmount })
    .from(claims)
    .where(eq(claims.id, document.claimId))
    .limit(1);

  await applyExtractionFields(db, {
    claimId: document.claimId,
    docType: document.docType,
    fields: params.fields,
  });

  await updateDocumentStatus(db, document.id, "verified");

  await retriageClaim(db, document.claimId, {
    previousAmount: Number(claimBeforeApply?.estimatedAmount ?? 0),
    trigger: "doc_applied",
  });

  return { applied: true, documentStatus: "verified" as DocStatus };
}
