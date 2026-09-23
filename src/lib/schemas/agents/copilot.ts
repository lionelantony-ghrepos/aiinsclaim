import { z } from "zod";

export const CopilotAgentInputSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
});

export const CopilotAgentOutputSchema = z.object({
  sql: z.string().min(1).max(10_000),
  explanation: z.string().min(1).max(1_000),
});

export type CopilotAgentInput = z.infer<typeof CopilotAgentInputSchema>;
export type CopilotAgentOutput = z.infer<typeof CopilotAgentOutputSchema>;
