-- PBI-018: KPI views for ops dashboard

-- View: claims_by_state
-- Count of claims in each status
CREATE VIEW IF NOT EXISTS claims_by_state AS
SELECT 
  status,
  COUNT(*) as claim_count
FROM claims
GROUP BY status;

-- View: cycle_time_by_lob
-- Average cycle time (reportedAt to closed/paid/denied) by line of business
CREATE VIEW IF NOT EXISTS cycle_time_by_lob AS
SELECT 
  c.line_of_business as lob,
  COUNT(*) as closed_claims,
  CAST(AVG(CAST(h.created_at AS REAL) - CAST(c.reported_at AS REAL)) AS INTEGER) as avg_cycle_time_ms
FROM claims c
INNER JOIN claim_state_history h ON h.claim_id = c.id
WHERE h.to_status IN ('paid', 'closed', 'denied')
  AND h.from_status IS NOT NULL
GROUP BY c.line_of_business;

-- View: stp_rate
-- Straight-through processing rate (claims reaching approved without human intervention)
CREATE VIEW IF NOT EXISTS stp_rate AS
SELECT 
  COUNT(DISTINCT c.id) as total_closed_claims,
  COUNT(DISTINCT CASE 
    WHEN h.to_status = 'approved' 
    AND NOT EXISTS (
      SELECT 1 FROM claim_state_history h2 
      WHERE h2.claim_id = c.id 
      AND h2.triggered_by != 'SYSTEM'
    ) 
    THEN c.id 
  END) as stp_claims,
  ROUND(
    CAST(COUNT(DISTINCT CASE 
      WHEN h.to_status = 'approved' 
      AND NOT EXISTS (
        SELECT 1 FROM claim_state_history h2 
        WHERE h2.claim_id = c.id 
        AND h2.triggered_by != 'SYSTEM'
      ) 
      THEN c.id 
    END) AS REAL) * 100.0 / NULLIF(COUNT(DISTINCT c.id), 0),
    2
  ) as stp_rate_pct
FROM claims c
INNER JOIN claim_state_history h ON h.claim_id = c.id
WHERE c.status IN ('approved', 'in_settlement', 'pending_approval', 'paid', 'closed');

-- View: sla_breach_counts
-- Count of SLA breaches by status
CREATE VIEW IF NOT EXISTS sla_breach_counts AS
SELECT 
  status,
  SUM(breach_count) as total_breaches,
  COUNT(*) as timers_with_breaches
FROM sla_timers
WHERE breach_count > 0
GROUP BY status

UNION ALL

SELECT 
  'TOTAL' as status,
  SUM(breach_count) as total_breaches,
  COUNT(*) as timers_with_breaches
FROM sla_timers
WHERE breach_count > 0;

-- View: override_rates_by_agent
-- Override rate per agent (from rule_audit_log where actor != 'SYSTEM')
CREATE VIEW IF NOT EXISTS override_rates_by_agent AS
WITH agent_evaluations AS (
  SELECT 
    r.actor,
    COUNT(*) as total_evaluations,
    SUM(CASE 
      WHEN r.actor != 'SYSTEM' 
      AND json_extract(r.outputs_json, '$.is_override') = true
      THEN 1 
      ELSE 0 
    END) as override_count
  FROM rule_audit_log r
  WHERE r.actor != 'SYSTEM'
  GROUP BY r.actor
)
SELECT 
  actor as agent_id,
  total_evaluations,
  override_count,
  ROUND(
    CAST(override_count AS REAL) * 100.0 / NULLIF(total_evaluations, 0),
    2
  ) as override_rate_pct
FROM agent_evaluations
WHERE total_evaluations > 0;

-- View: fraud_band_distribution
-- Distribution of fraud scores by band
CREATE VIEW IF NOT EXISTS fraud_band_distribution AS
SELECT 
  band,
  COUNT(*) as claim_count,
  ROUND(
    CAST(COUNT(*) AS REAL) * 100.0 / (SELECT COUNT(*) FROM fraud_scores),
    2
  ) as percentage
FROM fraud_scores
GROUP BY band;

-- View: queue_backlog
-- Current backlog in each queue
CREATE VIEW IF NOT EXISTS queue_backlog AS
SELECT 
  queue,
  COUNT(*) as open_tasks,
  AVG(CAST((julianday('now') * 86400000) - created_at AS REAL)) as avg_age_ms,
  MIN(priority) as highest_priority
FROM tasks
WHERE status = 'open'
GROUP BY queue;

-- View: claim_audit_chain
-- Full audit chain for a claim (rules, agent runs, state history)
-- Note: This view is meant to be filtered by claim_id in queries
CREATE VIEW IF NOT EXISTS claim_audit_chain AS
SELECT 
  'rule_eval' as event_type,
  r.id as event_id,
  r.claim_id,
  r.evaluated_at as event_at,
  r.actor,
  r.version_id,
  r.inputs_json,
  r.outputs_json,
  r.matched_rule_ids,
  NULL as agent_id,
  NULL as from_status,
  NULL as to_status
FROM rule_audit_log r

UNION ALL

SELECT 
  'agent_run' as event_type,
  a.id as event_id,
  a.claim_id,
  a.created_at as event_at,
  NULL as actor,
  NULL as version_id,
  a.input_json as inputs_json,
  a.output_json as outputs_json,
  NULL as matched_rule_ids,
  a.agent_id,
  NULL as from_status,
  NULL as to_status
FROM agent_runs a

UNION ALL

SELECT 
  'state_change' as event_type,
  h.id as event_id,
  h.claim_id,
  h.created_at as event_at,
  h.actor_id as actor,
  NULL as version_id,
  NULL as inputs_json,
  NULL as outputs_json,
  NULL as matched_rule_ids,
  NULL as agent_id,
  h.from_status,
  h.to_status
FROM claim_state_history h

ORDER BY event_at ASC;
