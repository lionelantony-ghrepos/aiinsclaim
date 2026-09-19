# Product Requirements Document — aiinsclaim

AI-native, agentic insurance claims processing system (Auto + Property/Home). **Learning project** on a lightweight local stack (SQLite + Drizzle). Mock data, production-grade architecture patterns.

**Value proposition:** One claims workspace where AI agents propose, rules decide, humans supervise — from FNOL to payment, fully audited.

References: architecture `DESIGN.md`, rules `BUSINESS-RULES.md`, schema `DATA-DICTIONARY.md`, agents `AGENT-OPS.md`, APIs `API-CONTRACTS.md`, tests `TEST-PLAN.md`, conventions `AGENTS.md`.

## PBI Index

| PBI | Title | Phase | MoSCoW | Depends on |
|---|---|---|---|---|
| PBI-001 | Repo scaffolding, SQLite/Drizzle wiring, CI | 0 | Must | — |
| PBI-002 | Design tokens + app layout shell | 0 | Must | 001 |
| PBI-003 | Auth, roles & route protection | 1 | Must | 001 |
| PBI-004 | Core data model, migrations & RLS | 1 | Must | 001 |
| PBI-005 | Seed / mock-data pipeline | 1 | Must | 004 |
| PBI-006 | Rules engine core + parameters | 1 | Must | 004 |
| PBI-007 | Claim state machine | 1 | Must | 004, 006 |
| PBI-008 | Rules & decision-table admin UI | 1 | Must | 002, 003, 006 |
| PBI-009 | FNOL intake wizard (+ AGT-INTAKE) | 2 | Must | 002, 003, 005, 007 |
| PBI-010 | Document upload & extraction (AGT-EXTRACT) | 2 | Must | 009 |
| PBI-011 | Triage, routing & STP (AGT-TRIAGE) | 2 | Must | 007, 010 |
| PBI-012 | Fraud scoring (AGT-FRAUD + BR-FRAUD-001) | 2 | Must | 011 |
| PBI-013 | HITL task queues & worklists | 2 | Must | 011 |
| PBI-014 | SLA timers & escalation | 2 | Must | 013 |
| PBI-015 | Assessment workbench & reserves (AGT-RESERVE) | 2 | Must | 013 |
| PBI-016 | Settlement, authority & payments | 2 | Must | 015 |
| PBI-017 | Claim summary agent & timeline (AGT-SUMMARY) | 2 | Should | 011 |
| PBI-018 | Ops dashboards & audit viewer | 2 | Should | 014, 016 |
| PBI-019 | Claims copilot NL query (AGT-COPILOT) | 3 | Could | 018 |
| PBI-020 | Comms drafting agent (AGT-COMMS) | 3 | Could | 017 |

---

# Phase 0 — Scaffolding

## PBI-001 — Repo scaffolding, SQLite/Drizzle wiring, CI

**User story:** As the build agent, I need a strict, conventional codebase skeleton so every later feature lands in a predictable place.
**Functional requirements:** Next.js App Router + TS strict; Tailwind; TanStack Query provider; Zod; folder layout per DESIGN §11; SQLite + Drizzle wired (`src/lib/db/`, `drizzle.config.ts`, `.env.example`); Vitest + Playwright configured; GitHub Actions CI (typecheck, lint, unit tests); ESLint per AGENTS.md.
**Data touched:** none (schema defined, not seeded). **Rules:** none.
**UI notes:** placeholder home page.

**Cursor prompt:**
> **Context:** DESIGN.md §3.1, §11; AGENTS.md conventions. Fresh repo.
> **Task:** Scaffold the app: Next.js (App Router, TypeScript strict), Tailwind, TanStack Query provider in root layout, Zod, Vitest, Playwright, ESLint configs from AGENTS.md. Create folder structure exactly per DESIGN §11 with `.gitkeep` where empty. Wire Drizzle + SQLite in `src/lib/db/client.ts`; add `.env.example`. Add GitHub Actions workflow: install, db:push, typecheck, lint, vitest.
> **Constraints:** No business logic. No hard-coded secrets. `strict: true`, no `any`.
> **Files expected:** standard Next scaffold + `src/lib/db/`, `drizzle.config.ts`, `.env.example`, `.github/workflows/ci.yml`, configs.
> **Acceptance check:** AC-001-01..03 — `npm run build`, `npm run test`, CI workflow green locally via act or push.
> **Out of scope:** auth UI, full seed, UI beyond placeholder page.

**DoD:** builds clean; CI green; AC-001-01..03 pass.

## PBI-002 — Design tokens + app layout shell

