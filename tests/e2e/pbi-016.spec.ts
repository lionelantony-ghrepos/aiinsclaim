import { asc, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { getDb } from "@/lib/db";
import {
  claimItems,
  claims,
  fraudScores,
  notifications,
  payments,
  settlements,
  tasks,
  users,
} from "@/lib/db/schema";
import { loginAs, signOut } from "./helpers/auth";

async function getUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`User not seeded: ${email}`);
  return user;
}

async function prepareSettlementClaim(
  position: number,
  opts?: {
    fraudBand?: "low" | "medium" | "high" | "critical";
    itemAmount?: string;
  },
) {
  const db = getDb();
  const adjuster = await getUserByEmail(DEMO_ACCOUNT_EMAILS.adjuster);
  const rows = await db
    .select()
    .from(claims)
    .where(eq(claims.status, "in_settlement"))
    .orderBy(asc(claims.claimNumber));
  const claim = rows[position];
  if (!claim) {
    throw new Error(`No in_settlement seed claim at position ${position}`);
  }
  const itemAmount = opts?.itemAmount ?? "32000.00";
  await db
    .update(claims)
    .set({
      assignedTo: adjuster.id,
      siuReferred: false,
      siuDisposition: null,
      estimatedAmount: itemAmount,
      denialReasonCode: null,
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claim.id));
  await db.delete(tasks).where(eq(tasks.claimId, claim.id));
  await db.delete(settlements).where(eq(settlements.claimId, claim.id));
  await db.delete(payments).where(eq(payments.claimId, claim.id));
  await db.delete(fraudScores).where(eq(fraudScores.claimId, claim.id));

  const fraudBand = opts?.fraudBand ?? "low";
  await db.insert(fraudScores).values({
    id: crypto.randomUUID(),
    claimId: claim.id,
    score: fraudBand === "low" ? 10 : 60,
    band: fraudBand,
    reasonCodes: [],
    signalsJson: {},
    createdAt: new Date(),
  });

  // Single item at the test amount — multi-item seeds otherwise keep extra
  // assessed rows at 32k and incorrectly trip BR-AUTH-001.
  await db.delete(claimItems).where(eq(claimItems.claimId, claim.id));
  await db.insert(claimItems).values({
    id: crypto.randomUUID(),
    claimId: claim.id,
    itemType: "vehicle",
    description: "E2E settlement item",
    assessedAmount: itemAmount,
    assessmentStatus: "assessed",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { claim, adjuster };
}

test.describe("TC-016-01 authority route to supervision", () => {
  test("32k settlement routes with worked-example message", async ({ page }) => {
    const { claim } = await prepareSettlementClaim(0, {
      fraudBand: "low",
      itemAmount: "32000.00",
    });
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=financials`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("settlement-workbench")).toBeVisible();
    await page.getByTestId("settle-deductible").fill("0.00");
    const amountInputs = page.locator('[data-testid^="settle-item-amount-"]');
    await expect(amountInputs.first()).toBeVisible();
    await amountInputs.first().fill("32000.00");

    await page.getByTestId("settle-propose").click();
    await expect(page.getByTestId("settle-status")).toContainText("Settlement proposed", {
      timeout: 15_000,
    });

    await page.getByTestId("settle-approve").click();
    await expect(page.getByTestId("settle-status")).toContainText(
      "Above your authority — routed to supervision.",
      { timeout: 15_000 },
    );

    const db = getDb();
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.claimId, claim.id));
    expect(
      rows.some(
        (t) => t.type === "approve_settlement" && t.queue === "supervision",
      ),
    ).toBe(true);
  });
});

test.describe("TC-016-02 authority allow within level", () => {
  test("small settlement approves for level-2 adjuster", async ({ page }) => {
    const { claim } = await prepareSettlementClaim(1, {
      fraudBand: "low",
      itemAmount: "2000.00",
    });
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=financials`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByTestId("settle-deductible").fill("0.00");
    const amountInputs = page.locator('[data-testid^="settle-item-amount-"]');
    await amountInputs.first().fill("2000.00");
    await page.getByTestId("settle-propose").click();
    await expect(page.getByTestId("settle-status")).toContainText("Settlement proposed", {
      timeout: 15_000,
    });
    await page.getByTestId("settle-approve").click();
    await expect(page.getByTestId("settle-status")).toContainText("Settlement approved", {
      timeout: 15_000,
    });

    const db = getDb();
    const [updated] = await db.select().from(claims).where(eq(claims.id, claim.id));
    expect(updated.status).toBe("approved");
  });
});

test.describe("TC-016-03 SIU hold", () => {
  test("shows SIU hold banner and does not transition", async ({ page }) => {
    const { claim } = await prepareSettlementClaim(2, {
      fraudBand: "low",
      itemAmount: "1000.00",
    });
    const db = getDb();
    await db
      .update(claims)
      .set({
        siuReferred: true,
        siuDisposition: "open",
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claim.id));

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=financials`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByTestId("settle-deductible").fill("0.00");
    const amountInputs = page.locator('[data-testid^="settle-item-amount-"]');
    await amountInputs.first().fill("1000.00");
    await page.getByTestId("settle-propose").click();
    await expect(page.getByTestId("settle-status")).toContainText("Settlement proposed", {
      timeout: 15_000,
    });
    await page.getByTestId("settle-approve").click();
    await expect(page.getByTestId("siu-hold-banner")).toBeVisible({ timeout: 15_000 });

    const [updated] = await db.select().from(claims).where(eq(claims.id, claim.id));
    expect(updated.status).toBe("in_settlement");
  });
});

test.describe("TC-016-04 payment and close", () => {
  test("issues mock payment and closes when tasks clear", async ({ page }) => {
    const { claim } = await prepareSettlementClaim(3, {
      fraudBand: "low",
      itemAmount: "1500.00",
    });
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=financials`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByTestId("settle-deductible").fill("0.00");
    const amountInputs = page.locator('[data-testid^="settle-item-amount-"]');
    await amountInputs.first().fill("1500.00");
    await page.getByTestId("settle-propose").click();
    await expect(page.getByTestId("settle-status")).toContainText("Settlement proposed", {
      timeout: 15_000,
    });
    await page.getByTestId("settle-approve").click();
    await expect(page.getByTestId("settle-status")).toContainText("Settlement approved", {
      timeout: 15_000,
    });

    await page.getByTestId("payment-method").selectOption("ach_mock");
    await page.getByTestId("payment-issue").click();
    await expect(page.getByTestId("settle-status")).toContainText("Payment issued", {
      timeout: 15_000,
    });

    const db = getDb();
    const payRows = await db
      .select()
      .from(payments)
      .where(eq(payments.claimId, claim.id));
    expect(payRows.length).toBeGreaterThanOrEqual(1);
    expect(payRows[0]?.reference?.startsWith("ACH-MOCK-")).toBe(true);
    const [paidClaim] = await db.select().from(claims).where(eq(claims.id, claim.id));
    expect(paidClaim.status).toBe("paid");

    const openTaskId = crypto.randomUUID();
    await db.insert(tasks).values({
      id: openTaskId,
      claimId: claim.id,
      type: "assess_claim",
      queue: "adjusting",
      priority: 3,
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("settlement-workbench")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("closure-open-tasks")).toContainText(
      "1 open task",
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("claim-close")).toBeEnabled();
    await page.getByTestId("claim-close").click();
    await expect(page.getByTestId("settle-status")).toContainText("open task", {
      timeout: 15_000,
    });

    await db
      .update(tasks)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(tasks.id, openTaskId));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("settlement-workbench")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("closure-open-tasks")).toContainText(
      "No open tasks",
      { timeout: 15_000 },
    );
    await page.getByTestId("claim-close").click();
    await expect(page.getByTestId("settle-status")).toContainText("Claim closed", {
      timeout: 15_000,
    });

    const [closed] = await db.select().from(claims).where(eq(claims.id, claim.id));
    expect(closed.status).toBe("closed");
  });
});

test.describe("TC-016-05 denial supervisor gate", () => {
  test("denial creates confirmation task; supervisor confirms", async ({ page }) => {
    test.setTimeout(120_000);
    const { claim } = await prepareSettlementClaim(4, {
      fraudBand: "low",
      itemAmount: "4000.00",
    });
    const db = getDb();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=financials`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("settlement-workbench")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("settle-deny-open")).toBeEnabled();
    await page.getByTestId("settle-deny-open").click();
    await expect(page.getByTestId("deny-dialog")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("deny-reason-code").selectOption("COVERAGE_EXCLUDED");
    await page.getByTestId("deny-note").fill("short");
    await expect(page.getByTestId("deny-submit")).toBeDisabled();
    await page
      .getByTestId("deny-note")
      .fill("Coverage exclusion applies after policy review.");
    await page.getByTestId("deny-submit").click();
    await expect(page.getByTestId("settle-status")).toContainText(
      "Denial submitted for supervisor confirmation",
      { timeout: 15_000 },
    );

    const [mid] = await db.select().from(claims).where(eq(claims.id, claim.id));
    expect(mid.status).toBe("in_settlement");
    expect(mid.denialReasonCode).toBe("COVERAGE_EXCLUDED");

    const denyTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.claimId, claim.id));
    const denyTask = denyTasks.find(
      (t) => (t.payloadJson as { kind?: string } | null)?.kind === "deny_confirmation",
    );
    expect(denyTask).toBeTruthy();

    await signOut(page);
    await loginAs(page, DEMO_ACCOUNT_EMAILS.supervisor);
    await page.goto(`/queue/${denyTask!.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByTestId("deny-confirmation-panel")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("deny-confirmation-accept").click();
    await expect(page.getByTestId("task-detail-error")).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const [row] = await db
            .select()
            .from(claims)
            .where(eq(claims.id, claim.id));
          return row?.status ?? null;
        },
        { timeout: 30_000 },
      )
      .toBe("denied");

    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.claimId, claim.id));
    expect(notes.some((n) => n.kind === "claim_denied")).toBe(true);
  });
});
