import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { getRoleHomePath } from "@/lib/auth/role-home";
import { USER_ROLES } from "@/lib/db/schema/enums";
import { loginAs } from "./helpers/auth";

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.describe("TC-003-01 role-correct home after sign-in", () => {
  for (const role of USER_ROLES) {
    test(`${role} lands on ${getRoleHomePath(role)}`, async ({ page }) => {
      await loginAs(page, DEMO_ACCOUNT_EMAILS[role]);
      await expect(page).toHaveURL(new RegExp(`${getRoleHomePath(role).replace("/", "\\/")}$`));
    });
  }
});

test.describe("TC-003-02 claimant blocked from staff/admin routes", () => {
  test("claimant deep-linking /queue is redirected with notice", async ({
    page,
  }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/queue");
    await expect(page).toHaveURL(/\/claims\?notice=forbidden$/);
    await expect(page.getByRole("status")).toContainText(
      "You do not have access to that page",
    );
  });

  test("claimant deep-linking /rules is redirected with notice", async ({
    page,
  }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.claimant);
    await page.goto("/rules");
    await expect(page).toHaveURL(/\/claims\?notice=forbidden$/);
    await expect(page.getByRole("status")).toContainText(
      "You do not have access to that page",
    );
  });
});

test.describe("TC-003-03 unauthenticated redirect and return", () => {
  test("protected route redirects to login and returns post-login", async ({
    page,
  }) => {
    await page.goto("/queue");
    await expect(page).toHaveURL(/\/login\?next=%2Fqueue$/);

    await page.getByLabel("Email").fill(DEMO_ACCOUNT_EMAILS.adjuster);
    await page.getByLabel("Password").fill("demo1234");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/queue$/);
  });
});

test.describe("TC-003-04 sign-out invalidates session", () => {
  test("back navigation after sign-out requires login again", async ({
    page,
  }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await expect(page).toHaveURL(/\/queue$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
  });
});