**User story:** As any user, I get a coherent, accessible, dark-mode-first interface so the app feels like a professional claims workbench, not a template.
**Functional requirements:** implement "Ledger" design system (DESIGN §9): CSS variables for all color/status/fraud-band tokens, light+dark; Inter + JetBrains Mono; app shell with role-aware sidebar nav (route groups `(claimant)`, `(staff)`, `(admin)`), topbar with user menu + theme toggle; signature component stubs: `ClaimStatusTimeline`, `TaskCard`, `AgentProposalCard`, `FraudBandBadge`, `SlaCountdown`, `DecisionTableGrid` (stories/props only, no data).
**Rules:** none. **Data touched:** none.
**UI notes:** WCAG 2.1 AA: contrast checked, keyboard nav on sidebar, visible focus rings, status never color-only.

**Cursor prompt:**
> **Context:** DESIGN §9, §11; builds on PBI-001.
> **Task:** Implement design tokens as CSS vars in `globals.css` (light+dark per DESIGN §9 incl. status ramp + fraud bands), font setup, and the app shell layout with role-aware sidebar (nav config in `src/lib/nav.ts`, filtered by role placeholder), topbar, theme toggle. Create the six signature components in `src/components/` with typed props and mock-prop demo page `/dev/components`.
> **Constraints:** shadcn/ui primitives only; tokens via CSS vars, no raw hex in components; AA contrast.
> **Files expected:** `globals.css`, `src/app/(staff)/layout.tsx` etc., `src/components/*`, `src/lib/nav.ts`, `/dev/components` page.
> **InsForge actions:** none.
> **Acceptance check:** AC-002-01..03; axe scan of `/dev/components` has no critical violations.
> **Out of scope:** real data, auth gating (placeholder role switcher OK).

**DoD:** shell renders in both themes; components demo page passes axe; AC-002-01..03.

---

# Phase 1 — Foundations

## PBI-003 — Auth, roles & route protection

**User story:** As a user, I sign in and see only what my role permits, so claimants never see staff tooling and staff actions are attributable.
**Functional requirements:** Local session auth (iron-session + bcrypt) email/password sign-in/out; `users` row with password_hash, role + authority_level; middleware protecting route groups by role; role switcher removed from PBI-002 shell; seeded demo accounts (one per role, listed on login page for demo).
**Rules:** none. **Data touched:** `users`.
**UI notes:** login page on tokens; error states via ux-copy conventions; session persists.

**Cursor prompt:**
> **Context:** DESIGN §2.1, §10; DATA-DICTIONARY §users; builds on PBI-001/002.
> **Task:** Implement local session auth (iron-session + bcrypt). Ensure `users` table in Drizzle schema per DATA-DICTIONARY. Server helpers `getCurrentUser()`/`requireRole(...)` in `src/lib/auth/`; Next middleware guarding `(claimant)`, `(staff)`, `(admin)` groups; login/logout pages; sidebar nav filtered by real role.
> **Constraints:** roles from DB only; no client-side-only gating; Zod on auth forms.
> **Files expected:** `src/lib/auth/`, `middleware.ts`, login page, nav update.
> **Acceptance check:** AC-003-01..04 (role redirects, deep-link protection).
> **Out of scope:** all other tables; password reset flows.

**DoD:** six demo roles sign in and land on role-correct home; AC-003-01..04.

## PBI-004 — Core data model, migrations & RLS

**User story:** As the platform, I persist every domain entity with row-level authorization so data access is safe by construction.
**Functional requirements:** Drizzle schema for ALL tables in DATA-DICTIONARY §2–§5 (policies, parties, claims, claim_parties, claim_items, claim_state_history, documents, extractions, tasks, sla_timers, rules tables, parameters, fraud_scores, reserves, payments, agent_runs, notifications, audit_log) with enums, FKs; sequences for claim_number; access scope helpers per DATA-DICTIONARY summary; append-only enforcement on history/audit tables; typed query helpers in `src/lib/db/`.
**Rules:** schema hosts them all. **Data touched:** everything.

