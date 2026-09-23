import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { documents, type DocStatus } from "@/lib/db/schema";

export async function getDocumentById(db: Db, documentId: string) {
  const [row] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  return row ?? null;
}

export async function updateDocumentStatus(
  db: Db,
  documentId: string,
  status: DocStatus,
) {
  const [row] = await db
    .update(documents)
    .set({ status, updatedAt: new Date() })
    .where(eq(documents.id, documentId))
    .returning();
  return row ?? null;
}
