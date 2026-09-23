export type AgentProposalView = {
  agentRunId: string | null;
  title: string;
  summary: string;
  confidencePercent: number;
  reasonCodes: string[];
};

export function agentProposalFromPayload(
  payload: Record<string, unknown> | null | undefined,
  fallbackTitle: string,
): AgentProposalView | null {
  if (!payload) {
    return null;
  }

  const hasProposal =
    typeof payload.agentRunId === "string" ||
    typeof payload.summary === "string" ||
    Array.isArray(payload.reasonCodes);

  if (!hasProposal) {
    return null;
  }

  const reasonCodes = Array.isArray(payload.reasonCodes)
    ? payload.reasonCodes.filter((code): code is string => typeof code === "string")
    : [];

  const confidenceRaw =
    typeof payload.confidencePercent === "number"
      ? payload.confidencePercent
      : typeof payload.confidence === "number"
        ? Math.round(payload.confidence * 100)
        : 75;

  return {
    agentRunId:
      typeof payload.agentRunId === "string" ? payload.agentRunId : null,
    title:
      typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title
        : fallbackTitle,
    summary:
      typeof payload.summary === "string" && payload.summary.trim().length > 0
        ? payload.summary
        : typeof payload.reason === "string"
          ? payload.reason
          : "Review the agent proposal and accept or override.",
    confidencePercent: confidenceRaw,
    reasonCodes,
  };
}
