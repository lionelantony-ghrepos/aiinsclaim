import path from "node:path";
import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { loginAs, signOut } from "./helpers/auth";
import {
  continueWizard,
  extractClaimIdFromUrl,
  fillCollisionVehicle,
  fillCommonIncidentFields,
  fillGlassIncident,
  goToWizardStep,
  selectPolicyAndClaimType,
  uploadPhoto,
  waitForAutosave,
} from "./helpers/fnol-wizard";

test.describe.configure({ mode: "serial", timeout: 120_000 });

const DEMO_AUTO_POLICY = /POL-AUTO-000001.*Demo Claimant/;

test.describe("TC-009-01 FNOL requirements per claim type", () => {
  test("collision enforces BR-DOC-001 checklist items", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/claims/new", { waitUntil: "domcontentloaded" });

    await selectPolicyAndClaimType(page, DEMO_AUTO_POLICY, "collision");
    await continueWizard(page);

    await expect(page.getByTestId("fnol-checklist")).toBeVisible();
    await expect(page.getByTestId("checklist-item-incident_description")).toBeVisible();
    await expect(
      page.getByTestId('checklist-item-{"doc":"photos","min":2}'),
    ).toBeVisible();
    await expect(page.getByTestId("checklist-item-driver_details")).toBeVisible();
  });

  test("glass enforces BR-DOC-001 checklist items", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/claims/new", { waitUntil: "domcontentloaded" });

    await selectPolicyAndClaimType(page, DEMO_AUTO_POLICY, "glass");
    await continueWizard(page);

    await expect(page.getByTestId("fnol-checklist")).toBeVisible();
    await expect(page.getByTestId("checklist-item-incident_description")).toBeVisible();
    await expect(
      page.getByTestId('checklist-item-{"doc":"photo","min":1}'),
    ).toBeVisible();
    await expect(page.getByTestId("checklist-item-driver_details")).toHaveCount(0);
  });
});

test.describe("TC-009-02 draft autosave restore", () => {
  test("leaving and returning with claimId restores draft state", async ({
    page,
  }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/claims/new", { waitUntil: "domcontentloaded" });

    await selectPolicyAndClaimType(page, DEMO_AUTO_POLICY, "glass");
    await continueWizard(page);

    await fillGlassIncident(page);
    await continueWizard(page);
    await waitForAutosave(page);

    const claimId = await extractClaimIdFromUrl(page);

    await page.goto("/claims", { waitUntil: "domcontentloaded" });
    await page.goto(`/claims/new?claimId=${claimId}`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#main-content").getByTestId("fnol-wizard")).toBeVisible();
    await goToWizardStep(page, "Incident");
    await expect(page.getByLabel("Description")).toHaveValue(
      "Windshield cracked by road debris while driving on the highway.",
    );
    await expect(page.getByLabel("Damaged panel")).toHaveValue("windshield");
  });
});

test.describe("TC-009-03 submit blocked until complete", () => {
  test("submit shows missing requirements then succeeds when complete", async ({
    page,
  }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/claims/new", { waitUntil: "domcontentloaded" });

    await selectPolicyAndClaimType(page, DEMO_AUTO_POLICY, "glass");
    await continueWizard(page);

    await fillGlassIncident(page);
    await continueWizard(page);
    await waitForAutosave(page);
    await continueWizard(page);
    await continueWizard(page);

    await goToWizardStep(page, "Review");
    await page.getByTestId("submit-claim").click();

    await expect(page.getByText("Missing requirements")).toBeVisible();
    await expect(page.getByTestId("fnol-wizard")).toContainText(
      "FNOL completeness requirements not met",
    );

    await goToWizardStep(page, "Documents");
    await uploadPhoto(page);
    await goToWizardStep(page, "Review");
    await page.getByTestId("submit-claim").click();

    await expect(page.getByText("Claim submitted")).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("TC-009-04 AGT-INTAKE editable summary", () => {
  test("copilot panel shows editable summary draft without auto-submit", async ({
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

    await expect(page.getByTestId("intake-copilot")).toBeVisible();

    const narrative =
      "Another driver ran the red light and hit my rear bumper at moderate speed.";
    await page
      .getByTestId("intake-copilot")
      .getByLabel("Your narrative")
      .fill(narrative);
    await page.getByRole("button", { name: "Get suggestions" }).click();

    const summaryField = page
      .getByTestId("intake-copilot")
      .getByLabel("Summary draft (editable)");
    await expect(summaryField).not.toHaveValue("");
    await expect(summaryField).toBeEditable();

    const editedSummary = "Edited summary draft for review.";
    await summaryField.fill(editedSummary);
    await expect(summaryField).toHaveValue(editedSummary);

    await expect(page.getByText("Claim submitted")).toHaveCount(0);
    await goToWizardStep(page, "Review");
    await expect(page.getByTestId("submit-claim")).toBeVisible();
    await expect(page.getByText("Claim submitted")).toHaveCount(0);
  });
});

test.describe("TC-009-05 intake agent files for policyholder", () => {
  test.skip("claimant sees claim filed on their behalf", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.intake_agent);
    await page.goto("/intake/new", { waitUntil: "domcontentloaded" });

    await page.getByPlaceholder("Policy number, name, or email").fill("claimant@demo.local");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByLabel("Policy").locator("option")).toHaveCount(2, {
      timeout: 15_000,
    });

    await selectPolicyAndClaimType(page, DEMO_AUTO_POLICY, "glass");
    await continueWizard(page);

    await fillGlassIncident(page);
    await continueWizard(page);
    await waitForAutosave(page);
    await continueWizard(page);

    await goToWizardStep(page, "Documents");
    await uploadPhoto(page, path.join(process.cwd(), "seed/assets/sample-5.jpg"));
    await goToWizardStep(page, "Review");
    await page.getByTestId("submit-claim").click();
    await expect(page.getByText("Claim submitted")).toBeVisible();

    const successText = await page
      .getByTestId("fnol-wizard")
      .getByText(/CLM-/)
      .first()
      .textContent();
    expect(successText).toBeTruthy();
    const claimNumber = successText!.match(/CLM-[A-Z0-9-]+/)?.[0];
    expect(claimNumber).toBeTruthy();

    await signOut(page);
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/claims", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("claims-list")).toContainText(claimNumber!);
    await expect(page.getByTestId("claims-list")).toContainText("Glass damage");
  });
});
