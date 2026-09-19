# Business Rules Catalog — aiinsclaim

Every decision table stored in the rules engine (DESIGN §5). All numeric values shown are **seed defaults** loaded into the `parameters` table / rule versions — never hard-coded. All tables are effective-dated, versioned, and admin-editable; every evaluation is written to `rule_audit_log`.

Conventions: hit policy `first` = first matching row wins (rows ordered); `collect_sum` = all matching rows contribute to a score; `all` = every matching row's actions fire.

---

## BR-TRIAGE-001 — Claim Triage & Routing

**Purpose:** After submission (and on material change), classify severity/complexity and route the claim.
**Inputs:** `line_of_business`, `estimated_amount`, `injury_involved` (bool), `liability_disputed` (bool), `severity_score` (0–100, from AGT-TRIAGE), `complexity_score` (0–100, from AGT-TRIAGE), `policy_active` (bool).
**Hit policy:** `first`. **Outputs:** `route` (green_lane | standard | complex | supervisor), `target_queue`, `priority` (1–5).

| # | Conditions | route | queue | priority |
|---|---|---|---|---|
| 1 | policy_active = false | supervisor | supervision | 5 |
| 2 | injury_involved = true | complex | adjusting | 5 |
| 3 | liability_disputed = true | complex | adjusting | 4 |
| 4 | estimated_amount ≤ `triage.green_max_amount` (2,500) AND severity_score < 30 AND complexity_score < 30 | green_lane | — (candidate for STP, see BR-STP-001) | 2 |
| 5 | estimated_amount ≤ `triage.standard_max_amount` (25,000) AND complexity_score < 60 | standard | adjusting | 3 |
| 6 | estimated_amount > `triage.standard_max_amount` | complex | adjusting | 4 |
| 7 | *default* | standard | adjusting | 3 |

**Worked example:** Auto claim, amount 1,800, no injury, severity 22, complexity 15, active policy → row 4 → `green_lane`, priority 2 → proceeds to BR-STP-001.

## BR-STP-001 — Straight-Through Processing Gate

**Purpose:** Decide whether a green-lane claim may auto-approve without human touch (Lemonade pattern).
**Inputs:** `route`, `fraud_band` (from BR-FRAUD-001), `all_required_docs_extracted` (bool), `extraction_min_confidence` (0–1), `claimant_prior_claims_12m` (int), `estimated_amount`.
**Hit policy:** `first`. **Outputs:** `stp_allowed` (bool), `reason_code`.

| # | Conditions | stp_allowed | reason_code |
|---|---|---|---|
| 1 | fraud_band ≠ low | false | STP-BLOCK-FRAUD |
| 2 | all_required_docs_extracted = false | false | STP-BLOCK-DOCS |
| 3 | extraction_min_confidence < `stp.min_extraction_confidence` (0.90) | false | STP-BLOCK-CONFIDENCE |
| 4 | claimant_prior_claims_12m > `stp.max_prior_claims` (1) | false | STP-BLOCK-FREQUENCY |
| 5 | estimated_amount > `stp.max_amount` (2,500) | false | STP-BLOCK-AMOUNT |
| 6 | *default* | true | STP-PASS |

**Worked example:** green-lane claim, fraud_band low, docs extracted at 0.94, 0 prior claims, 1,800 → row 6 → auto-approve; state machine transitions `in_triage → approved`; audit rows record rule version + inputs.

## BR-FRAUD-001 — Fraud Scoring

**Purpose:** Composite fraud score from rule signals + AGT-FRAUD LLM signals; banding drives action.
**Hit policy:** `collect_sum` (scoring rows), then banding table (`first`).
**Inputs:** `days_since_policy_start`, `days_to_report` (incident→FNOL), `claimant_prior_claims_12m`, `amount_vs_coverage_ratio`, `narrative_inconsistency` (0–1, AGT-FRAUD), `doc_anomaly` (0–1, AGT-FRAUD), `incident_time_band` (day/night), `police_report_present` (bool, for theft/collision).

