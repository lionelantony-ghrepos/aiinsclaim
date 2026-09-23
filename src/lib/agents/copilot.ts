import Database from "better-sqlite3";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import type { Db } from "@/lib/db/client";
import { getParameter } from "@/lib/rules/params";
import {
  CopilotAgentInputSchema,
  CopilotAgentOutputSchema,
  type CopilotAgentOutput,
} from "@/lib/schemas/agents/copilot";
import { callAiGateway } from "./gateway";
import { redactForAgent } from "./redact";
import { DB_PATH } from "@/lib/db/paths";

export const COPILOT_VIEWS = [
  "vw_claims_reporting",
  "vw_sla_status",
  "vw_fraud_summary",
] as const;

const MUTATION_PATTERN =
  /\b(attach|alter|create|delete|detach|drop|insert|replace|reindex|truncate|update|vacuum|write)\b/i;
const AGENT_ID = "AGT-COPILOT";
const PROMPT_VERSION = "v1";
const REPORTING_VIEW_SQL: Record<(typeof COPILOT_VIEWS)[number], string> = {
  vw_claims_reporting: `
    SELECT claim_number, line_of_business, claim_type, status, route, priority,
      estimated_amount, severity_score, complexity_score, siu_referred, created_at, updated_at
    FROM claims
  `,
  vw_sla_status: `
    SELECT s.claim_id, c.claim_number, s.timer_code, s.status, s.started_at,
      s.due_at, s.breach_count
    FROM sla_timers s INNER JOIN claims c ON c.id = s.claim_id
  `,
  vw_fraud_summary: `
    SELECT c.claim_number, f.band AS fraud_band, f.score, f.reason_codes, f.created_at
    FROM fraud_scores f INNER JOIN claims c ON c.id = f.claim_id
    WHERE f.created_at = (
      SELECT MAX(newer.created_at) FROM fraud_scores newer
      WHERE newer.claim_id = f.claim_id
    )
  `,
};

export type CopilotResult = {
  sql: string;
  explanation: string;
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  agentRunId: string;
};

export class CopilotQueryRejectedError extends Error {
  code = "COPILOT_QUERY_REJECTED" as const;
}

export class CopilotQueryTimeoutError extends Error {
  code = "COPILOT_QUERY_TIMEOUT" as const;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function referencedRelations(sql: string): string[] {
  return [...stripSqlComments(sql).matchAll(/\b(?:from|join)\s+["`]?([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1]!.toLowerCase());
}

export function validateCopilotSql(sql: string): void {
  const normalized = stripSqlComments(sql).trim();
  if (!normalized || !/^(select|with)\b/i.test(normalized)) {
    throw new CopilotQueryRejectedError("Only read-only SELECT queries are allowed.");
  }
  if (MUTATION_PATTERN.test(normalized)) {
    throw new CopilotQueryRejectedError("Mutation-seeking queries are refused.");
  }
  const withoutTerminalSemicolon = normalized.replace(/;\s*$/, "");
  if (withoutTerminalSemicolon.includes(";")) {
    throw new CopilotQueryRejectedError("Only one SQL statement is allowed.");
  }
  const relations = referencedRelations(withoutTerminalSemicolon);
  if (
    relations.length === 0 ||
    relations.some(
      (relation) => !(COPILOT_VIEWS as readonly string[]).includes(relation),
    )
  ) {
    throw new CopilotQueryRejectedError(
      "The query may reference only approved reporting views.",
    );
  }
}

export function applyCopilotRowLimit(sql: string, maxRows: number): string {
  const normalized = sql.trim().replace(/;\s*$/, "");
  const limitMatch = normalized.match(/\blimit\s+(\d+)/i);
  if (!limitMatch) {
    return `${normalized} LIMIT ${maxRows}`;
  }
  const requested = Number(limitMatch[1]);
  if (requested <= maxRows) {
    return normalized;
  }
  return normalized.replace(/\blimit\s+\d+/i, `LIMIT ${maxRows}`);
}

function compileAllowlistedViews(sql: string): string {
  return sql.replace(
    /\b(vw_claims_reporting|vw_sla_status|vw_fraud_summary)\b/gi,
    (viewName) =>
      `(${REPORTING_VIEW_SQL[viewName.toLowerCase() as (typeof COPILOT_VIEWS)[number]]})`,
  );
}

async function readParameterNumber(db: Db, key: string): Promise<number> {
  const parameter = await getParameter(db, key);
  const value = Number(parameter.valueJson);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid copilot parameter: ${key}`);
  }
  return value;
}

function executeReadOnlyQuery(
  sql: string,
  timeoutMs: number,
): { columns: string[]; rows: Record<string, unknown>[] } {
  const sqlite = new Database(DB_PATH, { readonly: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    // better-sqlite3 exposes interrupt at runtime, but its bundled typings omit it.
    (sqlite as unknown as { interrupt: () => void }).interrupt();
  }, timeoutMs);
  try {
    const statement = sqlite.prepare(sql);
    const rows = statement.all() as Record<string, unknown>[];
    if (timedOut) {
      throw new CopilotQueryTimeoutError("Copilot query timed out.");
    }
    return { columns: statement.columns().map((column) => column.name), rows };
  } catch (error) {
    if (timedOut) {
      throw new CopilotQueryTimeoutError("Copilot query timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    sqlite.close();
  }
}

export async function runCopilot(
  db: Db,
  question: string,
): Promise<CopilotResult> {
  const input = CopilotAgentInputSchema.parse({ question });
  const redactedInput = redactForAgent(input);
  const started = Date.now();
  let agentRunId = "";
  try {
    const gateway = await callAiGateway({
      agentId: AGENT_ID,
      promptVersion: PROMPT_VERSION,
      input,
    });
    const output = CopilotAgentOutputSchema.parse(gateway.output);
    const maxRows = await readParameterNumber(db, "copilot.max_rows");
    const timeoutMs = await readParameterNumber(db, "copilot.timeout_ms");
    validateCopilotSql(output.sql);
    const sql = applyCopilotRowLimit(output.sql, maxRows);
    const result = executeReadOnlyQuery(compileAllowlistedViews(sql), timeoutMs);
    const agentRun = await insertAgentRun(db, {
      agentId: AGENT_ID,
      promptVersion: PROMPT_VERSION,
      model: gateway.model,
      inputJson: redactedInput,
      outputJson: { sql, explanation: output.explanation, rowCount: result.rows.length },
      status: "ok",
      latencyMs: Date.now() - started,
      outcome: "accepted",
    });
    agentRunId = agentRun.id;
    return {
      ...result,
      sql,
      explanation: output.explanation,
      truncated: result.rows.length >= maxRows,
      agentRunId,
    };
  } catch (error) {
    const agentRun = await insertAgentRun(db, {
      agentId: AGENT_ID,
      promptVersion: PROMPT_VERSION,
      model: "mock:agt-copilot-v1",
      inputJson: redactedInput,
      outputJson: {
        error: error instanceof Error ? error.message : "Copilot query failed",
      },
      status: error instanceof CopilotQueryTimeoutError ? "timeout" : "failed",
      latencyMs: Date.now() - started,
    });
    agentRunId = agentRun.id;
    throw error;
  }
}
