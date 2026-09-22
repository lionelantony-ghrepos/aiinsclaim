import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import { claims } from "@/lib/db/schema";
import { evaluateRuleSet } from "@/lib/rules";
import {
  IntakeAgentInputSchema,
  IntakeAgentOutputSchema,
  type IntakeAgentInput,
  type IntakeAgentOutput,
} from "@/lib/schemas/agents/intake";
import { callAiGateway } from "./gateway";
import { redactForAgent } from "./redact";

const AGENT_ID = "AGT-INTAKE";
const PROMPT_VERSION = "v1";

export async function runIntakeAgent(
  db: Db,
  input: IntakeAgentInput,
): Promise<IntakeAgentOutput> {
  const parsedInput = IntakeAgentInputSchema.parse(input);
  const redactedInput = {
    ...redactForAgent(parsedInput),
    narrative: "[REDACTED]",
  };
  const started = Date.now();

  let output: IntakeAgentOutput;
  let model = "mock:agt-intake-v1";
  let status: "ok" | "failed" = "ok";

  try {
    const gateway = await callAiGateway({
      agentId: AGENT_ID,
      promptVersion: PROMPT_VERSION,
      input: parsedInput,
    });
    output = IntakeAgentOutputSchema.parse(gateway.output as unknown);
    model = gateway.model;
  } catch {
    status = "failed";
    output = IntakeAgentOutputSchema.parse({
      summaryDraft: "Intake copilot is temporarily unavailable.",
      completenessHints: [],
      confidence: 0,
    });
  }

  const claimId =
    typeof parsedInput.enteredFields.claimId === "string"
      ? parsedInput.enteredFields.claimId
      : null;

  await enrichHintsFromBrDoc001(db, parsedInput, output);

  await insertAgentRun(db, {
    agentId: AGENT_ID,
    claimId,
    promptVersion: PROMPT_VERSION,
    model,
    inputJson: redactedInput as unknown as Record<string, unknown>,
    outputJson: output as unknown as Record<string, unknown>,
    confidence: String(output.confidence),
    status,
    latencyMs: Date.now() - started,
    outcome: status === "ok" ? "accepted" : undefined,
  });

  return output;
}

async function enrichHintsFromBrDoc001(
  db: Db,
  input: IntakeAgentInput,
  output: IntakeAgentOutput,
) {
  const claimId =
    typeof input.enteredFields.claimId === "string"
      ? input.enteredFields.claimId
      : null;
  if (!claimId) {
    return;
  }

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claim) {
    return;
  }

  const ruleResult = await evaluateRuleSet(
    db,
    "BR-DOC-001",
    {
      line_of_business: claim.lineOfBusiness,
      claim_type: claim.claimType,
      estimated_amount: Number(claim.estimatedAmount ?? 0),
    },
    {
      claimId,
      actor: "agent:AGT-INTAKE",
      dryRun: true,
    },
  );

  const requirements = (ruleResult.outputs.fnol_required ?? []) as unknown[];
  const existingFields = new Set(output.completenessHints.map((hint) => hint.field));

  for (const requirement of requirements) {
    const key =
      typeof requirement === "string"
        ? requirement
        : JSON.stringify(requirement);
    const checklistItem = input.checklistState.find(
      (item) => item.requirement === key,
    );
    if (checklistItem?.satisfied || existingFields.has(key)) {
      continue;
    }
    output.completenessHints.push({
      field: key,
      hint: `Required for ${input.claimType}: ${key.replaceAll("_", " ")}.`,
      severity: "warning",
    });
  }
}
