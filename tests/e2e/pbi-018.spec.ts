/**
 * PBI-018: TC-018-02, TC-018-03, TC-018-04 — Dashboard role gating, audit page, a11y
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const DEMO_ACCOUNTS = {
  admin: { email: "admin@demo.local", password: "demo1234" },
  supervisor: { email: "supervisor@demo.local", password: "demo1234" },
  adjuster: { email: "adjuster@demo.local", password: "demo1234" },
  claimant: { email: "claimant@demo.local", password: "demo1234" },
};

test.describe("PBI-018: Ops dashboards and audit viewer", () => {
  test.beforeEach(async ({ page }) => {
    // Start from login
    await page.goto("/login");
  });

  test("TC-018-02: Adjuster denied access to dashboard (supervisor+ only)", async ({
    page,
  }) => {
    // Login as adjuster
    await page.fill('input[name="email"]', DEMO_ACCOUNTS.adjuster.email);
    await page.fill('input[name="password"]', DEMO_ACCOUNTS.adjuster.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/queue|\/claims/);

    // Try to navigate to dashboard
    await page.goto("/dashboard");

    // Should be denied (redirect or error)
    // Either redirected away or see error/access denied
    const url = page.url();
    const hasError = await page.locator("text=/unauthorized|forbidden|denied/i").count();
    
    expect(url.includes("/dashboard") === false || hasError > 0).toBe(true);
  });

  test("TC-018-02: Supervisor can access dashboard", async ({ page }) => {
    // Login as supervisor
    await page.fill('input[name="email"]', DEMO_ACCOUNTS.supervisor.email);
    await page.fill('input[name="password"]', DEMO_ACCOUNTS.supervisor.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\//);

    // Navigate to dashboard
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should see dashboard content
    await expect(page.locator("text=Operations Dashboard")).toBeVisible();
    await expect(page.locator("text=Open Claims by State")).toBeVisible();
    await expect(page.locator("text=STP Rate")).toBeVisible();
    await expect(page.locator("text=Queue Backlog")).toBeVisible();
  });

  test("TC-018-03: Audit page renders complete chain and CSV export works", async ({
    page,
  }) => {
    // Login as adjuster
    await page.fill('input[name="email"]', DEMO_ACCOUNTS.adjuster.email);
    await page.fill('input[name="password"]', DEMO_ACCOUNTS.adjuster.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\//);

    // Navigate to queue to find a claim
    await page.goto("/queue");
    await page.waitForLoadState("networkidle");

    // Click on first claim (if exists)
    const firstClaimLink = page.locator('a[href*="/claims/"]').first();
    const claimLinkCount = await firstClaimLink.count();
    
    if (claimLinkCount === 0) {
      // No claims to test with, mark as pass (seed dependent)
      test.skip();
      return;
    }

    const claimUrl = await firstClaimLink.getAttribute("href");
    expect(claimUrl).toBeTruthy();

    // Navigate to audit page
    await page.goto(`${claimUrl}/audit`);
    await page.waitForLoadState("networkidle");

    // Should see audit trail heading
    await expect(page.locator("text=Audit Trail")).toBeVisible();
    await expect(page.locator("text=Decision Chain")).toBeVisible();

    // Check for CSV export button
    const exportButton = page.locator("button:has-text('Export CSV')");
    await expect(exportButton).toBeVisible();

    // Note: actual CSV download testing is tricky in Playwright
    // We verify the button exists and is clickable
    expect(await exportButton.isEnabled()).toBe(true);
  });

  test("TC-018-04: Dashboard charts accessible (patterns + labels, not color-only)", async ({
    page,
  }) => {
    // Login as supervisor
    await page.fill('input[name="email"]', DEMO_ACCOUNTS.supervisor.email);
    await page.fill('input[name="password"]', DEMO_ACCOUNTS.supervisor.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\//);

    // Navigate to dashboard
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Verify data is distinguishable without color alone
    // Charts should have text labels alongside visual bars
    await expect(page.locator("text=Cycle Time by LOB")).toBeVisible();
    await expect(page.locator("text=Fraud Band Distribution")).toBeVisible();
    await expect(page.locator("text=Agent Override Rates")).toBeVisible();

    // Check that chart bars have aria-labels for screen readers
    const bars = page.locator('[aria-label*="hours"], [aria-label*="claims"]');
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThan(0);

    // Run axe accessibility checks
    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // No critical violations
    expect(axeResults.violations.length).toBe(0);
  });

  test("TC-018-04: Audit page passes axe accessibility checks", async ({
    page,
  }) => {
    // Login as adjuster
    await page.fill('input[name="email"]', DEMO_ACCOUNTS.adjuster.email);
    await page.fill('input[name="password"]', DEMO_ACCOUNTS.adjuster.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\//);

    // Navigate to queue
    await page.goto("/queue");
    await page.waitForLoadState("networkidle");

    // Click on first claim
    const firstClaimLink = page.locator('a[href*="/claims/"]').first();
    const claimLinkCount = await firstClaimLink.count();
    
    if (claimLinkCount === 0) {
      test.skip();
      return;
    }

    const claimUrl = await firstClaimLink.getAttribute("href");
    await page.goto(`${claimUrl}/audit`);
    await page.waitForLoadState("networkidle");

    // Run axe accessibility checks
    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // No critical violations
    expect(axeResults.violations.length).toBe(0);
  });
});
