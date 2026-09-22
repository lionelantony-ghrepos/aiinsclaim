import path from "node:path";
import { expect, type Page } from "@playwright/test";
import type { FnolClaimType } from "@/lib/intake/constants";
import { FNOL_CLAIM_TYPE_LABELS } from "@/lib/intake/constants";

const SAMPLE_PHOTO = path.join(process.cwd(), "seed/assets/sample-2.jpg");
const SAMPLE_PHOTO_ALT = path.join(process.cwd(), "seed/assets/sample-3.jpg");

async function selectPolicyOption(page: Page, policyLabel: RegExp | string) {
  const policySelect = page.getByLabel("Policy");
  if (typeof policyLabel === "string") {
    await policySelect.selectOption({ label: policyLabel });
    await syncSelectValue(policySelect);
    return;
  }

  const options = await policySelect.locator("option").allTextContents();
  const match = options.find((option) => policyLabel.test(option.trim()));
  if (!match) {
    throw new Error(
      `No policy option matching ${policyLabel}. Options: ${options.join(", ")}`,
    );
  }
  await policySelect.selectOption({ label: match.trim() });
  await syncSelectValue(policySelect);
}

async function syncSelectValue(select: ReturnType<Page["getByLabel"]>) {
  await select.evaluate((element) => {
    if (element instanceof HTMLSelectElement) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

export async function selectPolicyAndClaimType(
  page: Page,
  policyLabel: RegExp | string,
  claimType: FnolClaimType,
) {
  await selectPolicyOption(page, policyLabel);
  const claimTypeSelect = page.getByLabel("Claim type");
  await claimTypeSelect.selectOption({
    label: FNOL_CLAIM_TYPE_LABELS[claimType],
  });
  await syncSelectValue(claimTypeSelect);
  await expectPolicyAndTypeSelected(page);
}

async function expectPolicyAndTypeSelected(page: Page) {
  await expect(page.getByLabel("Policy")).not.toHaveValue("");
  await expect(page.getByLabel("Claim type")).not.toHaveValue("");
}

export async function continueWizard(page: Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByTestId("step-incident")
    .or(page.getByTestId("step-parties"))
    .or(page.getByTestId("step-documents"))
    .or(page.getByTestId("step-review"))
    .first()
    .waitFor({ timeout: 30_000 });
}

export async function goToWizardStep(page: Page, stepLabel: string) {
  await page.getByRole("button", { name: stepLabel }).click();
}

export async function fillCommonIncidentFields(page: Page) {
  await page.locator('input[type="datetime-local"]').fill("2026-06-15T10:30");
  await page.getByLabel("Estimated amount (USD)").fill("1500");
  await page
    .getByLabel("Description")
    .fill(
      "Rear-end collision at Main Street intersection with moderate vehicle damage.",
    );
  await page.getByLabel("Street address").fill("123 Main St");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("State").fill("IL");
  await page.getByLabel("Postal code").fill("62701");
}

export async function fillCollisionVehicle(page: Page) {
  await page.getByLabel("Make").fill("Toyota");
  await page.getByLabel("Model").fill("Camry");
}

export async function fillGlassIncident(page: Page) {
  await page.locator('input[type="datetime-local"]').fill("2026-06-15T10:30");
  await page.getByLabel("Estimated amount (USD)").fill("450");
  await page
    .getByLabel("Description")
    .fill("Windshield cracked by road debris while driving on the highway.");
  await page.getByLabel("Street address").fill("123 Main St");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("State").fill("IL");
  await page.getByLabel("Postal code").fill("62701");
  await page.getByLabel("Damaged panel").fill("windshield");
}

export async function uploadPhoto(page: Page, filePath = SAMPLE_PHOTO) {
  await page.getByTestId("step-documents").getByLabel("Document type").selectOption({
    value: "photo",
  });
  await page
    .getByTestId("step-documents")
    .locator('input[type="file"]')
    .setInputFiles(filePath);
  await page
    .getByTestId("step-documents")
    .getByRole("button", { name: "Upload document" })
    .click();
  await page
    .getByTestId("fnol-checklist")
    .getByTestId('checklist-item-{"doc":"photo","min":1}')
    .getByText("Satisfied")
    .waitFor({ timeout: 15_000 });
}

export async function uploadPhotos(page: Page, count: number) {
  const files = [SAMPLE_PHOTO, SAMPLE_PHOTO_ALT];
  for (let index = 0; index < count; index += 1) {
    await uploadPhoto(page, files[index % files.length]!);
  }
}

export async function waitForAutosave(page: Page) {
  await page.getByTestId("autosave-status").filter({ hasText: "Draft saved" }).waitFor({
    timeout: 30_000,
  });
}

export async function extractClaimIdFromUrl(page: Page) {
  const url = new URL(page.url());
  const claimId = url.searchParams.get("claimId");
  if (!claimId) {
    throw new Error("Expected claimId query parameter in wizard URL");
  }
  return claimId;
}
