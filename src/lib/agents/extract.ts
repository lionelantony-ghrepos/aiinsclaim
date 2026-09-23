import type { Db } from "@/lib/db/client";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import {
  ExtractAgentInputSchema,
  ExtractAgentOutputSchema,
  isExtractableDocType,
  schemaForDocType,
  type ExtractAgentInput,
  type ExtractAgentOutput,
} from "@/lib/schemas/agents/extract";
import { ExtractAgentUnavailableError, ExtractSchemaError } from "./errors";
import { callAiGateway } from "./gateway";

export { ExtractAgentUnavailableError, ExtractSchemaError } from "./errors";

const AGENT_ID = "AGT-EXTRACT";
const PROMPT_VERSION = "v1";

type ExtractContext = {
  claimId: string;
  documentId: string;
};

export async function runExtractAgent(
  db: Db,
  input: ExtractAgentInput,
  context: ExtractContext,
  options?: { retryOnSchemaFail?: boolean },
): Promise<{ output: ExtractAgentOutput; agentRunId: string; status: "ok" | "failed" }> {
  const parsedInput = ExtractAgentInputSchema.parse(input);

  if (!isExtractableDocType(parsedInput.docType)) {
    throw new Error(`Unsupported extraction doc type: ${parsedInput.docType}`);
  }

  const started = Date.now();
  let output: ExtractAgentOutput | null = null;
  let model = "mock:agt-extract-v1";
  let status: "ok" | "failed" = "ok";
  let lastError: unknown;

  const attempts = options?.retryOnSchemaFail === false ? 1 : 2;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const gateway = await callAiGateway({
        agentId: AGENT_ID,
        promptVersion: PROMPT_VERSION,
        input: parsedInput,
      });
      const raw = ExtractAgentOutputSchema.parse(gateway.output as unknown);
      const schema = schemaForDocType(parsedInput.docType);
      schema.parse(raw.fields);
      output = raw;
      model = gateway.model;
      status = "ok";
      break;
    } catch (error) {
      lastError = error;
      status = "failed";
      if (attempt === attempts - 1) {
        break;
      }
    }
  }

  if (!output) {
    throw lastError instanceof ExtractAgentUnavailableError
      ? lastError
      : lastError instanceof Error
        ? lastError
        : new ExtractSchemaError();
  }

  const redactedInput = {
    docType: parsedInput.docType,
    claimType: parsedInput.claimType,
    expectedFieldsSchemaId: parsedInput.expectedFieldsSchemaId,
    fileRef: "[REDACTED]",
  };

  const agentRun = await insertAgentRun(db, {
    agentId: AGENT_ID,
    claimId: context.claimId,
    documentId: context.documentId,
    promptVersion: PROMPT_VERSION,
    model,
    inputJson: redactedInput as unknown as Record<string, unknown>,
    outputJson: {
      minConfidence: output.minConfidence,
      anomalies: output.anomalies,
      fieldKeys: Object.keys(output.fields),
    },
    confidence: String(output.minConfidence),
    status,
    latencyMs: Date.now() - started,
    outcome: status === "ok" ? "accepted" : undefined,
  });

  return { output, agentRunId: agentRun.id, status };
}
