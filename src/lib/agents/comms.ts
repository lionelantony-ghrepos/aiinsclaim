import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import { notifyAdminsOfAgentDisable } from "@/lib/db/queries/notifications";
import { insertTask } from "@/lib/db/queries/tasks";
import {
  clearParameterCache,
  getParameter,
  parseDuration,
} from "@/lib/rules/params";
import { agentRuns, parameters } from "@/lib/db/schema";
import { PARAMETER_DEFINITIONS } from "../../../seed/definitions/parameters";
import {
  CommsAgentInputSchema,
  CommsAgentOutputSchema,
  CommsManualReviewTaskRoutingSchema,
  type CommsAgentInput,
  type CommsAgentOutput,
} from "@/lib/schemas/agents/comms";
import { callAiGateway } from "./gateway";
import { redactForAgent } from "./redact";

const AGENT_ID = "AGT-COMMS";
const PROMPT_VERSION = "v1";
const FailureAlertCountSchema = z.number().int().positive();
const FailureWindowSchema = z.string().regex(/^\d+(?:\.\d+)?[hdm]$/);

async function getConfiguredParameter(
  db: Parameters<typeof insertAgentRun>[0],
  key: string,
) {
  try {
    return await getParameter(db, key);
  } catch {
    const definition = PARAMETER_DEFINITIONS.find(
      (parameter) => parameter.key === key,
    );
    if (!definition) {
      throw new Error(`Parameter not configured: ${key}`);
    }
    return {
      valueJson: definition.valueJson,
      valueType: definition.valueType,
    };
  }
}

export type CommsAgentResult = {
  output: CommsAgentOutput;
  agentRunId: string;
  agentFailed: boolean;
};

function unavailableDraft(input: CommsAgentInput): CommsAgentOutput {
  return {
    subject: "Communication draft unavailable",
    bodyMd:
      "The communication assistant is temporarily unavailable. Please draft this communication manually.",
    templateId: input.template.templateId,
    readingLevel: input.readingLevel,
    tone: input.tone,
  };
}

function parseGroundedOutput(
  raw: unknown,
  input: CommsAgentInput,
): CommsAgentOutput {
  const output = CommsAgentOutputSchema.parse(raw);
  const normalizedBody = output.bodyMd.toLowerCase();
  const hasGroundingToken = (source: string) =>
    source
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
      .some((token) => normalizedBody.includes(token));
  const templateGrounded =
    hasGroundingToken(input.template.subject) ||
    hasGroundingToken(input.template.bodyMd);
  const summaryGrounded =
    input.claimSummaryMd.trim().length === 0 ||
    hasGroundingToken(input.claimSummaryMd);
  if (
    output.templateId !== input.template.templateId ||
    output.tone !== input.tone ||
    output.readingLevel !== input.readingLevel ||
    !templateGrounded ||
    !summaryGrounded ||
    (input.draftType === "decision_letter" &&
      !output.bodyMd.includes(input.claimFacts.denialReasonCode))
  ) {
    throw new Error("AGT_COMMS_OUTPUT_NOT_GROUNDED");
  }
  return output;
}

