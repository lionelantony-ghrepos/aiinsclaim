import { ExtractAgentUnavailableError } from "@/lib/agents/errors";
import {
  ExtractAgentInputSchema,
  ExtractAgentOutputSchema,
  type ExtractAgentInput,
  type ExtractAgentOutput,
} from "@/lib/schemas/agents/extract";
import {
  IntakeAgentInputSchema,
  IntakeAgentOutputSchema,
  type IntakeAgentInput,
  type IntakeAgentOutput,
} from "@/lib/schemas/agents/intake";
import {
  TriageAgentInputSchema,
  TriageAgentOutputSchema,
  type TriageAgentInput,
  type TriageAgentOutput,
} from "@/lib/schemas/agents/triage";

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

function highConfidenceInvoice(): ExtractAgentOutput {
  return ExtractAgentOutputSchema.parse({
    fields: {
      vendorName: { value: "Acme Auto Repair", confidence: 0.96 },
      invoiceDate: { value: "2026-01-15", confidence: 0.94 },
      totalAmount: { value: "2450.00", confidence: 0.95 },
      lineItems: {
        value: [{ desc: "Bumper repair", amount: "2450.00" }],
        confidence: 0.93,
      },
    },
    minConfidence: 0.93,
    anomalies: [],
  });
}

function lowConfidenceInvoice(): ExtractAgentOutput {
  return ExtractAgentOutputSchema.parse({
    fields: {
      vendorName: { value: "Acme Auto Repair", confidence: 0.72 },
      invoiceDate: { value: "2026-01-15", confidence: 0.68 },
      totalAmount: { value: "2450.00", confidence: 0.71 },
      lineItems: {
        value: [{ desc: "Bumper repair", amount: "2450.00" }],
        confidence: 0.7,
      },
    },
    minConfidence: 0.68,
    anomalies: ["total amount partially obscured"],
  });
}

function highConfidencePoliceReport(): ExtractAgentOutput {
  return ExtractAgentOutputSchema.parse({
    fields: {
      reportNumber: { value: "PR-2026-0042", confidence: 0.95 },
      agency: { value: "Springfield PD", confidence: 0.94 },
      incidentDate: { value: "2026-01-10", confidence: 0.92 },
      narrativeSummary: {
        value: "Vehicle reported stolen from residential driveway.",
        confidence: 0.91,
      },
    },
    minConfidence: 0.91,
    anomalies: [],
  });
}

function highConfidenceRepairEstimate(): ExtractAgentOutput {
  return ExtractAgentOutputSchema.parse({
    fields: {
      shopName: { value: "Metro Body Shop", confidence: 0.94 },
      estimateTotal: { value: "3200.00", confidence: 0.93 },
      lines: {
        value: [{ desc: "Panel replacement", amount: "3200.00" }],
        confidence: 0.92,
      },
    },
    minConfidence: 0.92,
    anomalies: [],
  });
}

async function resolveExtractScenario(fileRef: string): Promise<
  "gateway-fail" | "schema-fail" | "injection" | "low-confidence" | null
> {
  const normalized = fileRef.toLowerCase();
  if (normalized.includes("gateway-fail")) return "gateway-fail";
  if (normalized.includes("schema-fail")) return "schema-fail";
  if (normalized.includes("ignore instructions")) return "injection";
  if (normalized.includes("low-confidence")) return "low-confidence";

  const docIdMatch = fileRef.match(/\/documents\/([^/?]+)/);
  if (!docIdMatch) {
    return null;
  }

  try {
    const { getDb } = await import("@/lib/db");
    const { getDocumentById } = await import("@/lib/db/queries/documents-mutate");
    const document = await getDocumentById(getDb(), docIdMatch[1]!);
    if (!document) {
      return null;
    }
    const storage = document.storagePath.toLowerCase();
    if (storage.includes("gateway-fail")) return "gateway-fail";
    if (storage.includes("low")) return "low-confidence";
    if (storage.includes("ignore")) return "injection";
  } catch {
    return null;
  }

  return null;
}