**Cursor prompt:**
> **Context:** DATA-DICTIONARY.md (entire), DESIGN §6, §10; builds on PBI-003.
> **Task:** Ensure Drizzle schema covers every table/enum in DATA-DICTIONARY §1–§5, including claim_number sequence (`CLM-YYYY-NNNNNN`), and access scope in `src/lib/auth/scope.ts` (claimant self-scope via party→user; staff role scopes; admin-only rules writes; INSERT-only helpers on append-only tables). Generate query helpers in `src/lib/db/`.
> **Constraints:** no data seeding here; every query respects role scope.
> **Files expected:** `src/lib/db/schema/*`, `src/lib/db/queries/*`, `src/lib/auth/scope.ts`.
> **Acceptance check:** AC-004-01..04 (scope probes: claimant cannot read others' claims; update on audit table rejected).
> **Out of scope:** seed data, business logic.

**DoD:** migrations apply cleanly to fresh project; RLS probe tests pass; AC-004-01..04.

## PBI-005 — Seed / mock-data pipeline

**User story:** As a developer/demo presenter, I run one command and every screen has realistic, rule-consistent data.
**Functional requirements:** implement DATA-DICTIONARY §6 fully: deterministic faker (seed 42), volumes/distributions per §6.1–6.2, generation rules §6.3 (decisions produced by really running the rules engine), commands §6.4, sample doc assets copied to local storage `ljadev/storage/claim-documents/`.
**Rules:** seeds all BR-* rule sets v1 + parameters. **Data touched:** all tables.

**Cursor prompt:**
> **Context:** DATA-DICTIONARY §6; BUSINESS-RULES.md (all tables + defaults); depends on PBI-004 (and PBI-006 evaluator — build seed to import it).
> **Task:** Build `/seed` pipeline: generators per entity honoring §6.1–6.3 distributions; loader that seeds rule sets/versions/rules/conditions/actions for all 9 BR-* tables and ~30 parameters with BUSINESS-RULES defaults; claims seeded by invoking `evaluateRuleSet` so route/fraud/reserve values carry genuine `rule_audit_log` rows; upload `/seed/assets` files to Storage. npm scripts `seed`, `seed:rules`, `seed:demo` with production guard.
> **Constraints:** idempotent; deterministic; no PII-looking real data (faker).
> **Files expected:** `/seed/**`, `package.json` scripts, `/seed/assets/*` (generate simple PDFs/JPEGs).
> **InsForge actions:** storage bucket `claim-documents` (private); bulk inserts.
> **Acceptance check:** AC-005-01..04 (counts, distribution spot checks, rerun idempotency).
> **Out of scope:** UI.

**DoD:** `npm run seed` < 2 min, all counts match spec; AC-005-01..04.

## PBI-006 — Rules engine core + parameters

**User story:** As the business, every operational decision comes from an editable, versioned, audited decision table — never from code.
**Functional requirements:** `evaluateRuleSet(code, inputs, asOf)` per DESIGN §5.2: loads active effective-dated version, Zod-validates inputs per rule-set input schema registry, applies hit policies (`first`, `all`, `collect_sum`), executes action rows into typed outputs, writes `rule_audit_log`; `getParameter(key, asOf)` helper with caching; input schema registry for all 9 BR-* sets in `src/lib/rules/schemas.ts`.
**Rules:** engine for all BR-*. **Data touched:** rules tables, parameters, rule_audit_log.

**Cursor prompt:**
> **Context:** DESIGN §5; BUSINESS-RULES.md; API-CONTRACTS §rules; depends on PBI-004.
> **Task:** Implement the rules engine in `src/lib/rules/`: evaluator (pure function + DB loader), operator library (eq,neq,gt,gte,lt,lte,in,between,contains,is_null), hit policies first/all/collect_sum, action executor mapping action_type→typed output, audit writer, `getParameter`. Zod input schemas for the 9 BR-* rule sets. Golden-table unit tests: for each BUSINESS-RULES worked example, assert exact outputs.
> **Constraints:** evaluator is pure/deterministic given loaded version; no thresholds in code; every evaluation writes audit.
> **Files expected:** `src/lib/rules/{engine.ts,operators.ts,actions.ts,schemas.ts,params.ts}`, `tests/rules/*.test.ts`.
> **InsForge actions:** none new.
> **Acceptance check:** AC-006-01..05 incl. every worked example from BUSINESS-RULES.md.
> **Out of scope:** admin UI, agents.

**DoD:** golden tests for all 9 tables pass; audit rows verified; AC-006-01..05.

## PBI-007 — Claim state machine

**User story:** As the platform, claims can only move through legal, guarded, audited transitions.
**Functional requirements:** DB-driven transition table (DESIGN §4.2) seeded from spec; `transitionClaim(claimId, to, actor, reason)` validating transition + guard functions (completeness via BR-DOC-001, authority via BR-AUTH-001 etc.), writing `claim_state_history`; illegal transitions throw typed error; withdrawn/denied paths incl. denial reason codes.
**Rules:** BR-DOC-001 guard hookup. **Data touched:** claims, claim_state_history, +`claim_transitions` table (add migration).

**Cursor prompt:**
> **Context:** DESIGN §4.1–4.2; depends on PBI-004, PBI-006.
> **Task:** Add `claim_transitions` migration (from_status, to_status, trigger, guard_code) seeded with the DESIGN §4.2 table. Implement `src/lib/state-machine/`: `transitionClaim` server function loading legal transitions from DB, running guard functions registered per guard_code (guards call rules engine where specified), writing history with actor/reason/rule_audit link. Unit tests for every row of §4.2 + illegal transition rejection.
> **Constraints:** transitions from DB, not a code enum; history append-only.
> **Files expected:** migration, `src/lib/state-machine/{index.ts,guards.ts}`, tests.
> **InsForge actions:** migration + seed transitions.
> **Acceptance check:** AC-007-01..04.
> **Out of scope:** UI, agents, SLA timers (PBI-014 hooks in later).

**DoD:** all transition tests green; AC-007-01..04.

## PBI-008 — Rules & decision-table admin UI

**User story:** As a claims ops admin, I edit decision tables and parameters in a UI — draft, simulate, effective-date, activate — with full audit and no deploys.
**Functional requirements:** admin route group: rule-set list → version list (status badges, diff view between versions) → `DecisionTableGrid` editor (conditions/actions as columns, rows orderable) creating **draft** versions only; simulation panel (paste/select sample inputs → see matched rows + outputs, no audit write in simulate mode); activation flow (mandatory change note, effective_from, auto-retire prior); parameters editor with effective dating; all changes to `audit_log`.
**Rules:** manages all. **Data touched:** rules tables, parameters, audit_log.

**Cursor prompt:**
> **Context:** DESIGN §5.3, §9 (DecisionTableGrid); API-CONTRACTS §admin; depends on PBI-002/003/006.
> **Task:** Build `(admin)/rules` pages: list, version detail with read-only grid + version diff, "new draft from version" editor grid (add/edit/delete/reorder rows, condition operator pickers, action param forms — all Zod-validated), simulate drawer calling evaluator in dry-run mode, activate dialog (change note required, effective_from date), parameters CRUD page. Server actions per API-CONTRACTS §admin; admin role enforced server-side.
> **Constraints:** active/retired versions immutable; simulate never writes audit; keyboard-navigable grid (AA).
> **Files expected:** `(admin)/rules/**`, `(admin)/parameters/page.tsx`, server actions, `DecisionTableGrid` completion.
> **InsForge actions:** none new.
> **Acceptance check:** AC-008-01..05 (draft/simulate/activate lifecycle, immutability, audit rows).
> **Out of scope:** rule-set creation of brand-new codes (seeded 9 only), approvals workflow.

**DoD:** admin can change `stp.max_amount`, simulate, activate, and see behavior change; AC-008-01..05.

---

# Phase 2 — Features

## PBI-009 — FNOL intake wizard (+ AGT-INTAKE)

**User story:** As a claimant (or intake agent on their behalf), I file a claim through a guided wizard that checks completeness live, so my claim starts clean and fast.
**Functional requirements:** multi-step wizard (policy select → incident details per claim_type → parties → items/damage → documents checklist → review & submit); dynamic required-docs checklist from BR-DOC-001; AGT-INTAKE panel: completeness hints + drafts a normalized incident summary from free-text narrative (claimant can edit; agent output never auto-submits); submit runs `draft → submitted` guard; acknowledgement screen + notification; intake-agent mode can file for any policyholder.
**Rules:** BR-DOC-001. **Data touched:** claims, claim_parties, claim_items, documents (checklist state), notifications, agent_runs.
**UI notes:** ClaimStatusTimeline appears post-submit; autosave draft each step; mobile-friendly.

**Cursor prompt:**
> **Context:** DESIGN §2.1, §4.2 (draft→submitted), AGENT-OPS §AGT-INTAKE; API-CONTRACTS §claims; depends on PBI-003/005/007.
> **Task:** Build `(claimant)/claims/new` wizard (steps above; per-type incident forms for the 7 claim_types) with Zod schemas from API-CONTRACTS, autosaved `draft` claim, BR-DOC-001-driven checklist component, AGT-INTAKE server action (summary draft + completeness hints per AGENT-OPS contract, logged to agent_runs), submit via `transitionClaim`. Staff variant `(staff)/intake/new` with policy search. Post-submit acknowledgement + notification row.
> **Constraints:** agent assists, never blocks/decides; all narrative text treated as data in prompts; no PII in agent_runs input (redaction helper).
> **Files expected:** wizard routes/components, `src/lib/agents/intake.ts`, server actions.
> **InsForge actions:** AI Gateway call (AGT-INTAKE prompt v1).
> **Acceptance check:** AC-009-01..05 (per-type completeness, autosave, submit guard, agent logging).
> **Out of scope:** document upload processing (PBI-010), triage (PBI-011).

**DoD:** claim of each type can be filed end-to-end; AC-009-01..05.

## PBI-010 — Document upload & extraction (AGT-EXTRACT)

**User story:** As a claimant/adjuster, uploaded documents turn into structured data automatically, with humans verifying only when confidence is low.
**Functional requirements:** upload to Storage (type/size validated); `documents` lifecycle per DATA-DICTIONARY; AGT-EXTRACT run per doc_type schema (API-CONTRACTS §extraction) with per-field confidence; auto-apply when `min_confidence ≥ stp.min_extraction_confidence` param, else `verify_extraction` HITL task with side-by-side viewer (doc preview vs editable extracted fields); verified fields applied to claim/items; re-extract action; failures → manual-entry fallback task (never blocks).
**Rules:** confidence params; feeds BR-STP-001/BR-DOC-001. **Data touched:** documents, extractions, tasks, agent_runs, claim fields.

**Cursor prompt:**
> **Context:** DESIGN §3.3, AGENT-OPS §AGT-EXTRACT, API-CONTRACTS §extraction (per-doc-type Zod schemas); depends on PBI-009.
> **Task:** Implement upload server action (mime/size allowlist from parameters), Storage write, document rows; extraction pipeline: AI Gateway vision+LLM call with doc-type-specific prompt + strict Zod parse (retry once on schema fail, then task), per-field confidence, auto-apply vs `verify_extraction` task per threshold param; verification UI in `(staff)` with doc preview (signed URL) beside editable fields, accept/correct writes `verified_by` and applies; status chips on claim documents tab.
> **Constraints:** document text is data not instructions (delimited prompt per AGENT-OPS guardrails); timeouts → manual task; no PII in logs.
> **Files expected:** `src/lib/agents/extract.ts`, doc schemas, upload/verify actions, documents tab UI, verify task view.
> **InsForge actions:** Storage signed URLs; AI Gateway (AGT-EXTRACT prompts v1 per doc_type).
> **Acceptance check:** AC-010-01..05.
> **Out of scope:** photo damage assessment (Later/F16).

**DoD:** invoice + police report demo docs extract, one auto-applies, one routes to verification; AC-010-01..05.

## PBI-011 — Triage, routing & STP (AGT-TRIAGE)

**User story:** As claims ops, every submitted claim is scored, routed, and — when genuinely low-risk — auto-approved with a full audit trail.
**Functional requirements:** on `submitted`: AGT-TRIAGE produces severity/complexity scores + reason codes; BR-TRIAGE-001 evaluated → route/queue/priority; BR-ASSIGN-001 assignment; green_lane claims evaluate BR-FRAUD-001 then BR-STP-001 — pass = auto transition to `approved` (STP), fail = standard queue with block reason; `review_triage` task for supervisor route; re-triage on material change (new doc applied, amount change > param) — EvolutionIQ-style continuous scoring; every step visible on claim timeline with reason codes.
**Rules:** BR-TRIAGE-001, BR-ASSIGN-001, BR-STP-001 (+BR-FRAUD-001 via PBI-012 stub until then: band=low). **Data touched:** claims, tasks, agent_runs, rule_audit_log, claim_state_history.

**Cursor prompt:**
> **Context:** DESIGN §4, §7; BUSINESS-RULES BR-TRIAGE-001/BR-ASSIGN-001/BR-STP-001; AGENT-OPS §AGT-TRIAGE; depends on PBI-007/010.
> **Task:** Implement triage orchestration `src/lib/agents/triage.ts`: AGT-TRIAGE scoring call (structured output, reason codes), then rules-engine chain (triage→assign→[fraud stub]→stp), applying outputs: claim route/priority/assigned_to, tasks, or STP auto-approval via `transitionClaim` with actor `rule:BR-STP-001`. Trigger on submit and on material-change events (define `retriageClaim` invoked by PBI-010 apply + amount edits). Claim detail shows triage card: scores, matched rules, route, reasons.
> **Constraints:** agent proposes scores; only rules route/approve; STP path writes complete audit chain (agent_run + 3 rule_audit rows + state history).
> **Files expected:** `src/lib/agents/triage.ts`, orchestration in submit flow, triage card component.
> **InsForge actions:** AI Gateway (AGT-TRIAGE prompt v1).
> **Acceptance check:** AC-011-01..05 (routing matrix cases, STP pass + each block reason, re-triage).
> **Out of scope:** real fraud scoring (PBI-012), SLA (PBI-014).

**DoD:** seeded demo draft submits → auto-approves via STP with inspectable audit chain; AC-011-01..05.

## PBI-012 — Fraud scoring (AGT-FRAUD + BR-FRAUD-001)

**User story:** As an SIU analyst, suspicious claims surface with explainable reason codes and land in my queue; legitimate claims flow untouched.
**Functional requirements:** AGT-FRAUD computes `narrative_inconsistency` + `doc_anomaly` signals (with cited evidence snippets); BR-FRAUD-001 `collect_sum` scoring + banding actions per BUSINESS-RULES (flag / review_fraud task / SIU referral + settlement hold); `fraud_scores` row with signals breakdown; FraudBandBadge + reason codes on claim; SIU queue view with disposition workflow (open→cleared/confirmed_fraud) — cleared releases holds; rescoring on re-triage.
**Rules:** BR-FRAUD-001; interacts BR-STP-001, BR-AUTH-001 row 1–2. **Data touched:** fraud_scores, claims (siu_*), tasks, agent_runs.

**Cursor prompt:**
> **Context:** BUSINESS-RULES BR-FRAUD-001 (incl. worked example); AGENT-OPS §AGT-FRAUD; depends on PBI-011.
> **Task:** Implement `src/lib/agents/fraud.ts`: AGT-FRAUD call producing the two 0–1 signals + evidence quotes (strict schema); assemble BR-FRAUD-001 inputs (policy age, report delay, prior-claim count query, ratio, signals, incident/police fields); evaluate + persist fraud_scores; execute banding actions (flag/task/referral+hold). Replace PBI-011 stub. SIU queue page `(staff)/siu` with claim fraud panel (score breakdown table, evidence, disposition actions). Wire settlement hold check into BR-AUTH-001 guard.
> **Constraints:** agent never sets the band — rules do; evidence quotes limited to claim's own docs; disposition changes audited.
> **Files expected:** `src/lib/agents/fraud.ts`, SIU pages, fraud panel component.
> **InsForge actions:** AI Gateway (AGT-FRAUD prompt v1).
> **Acceptance check:** AC-012-01..05 (worked example reproduces 65/high; band actions fire; cleared releases hold).
> **Out of scope:** SIU case management module (Later/F19).

**DoD:** seeded fraud cases show correct bands with reasons; SIU flow works; AC-012-01..05.

## PBI-013 — HITL task queues & worklists

**User story:** As an adjuster/supervisor/SIU analyst, I open my queue and see exactly what needs me now, why, and what the AI proposes — and every accept/override is captured.
**Functional requirements:** queue pages per role (intake, adjusting, supervision, siu) with EvolutionIQ ordering (priority desc, sla_due_at asc), filters (type, claim_type, breach state), TaskCard with SlaCountdown + reason codes; task detail renders AgentProposalCard for payloaded proposals with **Accept / Override** (override → mandatory reason, both → `resolution` + agent_runs.outcome update); claim/assign/release actions; supervisor rebalancing (bulk reassign); live updates via TanStack Query polling interval param.
**Rules:** consumes outputs of all. **Data touched:** tasks, agent_runs, notifications.

**Cursor prompt:**
> **Context:** DESIGN §4.3, §9 (TaskCard/AgentProposalCard); API-CONTRACTS §tasks; depends on PBI-011.
> **Task:** Build `(staff)/queue` (role-scoped default queue + tabs where permitted), ordered/filtered task list with pagination, task detail route with context panel (claim summary, links) + AgentProposalCard accept/override flow (server actions: `resolveTask` enforcing reason-on-override at API level too), claim/release/reassign actions, supervisor bulk-reassign. Poll interval from `parameters` (`ui.queue_poll_seconds`).
> **Constraints:** RLS + server checks on queue visibility; optimistic updates with rollback; keyboard operable list (AA).
> **Files expected:** queue routes/components, `resolveTask` + queue server actions.
> **InsForge actions:** none new.
> **Acceptance check:** AC-013-01..05 (ordering, role scoping, override reason enforced, outcome recorded).
> **Out of scope:** SLA sweep itself (PBI-014), dashboards (PBI-018).

**DoD:** all four queues functional on seed data; AC-013-01..05.

## PBI-014 — SLA timers & escalation

**User story:** As a supervisor, nothing silently stalls: timers run on every stage and breaches escalate automatically per configurable rules.
**Functional requirements:** timer creation on state entry/task creation per BR-SLA-001 (hooked into state machine + task creation); pause/resume on `pending_info` where rule says; sweep route handler (`/api/sweep/sla`, secured by secret header; dev button in admin) computing warning (75%)/breach(100%)/150%/200% events and applying BR-ESC-001 actions (notify, priority bump, reassign, escalation task); SlaCountdown live in UI; timers visible on claim timeline.
**Rules:** BR-SLA-001, BR-ESC-001. **Data touched:** sla_timers, tasks, notifications, audit.

**Cursor prompt:**
> **Context:** DESIGN §4.4; BUSINESS-RULES BR-SLA-001/BR-ESC-001; depends on PBI-013.
> **Task:** Implement `src/lib/sla/`: `startTimersFor(event)` called from state machine + task creation (evaluate BR-SLA-001 `all`), pause/resume hooks, sweep handler evaluating elapsed thresholds → breach_count increments → BR-ESC-001 evaluation + action execution (notifications, priority bump, BR-ASSIGN-001 reassign, escalation tasks). Admin dev page button "Run SLA sweep now". Durations/thresholds only from parameters.
> **Constraints:** sweep idempotent (no duplicate escalations per breach_count); secured endpoint; all escalations audited.
> **Files expected:** `src/lib/sla/*`, `src/app/api/sweep/sla/route.ts`, hooks in state machine/tasks, admin trigger.
> **InsForge actions:** none new.
> **Acceptance check:** AC-014-01..05 (timer creation matrix, pause in pending_info, each escalation tier, idempotency).
> **Out of scope:** production cron wiring (README note only).

**DoD:** seeded breach ladder visible; sweep escalates correctly and idempotently; AC-014-01..05.

## PBI-015 — Assessment workbench & reserves (AGT-RESERVE)

**User story:** As an adjuster, one workspace gives me everything to assess a claim: coverage check, items, documents, AI-suggested reserve — and my decisions are recorded.
**Functional requirements:** claim workbench tabs (Overview incl. triage/fraud cards, Items, Documents, Financials, Timeline, Tasks); coverage evaluation panel (claim vs `coverage_json` limits/deductible — computed display); item assessment (assessed_amount per item, dispute flag); AGT-RESERVE suggestion via BR-RESERVE-001 shown as AgentProposalCard → adjuster confirms/edits → `reserves` chain; reserve change >25% param → supervisor approval task; request-info flow (`in_assessment ⇄ pending_info` with info request note to claimant + notification); complete assessment → `in_settlement` guarded by BR-DOC-001 settlement docs.
**Rules:** BR-RESERVE-001, BR-DOC-001. **Data touched:** claims, claim_items, reserves, tasks, notifications.

**Cursor prompt:**
> **Context:** DESIGN §2.2, §4.2; BUSINESS-RULES BR-RESERVE-001/BR-DOC-001; AGENT-OPS §AGT-RESERVE; depends on PBI-013.
> **Task:** Build `(staff)/claims/[id]` workbench (tab layout, components composed from prior PBIs), coverage panel (pure function `evaluateCoverage(claim, policy)` + tests), item assessment forms, reserve flow (AGT-RESERVE calls rules engine, renders proposal, confirm/edit creates reserve row + supersede chain; >param% change → approval task), request-info dialog driving state transitions, "Complete assessment" action with BR-DOC-001 settlement-gate check showing missing docs.
> **Constraints:** reserve suggested never auto-set; all financial mutations audited; amounts in JetBrains Mono per design system.
> **Files expected:** workbench routes/components, `src/lib/coverage.ts`, reserve actions, `src/lib/agents/reserve.ts`.
> **InsForge actions:** none new (rules-only agent).
> **Acceptance check:** AC-015-01..05.
> **Out of scope:** settlement/payment (PBI-016), comms drafting.

**DoD:** full assessment of a seeded auto + property claim; AC-015-01..05.

## PBI-016 — Settlement, authority & payments

**User story:** As an adjuster I propose settlements; the authority matrix decides who can approve; payments issue (mock) and claims close cleanly.
**Functional requirements:** settlement proposal (per-item assessed amounts − deductible, breakdown display); BR-AUTH-001 evaluation on approve attempt → allow / route `approve_settlement` task to supervision / block (SIU hold with reason); approval transitions `in_settlement → approved`; payment issuance (mock ACH/check: payment row + fake reference, `approved → paid`); closure checklist (no open tasks, docs verified) → `paid → closed`; denial path with coded reasons + supervisor confirm; claimant notified at each step.
**Rules:** BR-AUTH-001, BR-STP-001 interplay, BR-SLA-001 rows 5–6. **Data touched:** payments, claims, tasks, notifications.

**Cursor prompt:**
> **Context:** DESIGN §4.2; BUSINESS-RULES BR-AUTH-001 (incl. worked example); depends on PBI-015.
> **Task:** Implement settlement panel in workbench Financials tab: proposal builder (items − deductible, Zod-validated), approve action evaluating BR-AUTH-001 (allow → transition; require_next_level → supervision task with proposal payload; block → SIU-hold banner), supervisor approval task view (approve/reject with reason), mock payment issuance action + payment record, closure checklist + close action, denial dialog (reason codes from parameters list, supervisor confirmation task). Notifications throughout.
> **Constraints:** authority checked server-side at approval time (not just UI); every financial action → audit_log; no real payment integrations.
> **Files expected:** settlement/payment components + server actions, supervisor approval view.
> **InsForge actions:** none new.
> **Acceptance check:** AC-016-01..05 (worked example 32k→supervision; SIU block; pay/close; denial).
> **Out of scope:** recoveries/subrogation (Later/F20).

**DoD:** claim runs settlement→paid→closed with authority routing; AC-016-01..05.

## PBI-017 — Claim summary agent & timeline (AGT-SUMMARY) — Should

**User story:** As any staff member opening a claim, I read a current, accurate AI-maintained summary and a complete visual timeline instead of reconstructing history.
**Functional requirements:** AGT-SUMMARY regenerates `summary_md` on material events (state change, doc applied, fraud band change, reserve/settlement change) — debounced per param; summary card on Overview with "AI-generated, view sources" affordance linking timeline entries; unified timeline component merging claim_state_history + tasks + agent_runs + payments + rule decisions, filterable by kind.
**Rules:** none new. **Data touched:** claims.summary_md, agent_runs.

**Cursor prompt:**
> **Context:** AGENT-OPS §AGT-SUMMARY; depends on PBI-011.
> **Task:** Implement `src/lib/agents/summary.ts` (event-triggered, debounced via `ui.summary_debounce_s` param; prompt receives structured claim snapshot, outputs markdown ≤ 200 words + key-facts list; strict schema), event hook registry so PBIs 010/011/012/015/016 emit `materialChange(claimId, kind)`, Overview summary card with regenerate button + AI provenance note, Timeline tab merging all history sources chronologically with kind filters and rule/agent drill-down links.
> **Constraints:** summary is content, never decisions; provenance always displayed; no PII beyond claim's own data.
> **Files expected:** `src/lib/agents/summary.ts`, event registry, summary card, timeline tab.
> **InsForge actions:** AI Gateway (AGT-SUMMARY prompt v1).
> **Acceptance check:** AC-017-01..03.
> **Out of scope:** comms drafting (PBI-020).

**DoD:** summary refreshes after assessment change; timeline complete; AC-017-01..03.

## PBI-018 — Ops dashboards & audit viewer — Should

**User story:** As a supervisor/admin, I see operational health (cycle time, SLA breaches, STP rate, fraud referrals, override rates) and can inspect any historical decision end-to-end.
**Functional requirements:** dashboard page: KPI cards (open claims by state, avg cycle time by LOB, STP rate, SLA breach count, fraud referral rate, **agent override rate by agent**), charts (claims funnel, breaches over time, fraud band distribution), queue backlog table; audit viewer: search by claim → chronological decision chain (rule evaluations with matched-row detail + version link, agent runs with I/O, state history), deep-linkable; export CSV of audit chain.
**Rules:** reads rule_audit_log. **Data touched:** read-only aggregates + views.

**Cursor prompt:**
> **Context:** DESIGN §7 (override telemetry), §9; depends on PBI-014/016.
> **Task:** Create SQL views (migration) for KPIs (cycle time, stp_rate, breach counts, override rates per agent_id); dashboard page `(staff)/dashboard` (supervisor+) with KPI cards + recharts-style charts on design tokens, backlog table; audit viewer `(staff)/claims/[id]/audit` rendering full decision chain (rule_audit_log rows expandable to matched rules & version, agent_runs expandable to redacted I/O, state history) + CSV export server action.
> **Constraints:** views not client-side aggregation; audit read-only; charts AA (patterns + labels, not color-only).
> **Files expected:** views migration, dashboard + audit routes/components, export action.
> **InsForge actions:** views migration.
> **Acceptance check:** AC-018-01..04.
> **Out of scope:** NL querying (PBI-019), scheduled reports.

**DoD:** dashboard accurate against seed; audit chain of an STP claim fully inspectable; AC-018-01..04.

---

# Phase 3 — Later (Could)

## PBI-019 — Claims copilot NL query (AGT-COPILOT) — Could

**User story:** As staff, I ask natural-language questions over claims data and get tabular answers with disclosed SQL.
**Functional requirements:** read-only allowlisted SQL views; AGT-COPILOT generates SQL from NL; result table + generated-SQL disclosure; guardrails per AGENT-OPS (read-only role, view allowlist, row limits, injection resistance).
**Rules:** none new. **Data touched:** read-only views, agent_runs.

**Cursor prompt:**
> **Context:** AGENT-OPS §AGT-COPILOT; depends on PBI-018.
> **Task:** Build read-only NL query copilot: allowlisted SQL views only, agent generates SQL from natural language, executes via read-only role, renders result table + disclosed generated SQL; guardrails per AGENT-OPS (row limits, view allowlist, injection resistance, no writes).
> **Constraints:** never auto-execute destructive SQL; no indexing of `ljadoc/` into copilot RAG; all queries logged to agent_runs.
> **Files expected:** `src/lib/agents/copilot.ts`, copilot UI route, view allowlist config, server actions.
> **Acceptance check:** AC-019-01..03.
> **Out of scope:** write queries, external data sources.

**DoD:** AC-019-01..03.

## PBI-020 — Comms drafting agent (AGT-COMMS) — Could

**User story:** As staff, I draft claimant communications from templates and claim summary; I edit and send manually.
**Functional requirements:** ack/info-request/decision letter drafts from templates + summary; editable preview; mock outbox (never auto-send); tone/reading-level validated on output schema; drafts logged to agent_runs.
**Rules:** none new. **Data touched:** agent_runs, notifications (mock outbox).

**Cursor prompt:**
> **Context:** AGENT-OPS §AGT-COMMS; depends on PBI-017.
> **Task:** Implement comms drafting agent: ack/info-request/decision letter drafts from templates + claim summary; editable preview; mock outbox (never auto-send); tone/reading-level validated on output schema; drafts logged to agent_runs with prompt version.
> **Constraints:** human must explicitly send; no autonomous outbound comms; no PII in logs beyond claim IDs.
> **Files expected:** `src/lib/agents/comms.ts`, draft UI in workbench, mock outbox, server actions.
> **Acceptance check:** AC-020-01..03.
> **Out of scope:** real email/SMS integrations.

**DoD:** AC-020-01..03.

---

*Traceability: every PBI's ACs and TCs are defined in TEST-PLAN.md; matrix guarantees no orphans.*
