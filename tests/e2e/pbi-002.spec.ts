import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

const SIGNATURE_COMPONENTS = [
  { testId: "claim-status-timeline", name: /claim status timeline/i },
  { testId: "task-card", name: /task card/i },
  { testId: "agent-proposal-card", name: /agent proposal/i },
  { testId: "fraud-band-badge", name: /fraud band/i },
  { testId: "sla-countdown", name: /sla countdown/i },
  { testId: "decision-table-grid", name: /decision table/i },
] as const;

test.describe("TC-002-01 theme toggle and CSS tokens", () => {
  test("theme toggle restyles the shell using CSS variables", async ({
    page,
  }) => {
    await page.goto("/dev/components", { waitUntil: "domcontentloaded" });

    const toggle = page.getByRole("button", { name: /switch to (light|dark) theme/i });
    await expect(toggle).toBeVisible();

    const before = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        bg: styles.getPropertyValue("--bg").trim(),
        text: styles.getPropertyValue("--text").trim(),
        theme: document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
      };
    });

    expect(before.bg.length).toBeGreaterThan(0);
    expect(before.text.length).toBeGreaterThan(0);

    await toggle.click();

    const after = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        bg: styles.getPropertyValue("--bg").trim(),
        theme: document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
      };
    });

    expect(after.bg).not.toBe(before.bg);
    expect(after.theme).not.toBe(before.theme);
    await expect(page.getByTestId("claim-status-timeline")).toBeVisible();
  });
});

test.describe("TC-002-02 axe on /dev/components", () => {
  test("renders six signature components with no critical axe violations", async ({
    page,
  }) => {
    await page.goto("/dev/components", { waitUntil: "domcontentloaded" });

    for (const component of SIGNATURE_COMPONENTS) {
      await expect(page.getByTestId(component.testId)).toBeVisible();
      await expect(
        page.getByRole("heading", { name: component.name }),
      ).toBeVisible();
    }

    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter(
      (violation) => violation.impact === "critical",
    );
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});

test.describe("TC-002-03 keyboard navigation on sidebar", () => {
  test("sidebar links are reachable, visibly focused, and operable via Enter", async ({
    page,
  }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main" });
    const links = nav.getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    await page.locator("body").click({ position: { x: 0, y: 0 } });

    const focusedHrefs: string[] = [];
    for (let i = 0; i < 24 && focusedHrefs.length < count; i += 1) {
      await page.keyboard.press("Tab");
      const href = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLAnchorElement)) return null;
        if (!el.closest('nav[aria-label="Main"]')) return null;
        return el.getAttribute("href");
      });
      if (href && !focusedHrefs.includes(href)) {
        focusedHrefs.push(href);
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
        expect(hasVisibleFocus, `missing visible focus on ${href}`).toBe(true);
      }
    }

    expect(focusedHrefs.length).toBe(count);

    const lab = nav.getByRole("link", { name: "Component lab" });
    await lab.focus();
    await expect(lab).toBeFocused();
    await lab.press("Enter");
    await expect(page).toHaveURL(/\/dev\/components$/);
  });
});
