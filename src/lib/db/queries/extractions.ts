import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { documents, extractions } from "@/lib/db/schema";

export async function insertExtraction(
  db: Db,
  values: {
    id?: string;
    documentId: string;
    agentRunId: string;
    fieldsJson: Record<string, unknown>;
    confidenceJson: Record<string, number>;
    minConfidence: number;
    applied?: boolean;
  },
) {
  const now = new Date();
  const [row] = await db
    .insert(extractions)
    .values({
      id: values.id ?? crypto.randomUUID(),
      documentId: values.documentId,
      agentRunId: values.agentRunId,
      fieldsJson: values.fieldsJson,
      confidenceJson: values.confidenceJson,
      minConfidence: String(values.minConfidence),
      applied: values.applied ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function getExtractionById(db: Db, extractionId: string) {
  const [row] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.id, extractionId))
    .limit(1);
  return row ?? null;
}

export async function getLatestExtractionForDocument(db: Db, documentId: string) {
  const [row] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.documentId, documentId))
    .orderBy(desc(extractions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function markExtractionVerified(
  db: Db,
  extractionId: string,
  params: {
    verifiedBy: string;
    fieldsJson: Record<string, unknown>;
    applied: boolean;
  },
) {
  const [row] = await db
    .update(extractions)
    .set({
      verifiedBy: params.verifiedBy,
      fieldsJson: params.fieldsJson,
      applied: params.applied,
      updatedAt: new Date(),
    })
    .where(eq(extractions.id, extractionId))
    .returning();
  return row ?? null;
}

export async function getExtractionWithDocument(db: Db, extractionId: string) {
  const extraction = await getExtractionById(db, extractionId);
  if (!extraction) {
    return null;
  }

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, extraction.documentId))
    .limit(1);

  if (!document) {
    return null;
  }

  return { extraction, document };
}
