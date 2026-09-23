import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import { insertTask } from "@/lib/db/queries/tasks";
import { documents } from "@/lib/db/schema";
import {
  FraudAgentInputSchema,
  FraudAgentOutputSchema,
  type FraudAgentInput,
  type FraudAgentOutput,
  type FraudEvidence,
} from "@/lib/schemas/agents/fraud";
import {
  buildFraudInputs,
  countClaimantPriorClaims12m,
  loadClaimWithPolicy,
  loadLatestExtractionFields,
} from "@/lib/triage/inputs";
import { callAiGateway } from "./gateway";
import { redactForAgent } from "./redact";

const AGENT_ID = "AGT-FRAUD";
const PROMPT_VERSION = "v1";

const DEFAULT_SIGNALS: FraudAgentOutput = {
  narrativeInconsistency: 0,
  docAnomaly: 0,
  evidence: [],
  confidence: 0,
};

function incidentTimeBand(incidentAt: Date): "day" | "night" {
  const hour = incidentAt.getHours();
  return hour >= 22 || hour < 6 ? "night" : "day";
}

export async function buildFraudInputsFromClaim(
  db: Db,
  claimId: string,
): Promise<FraudAgentInput> {
  const { claim, policy } = await loadClaimWithPolicy(db, claimId);
  const priorClaims12m = await countClaimantPriorClaims12m(db, claimId);
  const extractedDocFields = await loadLatestExtractionFields(db, claimId);

  const policyStart = new Date(policy.effectiveFrom).getTime();
  const incidentAt = claim.incidentAt;
  const reportedAt = claim.reportedAt;
  const daysSincePolicyStart = Math.max(
    0,
    Math.floor((incidentAt.getTime() - policyStart) / (24 * 60 * 60 * 1000)),
  );
  const daysToReport = Math.max(
    0,
    Math.floor((reportedAt.getTime() - incidentAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const coverageLimit = Number(
    (policy.coverageJson as { limit?: number })?.limit ?? 50000,
  );
  const estimated = Number(claim.estimatedAmount ?? 0);

  return FraudAgentInputSchema.parse({
    claimId,
    narrative: claim.incidentDescription ?? "",
    extractedDocFields,
    incidentFacts: {
      claimType: claim.claimType,
      lineOfBusiness: claim.lineOfBusiness,
      incidentAt: incidentAt.toISOString(),
      policeReportPresent: claim.policeReportPresent,
      estimatedAmount: estimated,
    },
    timelineFacts: {
      daysSincePolicyStart,
      daysToReport,
      priorClaims12m,
      amountVsCoverageRatio: coverageLimit > 0 ? estimated / coverageLimit : 0,
      incidentTimeBand: incidentTimeBand(incidentAt),
    },
  });
}

async function validateEvidenceSources(
  db: Db,
  claimId: string,
  narrative: string,
  evidence: FraudEvidence[],
): Promise<FraudEvidence[]> {
  const claimDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.claimId, claimId));
  const docIds = new Set(claimDocs.map((doc) => doc.id));
  const narrativeLower = narrative.toLowerCase();

  return evidence.filter((item) => {
    if (item.source === "narrative") {
      return narrativeLower.includes(item.quote.toLowerCase().slice(0, 40));
    }
    const docMatch = item.source.match(/^document:([a-f0-9-]+)$/i);
    if (docMatch) {
      return docIds.has(docMatch[1]!);
    }
    return false;
  });
}

export async function runFraudAgent(
  db: Db,
  input: FraudAgentInput,
): Promise<{
  output: FraudAgentOutput | null;
  agentRunId: string;
  agentFailed: boolean;
}> {
  const parsedInput = FraudAgentInputSchema.parse(input);
  const redactedInput = redactForAgent(parsedInput);
  const started = Date.now();

  let output: FraudAgentOutput | null = null;
  let model = "mock:agt-fraud-v1";
  let status: "ok" | "failed" = "ok";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const gateway = await callAiGateway({
        agentId: AGENT_ID,
        promptVersion: PROMPT_VERSION,
        input: parsedInput,
      });
      const raw = FraudAgentOutputSchema.parse(gateway.output as unknown);

      if ("fraud_band" in (gateway.output as Record<string, unknown>)) {
        throw new Error("Agent must not output fraud_band");
      }

      const validatedEvidence = await validateEvidenceSources(
        db,
        parsedInput.claimId,
        parsedInput.narrative,
        raw.evidence,
      );

      output = {
        ...raw,
        evidence: validatedEvidence,
      };
      model = gateway.model;
      status = "ok";
      break;
    } catch {
      status = "failed";
      output = null;
    }
  }

  const agentFailed = output === null;
  const persistedOutput: FraudAgentOutput = output ?? DEFAULT_SIGNALS;

  const agentRun = await insertAgentRun(db, {
    agentId: AGENT_ID,
    claimId: parsedInput.claimId,
    promptVersion: PROMPT_VERSION,
    model,
    inputJson: redactedInput as unknown as Record<string, unknown>,
    outputJson: persistedOutput as unknown as Record<string, unknown>,
    confidence: String(persistedOutput.confidence),
    status,
    latencyMs: Date.now() - started,
    outcome: agentFailed ? undefined : "accepted",
  });

  if (agentFailed) {
    await insertTask(db, {
      claimId: parsedInput.claimId,
      type: "review_fraud",
      queue: "siu",
      priority: 4,
      payloadJson: {
        reason: "agent_failure",
        trigger: "AGT-FRAUD",
      },
    });
  }

  return {
    output: agentFailed ? null : output,
    agentRunId: agentRun.id,
    agentFailed,
  };
}

export async function buildRuleInputsFromAgent(
  db: Db,
  claimId: string,
  agentSignals?: Pick<FraudAgentOutput, "narrativeInconsistency" | "docAnomaly">,
) {
  const { claim } = await loadClaimWithPolicy(db, claimId);
  const priorClaims12m = await countClaimantPriorClaims12m(db, claimId);
  return buildFraudInputs(db, claimId, claim, priorClaims12m, agentSignals);
}
