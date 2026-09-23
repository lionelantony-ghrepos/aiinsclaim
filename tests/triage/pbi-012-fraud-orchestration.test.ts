import { and, desc, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import * as gateway from "@/lib/agents/gateway";
import { retriageClaim, triageClaim } from "@/lib/agents/triage";
import {
  claims,
  fraudScores,
  policies,
  tasks,
} from "@/lib/db/schema";
import { evaluateRuleSet } from "@/lib/rules";
import { seedClaimTransitions } from "../../seed/loaders/transitions";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertBaseClaim } from "../helpers/pbi-007-fixtures";
import fraudHighSignals from "../fixtures/gateway/fraud-high-signals.json";
import fraudClean from "../fixtures/gateway/fraud-clean.json";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

async function addPriorClaimsForParty(partyId: string, count: number) {
  const now = new Date();
  for (let index = 0; index < count; index += 1) {
    const claimId = crypto.randomUUID();
    const policyId = crypto.randomUUID();
    await isolated.db.insert(policies).values({
      id: policyId,
      policyNumber: `POL-PRIOR-${index}-${claimId.slice(0, 4)}`,
      holderPartyId: partyId,
      lineOfBusiness: "auto",
      status: "active",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      coverageJson: {},
      createdAt: now,
      updatedAt: now,
    });
    await isolated.db.insert(claims).values({
      id: claimId,
      claimNumber: `CLM-PRIOR-${index}-${claimId.slice(0, 4)}`,
      policyId,
      lineOfBusiness: "auto",
      claimType: "collision",
      status: "closed",
      incidentAt: now,
      reportedAt: now,
      estimatedAmount: "900.00",
      createdAt: now,
      updatedAt: now,
    });
  }
}

