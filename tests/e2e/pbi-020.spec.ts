import { asc, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { getDb } from "@/lib/db";
import { claims, notifications } from "@/lib/db/schema";
import { loginAs } from "./helpers/auth";

async function findWorkbenchClaim() {
  const db = getDb();
  const [claim] = await db
    .select({ id: claims.id })
    .from(claims)
    .orderBy(asc(claims.claimNumber))
    .limit(1);
  if (!claim) throw new Error("No seed claim available for PBI-020 e2e");
  return claim;
}

test.describe("PBI-020 AGT-COMMS workbench", () => {
  test("TC-020-01 drafts an editable grounded preview without auto-send", async ({
    page,
  }) => {
    const claim = await findWorkbenchClaim();
    const db = getDb();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=comms`, {
      waitUntil: "domcontentloaded",
    });

    const panel = page.getByTestId("comms-draft-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toContainText(/AI-generated|draft/i);
    await expect(page.getByTestId("comms-template-select")).toBeVisible();
    await expect(page.getByTestId("comms-generate")).toBeVisible();

    await page.getByTestId("comms-template-select").selectOption({ index: 0 });
    await page.getByTestId("comms-generate").click();

    await expect(page.getByTestId("comms-subject")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("comms-body")).toBeVisible();
    await expect(page.getByTestId("comms-save")).toBeEnabled();
    await expect(page.getByTestId("comms-send")).toBeVisible();

    const beforeSend = await db
      .select()
      .from(notifications)
      .where(eq(notifications.claimId, claim.id));
    expect(beforeSend).toHaveLength(0);
    expect(
      beforeSend.some(
        (notification) => notification.deliveryStatus === "mock_sent",
      ),
    ).toBe(false);
  });

  test("TC-020-01-extra preserves edits and sends only after explicit mock-send action", async ({
    page,
  }) => {
    const claim = await findWorkbenchClaim();
    const db = getDb();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=comms`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("comms-draft-panel").waitFor();
    await page.getByTestId("comms-template-select").selectOption({ index: 0 });
    await page.getByTestId("comms-generate").click();
    await expect(page.getByTestId("comms-subject")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Edit draft" }).click();
    await page.getByTestId("comms-subject").fill("Edited acknowledgement");
    await page
      .getByTestId("comms-body")
      .fill("Edited body requiring explicit human approval.");
    await page.getByTestId("comms-save").click();
    await expect(page.getByRole("status")).toContainText(
      "Draft saved to the mock outbox",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("comms-subject")).toHaveValue(
      "Edited acknowledgement",
    );
    await expect(page.getByTestId("comms-body")).toHaveValue(
      "Edited body requiring explicit human approval.",
    );

    const savedRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.claimId, claim.id));
    expect(savedRows).toHaveLength(1);
    const savedOutboxId = savedRows[0]?.id;
    expect(savedOutboxId).toBeDefined();
    const [savedNotification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, savedOutboxId!));
    expect(savedNotification).toEqual(
      expect.objectContaining({
        id: savedOutboxId,
        title: "Edited acknowledgement",
        bodyMd: "Edited body requiring explicit human approval.",
        deliveryStatus: "draft",
      }),
    );
    expect(savedNotification?.deliveryStatus).not.toBe("mock_sent");

    await page.getByTestId("comms-send").click();
    await expect(page.getByRole("status")).toContainText(
      "Mock communication recorded after explicit human send",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("comms-outbox")).toContainText(/mock|sent/i, {
      timeout: 20_000,
    });

    const [sentNotification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, savedOutboxId!));
    expect(sentNotification).toEqual(
      expect.objectContaining({
        id: savedOutboxId,
        title: "Edited acknowledgement",
        bodyMd: "Edited body requiring explicit human approval.",
        deliveryStatus: "mock_sent",
      }),
    );
  });
});
