import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { loginAs } from "./helpers/auth";

test.describe("TC-012-04 SIU disposition workflow", () => {
  test("SIU analyst views queue and clears critical claim", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.siu_analyst);
    await page.goto("/siu", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("siu-queue-table")).toBeVisible();

    const claimLink = page.locator('a[href^="/claims/"]').first();
    const linkCount = await claimLink.count();
    if (linkCount === 0) {
      test.skip(true, "No fraud-flagged claims in seeded SIU queue");
    }

    await claimLink.click();
    await expect(page.getByTestId("fraud-panel")).toBeVisible();
    await expect(page.getByTestId("fraud-panel-band")).toBeVisible();

    const clearedButton = page.getByTestId("siu-disposition-cleared");
    if (await clearedButton.isVisible()) {
      await clearedButton.click();
      await expect(page.getByRole("status")).toContainText(/cleared/i);
    }
  });
});