describe("PBI-012 fraud orchestration", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
    await seedClaimTransitions(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-012-02 banding actions fire for medium, high, and critical", async () => {
    vi.spyOn(gateway, "callAiGateway").mockImplementation(async (request) => {
      if (request.agentId === "AGT-FRAUD") {
        return { output: fraudClean, model: "mock:clean", latencyMs: 1 };
      }
      return {
        output: {
          severityScore: 22,
          complexityScore: 15,
          reasonCodes: ["LOW_SEVERITY"],
          keyRisks: [],
          confidence: 0.84,
        },
        model: "mock:triage",
        latencyMs: 1,
      };
    });

    const mediumClaim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });
    const recentPolicyStart = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await isolated.db
      .update(policies)
      .set({ effectiveFrom: recentPolicyStart, updatedAt: new Date() })
      .where(eq(policies.id, mediumClaim.policyId));
    await triageClaim(isolated.db, mediumClaim.claimId);
    const [mediumScore] = await isolated.db
      .select()
      .from(fraudScores)
      .where(eq(fraudScores.claimId, mediumClaim.claimId));
    expect(mediumScore?.band).toBe("medium");
    const mediumTasks = await isolated.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.claimId, mediumClaim.claimId),
          eq(tasks.type, "review_fraud"),
        ),
      );
    expect(mediumTasks.length).toBe(0);

    vi.spyOn(gateway, "callAiGateway").mockImplementation(async (request) => {
      if (request.agentId === "AGT-FRAUD") {
        return { output: fraudHighSignals, model: "mock:high", latencyMs: 1 };
      }
      return {
        output: {
          severityScore: 22,
          complexityScore: 15,
          reasonCodes: ["LOW_SEVERITY"],
          keyRisks: [],
          confidence: 0.84,
        },
        model: "mock:triage",
        latencyMs: 1,
      };
    });

    const highClaim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
      incidentDescription:
        "Timeline contradicts police report timestamp in the account.",
    });
    await isolated.db
      .update(policies)
      .set({ effectiveFrom: recentPolicyStart, updatedAt: new Date() })
      .where(eq(policies.id, highClaim.policyId));
    await addPriorClaimsForParty(highClaim.partyId, 2);
    await triageClaim(isolated.db, highClaim.claimId);

    const [highScore] = await isolated.db
      .select()
      .from(fraudScores)
      .where(eq(fraudScores.claimId, highClaim.claimId));
    expect(highScore?.band).toBe("high");
    const highTasks = await isolated.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.claimId, highClaim.claimId),
          eq(tasks.type, "review_fraud"),
        ),
      );
    expect(highTasks.length).toBeGreaterThan(0);

    const criticalClaim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "48000.00",
      incidentDescription:
        "Timeline contradicts police report timestamp with suspicious document tampering.",
    });
    await isolated.db
      .update(policies)
      .set({
        effectiveFrom: recentPolicyStart,
        coverageJson: { limit: 50000 },
        updatedAt: new Date(),
      })
      .where(eq(policies.id, criticalClaim.policyId));
    await isolated.db
      .update(claims)
      .set({
        reportedAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(claims.id, criticalClaim.claimId));
    await addPriorClaimsForParty(criticalClaim.partyId, 2);

    vi.spyOn(gateway, "callAiGateway").mockImplementation(async (request) => {
      if (request.agentId === "AGT-FRAUD") {
        return {
          output: {
            narrativeInconsistency: 0.8,
            docAnomaly: 0.7,
            evidence: [
              {
                signal: "NARRATIVE_INCONSISTENCY",
                quote: "Timeline contradicts police report timestamp",
                source: "narrative",
              },
            ],
            confidence: 0.9,
          },
          model: "mock:critical",
          latencyMs: 1,
        };
      }
      return {
        output: {
          severityScore: 48,
          complexityScore: 72,
          reasonCodes: ["HIGH_VALUE"],
          keyRisks: [],
          confidence: 0.84,
        },
        model: "mock:triage",
        latencyMs: 1,
      };
    });

    await triageClaim(isolated.db, criticalClaim.claimId);
    const [criticalRow] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, criticalClaim.claimId));
    expect(criticalRow?.siuReferred).toBe(true);
    const siuTasks = await isolated.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.claimId, criticalClaim.claimId),
          eq(tasks.type, "siu_review"),
        ),
      );
    expect(siuTasks.length).toBeGreaterThan(0);
  });

  it("TC-012-04 SIU cleared releases BR-AUTH-001 settlement hold", async () => {
    const claim = await insertBaseClaim(isolated.db, {
      status: "in_settlement",
      estimatedAmount: "5000.00",
    });
    await isolated.db
      .update(claims)
      .set({
        siuReferred: true,
        siuDisposition: "open",
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claim.claimId));

    await expect(
      evaluateRuleSet(isolated.db, "BR-AUTH-001", {
        settlement_amount: 5000,
        approver_role: "adjuster",
        approver_authority_level: 3,
        fraud_band: "critical",
        siu_referred: true,
        siu_disposition: "open",
      }, { claimId: claim.claimId, actor: "test:auth" }),
    ).resolves.toMatchObject({
      outputs: { decision: "block", reason: "SIU hold" },
    });

    await isolated.db
      .update(claims)
      .set({
        siuDisposition: "cleared",
        siuReferred: false,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claim.claimId));

    const authAfter = await evaluateRuleSet(isolated.db, "BR-AUTH-001", {
      settlement_amount: 5000,
      approver_role: "adjuster",
      approver_authority_level: 3,
      fraud_band: "low",
      siu_referred: false,
      siu_disposition: "cleared",
    }, { claimId: claim.claimId, actor: "test:auth" });

    expect(authAfter.outputs.decision).toBe("allow");
  });

  it("TC-012-05 re-triage supersedes fraud score with history preserved", async () => {
    vi.spyOn(gateway, "callAiGateway").mockImplementation(async (request) => {
      if (request.agentId === "AGT-FRAUD") {
        return { output: fraudClean, model: "mock:clean", latencyMs: 1 };
      }
      return {
        output: {
          severityScore: 22,
          complexityScore: 15,
          reasonCodes: ["LOW_SEVERITY"],
          keyRisks: [],
          confidence: 0.84,
        },
        model: "mock:triage",
        latencyMs: 1,
      };
    });

    const claim = await insertBaseClaim(isolated.db, {
      status: "in_assessment",
      route: "standard",
      estimatedAmount: "5000.00",
    });

    await triageClaim(isolated.db, claim.claimId, { isRetriage: true });
    const firstCount = (
      await isolated.db
        .select()
        .from(fraudScores)
        .where(eq(fraudScores.claimId, claim.claimId))
    ).length;

    vi.spyOn(gateway, "callAiGateway").mockImplementation(async (request) => {
      if (request.agentId === "AGT-FRAUD") {
        return { output: fraudHighSignals, model: "mock:high", latencyMs: 1 };
      }
      return {
        output: {
          severityScore: 55,
          complexityScore: 62,
          reasonCodes: ["LIABILITY"],
          keyRisks: [],
          confidence: 0.84,
        },
        model: "mock:triage",
        latencyMs: 1,
      };
    });

    await isolated.db
      .update(claims)
      .set({
        incidentDescription:
          "Timeline contradicts police report timestamp in the account.",
        estimatedAmount: "30000.00",
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claim.claimId));

    await retriageClaim(isolated.db, claim.claimId, {
      previousAmount: 5000,
      trigger: "amount_edit",
    });

    const allScores = await isolated.db
      .select()
      .from(fraudScores)
      .where(eq(fraudScores.claimId, claim.claimId))
      .orderBy(desc(fraudScores.createdAt));

    expect(allScores.length).toBeGreaterThan(firstCount);
    expect(allScores[0]?.band).not.toBe(allScores[allScores.length - 1]?.band);
  });
});
