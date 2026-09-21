import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Db } from "@/lib/db/client";
import { ensureAppendOnlyTriggers } from "@/lib/db/append-only-triggers";
import { DB_PATH } from "@/lib/db/paths";
import * as schema from "@/lib/db/schema";
import { claims } from "@/lib/db/schema";
import { assertNotProduction, runSeed } from "./index";
import { deterministicId } from "./lib/deterministic-id";

function openSeedDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureAppendOnlyTriggers(sqlite);
  return { db: drizzle(sqlite, { schema }) as Db, sqlite };
}

async function addDemoDraftClaims(db: Db) {
  const [policy] = await db.select().from(schema.policies).limit(1);
  if (!policy) {
    throw new Error("No policies found — run full seed first");
  }

  const demoClaims = [
    {
      id: deterministicId("demo-claim", 0),
      claimNumber: "CLM-2026-DEMO01",
      policyId: policy.id,
      lineOfBusiness: "auto" as const,
      claimType: "collision" as const,
      status: "draft" as const,
      incidentAt: new Date("2026-06-10T14:30:00Z"),
      reportedAt: new Date("2026-06-10T15:00:00Z"),
      incidentDescription:
        "Minor rear-end collision in parking lot. No injuries. Ready for STP demo.",
      estimatedAmount: "1800.00",
      severityScore: 15,
      complexityScore: 10,
    },
    {
      id: deterministicId("demo-claim", 1),
      claimNumber: "CLM-2026-DEMO02",
      policyId: policy.id,
      lineOfBusiness: "auto" as const,
      claimType: "glass" as const,
      status: "draft" as const,
      incidentAt: new Date("2026-06-12T09:00:00Z"),
      reportedAt: new Date("2026-06-12T10:00:00Z"),
      incidentDescription: "Windshield cracked by road debris. Pristine demo claim.",
      estimatedAmount: "650.00",
      severityScore: 8,
      complexityScore: 5,
    },
    {
      id: deterministicId("demo-claim", 2),
      claimNumber: "CLM-2026-DEMO03",
      policyId: policy.id,
      lineOfBusiness: "auto" as const,
      claimType: "collision" as const,
      status: "draft" as const,
      incidentAt: new Date("2026-06-14T16:00:00Z"),
      reportedAt: new Date("2026-06-14T17:00:00Z"),
      incidentDescription:
        "Low-speed fender bender. All docs ready for live walkthrough.",
      estimatedAmount: "2200.00",
      severityScore: 18,
      complexityScore: 12,
    },
  ];

  await db.insert(claims).values(demoClaims);
  return demoClaims.length;
}

async function main() {
  assertNotProduction();
  const { db, sqlite } = openSeedDb();
  await runSeed(db, sqlite);
  const added = await addDemoDraftClaims(db);
  console.log(`Demo seed complete. Added ${added} pristine draft claims.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
