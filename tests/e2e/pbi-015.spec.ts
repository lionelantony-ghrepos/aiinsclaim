import { asc, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { getDb } from "@/lib/db";
import { claims, documents, reserves, tasks, users } from "@/lib/db/schema";
import type { ClaimType } from "@/lib/db/schema/enums";
import { loginAs } from "./helpers/auth";

const SETTLEMENT_DOCS: Record<ClaimType, string[]> = {
  collision: ["repair_estimate"],
  theft: ["police_report", "ownership_proof"],
  glass: ["invoice"],
  water_damage: ["contractor_report", "repair_estimate"],
  fire: ["fire_report", "inventory", "repair_estimate"],
  storm: ["repair_estimate"],
  burglary: ["police_report", "inventory"],
  other: ["repair_estimate"],
};

async function getAdjusterId() {
  const db = getDb();
  const [adjuster] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_ACCOUNT_EMAILS.adjuster))
    .limit(1);
  if (!adjuster) {
    throw new Error("Demo adjuster not seeded");
  }
  return adjuster.id;
}

async function prepareAssessmentClaim(position: number) {
  const db = getDb();
  const adjusterId = await getAdjusterId();
  const rows = await db
    .select()
    .from(claims)
    .where(eq(claims.status, "in_assessment"))
    .orderBy(asc(claims.claimNumber));
  const claim = rows[position];
  if (!claim) {
    throw new Error(`No in_assessment seed claim at position ${position}`);
  }
  await db
    .update(claims)
    .set({ assignedTo: adjusterId, updatedAt: new Date() })
    .where(eq(claims.id, claim.id));
  return { claim, adjusterId };
}

async function clearClaimAssessmentState(claimId: string) {
  const db = getDb();
  await db.delete(tasks).where(eq(tasks.claimId, claimId));
  await db.delete(reserves).where(eq(reserves.claimId, claimId));
  await db.delete(documents).where(eq(documents.claimId, claimId));
}

test.describe("TC-015-01 workbench tabs render seeded claim", () => {
  test("all tabs render with overview cards", async ({ page }) => {
    const { claim } = await prepareAssessmentClaim(0);
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("workbench-tabs")).toBeVisible();
    await expect(page.getByTestId("workbench-overview")).toBeVisible();
    await expect(page.getByTestId("coverage-panel")).toBeVisible();

    await page.getByTestId("workbench-tab-items").click();
    await expect(page.getByTestId("workbench-items")).toBeVisible();

    await page.getByTestId("workbench-tab-documents").click();
    await expect(page.getByTestId("workbench-documents")).toBeVisible();

    await page.getByTestId("workbench-tab-financials").click();
    await expect(page.getByTestId("reserve-workbench")).toBeVisible();
    await expect(page.getByTestId("settlement-checklist")).toBeVisible();

    await page.getByTestId("workbench-tab-timeline").click();
    await expect(page.getByTestId("workbench-timeline")).toBeVisible();

    await page.getByTestId("workbench-tab-tasks").click();
    await expect(page.getByTestId("workbench-tasks")).toBeVisible();
  });
});