**Scoring rows (points added when condition true):**

| # | Signal | Condition | Points |
|---|---|---|---|
| 1 | New policy | days_since_policy_start < `fraud.new_policy_days` (30) | +25 |
| 2 | Late reporting | days_to_report > `fraud.late_report_days` (14) | +15 |
| 3 | Frequency | claimant_prior_claims_12m ≥ 2 | +20 |
| 4 | Limit-hugging | amount_vs_coverage_ratio > 0.9 | +15 |
| 5 | Narrative inconsistency | narrative_inconsistency > 0.6 | +20 |
| 6 | Document anomaly | doc_anomaly > 0.6 | +25 |
| 7 | No police report | theft/collision AND police_report_present = false | +10 |
| 8 | Night incident, theft | incident_time_band = night AND type = theft | +5 |

**Banding (first match on total):**

| Band | Range | Action (rule_actions) |
|---|---|---|
| low | 0–24 | none |
| medium | 25–49 | flag on claim; adjuster sees reason codes |
| high | 50–74 | create `review_fraud` task (queue: siu, priority 4); block STP |
| critical | ≥75 | set `siu_referred=true`; create `siu_review` task (priority 5); hold settlement |

**Worked example:** policy 12 days old (+25), reported same day (0), 2 prior claims (+20), ratio 0.5 (0), narrative 0.7 (+20), docs clean (0), police report present (0) → **65 = high** → SIU review task, STP blocked, reason codes `[NEW_POLICY, FREQUENCY, NARRATIVE]`.

## BR-ASSIGN-001 — Adjuster Assignment

**Purpose:** Pick assignee for routed claims.
**Inputs:** `route`, `line_of_business`, `queue_workloads` (open tasks per adjuster), `adjuster_specialties`.
**Hit policy:** `first`. **Outputs:** `assignment_strategy`.

| # | Conditions | Strategy |
|---|---|---|
| 1 | route = complex AND injury_involved | least-loaded adjuster with specialty `bodily_injury` |
| 2 | route = complex | least-loaded adjuster with specialty = line_of_business |
| 3 | route = standard | round-robin within line_of_business pool |
| 4 | route = supervisor | supervision queue (unassigned) |

Cap: no assignment if adjuster open tasks ≥ `assign.max_open_tasks` (12) → next candidate; if none, task sits in queue and BR-SLA-001 timer still runs (supervisors see backlog).

## BR-RESERVE-001 — Initial Reserve Setting

**Purpose:** Suggested initial reserve on entering assessment (AGT-RESERVE presents; adjuster confirms).
**Inputs:** `line_of_business`, `claim_type`, `estimated_amount`, `injury_involved`.
**Hit policy:** `first`. **Outputs:** `reserve_amount_formula`, `expense_reserve_pct`.

| # | Conditions | Indemnity reserve | Expense % |
|---|---|---|---|
| 1 | injury_involved = true | estimated_amount × `reserve.injury_factor` (1.5) + `reserve.injury_base` (10,000) | 15% |
| 2 | auto, collision | estimated_amount × 1.1 | 5% |
| 3 | auto, theft | min(estimated_amount, vehicle_acv) × 1.0 | 5% |
| 4 | property, water_damage | estimated_amount × 1.25 | 10% |
| 5 | property, fire | estimated_amount × 1.4 | 12% |
| 6 | property, storm | estimated_amount × 1.15 | 8% |
| 7 | *default* | estimated_amount × 1.1 | 8% |

Reserve changes >`reserve.change_approval_pct` (25%) after initial set require supervisor approval task.

## BR-AUTH-001 — Settlement Authority Matrix

**Purpose:** Who may approve a settlement.
**Inputs:** `settlement_amount`, `approver_role`, `approver_authority_level` (1–4), `fraud_band`, `siu_referred`.
**Hit policy:** `first`. **Outputs:** `decision` (allow | require_next_level | block).

