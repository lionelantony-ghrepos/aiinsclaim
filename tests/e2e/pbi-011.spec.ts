import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { loginAs } from "./helpers/auth";

test.describe("TC-011-02 STP green-lane e2e visibility", () => {
  test("staff can view triage card on claim detail", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto("/queue", { waitUntil: "domcontentloaded" });

    const claimLink = page.locator('a[href^="/claims/"]').first();
    const linkCount = await claimLink.count();
    if (linkCount === 0) {
      test.skip(true, "No seeded claims available in queue navigation");
    }

    await claimLink.click();
    await expect(page.getByTestId("triage-card")).toBeVisible();
    await expect(page.getByTestId("triage-route")).toBeVisible();
  });
});