test.describe("TC-015-02 coverage panel matches policy math", () => {
  test("payable estimate equals min(est, limit) minus deductible", async ({
    page,
  }) => {
    const { claim } = await prepareAssessmentClaim(1);
    const db = getDb();
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}`, { waitUntil: "domcontentloaded" });

    const estimated = Number(claim.estimatedAmount ?? 0);
    const [row] = await db.select().from(claims).where(eq(claims.id, claim.id));
    void row;
    const coverageKey = await page
      .getByTestId("coverage-panel")
      .textContent();
    expect(coverageKey).toBeTruthy();

    const limit = Number(
      (await page.getByTestId("coverage-limit").textContent()) ?? "NaN",
    );
    const deductible = Number(
      (await page.getByTestId("coverage-deductible").textContent()) ?? "NaN",
    );
    const payable = Number(
      (await page.getByTestId("coverage-payable").textContent()) ?? "NaN",
    );
    expect(Number.isFinite(limit)).toBe(true);
    expect(Number.isFinite(deductible)).toBe(true);
    expect(payable).toBeCloseTo(Math.max(0, Math.min(estimated, limit) - deductible), 2);
  });
});

test.describe("TC-015-03 reserve suggestion requires confirm", () => {
  test("suggestion renders proposal and accept records reserves", async ({
    page,
  }) => {
    const { claim } = await prepareAssessmentClaim(2);
    await clearClaimAssessmentState(claim.id);
    const db = getDb();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=financials`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("reserve-empty")).toBeVisible();
    await page.getByTestId("reserve-suggest").click();
    await expect(page.getByTestId("agent-proposal-card")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("agent-proposal-accept").click();
    await expect(page.getByTestId("reserve-status")).toContainText(
      "Reserve confirmed",
      { timeout: 15_000 },
    );

    const rows = await db
      .select()
      .from(reserves)
      .where(eq(reserves.claimId, claim.id));
    expect(rows.some((r) => r.kind === "indemnity")).toBe(true);
    expect(rows.some((r) => r.kind === "expense")).toBe(true);
    expect(
      rows.every((r) => r.source === "agent_suggested"),
    ).toBe(true);
  });
});

test.describe("TC-015-04 large reserve change needs approval", () => {
  test("change beyond threshold creates supervision task", async ({ page }) => {
    const { claim } = await prepareAssessmentClaim(3);
    await clearClaimAssessmentState(claim.id);
    const db = getDb();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=financials`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByTestId("reserve-suggest").click();
    await expect(page.getByTestId("agent-proposal-card")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("agent-proposal-accept").click();
    await expect(page.getByTestId("reserve-status")).toContainText(
      "Reserve confirmed",
      { timeout: 15_000 },
    );

    const current = await db
      .select()
      .from(reserves)
      .where(eq(reserves.claimId, claim.id));
    const indemnity = current.find((r) => r.kind === "indemnity");
    expect(indemnity).toBeTruthy();
    const inflated = (Number(indemnity!.amount) * 5).toFixed(2);

    await page.getByTestId("reserve-indemnity").fill(inflated);
    await page.getByTestId("reserve-confirm").click();
    await expect(page.getByTestId("reserve-status")).toContainText(
      "supervisor approval",
      { timeout: 15_000 },
    );

    const approvalTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.claimId, claim.id));
    expect(
      approvalTasks.some(
        (t) =>
          t.queue === "supervision" &&
          (t.payloadJson as { kind?: string } | null)?.kind ===
            "reserve_approval",
      ),
    ).toBe(true);
  });
});

test.describe("TC-015-05 assessment completion gated by settlement docs", () => {
  test("blocked when docs missing, succeeds once satisfied", async ({
    page,
  }) => {
    const { claim, adjusterId } = await prepareAssessmentClaim(4);
    await clearClaimAssessmentState(claim.id);
    const db = getDb();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=financials`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByTestId("complete-assessment").click();
    await expect(page.getByTestId("complete-assessment-status")).toContainText(
      "Blocked",
      { timeout: 15_000 },
    );

    const docTypes = SETTLEMENT_DOCS[claim.claimType as ClaimType] ?? [
      "repair_estimate",
    ];
    if (claim.claimType === "collision" && Number(claim.estimatedAmount ?? 0) > 10000) {
      docTypes.push("police_report");
    }
    const now = new Date();
    for (const docType of docTypes) {
      await db.insert(documents).values({
        id: crypto.randomUUID(),
        claimId: claim.id,
        docType: docType as "repair_estimate",
        storagePath: `pbi-015-${docType}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "uploaded",
        uploadedBy: adjusterId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.insert(reserves).values({
      id: crypto.randomUUID(),
      claimId: claim.id,
      kind: "indemnity",
      amount: claim.estimatedAmount ?? "1000.00",
      setBy: adjusterId,
      source: "manual",
      createdAt: now,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("complete-assessment").click();
    await expect(page.getByTestId("complete-assessment-status")).toContainText(
      "moved to settlement",
      { timeout: 15_000 },
    );

    const [updated] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, claim.id));
    expect(updated?.status).toBe("in_settlement");
  });
});
