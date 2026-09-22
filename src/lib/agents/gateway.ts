import {
  IntakeAgentInputSchema,
  IntakeAgentOutputSchema,
  type IntakeAgentInput,
  type IntakeAgentOutput,
} from "@/lib/schemas/agents/intake";

export type AiGatewayRequest = {
  agentId: string;
  promptVersion: string;
  input: unknown;
};

export type AiGatewayResponse<T> = {
  output: T;
  model: string;
  latencyMs: number;
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function mockIntakeResponse(input: IntakeAgentInput): IntakeAgentOutput {
  const missing = input.checklistState.filter((item) => !item.satisfied);
  const hints = missing.slice(0, 5).map((item) => ({
    field: item.requirement,
    hint: `Provide ${item.requirement.replaceAll("_", " ")} to complete FNOL.`,
    severity: "warning" as const,
  }));

  const narrativeWords = wordCount(input.narrative);
  const summaryDraft =
    narrativeWords > 0
      ? `Draft summary (${input.claimType}/${input.lob}): ${input.narrative
          .trim()
          .split(/\s+/)
          .slice(0, 40)
          .join(" ")}.`
      : "Add an incident narrative to generate a summary draft.";

  return IntakeAgentOutputSchema.parse({
    summaryDraft: summaryDraft.slice(0, 1200),
    completenessHints: hints,
    confidence: missing.length === 0 ? 0.82 : 0.55,
  });
}

async function callLiveGateway<T>(
  request: AiGatewayRequest,
  parseOutput: (raw: unknown) => T,
): Promise<AiGatewayResponse<T>> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("AI gateway not configured");
  }

  const started = Date.now();
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/agents/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const payload = (await response.json()) as {
    output?: unknown;
    model?: string;
  };

  return {
    output: parseOutput(payload.output),
    model: payload.model ?? "unknown",
    latencyMs: Date.now() - started,
  };
}

export async function callAiGateway(
  request: AiGatewayRequest,
): Promise<AiGatewayResponse<IntakeAgentOutput>> {
  if (request.agentId === "AGT-INTAKE") {
    const parsedInput = IntakeAgentInputSchema.parse(request.input);

    if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
      try {
        return await callLiveGateway(request, (raw) =>
          IntakeAgentOutputSchema.parse(raw),
        );
      } catch {
        // Silent degrade to deterministic mock per AGENT-OPS.
      }
    }

    return {
      output: mockIntakeResponse(parsedInput),
      model: "mock:agt-intake-v1",
      latencyMs: 1,
    };
  }

  throw new Error(`Unsupported agent: ${request.agentId}`);
}
