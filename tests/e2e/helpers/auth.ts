import type { Page } from "@playwright/test";
import { DEMO_PASSWORD } from "@/lib/auth/demo-accounts";

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
}

export async function loginAs(
  page: Page,
  email: string,
  password = DEMO_PASSWORD,
) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 60_000,
    waitUntil: "commit",
  });
}
