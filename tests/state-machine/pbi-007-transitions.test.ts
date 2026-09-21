import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import {
  claimStateHistory,
  claims,
  claimTransitions,
  tasks,
} from "@/lib/db/schema";
import {
  GuardFailedError,
  IllegalTransitionError,
  transitionClaim,
} from "@/lib/state-machine";
import { seedClaimTransitions } from "../../seed/loaders/transitions";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  addOpenInfoRequestTask,
  addPayment,
  addReserve,
  addSettlementDocs,
  insertBaseClaim,
  satisfyCollisionFnol,
} from "../helpers/pbi-007-fixtures";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

const ACTOR = "test:adjuster";
const AS_OF = "2026-06-01";

describe("PBI-007 claim state machine", () => {
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

  it("TC-007-01 legal transitions succeed with history", async () => {
    const draft = await insertBaseClaim(isolated.db, { status: "draft" });
    await satisfyCollisionFnol(
      isolated.db,
      draft.claimId,
      draft.userId,
      draft.now,
    );

    const submitted = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "submitted",
      actorId: ACTOR,
      reason: "FNOL complete",
      triggeredBy: "user",
      guardContext: { asOf: AS_OF },
    });
    expect(submitted.fromStatus).toBe("draft");
    expect(submitted.toStatus).toBe("submitted");

    const triage = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "in_triage",
      actorId: "system:auto",
      reason: "Auto on submit",
      triggeredBy: "system",
    });
    expect(triage.toStatus).toBe("in_triage");

    await isolated.db
      .update(claims)
      .set({ route: "standard" })
      .where(eq(claims.id, draft.claimId));

    const assessment = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "in_assessment",
      actorId: ACTOR,
      reason: "Triage routed to assessment",
      guardContext: { asOf: AS_OF },
    });
    expect(assessment.toStatus).toBe("in_assessment");

    await addOpenInfoRequestTask(isolated.db, draft.claimId, draft.now);
    const pendingInfo = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "pending_info",
      actorId: ACTOR,
      reason: "Need additional photos",
    });
    expect(pendingInfo.toStatus).toBe("pending_info");

    const backToAssessment = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "in_assessment",
      actorId: ACTOR,
      reason: "Claimant provided photos",
      guardContext: { infoReceived: true },
    });
    expect(backToAssessment.toStatus).toBe("in_assessment");

    await isolated.db
      .update(tasks)
      .set({ status: "done", updatedAt: new Date() })
      .where(
        and(
          eq(tasks.claimId, draft.claimId),
          eq(tasks.type, "request_info"),
        ),
      );

    await addSettlementDocs(isolated.db, draft.claimId, draft.userId, draft.now);
    await addReserve(isolated.db, draft.claimId, draft.userId, draft.now);
    const settlement = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "in_settlement",
      actorId: ACTOR,
      reason: "Assessment complete",
      guardContext: { asOf: AS_OF },
    });
    expect(settlement.toStatus).toBe("in_settlement");

    const approved = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "approved",
      actorId: ACTOR,
      reason: "Settlement approved",
      guardContext: { asOf: AS_OF },
    });
    expect(approved.toStatus).toBe("approved");

    await addPayment(isolated.db, draft.claimId, draft.partyId, draft.now);
    const paid = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "paid",
      actorId: ACTOR,
      reason: "Payment issued",
    });
    expect(paid.toStatus).toBe("paid");

    const closed = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "closed",
      actorId: ACTOR,
      reason: "Closure checklist complete",
    });
    expect(closed.toStatus).toBe("closed");

    const stpClaim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      route: "green_lane",
      estimatedAmount: "1800.00",
    });
    const stpApproved = await transitionClaim(isolated.db, {
      claimId: stpClaim.claimId,
      toStatus: "approved",
      actorId: "rule:BR-STP-001",
      reason: "Green-lane STP",
      triggeredBy: "rule",
      guardContext: {
        asOf: AS_OF,
        stpInputs: {
          route: "green_lane",
          fraud_band: "low",
          all_required_docs_extracted: true,
          extraction_min_confidence: 0.95,
          claimant_prior_claims_12m: 0,
          estimated_amount: 1800,
        },
      },
    });
    expect(stpApproved.toStatus).toBe("approved");

    const withdrawDraft = await insertBaseClaim(isolated.db, { status: "draft" });
    await transitionClaim(isolated.db, {
      claimId: withdrawDraft.claimId,
      toStatus: "withdrawn",
      actorId: "test:claimant",
      reason: "Claimant withdrew",
    });
    const [withdrawnDraft] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, withdrawDraft.claimId));
    expect(withdrawnDraft.status).toBe("withdrawn");

    const withdrawSubmitted = await insertBaseClaim(isolated.db, {
      status: "submitted",
    });
    await transitionClaim(isolated.db, {
      claimId: withdrawSubmitted.claimId,
      toStatus: "withdrawn",
      actorId: "test:claimant",
      reason: "Claimant withdrew after submit",
    });

    const denyClaim = await insertBaseClaim(isolated.db, {
      status: "submitted",
      denialReasonCode: "COVERAGE_EXCLUDED",
    });
    await transitionClaim(isolated.db, {
      claimId: denyClaim.claimId,
      toStatus: "denied",
      actorId: "test:supervisor",
      reason: "Coverage exclusion confirmed",
      guardContext: { supervisorApproved: true },
    });

    const history = await isolated.db
      .select()
      .from(claimStateHistory)
      .where(eq(claimStateHistory.claimId, draft.claimId));

    expect(history.length).toBeGreaterThanOrEqual(8);
    for (const row of history) {
      expect(row.actorId).toBeTruthy();
      expect(row.reason).toBeTruthy();
    }
  });

  it("TC-007-02 illegal transitions rejected", async () => {
    const fixture = await insertBaseClaim(isolated.db, { status: "draft" });

    await expect(
      transitionClaim(isolated.db, {
        claimId: fixture.claimId,
        toStatus: "paid",
        actorId: ACTOR,
        reason: "Skip straight to paid",
      }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);

    const [unchanged] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(unchanged.status).toBe("draft");

    const history = await isolated.db
      .select()
      .from(claimStateHistory)
      .where(eq(claimStateHistory.claimId, fixture.claimId));
    expect(history).toHaveLength(0);
  });

  it("TC-007-03 submit blocked when FNOL incomplete", async () => {
    const incomplete = await insertBaseClaim(isolated.db, {
      status: "draft",
      incidentDescription: "Too short",
    });

    await expect(
      transitionClaim(isolated.db, {
        claimId: incomplete.claimId,
        toStatus: "submitted",
        actorId: "test:claimant",
        reason: "Attempt submit",
        guardContext: { asOf: AS_OF },
      }),
    ).rejects.toMatchObject({
      name: "GuardFailedError",
      guardCode: "BR-DOC-001",
    });

    try {
      await transitionClaim(isolated.db, {
        claimId: incomplete.claimId,
        toStatus: "submitted",
        actorId: "test:claimant",
        reason: "Attempt submit",
        guardContext: { asOf: AS_OF },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(GuardFailedError);
      const guardError = error as GuardFailedError;
      expect(guardError.details?.missing?.length).toBeGreaterThan(0);
    }

    const [stillDraft] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, incomplete.claimId));
    expect(stillDraft.status).toBe("draft");
  });

  it("TC-007-04 disabled DB transition row blocks move", async () => {
    const fixture = await insertBaseClaim(isolated.db, { status: "submitted" });

    await transitionClaim(isolated.db, {
      claimId: fixture.claimId,
      toStatus: "in_triage",
      actorId: "system:auto",
      reason: "Baseline legal move",
      triggeredBy: "system",
    });

    const rollback = await insertBaseClaim(isolated.db, { status: "submitted" });
    await isolated.db
      .update(claimTransitions)
      .set({ enabled: false })
      .where(
        and(
          eq(claimTransitions.fromStatus, "submitted"),
          eq(claimTransitions.toStatus, "in_triage"),
        ),
      );

    await expect(
      transitionClaim(isolated.db, {
        claimId: rollback.claimId,
        toStatus: "in_triage",
        actorId: "system:auto",
        reason: "Should be blocked by disabled row",
        triggeredBy: "system",
      }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);

    await isolated.db
      .update(claimTransitions)
      .set({ enabled: true })
      .where(
        and(
          eq(claimTransitions.fromStatus, "submitted"),
          eq(claimTransitions.toStatus, "in_triage"),
        ),
      );
  });
});
