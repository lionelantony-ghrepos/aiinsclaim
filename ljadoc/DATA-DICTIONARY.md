# Data Dictionary & Seed Data Spec — aiinsclaim

Schema reference for all domain tables. **Implementation:** SQLite via Drizzle ORM (`src/lib/db/schema/`).

Conventions: `id` text UUID (app-generated), `created_at/updated_at` integer timestamps on every table (omitted below), snake_case, FKs `<table>_id`. Money as text decimal strings (e.g. `"3200.00"`), currency USD (mock). Enums implemented as typed text columns with TS enum unions in `src/lib/db/schema/enums.ts`.

**Postgres RLS** from the original spec is replaced by application-layer access checks in `src/lib/auth/scope.ts` for the learning stack.

---

## 1. Identity & Access

### users
| Column | Type | Notes |
|---|---|---|
| password_hash | text | bcrypt hash (local auth — learning stack) |
| email | text unique | |
| display_name | text | |
| role | enum `user_role` | claimant, intake_agent, adjuster, supervisor, siu_analyst, admin |
| authority_level | int | 1–4, used by BR-AUTH-001; claimants = 0 |
| specialties | json array | e.g. ["auto","property","bodily_injury"] — BR-ASSIGN-001 |
| is_active | boolean | |

**Access control:** enforced in app layer via `src/lib/auth/scope.ts` (claimant self-scope via party→user; staff role scopes; admin all).

## 2. Policy & Party (mock policy admin)

### policies
| Column | Type | Notes |
|---|---|---|
| policy_number | text unique | e.g. `POL-AUTO-000123` |
| holder_party_id | uuid FK parties | |
| line_of_business | enum `lob` | auto, property |
| status | enum | active, lapsed, cancelled |
| effective_from / effective_to | date | |
| coverage_json | jsonb | limits & deductibles per coverage code (see §6 seed shapes) |

### parties
| Column | Type | Notes |
|---|---|---|
| party_type | enum | person, organization |
| full_name | text | PII — never logged |
| email / phone | text | PII |
| address_json | jsonb | PII |
| user_id | uuid FK users nullable | linked when party is a portal user |

## 3. Claims Core

### claims
| Column | Type | Notes |
|---|---|---|
| claim_number | text unique | `CLM-2026-000001` (sequence) |
| policy_id | uuid FK | |
| line_of_business | enum `lob` | denormalized for queries |
| claim_type | enum `claim_type` | collision, theft, glass, water_damage, fire, storm, burglary, other |
| status | enum `claim_status` | draft, submitted, in_triage, in_assessment, pending_info, in_settlement, approved, paid, closed, denied, withdrawn |
| incident_at | timestamptz | |
| reported_at | timestamptz | days_to_report = reported_at − incident_at |
| incident_description | text | claimant narrative |
| incident_location_json | jsonb | |
| estimated_amount | numeric(12,2) | claimant/intake estimate |
| severity_score / complexity_score | int | 0–100, AGT-TRIAGE |
| route | enum | green_lane, standard, complex, supervisor (BR-TRIAGE-001) |
| priority | int | 1–5 |
| assigned_to | uuid FK users | |
| siu_referred | boolean default false | |
| siu_disposition | enum nullable | open, cleared, confirmed_fraud |
| injury_involved / liability_disputed / police_report_present | boolean | |
| police_report_number | text nullable | |
| summary_md | text | maintained by AGT-SUMMARY |
| denial_reason_code | text nullable | |

### claim_parties
claim_id, party_id, role enum (claimant, insured, witness, third_party, repairer, medical_provider).

### claim_items
| Column | Type | Notes |
|---|---|---|
| claim_id | uuid FK | |
| item_type | enum | vehicle, dwelling, contents, other |
| description | text | |
| vehicle_json | jsonb nullable | make/model/year/vin/acv |
| claimed_amount / assessed_amount | numeric(12,2) | |
| assessment_status | enum | pending, assessed, disputed |

