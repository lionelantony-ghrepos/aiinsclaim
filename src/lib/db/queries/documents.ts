import { eq } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getClaimForUser } from "./claims";

export async function listDocumentsForUser(
  db: Db,
  user: SessionUser,
  claimId: string,
) {
  const claim = await getClaimForUser(db, user, claimId);
  if (!claim) {
    return [];
  }

  return db.select().from(documents).where(eq(documents.claimId, claimId));
}