async function runWithDb(
  db: Parameters<typeof insertAgentRun>[0],
  input: CommsAgentInput,
): Promise<CommsAgentResult> {
  const parsedInput = CommsAgentInputSchema.parse(input);
  const redactedInput = redactForAgent(parsedInput);
  const started = Date.now();
  let status: "ok" | "schema_retry" | "failed" = "ok";
  let model = "mock:agt-comms-v1";
  let output: CommsAgentOutput | null = null;

  try {
    const enabledParameter = await getConfiguredParameter(
      db,
      "agents.AGT-COMMS.enabled",
    );
    if (z.boolean().parse(enabledParameter.valueJson) === false) {
      throw new Error("AGT-COMMS is disabled");
    }
    const first = await callAiGateway({
      agentId: AGENT_ID,
      promptVersion: PROMPT_VERSION,
      input: redactedInput,
      db,
    });
    try {
      output = parseGroundedOutput(first.output, parsedInput);
      model = first.model;
    } catch {
      status = "schema_retry";
      const retry = await callAiGateway({
        agentId: AGENT_ID,
        promptVersion: PROMPT_VERSION,
        input: redactedInput,
        db,
      });
      output = parseGroundedOutput(retry.output, parsedInput);
      model = retry.model;
    }
  } catch {
    status = "failed";
    output = unavailableDraft(parsedInput);
  }

  const runRow = await insertAgentRun(db, {
    agentId: AGENT_ID,
    claimId: parsedInput.claimFacts.claimId,
    promptVersion: PROMPT_VERSION,
    model,
    inputJson: redactedInput as unknown as Record<string, unknown>,
    outputJson: output as unknown as Record<string, unknown>,
    status,
    latencyMs: Date.now() - started,
    outcome: null,
  });

  if (status === "failed") {
    await handleFailureAlert(db, runRow.createdAt);
    let routingParameter;
    try {
      routingParameter = await getParameter(
        db,
        "agents.AGT-COMMS.manual_review_task",
      );
    } catch {
      routingParameter = PARAMETER_DEFINITIONS.find(
        (parameter) => parameter.key === "agents.AGT-COMMS.manual_review_task",
      );
      if (!routingParameter) throw new Error("AGT_COMMS_ROUTING_NOT_CONFIGURED");
    }
    const routing = CommsManualReviewTaskRoutingSchema.parse(
      routingParameter.valueJson,
    );
    await insertTask(db, {
      claimId: parsedInput.claimFacts.claimId,
      type: routing.type,
      queue: routing.queue,
      priority: routing.priority,
      assignedTo: null,
      payloadJson: {
        kind: "communication_manual_review",
        agentRunId: runRow.id,
        draftType: parsedInput.draftType,
        templateId: parsedInput.template.templateId,
      },
    });
  }

  return {
    output,
    agentRunId: runRow.id,
    agentFailed: status === "failed",
  };
}

async function handleFailureAlert(
  db: Parameters<typeof insertAgentRun>[0],
  createdAt: Date,
) {
  const thresholdParameter = await getConfiguredParameter(
    db,
    "agents.failure_alert_count",
  );
  const windowParameter = await getConfiguredParameter(db, "agents.failure_window");
  const threshold = FailureAlertCountSchema.parse(thresholdParameter.valueJson);
  const window = parseDuration(FailureWindowSchema.parse(windowParameter.valueJson));
  const windowStart = new Date(createdAt.getTime() - window.totalMs);
  const recentFailures = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.agentId, AGENT_ID),
        eq(agentRuns.status, "failed"),
        gt(agentRuns.createdAt, windowStart),
      ),
    );

  if (recentFailures.length <= threshold) {
    return;
  }

  const enabledParameter = await getConfiguredParameter(
    db,
    "agents.AGT-COMMS.enabled",
  );
  if (z.boolean().parse(enabledParameter.valueJson) === false) {
    return;
  }

  const effectiveFrom = new Date().toISOString().slice(0, 10);
  await db
    .update(parameters)
    .set({ valueJson: false, updatedAt: new Date() })
    .where(
      and(
        eq(parameters.key, "agents.AGT-COMMS.enabled"),
        lte(parameters.effectiveFrom, effectiveFrom),
        or(
          isNull(parameters.effectiveTo),
          gt(parameters.effectiveTo, effectiveFrom),
        ),
      ),
    );
  clearParameterCache();
  await notifyAdminsOfAgentDisable(db, {
    agentId: AGENT_ID,
    failureCount: recentFailures.length,
  });
}

export async function runCommsAgent(
  db: Parameters<typeof insertAgentRun>[0],
  input: CommsAgentInput,
): Promise<CommsAgentResult> {
  return runWithDb(db, input);
}

/** Default contract for callers that do not need to provide a database handle. */
export async function run(input: CommsAgentInput): Promise<CommsAgentOutput> {
  return (await runWithDb(getDb(), input)).output;
}
