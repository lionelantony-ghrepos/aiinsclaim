import type { Db } from "@/lib/db/client";
import { claimTransitions } from "@/lib/db/schema";
import { TRANSITION_DEFINITIONS } from "../definitions/transitions";
import { deterministicId } from "../lib/deterministic-id";

export async function seedClaimTransitions(db: Db) {
  await db.delete(claimTransitions);

  for (const [index, row] of TRANSITION_DEFINITIONS.entries()) {
    await db.insert(claimTransitions).values({
      id: deterministicId("claim-transition", index),
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      triggerLabel: row.triggerLabel,
      guardCode: row.guardCode,
      enabled: true,
    });
  }
}