async function mockExtractResponse(input: ExtractAgentInput): Promise<ExtractAgentOutput> {
  const scenario = await resolveExtractScenario(input.fileRef);

  if (scenario === "gateway-fail") {
    throw new ExtractAgentUnavailableError();
  }

  if (scenario === "schema-fail") {
    return ExtractAgentOutputSchema.parse({
      fields: { unexpectedField: { value: "bad", confidence: 0.5 } },
      minConfidence: 0.5,
      anomalies: [],
    });
  }

  if (scenario === "injection") {
    return highConfidenceInvoice();
  }

  if (scenario === "low-confidence") {
    switch (input.docType) {
      case "police_report":
        return ExtractAgentOutputSchema.parse({
          fields: {
            reportNumber: { value: "PR-LOW-001", confidence: 0.65 },
            agency: { value: "Metro PD", confidence: 0.62 },
            incidentDate: { value: "2026-01-10", confidence: 0.6 },
            narrativeSummary: { value: "Incident under review.", confidence: 0.58 },
          },
          minConfidence: 0.58,
          anomalies: ["report number unclear"],
        });
      default:
        return lowConfidenceInvoice();
    }
  }

  switch (input.docType) {
    case "invoice":
      return highConfidenceInvoice();
    case "police_report":
      return highConfidencePoliceReport();
    case "repair_estimate":
      return highConfidenceRepairEstimate();
    default:
      throw new Error(`Unsupported extraction doc type: ${input.docType}`);
  }
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
): Promise<AiGatewayResponse<unknown>> {
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

  if (request.agentId === "AGT-EXTRACT") {
    const parsedInput = ExtractAgentInputSchema.parse(request.input);

    if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
      try {
        return await callLiveGateway(request, (raw) =>
          ExtractAgentOutputSchema.parse(raw),
        );
      } catch {
        throw new ExtractAgentUnavailableError();
      }
    }

    return {
      output: await mockExtractResponse(parsedInput),
      model: "mock:agt-extract-v1",
      latencyMs: 1,
    };
  }

  if (request.agentId === "AGT-TRIAGE") {
    const parsedInput = TriageAgentInputSchema.parse(request.input);

    if (parsedInput.claimSnapshot.claimId.includes("schema-fail")) {
      return {
        output: { invalid: true },
        model: "mock:agt-triage-v1",
        latencyMs: 1,
      };
    }

    if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
      try {
        return await callLiveGateway(request, (raw) =>
          TriageAgentOutputSchema.parse(raw),
        );
      } catch {
        // Silent degrade to deterministic mock per AGENT-OPS.
      }
    }

    return {
      output: mockTriageResponse(parsedInput),
      model: "mock:agt-triage-v1",
      latencyMs: 1,
    };
  }

  throw new Error(`Unsupported agent: ${request.agentId}`);
}

function mockTriageResponse(input: TriageAgentInput): TriageAgentOutput {
  const { claimSnapshot } = input;
  let severityScore = 22;
  let complexityScore = 15;
  const reasonCodes: string[] = [];
  const keyRisks: string[] = [];

  if (claimSnapshot.injuryInvolved) {
    severityScore = 72;
    complexityScore = 68;
    reasonCodes.push("INJURY");
    keyRisks.push("Bodily injury reported");
  } else if (claimSnapshot.liabilityDisputed) {
    severityScore = 55;
    complexityScore = 62;
    reasonCodes.push("LIABILITY");
    keyRisks.push("Liability dispute flagged");
  } else if (claimSnapshot.estimatedAmount > 25000) {
    severityScore = 48;
    complexityScore = 72;
    reasonCodes.push("HIGH_VALUE");
    keyRisks.push("High estimated amount");
  } else if (claimSnapshot.estimatedAmount <= 2500) {
    severityScore = 22;
    complexityScore = 15;
    reasonCodes.push("LOW_SEVERITY");
  } else {
    severityScore = 35;
    complexityScore = 45;
    reasonCodes.push("STANDARD");
  }

  if (!input.policyCoverageSummary.active) {
    reasonCodes.push("POLICY_INACTIVE");
    keyRisks.push("Policy not active at triage");
  }

  return TriageAgentOutputSchema.parse({
    severityScore,
    complexityScore,
    reasonCodes,
    keyRisks,
    confidence: 0.84,
  });
}
