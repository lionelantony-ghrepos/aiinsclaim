import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { claims, fraudScores } from "@/lib/db/schema";

export async function getLatestFraudScore(db: Db, claimId: string) {
  const [row] = await db
    .select()
    .from(fraudScores)
    .where(eq(fraudScores.claimId, claimId))
    .orderBy(desc(fraudScores.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listSiuQueueClaims(db: Db) {
  const referredClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.siuReferred, true));

  const allScores = await db
    .select()
    .from(fraudScores)
    .orderBy(desc(fraudScores.createdAt));

  const latestByClaim = new Map<string, (typeof allScores)[number]>();
  for (const score of allScores) {
    if (!latestByClaim.has(score.claimId)) {
      latestByClaim.set(score.claimId, score);
    }
  }

  const highCriticalClaimIds = [...latestByClaim.entries()]
    .filter(([, score]) => score.band === "high" || score.band === "critical")
    .map(([claimId]) => claimId);

  const claimIds = new Set([
    ...referredClaims.map((claim) => claim.id),
    ...highCriticalClaimIds,
  ]);

  if (claimIds.size === 0) {
    return [];
  }

  const claimRows = await db.select().from(claims);
  const claimMap = new Map(claimRows.map((claim) => [claim.id, claim]));

  return [...claimIds]
    .map((claimId) => {
      const claim = claimMap.get(claimId);
      const fraudScore = latestByClaim.get(claimId);
      if (!claim || !fraudScore) {
        return null;
      }
      return { claim, fraudScore };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.fraudScore.score - a.fraudScore.score);
}
