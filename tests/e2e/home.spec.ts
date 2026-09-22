import { test, expect } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { loginAs } from "./helpers/auth";

test("home page loads for signed-in users", async ({ page }) => {
  await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /aiinsclaim/i })).toBeVisible();
});
