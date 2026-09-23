import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { agentRuns, notifications, parameters, users } from "@/lib/db/schema";
import { CommsAgentOutputSchema } from "@/lib/schemas/agents/comms";
import { runCommsAgent } from "@/lib/agents/comms";
import validGatewayFixture from "../fixtures/gateway/comms-valid.json";
import invalidGatewayFixture from "../fixtures/gateway/comms-schema-invalid.json";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertBaseClaim } from "../helpers/pbi-007-fixtures";

const gatewayMock = vi.hoisted(() => vi.fn());
const insertTaskMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/gateway", () => ({
  callAiGateway: gatewayMock,
}));
vi.mock("@/lib/db/queries/tasks", () => ({
  insertTask: insertTaskMock,
}));

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

const template = {
  templateId: "claims.acknowledgement.v1",
  subject: "We received your claim",
  bodyMd: "Thank you for reporting your claim. We will review the information provided.",
};

function fixtureInput(claimId: string) {
  return {
    draftType: "acknowledgement" as const,
    claimFacts: {
      claimId,
      claimNumber: "CLM-TEST-020",
      lineOfBusiness: "auto" as const,
      claimType: "collision" as const,
      denialReasonCode: null,
    },
    claimSummaryMd: "A rear-end collision was reported and the claim is under review.",
    template,
    context: { locale: "en-US" },
    tone: "warm" as const,
    readingLevel: "plain" as const,
  };
}

