import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { loginAs } from "./helpers/auth";

test.describe.configure({ mode: "serial", timeout: 120_000 });

const RULE_SET_CODE = "BR-STP-001";
const ACTIVATION_DATE = "2026-08-01";
const CHANGE_NOTE = "TC-008-03 e2e activation with change note";

const greenLaneStpInputs = {
  route: "green_lane",
  fraud_band: "low",
  all_required_docs_extracted: true,
  extraction_min_confidence: 0.94,
  claimant_prior_claims_12m: 0,
  estimated_amount: 1800,
};

let draftVersionUrl: string;

test.beforeEach(async ({ page }) => {
  await loginAs(page, DEMO_ACCOUNT_EMAILS.admin);
});

test("TC-008-01 create draft from active; active remains read-only", async ({
  page,
}) => {
  await page.goto("/rules", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("rules-list")).toBeVisible();

  await page.goto(`/rules/${RULE_SET_CODE}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("rules-versions-list")).toBeVisible();

  const versionLink = page
    .getByTestId("rules-versions-list")
    .getByRole("link", { name: /^Version \d+$/ })
    .first();
  const versionHref = await versionLink.getAttribute("href");
  expect(versionHref).toBeTruthy();
  await page.goto(versionHref!, { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("version-detail")).toBeVisible();
  await expect(page.getByTestId("decision-table-grid")).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/versions\/[0-9a-f-]+$/),
    page.getByTestId("create-draft-btn").click(),
  ]);

  await expect(page.getByTestId("version-detail")).toBeVisible();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  await expect(page.getByTestId("simulate-btn")).toBeVisible();
  await expect(page.getByTestId("activate-btn")).toBeVisible();

  draftVersionUrl = page.url();

  await page.goBack();
  await expect(page.getByTestId("version-detail")).toBeVisible();
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await expect(page.getByTestId("create-draft-btn")).toBeVisible();
  await expect(page.getByTestId("simulate-btn")).toHaveCount(0);
  await expect(page.getByTestId("activate-btn")).toHaveCount(0);
});

test("TC-008-02 simulate draft shows matched rows and outputs without persisting audit", async ({
  page,
}) => {
  await page.goto(draftVersionUrl, { waitUntil: "load" });
  await expect(page.getByTestId("version-detail")).toBeVisible();

  const simulateBtn = page.getByTestId("simulate-btn");
  await expect(simulateBtn).toBeEnabled();
  await simulateBtn.click();
  await page.waitForFunction(() =>
    document.querySelector('dialog[data-testid="simulate-drawer"][open]'),
  );

  await page
    .getByTestId("simulate-drawer")
    .locator("textarea")
    .fill(JSON.stringify(greenLaneStpInputs, null, 2));

  await page
    .getByTestId("simulate-drawer")
    .getByRole("button", { name: /run simulation|simulate/i })
    .click();

  await expect(page.getByTestId("simulate-drawer")).toContainText("matchedRuleIds");
  await expect(page.getByTestId("simulate-drawer")).toContainText("outputs");
  await expect(page.getByTestId("simulate-drawer")).toContainText("stp_allowed");
});

test("TC-008-03 activate draft retires prior active version", async ({
  page,
}) => {
  await page.goto(draftVersionUrl, { waitUntil: "load" });
  await page.getByTestId("activate-btn").click();
  await page.waitForFunction(() =>
    document.querySelector('dialog[data-testid="activate-dialog"][open]'),
  );

  await page
    .getByTestId("activate-dialog")
    .getByLabel(/change note|note/i)
    .fill(CHANGE_NOTE);
  await page
    .getByTestId("activate-dialog")
    .getByLabel(/effective/i)
    .fill(ACTIVATION_DATE);
  await Promise.all([
    page.waitForURL(/\/versions\/[0-9a-f-]+$/),
    page
      .getByTestId("activate-dialog")
      .getByRole("button", { name: /confirm activation/i })
      .click(),
  ]);

  await expect(page.getByText("active", { exact: true })).toBeVisible();

  await page.goto(`/rules/${RULE_SET_CODE}`, { waitUntil: "domcontentloaded" });
  const versionsList = page.getByTestId("rules-versions-list");
  await expect(versionsList).toContainText("retired");
  await expect(versionsList).toContainText("active");
});

test("TC-008-04 change stp.max_amount to 1000 on parameters page", async ({
  page,
}) => {
  await page.goto("/parameters", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("parameters-list")).toBeVisible();

  const stpForm = page
    .getByTestId("parameters-list")
    .locator("form")
    .filter({ hasText: "stp.max_amount" });
  await expect(stpForm).toBeVisible();

  await stpForm.getByLabel(/value/i).fill("1000");
  await Promise.all([
    page.waitForURL(/\/parameters/),
    stpForm.getByRole("button", { name: /save/i }).click(),
  ]);

  await expect(stpForm.getByLabel(/value/i)).toHaveValue("1000");
});

test("TC-008-05 axe clean and keyboard focus on version detail grid", async ({
  page,
}) => {
  await page.goto(draftVersionUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("version-detail")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter(
    (violation) => violation.impact === "critical",
  );
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);

  const grid = page.getByTestId("decision-table-grid");
  await expect(grid).toBeVisible();

  await page.locator("body").click({ position: { x: 0, y: 0 } });

  const focusedInGrid: string[] = [];
  for (let i = 0; i < 40 && focusedInGrid.length < 3; i += 1) {
    await page.keyboard.press("Tab");
    const cellLabel = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return null;
      if (!el.closest('[data-testid="decision-table-grid"]')) return null;
      return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "cell";
    });
    if (cellLabel && !focusedInGrid.includes(cellLabel)) {
      focusedInGrid.push(cellLabel);
      const outline = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return "";
        const styles = getComputedStyle(el);
        return `${styles.outlineStyle} ${styles.outlineWidth} ${styles.boxShadow}`;
      });
      const hasVisibleFocus =
        outline.includes("solid") ||
        outline.includes("auto") ||
        outline.includes("rgb");
      expect(hasVisibleFocus, `missing visible focus in grid`).toBe(true);
    }
  }

  expect(focusedInGrid.length).toBeGreaterThan(0);
});
