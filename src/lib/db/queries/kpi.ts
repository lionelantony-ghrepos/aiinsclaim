/**
 * PBI-018: KPI queries for ops dashboard
 * Reads from SQL views created in migration 0001_kpi_views.sql
 */

import type { Db } from "../client";
import { sql } from "drizzle-orm";

export type ClaimsByState = {
  status: string;
  claim_count: number;
};

export type CycleTimeByLob = {
  lob: string;
  closed_claims: number;
  avg_cycle_time_ms: number;
};

export type StpRate = {
  total_closed_claims: number;
  stp_claims: number;
  stp_rate_pct: number;
};

export type SlaBreachCount = {
  status: string;
  total_breaches: number;
  timers_with_breaches: number;
};

export type OverrideRateByAgent = {
  agent_id: string;
  total_evaluations: number;
  override_count: number;
  override_rate_pct: number;
};

export type FraudBandDistribution = {
  band: string;
  claim_count: number;
  percentage: number;
};

export type QueueBacklog = {
  queue: string;
  open_tasks: number;
  avg_age_ms: number;
  highest_priority: number;
};

export async function getClaimsByState(db: Db): Promise<ClaimsByState[]> {
  return db.all<ClaimsByState>(
    sql`SELECT status, claim_count FROM claims_by_state ORDER BY claim_count DESC`
  );
}

export async function getCycleTimeByLob(db: Db): Promise<CycleTimeByLob[]> {
  return db.all<CycleTimeByLob>(
    sql`SELECT lob, closed_claims, avg_cycle_time_ms FROM cycle_time_by_lob ORDER BY lob`
  );
}

export async function getStpRate(db: Db): Promise<StpRate | null> {
  const result = db.all<StpRate>(
    sql`SELECT total_closed_claims, stp_claims, stp_rate_pct FROM stp_rate LIMIT 1`
  );
  return result[0] ?? null;
}

export async function getSlaBreachCounts(db: Db): Promise<SlaBreachCount[]> {
  return db.all<SlaBreachCount>(
    sql`SELECT status, total_breaches, timers_with_breaches FROM sla_breach_counts ORDER BY 
      CASE WHEN status = 'TOTAL' THEN 1 ELSE 0 END, 
      total_breaches DESC`
  );
}

export async function getOverrideRatesByAgent(
  db: Db
): Promise<OverrideRateByAgent[]> {
  return db.all<OverrideRateByAgent>(
    sql`SELECT agent_id, total_evaluations, override_count, override_rate_pct 
        FROM override_rates_by_agent 
        ORDER BY override_rate_pct DESC 
        LIMIT 20`
  );
}

export async function getFraudBandDistribution(
  db: Db
): Promise<FraudBandDistribution[]> {
  return db.all<FraudBandDistribution>(
    sql`SELECT band, claim_count, percentage FROM fraud_band_distribution ORDER BY 
      CASE band 
        WHEN 'low' THEN 1 
        WHEN 'medium' THEN 2 
        WHEN 'high' THEN 3 
        WHEN 'critical' THEN 4 
        ELSE 5 
      END`
  );
}

export async function getQueueBacklog(db: Db): Promise<QueueBacklog[]> {
  return db.all<QueueBacklog>(
    sql`SELECT queue, open_tasks, avg_age_ms, highest_priority FROM queue_backlog ORDER BY open_tasks DESC`
  );
}

export type ClaimAuditEvent = {
  event_type: "rule_eval" | "agent_run" | "state_change";
  event_id: string;
  claim_id: string | null;
  event_at: number;
  actor: string | null;
  version_id: string | null;
  inputs_json: string | null;
  outputs_json: string | null;
  matched_rule_ids: string | null;
  agent_id: string | null;
  from_status: string | null;
  to_status: string | null;
};

export async function getClaimAuditChain(
  db: Db,
  claimId: string
): Promise<ClaimAuditEvent[]> {
  return db.all<ClaimAuditEvent>(
    sql`SELECT * FROM claim_audit_chain WHERE claim_id = ${claimId} ORDER BY event_at ASC`
  );
}