describe("PBI-020 AGT-COMMS contract", () => {
  beforeAll(() => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  beforeEach(() => {
    gatewayMock.mockReset();
    insertTaskMock.mockReset();
    insertTaskMock.mockResolvedValue({ id: "manual-review-task" });
  });

  it("TC-020-01 grounds a draft in the template and summary without sending", async () => {
    const { claimId } = await insertBaseClaim(isolated.db, {
      incidentDescription: "Rear-end collision at an intersection.",
    });
    const input = fixtureInput(claimId);
    gatewayMock.mockResolvedValue({
      output: validGatewayFixture,
      model: "mock:agt-comms-v1",
      latencyMs: 1,
    });

    const result = await runCommsAgent(isolated.db, input);

    expect(result.output).toEqual(CommsAgentOutputSchema.parse(validGatewayFixture));
    expect(result.output.templateId).toBe(input.template.templateId);
    expect(result.output.tone).toBe(input.tone);
    expect(gatewayMock).toHaveBeenCalledTimes(1);
    expect(gatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "AGT-COMMS",
        promptVersion: "v1",
        input: expect.objectContaining({
          claimSummaryMd: input.claimSummaryMd,
          template,
          tone: input.tone,
        }),
      }),
    );
    expect(
      await isolated.db
        .select()
        .from(notifications)
        .where(eq(notifications.claimId, claimId)),
    ).toHaveLength(0);
  });

  it("TC-020-02 logs a redacted input, prompt version, and leaves output pending human review", async () => {
    const { claimId } = await insertBaseClaim(isolated.db);
    const input = {
      ...fixtureInput(claimId),
      claimSummaryMd:
        "Jordan Example, jordan@example.test, 10 Main Street, reported a loss. " +
        "Call Alex at 555-867-5309 for the narrative details.",
    };
    gatewayMock.mockResolvedValue({
      output: validGatewayFixture,
      model: "mock:agt-comms-v1",
      latencyMs: 3,
    });

    const result = await runCommsAgent(isolated.db, input);
    const [run] = await isolated.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, result.agentRunId))
      .orderBy(desc(agentRuns.createdAt));

    expect(run?.agentId).toBe("AGT-COMMS");
    expect(run?.promptVersion).toBe("v1");
    expect(run?.status).toBe("ok");
    expect(run?.outcome).toBeNull();
    expect(JSON.stringify(run?.inputJson)).not.toContain("jordan@example.test");
    expect(JSON.stringify(run?.inputJson)).not.toContain("10 Main Street");
    expect(JSON.stringify(run?.inputJson)).not.toContain("Jordan Example");
    expect(JSON.stringify(run?.inputJson)).not.toContain("555-867-5309");
    expect(JSON.stringify(run?.inputJson)).not.toContain("Call Alex");
    expect(run?.inputJson).toEqual(
      expect.objectContaining({
        claimFacts: expect.objectContaining({ claimId }),
      }),
    );
  });

  it("TC-020-03 rejects schema-invalid tone or reading-level output after one retry", async () => {
    const { claimId } = await insertBaseClaim(isolated.db);
    gatewayMock
      .mockResolvedValueOnce({
        output: invalidGatewayFixture,
        model: "mock:agt-comms-v1",
        latencyMs: 1,
      })
      .mockResolvedValueOnce({
        output: validGatewayFixture,
        model: "mock:agt-comms-v1",
        latencyMs: 1,
      });

    const result = await runCommsAgent(isolated.db, fixtureInput(claimId));

    expect(CommsAgentOutputSchema.safeParse(invalidGatewayFixture).success).toBe(
      false,
    );
    expect(gatewayMock).toHaveBeenCalledTimes(2);
    expect(result.output).toEqual(CommsAgentOutputSchema.parse(validGatewayFixture));
    expect(result.agentFailed).toBe(false);
  });

  it("TC-020-03-extra returns a manual-review fallback after two schema failures", async () => {
    const { claimId } = await insertBaseClaim(isolated.db);
    gatewayMock
      .mockResolvedValueOnce({
        output: invalidGatewayFixture,
        model: "mock:agt-comms-v1",
        latencyMs: 1,
      })
      .mockResolvedValueOnce({
        output: invalidGatewayFixture,
        model: "mock:agt-comms-v1",
        latencyMs: 1,
      });

    const result = await runCommsAgent(isolated.db, fixtureInput(claimId));

    expect(result.agentFailed).toBe(true);
    expect(result.output.subject).toMatch(/unavailable|manual/i);
    expect(gatewayMock).toHaveBeenCalledTimes(2);
    const [run] = await isolated.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, result.agentRunId));
    expect(run?.status).toBe("failed");
    expect(run?.outcome).toBeNull();
    expect(
      await isolated.db
        .select()
        .from(notifications)
        .where(eq(notifications.claimId, claimId)),
    ).toHaveLength(0);
    expect(insertTaskMock).toHaveBeenCalledTimes(1);
    expect(insertTaskMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        claimId,
        type: "assess_claim",
        payloadJson: expect.objectContaining({
          agentRunId: result.agentRunId,
          kind: "communication_manual_review",
        }),
      }),
    );
  });

  it("auto-disables AGT-COMMS and notifies active admins after the configured threshold", async () => {
    const { claimId } = await insertBaseClaim(isolated.db);
    const existingFailures = await isolated.db
      .select()
      .from(agentRuns)
      .where(
        and(eq(agentRuns.agentId, "AGT-COMMS"), eq(agentRuns.status, "failed")),
      );
    await isolated.db.insert(users).values({
      id: "admin-pbi-020",
      email: "admin-pbi-020@example.test",
      passwordHash: "test",
      displayName: "PBI-020 Admin",
      role: "admin",
      authorityLevel: 4,
      specialties: [],
      isActive: true,
    });
    await isolated.db.insert(parameters).values([
      {
        id: "pbi-020-enabled",
        key: "agents.AGT-COMMS.enabled",
        valueJson: true,
        valueType: "boolean",
        effectiveFrom: "2026-01-01",
      },
      {
        id: "pbi-020-threshold",
        key: "agents.failure_alert_count",
        valueJson: existingFailures.length,
        valueType: "number",
        effectiveFrom: "2026-01-01",
      },
      {
        id: "pbi-020-window",
        key: "agents.failure_window",
        valueJson: "1h",
        valueType: "duration",
        effectiveFrom: "2026-01-01",
      },
    ]);
    gatewayMock
      .mockResolvedValueOnce({
        output: invalidGatewayFixture,
        model: "mock:agt-comms-v1",
        latencyMs: 1,
      })
      .mockResolvedValueOnce({
        output: invalidGatewayFixture,
        model: "mock:agt-comms-v1",
        latencyMs: 1,
      });

    const result = await runCommsAgent(isolated.db, fixtureInput(claimId));

    expect(result.agentFailed).toBe(true);
    const [enabled] = await isolated.db
      .select()
      .from(parameters)
      .where(eq(parameters.key, "agents.AGT-COMMS.enabled"));
    expect(enabled?.valueJson).toBe(false);
    expect(
      await isolated.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "admin-pbi-020")),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "agent_ops",
          title: "AGT-COMMS disabled after repeated failures",
        }),
      ]),
    );

    gatewayMock.mockReset();
    const nextResult = await runCommsAgent(
      isolated.db,
      fixtureInput(claimId),
    );
    expect(nextResult.agentFailed).toBe(true);
    expect(gatewayMock).not.toHaveBeenCalled();
  });
});