### claim_state_history *(append-only)*
claim_id, from_status, to_status, triggered_by enum (user, agent, rule, system), actor_id text (`user:<id>` / `agent:AGT-x` / `rule:BR-x`), reason text, rule_audit_id FK nullable.

## 4. Documents & Extraction

### documents
| Column | Type | Notes |
|---|---|---|
| claim_id | uuid FK | |
| doc_type | enum | photo, police_report, repair_estimate, invoice, contractor_report, fire_report, inventory, ownership_proof, other |
| storage_path | text | Local path under `ljadev/storage/claim-documents/` |
| mime_type / size_bytes | text / bigint | |
| status | enum | uploaded, extracting, extracted, verification_pending, verified, rejected |
| uploaded_by | uuid FK users | |

### extractions
| Column | Type | Notes |
|---|---|---|
| document_id | uuid FK | |
| agent_run_id | uuid FK agent_runs | |
| fields_json | jsonb | per doc_type schema (API-CONTRACTS §extraction) |
| confidence_json | jsonb | per-field 0–1 |
| min_confidence | numeric(3,2) | drives BR-STP-001 / HITL gate |
| verified_by | uuid FK users nullable | set when HITL-verified |
| applied | boolean | fields applied to claim |

## 5. Workflow, Rules, Agents, Financials

### tasks
| Column | Type | Notes |
|---|---|---|
| claim_id | uuid FK | |
| type | enum `task_type` | verify_extraction, review_triage, review_fraud, assess_claim, approve_settlement, escalation, siu_review, request_info |
| queue | enum | intake, adjusting, supervision, siu |
| priority | int 1–5 | |
| status | enum | open, in_progress, done, cancelled |
| assigned_to | uuid FK users nullable | |
| payload_json | jsonb | agent proposal / context |
| resolution | enum nullable | accepted, overridden, rejected |
| resolution_reason | text | **mandatory when overridden/rejected** (CHECK constraint) |
| sla_timer_id | uuid FK nullable | |

### sla_timers
claim_id, task_id nullable, timer_code (BR-SLA-001 rows), started_at, due_at, paused_at nullable, breach_count int default 0, status enum (running, paused, met, breached).

### rule_sets / rule_set_versions / rules / rule_conditions / rule_actions / rule_audit_log
Per DESIGN §5.1. Key columns: `rule_sets(code unique, name, hit_policy)`; `rule_set_versions(rule_set_id, version int, status enum(draft,active,retired), effective_from, effective_to, change_note, created_by)`; `rules(version_id, row_order, label)`; `rule_conditions(rule_id, input_key, operator enum, value_json)`; `rule_actions(rule_id, action_type enum, params_json)`; `rule_audit_log(version_id, claim_id nullable, inputs_json, outputs_json, matched_rule_ids uuid[], actor text, evaluated_at)` *(append-only)*.

### parameters
key text unique (dot-namespaced, e.g. `sla.triage_hours`), value_json, value_type enum (number, string, boolean, duration), description, effective_from/to, updated_by. **All thresholds in BUSINESS-RULES.md seed here.**

### fraud_scores
claim_id, agent_run_id nullable, score int, band enum (low, medium, high, critical), reason_codes text[], signals_json (per-signal points), rule_audit_id FK.

### reserves
claim_id, kind enum (indemnity, expense), amount, set_by, source enum (agent_suggested, manual), supersedes_id FK self nullable (history chain), approval_task_id nullable.

### settlements
claim_id, items_json (array of `{ claimItemId, amount }`), deductible_applied, total_amount, note nullable, status enum (`proposed`, `pending_approval`, `approved`, `rejected`), proposed_by, authority_rule_audit_id FK nullable, created_at, updated_at.

### payments
claim_id, payee_party_id, amount, method enum (ach_mock, check_mock), status enum (pending, issued, failed), reference text, approved_by, authority_rule_audit_id FK.