| # | Conditions | Decision |
|---|---|---|
| 1 | siu_referred = true AND siu_disposition ≠ cleared | block (SIU hold) |
| 2 | fraud_band ∈ {high, critical} | require_next_level (supervisor min) |
| 3 | amount ≤ `auth.level1_max` (5,000) AND level ≥ 1 | allow |
| 4 | amount ≤ `auth.level2_max` (25,000) AND level ≥ 2 | allow |
| 5 | amount ≤ `auth.level3_max` (100,000) AND level ≥ 3 | allow |
| 6 | amount > level3_max AND level = 4 | allow |
| 7 | *default* | require_next_level → `approve_settlement` task in supervision queue |

**Worked example:** Adjuster (level 2) proposes 32,000 settlement, fraud low → row 5 fails (needs level 3) → row 7 → supervisor approval task created; adjuster UI shows "Above your authority — routed to supervision."

## BR-SLA-001 — SLA Timer Definitions

**Purpose:** Start timers on state entry/task creation. **Hit policy:** `all`.

| # | Trigger | Timer | Default duration (parameters) | Pause in pending_info? |
|---|---|---|---|---|
| 1 | claim → submitted | acknowledge_claimant | `sla.ack_hours` (4h) | n/a |
| 2 | claim → in_triage | complete_triage | `sla.triage_hours` (24h) | n/a |
| 3 | claim → in_assessment (auto) | complete_assessment | `sla.assess_days.auto` (7d) | yes |
| 4 | claim → in_assessment (property) | complete_assessment | `sla.assess_days.property` (14d) | yes |
| 5 | claim → in_settlement | issue_decision | `sla.settle_days` (5d) | no |
| 6 | approved | issue_payment | `sla.pay_days` (2d) | no |
| 7 | task created (any) | task_completion | per task type in `parameters` | follows task |

## BR-ESC-001 — Escalation on SLA Breach

**Hit policy:** `first` per breach event (breach_count increments per sweep).

| # | Conditions | Action |
|---|---|---|
| 1 | breach_count = 1 (75% elapsed — warning) | notify assignee (aria-live + notification row) |
| 2 | breach_count = 2 (100% — breach) | notify assignee + supervisor; task priority +1 |
| 3 | breach_count = 3 (150%) | reassign per BR-ASSIGN-001; escalation task to supervisor |
| 4 | breach_count ≥ 4 (200%) | escalation task priority 5 to supervision queue; flagged on ops dashboard |

## BR-DOC-001 — Required Documents Matrix

**Purpose:** FNOL completeness + assessment document requirements. **Hit policy:** `all` (collect requirements).

| # | Claim type | Required at FNOL | Required before settlement |
|---|---|---|---|
| 1 | auto / collision | incident description, photos ≥ `doc.min_photos` (2), driver details | repair estimate, police report if amount > `doc.police_report_amount` (10,000) |
| 2 | auto / theft | incident description, police report number | police report document, ownership proof |
| 3 | auto / glass | incident description, photo ≥ 1 | repair invoice |
| 4 | property / water_damage | incident description, photos ≥ 3 | plumber/contractor report, repair estimate |
| 5 | property / fire | incident description, fire service reference | fire report, contents inventory, repair estimate |
| 6 | property / storm | incident description, photos ≥ 3, incident date within storm event window | repair estimate |
| 7 | property / burglary | incident description, police report number | police report, stolen items inventory with receipts where available |

Completeness gate at `draft → submitted`; settlement gate at `in_assessment → in_settlement`.

---

## Change Management

1. Edits create a **draft** `rule_set_version`; simulation against sample claims required before activation.
2. Activation is effective-dated; prior version auto-retires at boundary; both retained forever.
3. `rule_audit_log` links every historical decision to the exact version used — decisions are always re-explainable.
4. Admin UI (PBI-008) enforces: no editing active versions, mandatory change note, diff view between versions.
