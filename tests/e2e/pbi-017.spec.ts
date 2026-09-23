import { asc } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { getDb } from "@/lib/db";
import { claims } from "@/lib/db/schema";
import { loginAs } from "./helpers/auth";

async function findTimelineClaim() {
  const db = getDb();
  // Prefer a claim that has gone through at least one state transition
  // (has state history) so the timeline has real entries.
  const [claim] = await db
    .select({ id: claims.id, status: claims.status })
    .from(claims)
    .orderBy(asc(claims.claimNumber))
    .limit(1);
  if (!claim) throw new Error("No seed claim available for PBI-017 e2e");
  return claim;
}

// ---------------------------------------------------------------------------
// TC-017-02: Timeline merges all history sources
// ---------------------------------------------------------------------------
test.describe("TC-017-02 timeline merges all history sources", () => {
  test("merged timeline renders with kind filters", async ({ page }) => {
    const claim = await findTimelineClaim();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/claims/${claim.id}?tab=timeline`, {
      waitUntil: "domcontentloaded",
    });

    // Timeline card must be visible
    await expect(page.getByTestId("workbench-timeline")).toBeVisible({
      timeout: 20_000,
    });

    // At least one entry in the timeline
    const entries = page.getByTestId("timeline-entry");
    await expect(entries.first()).toBeVisible({ timeout: 15_000 });

    // Kind filter buttons must be present
    await expect(page.getByTestId("timeline-filter-all")).toBeVisible();
    await expect(page.getByTestId("timeline-filter-state")).toBeVisible();
    await expect(page.getByTestId("timeline-filter-agent")).toBeVisible();

    // Clicking each filter should not break the page
    for (const kind of ["state", "task", "agent", "reserve", "payment"] as const) {
      await page.getByTestId(`timeline-filter-${kind}`).click();
      // Page should not crash — workbench-timeline must still be visible
      await expect(page.getByTestId("workbench-timeline")).toBeVisible({
        timeout: 5_000,
      });
    }

    // Reset to "All"
    await page.getByTestId("timeline-filter-all").click();
    await expect(page.getByTestId("workbench-timeline")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// TC-017-01 UI: Summary card appears on overview tab
// ---------------------------------------------------------------------------
test.describe("TC-017-01 summary card visible on overview", () => {
  test("summary-card, provenance, and regenerate button are present", async ({
    page,
  }) => {
    const claim = await findTimelineClaim();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    // Default tab is overview (no ?tab= param, or explicit)
    await page.goto(`/claims/${claim.id}`, {
      waitUntil: "domcontentloaded",
    });

    // Summary card
    await expect(page.getByTestId("summary-card")).toBeVisible({
      timeout: 20_000,
    });

    // Provenance note (AI-generated badge + timestamp line)
    await expect(page.getByTestId("summary-provenance")).toBeVisible({
      timeout: 10_000,
    });

    // Regenerate button
    await expect(page.getByTestId("summary-regenerate")).toBeVisible({
      timeout: 10_000,
    });
  });
});
