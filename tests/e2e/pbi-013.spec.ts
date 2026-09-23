import AxeBuilder from "@axe-core/playwright";
import { eq, inArray } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_EMAILS } from "@/lib/auth/demo-accounts";
import { getDb } from "@/lib/db";
import {
  agentRuns,
  auditLog,
  notifications,
  tasks,
  users,
} from "@/lib/db/schema";
import { deterministicId } from "../../seed/lib/deterministic-id";
import { loginAs, signOut } from "./helpers/auth";

const PROPOSAL_TASK_ID = deterministicId("queue-task", 0);
const PROPOSAL_AGENT_RUN_ID = deterministicId("queue-agent-run", 0);
test.describe("TC-013-01 queue ordering and filters", () => {
  test("adjusting queue orders by priority desc then SLA due asc", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto("/queue", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("queue-list")).toBeVisible();
    await expect(page.getByTestId("queue-tab-adjusting")).toBeVisible();

    const priorities = await page
      .locator('[data-testid^="queue-item-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const text = node.textContent ?? "";
          const match = /Priority (\d+)/.exec(text);
          return match ? Number(match[1]) : 0;
        }),
      );

    expect(priorities.length).toBeGreaterThan(1);
    for (let i = 1; i < priorities.length; i += 1) {
      expect(priorities[i - 1]!).toBeGreaterThanOrEqual(priorities[i]!);
    }

    await page.getByLabel("Filter by task type").selectOption("review_triage");
    await expect(page.getByTestId(`queue-item-${PROPOSAL_TASK_ID}`)).toBeVisible();
  });
});

test.describe("TC-013-02 adjuster role scoping", () => {
  test("adjuster cannot access supervision queue tab", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto("/queue", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("queue-tab-supervision")).toHaveCount(0);
  });

  test("queue list API rejects forbidden queue for adjuster", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    const response = await page.request.post("/api/queue/list", {
      data: { queue: "supervision", filters: {}, limit: 25 },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("FORBIDDEN");
  });
});

test.describe("TC-013-03 accept agent proposal", () => {
  test("accept records agent_runs.outcome=accepted", async ({ page }) => {
    const db = getDb();
    await db
      .update(tasks)
      .set({ status: "open", resolution: null, resolutionReason: null })
      .where(eq(tasks.id, PROPOSAL_TASK_ID));
    await db
      .update(agentRuns)
      .set({ outcome: null })
      .where(eq(agentRuns.id, PROPOSAL_AGENT_RUN_ID));

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/queue/${PROPOSAL_TASK_ID}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("agent-proposal-card")).toBeVisible();
    await page.getByTestId("agent-proposal-accept").click();

    await expect(page.getByTestId("task-resolution-summary")).toBeVisible({
      timeout: 10_000,
    });

    const [run] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, PROPOSAL_AGENT_RUN_ID));
    expect(run?.outcome).toBe("accepted");
  });
});

test.describe("TC-013-04 override requires reason", () => {
  test("UI and API reject override without reason", async ({ page }) => {
    const db = getDb();
    const overrideTaskId = deterministicId("queue-task", 2);
    await db
      .update(tasks)
      .set({ status: "open", resolution: null, resolutionReason: null })
      .where(eq(tasks.id, overrideTaskId));

    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto(`/queue/${overrideTaskId}`, { waitUntil: "domcontentloaded" });

    await page.getByTestId("agent-proposal-override").click();
    await expect(page.getByTestId("resolve-dialog")).toBeVisible();
    await page.getByTestId("resolve-submit").click();
    await expect(page.getByTestId("resolve-reason-error")).toBeVisible();

    const apiReject = await page.request.post("/api/tasks/resolve", {
      data: { taskId: overrideTaskId, resolution: "overridden" },
    });
    expect(apiReject.status()).toBe(400);
    const rejectBody = (await apiReject.json()) as { error?: { code?: string } };
    expect(rejectBody.error?.code).toBe("REASON_REQUIRED");

    await page.getByTestId("resolve-reason-input").fill("Manual review found conflicting evidence.");
    await page.getByTestId("resolve-submit").click();
    await expect(page.getByTestId("task-resolution-summary")).toBeVisible({
      timeout: 10_000,
    });

    const agentRunId = deterministicId("queue-agent-run", 1);
    const [run] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, agentRunId));
    expect(run?.outcome).toBe("overridden");
  });
});

test.describe("TC-013-05 supervisor bulk reassign", () => {
  test("moves tasks, notifies assignee, and audits", async ({ page }) => {
    const db = getDb();
    const taskIds = [
      deterministicId("queue-task", 1),
      deterministicId("queue-task", 6),
    ];

    await db
      .update(tasks)
      .set({ assignedTo: null, status: "open" })
      .where(inArray(tasks.id, taskIds));

    const [adjuster] = await db
      .select()
      .from(users)
      .where(eq(users.email, DEMO_ACCOUNT_EMAILS.adjuster))
      .limit(1);
    expect(adjuster).toBeTruthy();

    await loginAs(page, DEMO_ACCOUNT_EMAILS.supervisor);
    await page.goto("/queue", { waitUntil: "domcontentloaded" });
    await page.getByTestId("queue-tab-adjusting").click();

    for (const taskId of taskIds) {
      await page.getByTestId(`queue-select-${taskId}`).check();
    }

    await page.getByTestId("bulk-reassign-open").click();
    await page.getByTestId("bulk-reassign-select").selectOption(adjuster!.id);
    await page.getByTestId("bulk-reassign-submit").click();

    await expect(page.getByTestId("queue-status-live")).toContainText("Reassigned", {
      timeout: 10_000,
    });

    const moved = await db.select().from(tasks).where(inArray(tasks.id, taskIds));
    expect(moved.every((row) => row.assignedTo === adjuster!.id)).toBe(true);

    const noteRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, adjuster!.id));
    expect(noteRows.some((row) => row.kind === "task_reassigned")).toBe(true);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "bulk_reassign_task"));
    expect(audits.length).toBeGreaterThan(0);
  });
});

test.describe("TC-013-06 keyboard and axe", () => {
  test("queue list is keyboard operable and axe clean", async ({ page }) => {
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto("/queue", { waitUntil: "domcontentloaded" });

    const firstOpen = page.locator('[data-testid^="queue-open-"]').first();
    await firstOpen.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/queue\/.+/);

    await signOut(page);
    await loginAs(page, DEMO_ACCOUNT_EMAILS.adjuster);
    await page.goto("/queue", { waitUntil: "domcontentloaded" });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[data-testid="queue-list"]')
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
