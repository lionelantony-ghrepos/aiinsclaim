import { eq, sql } from "drizzle-orm";
import { sequences } from "./schema";
import type { Db } from "./client";

export async function nextClaimNumber(db: Db): Promise<string> {
  const year = new Date().getFullYear();
  const seqName = `claim_number_${year}`;

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