### agent_runs *(append-only)*
agent_id text (AGT-*), claim_id nullable, document_id nullable, prompt_version text, model text, input_json (PII-redacted), output_json, confidence numeric nullable, status enum (ok, schema_retry, failed, timeout), latency_ms int, outcome enum nullable (accepted, overridden, auto_applied).

### notifications
user_id, claim_id nullable, task_id nullable, kind, title, body_md, read_at nullable.

### audit_log *(append-only, generic)*
actor text, action text, entity text, entity_id uuid, before_json, after_json, at timestamptz.

**Access summary:** claimant → own claims/documents/notifications only (via party→user link); adjuster/supervisor/siu → staff-wide read, write scoped by assignment+role; admin → all incl. rules tables (sole writer); append-only tables (`claim_state_history`, `rule_audit_log`, `agent_runs`, `audit_log`) — no UPDATE/DELETE in query helpers.

---

## 6. Seed Data Spec

Goal: every feature demoable immediately after `npm run seed`. Deterministic (faker with fixed seed `42`), idempotent (truncate + reload), one command.

### 6.1 Volumes

| Entity | Count | Shape |
|---|---|---|
| users | 14 | 1 admin, 2 supervisors (level 3), 4 adjusters (level 2; specialties split auto/property/bodily_injury), 1 intake agent, 1 SIU analyst, 5 claimants |
| parties | ~60 | claimants + third parties, witnesses, repairers |
| policies | 40 | 25 auto / 15 property; 34 active, 4 lapsed, 2 cancelled; realistic coverage_json |
| claims | 120 | distribution below |
| documents | ~350 | 2–5 per claim; sample PDFs/JPEGs in `/seed/assets` copied to local storage |
| rule sets | 9 | all BR-* tables from BUSINESS-RULES.md, version 1 active, effective 2026-01-01 |
| parameters | ~30 | all defaults from BUSINESS-RULES.md |

### 6.2 Claim distribution (drives every screen having data)

- **By status:** 8 draft, 12 submitted, 15 in_triage, 30 in_assessment, 8 pending_info, 12 in_settlement, 8 approved, 10 paid, 10 closed, 4 denied, 3 withdrawn.
- **By line:** 70 auto (collision 40, theft 12, glass 18), 50 property (water 18, storm 14, fire 6, burglary 12).
- **Fraud spread:** ~70% low, 18% medium, 8% high, 4% critical (crafted so BR-FRAUD-001 seed inputs reproduce these bands — e.g. critical claims get policy age <30d + 2 prior claims + planted narrative inconsistencies).
- **SLA spread:** ~15 claims with breached timers (staggered breach_count 1–4) so escalation dashboard is populated; 10 approaching (75%).
- **STP examples:** ≥6 historical green-lane auto-approved claims (audit trail complete) + 3 seeded drafts that will pass STP when submitted in demo.
- **Authority examples:** ≥3 in_settlement claims above adjuster authority → supervision tasks exist.

### 6.3 Generation rules

1. Narratives: template bank per claim_type with slot-filled details (location, time, vehicle); fraud-flagged claims get deliberately inconsistent narratives (date mismatch vs police report field) so AGT-FRAUD has real signal.
2. Amounts: log-normal per claim_type (collision median 3.2k, fire median 45k); clamp to coverage limits ±.
3. Dates: incidents within 2025-07-01..2026-06-30; reported_at = incident + skewed delay (80% ≤3d; fraud cases > 14d).
4. Documents: reuse ~20 seed asset files; extraction rows pre-populated for extracted docs with plausible fields + confidence (mix above/below `stp.min_extraction_confidence`).
5. Every generated decision (route, fraud score, reserve) is produced **by actually running the rules engine during seeding**, writing genuine `rule_audit_log` rows — the audit trail is real, not faked.

### 6.4 Commands

- `npm run seed` — full reset + load (guarded: refuses if `NODE_ENV=production`).
- `npm run seed:rules` — rules/parameters only (used after rule schema changes).
- `npm run seed:demo` — adds 3 pristine draft claims for live demo walkthrough.
