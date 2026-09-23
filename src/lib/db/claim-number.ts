import { eq, like, sql } from "drizzle-orm";
import { claims, sequences } from "./schema";
import type { Db } from "./client";

async function bootstrapSequenceIfNeeded(db: Db, seqName: string, year: number) {
  const [existingSeq] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.name, seqName))
    .limit(1);

  if (existingSeq) {
    return;
  }

  const prefix = `CLM-${year}-`;
  const rows = await db
    .select({ claimNumber: claims.claimNumber })
    .from(claims)
    .where(like(claims.claimNumber, `${prefix}%`));

  let maxValue = 0;
  for (const row of rows) {
    const suffix = row.claimNumber.slice(prefix.length);
    const parsed = Number.parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) {
      maxValue = Math.max(maxValue, parsed);
    }
  }

  await db.insert(sequences).values({ name: seqName, value: maxValue });
}

export async function nextClaimNumber(db: Db): Promise<string> {
  const year = new Date().getFullYear();
  const seqName = `claim_number_${year}`;

  await bootstrapSequenceIfNeeded(db, seqName, year);

  await db
    .insert(sequences)
    .values({ name: seqName, value: 1 })
    .onConflictDoUpdate({
      target: sequences.name,
      set: { value: sql`${sequences.value} + 1` },
    });

  const [row] = await db
    .select({ value: sequences.value })
    .from(sequences)
    .where(eq(sequences.name, seqName));

  const padded = String(row?.value ?? 1).padStart(6, "0");
  return `CLM-${year}-${padded}`;
}
