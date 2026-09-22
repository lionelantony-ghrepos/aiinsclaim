import path from "node:path";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { getDb } from "@/lib/db";
import { extractions, tasks } from "@/lib/db/schema";
import { loginAs, signOut } from "./helpers/auth";
import {
  continueWizard,
  extractClaimIdFromUrl,
  fillCollisionVehicle,
  fillCommonIncidentFields,
  goToWizardStep,
  selectPolicyAndClaimType,
  waitForAutosave,
} from "./helpers/fnol-wizard";

test.describe.configure({ mode: "serial", timeout: 120_000 });

const DEMO_AUTO_POLICY = /POL-AUTO-000001.*Demo Claimant/;

test.describe("TC-010-01 document upload validates mime/size", () => {
  test("allowed PDF upload shows verified status chip for invoice", async ({
    page,
  }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/claims/new", { waitUntil: "domcontentloaded" });

    await selectPolicyAndClaimType(page, DEMO_AUTO_POLICY, "collision");
    await continueWizard(page);
    await fillCommonIncidentFields(page);
    await fillCollisionVehicle(page);
    await continueWizard(page);
    await waitForAutosave(page);

    await goToWizardStep(page, "Documents");

    const samplePdf = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "samples",
      "sample-invoice.pdf",
    );

    await page.locator('select[name="docType"]').selectOption("invoice");
    await page.locator('input[type="file"]').setInputFiles(samplePdf);
    await page.getByRole("button", { name: "Upload document" }).click();

    await expect(page.getByTestId("doc-status-verified")).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("TC-010-04 verification accept applies corrected fields", () => {
  test("staff reviewer accepts corrected extraction", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/claims/new", { waitUntil: "domcontentloaded" });

    await selectPolicyAndClaimType(page, DEMO_AUTO_POLICY, "collision");
    await continueWizard(page);
    await fillCommonIncidentFields(page);
    await fillCollisionVehicle(page);
    await continueWizard(page);
    await waitForAutosave(page);
    const claimId = await extractClaimIdFromUrl(page);

    await goToWizardStep(page, "Documents");
    const samplePdf = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "samples",
      "sample-invoice-low.pdf",
    );
    await page.locator('select[name="docType"]').selectOption("invoice");
    await page.locator('input[type="file"]').setInputFiles(samplePdf);
    await page.getByRole("button", { name: "Upload document" }).click();

    await expect(page.getByTestId("doc-status-verification_pending")).toBeVisible({
      timeout: 15_000,
    });

    const db = getDb();
    const taskRows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.claimId, claimId));
    const verifyTask = taskRows.find((task) => task.type === "verify_extraction");
    expect(verifyTask).toBeTruthy();

    await signOut(page);
    await loginAs(page, DEMO_ACCOUNT_EMAILS.intake_agent);
    await page.goto(`/verify-extraction/${verifyTask!.id}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("verify-extraction-view")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("verify-field-totalAmount").fill("2550.00");
    await page.getByTestId("verify-accept").click();

    await expect(page.getByText("Extraction accepted and applied.")).toBeVisible({
      timeout: 10_000,
    });

    const payload = (verifyTask!.payloadJson ?? {}) as { extractionId?: string };
    expect(payload.extractionId).toBeTruthy();

    const [verifiedExtraction] = await db
      .select()
      .from(extractions)
      .where(eq(extractions.id, payload.extractionId!));
    expect(verifiedExtraction?.applied).toBe(true);
    expect(verifiedExtraction?.verifiedBy).toBeTruthy();
  });
});
