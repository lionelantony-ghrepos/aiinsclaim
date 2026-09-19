import fs from "node:fs";
import path from "node:path";

const outDir = path.join(process.cwd(), "ljadoc", "kb", "as-built");

type PbiMeta = {
  n: string;
  title: string;
  phase: number;
  acs: string[];
  tcs: string[];
  rules: string;
  surfaces: string;
  contracts: string;
  extend: string;
  ops: string;
  shipped: { item: string; status: string; notes: string }[];
  trace: string;
};

const pbis: PbiMeta[] = [
  {
    n: "002",
    title: "Design tokens + app layout shell",
    phase: 0,
    acs: ["AC-002-01", "AC-002-02", "AC-002-03"],
    tcs: ["TC-002-01", "TC-002-02", "TC-002-03"],
    rules: "None — no decision tables evaluated in this PBI (UI-only).",
    surfaces:
      "`src/app/globals.css` tokens; route groups `(claimant)`, `(staff)`, `(admin)`; `src/lib/nav.ts`; signature components in `src/components/`; `/dev/components` demo page.",
    contracts: "Component prop types only; no API payloads yet.",
    extend:
      "Add shadcn/ui init; wire nav config consumed by PBI-003 role filtering; keep tokens in CSS vars per DESIGN §9.",
    ops: "No new env vars. Run axe on `/dev/components` after implementation.",
    shipped: [
      { item: "Ledger design tokens light+dark", status: "not started", notes: "Spec: DESIGN §9" },
      { item: "App shell + role-aware sidebar", status: "not started", notes: "Placeholder role switcher OK until PBI-003" },
      { item: "Six signature component stubs", status: "not started", notes: "ClaimStatusTimeline, TaskCard, AgentProposalCard, FraudBandBadge, SlaCountdown, DecisionTableGrid" },
    ],
    trace: "Pending implementation — land with commit `feat(PBI-002): …` and record SHA here.",
  },
  {
    n: "003",
    title: "Auth, roles and route protection",
    phase: 1,
    acs: ["AC-003-01", "AC-003-02", "AC-003-03", "AC-003-04"],
    tcs: ["TC-003-01", "TC-003-02", "TC-003-03", "TC-003-04"],
    rules: "None — no decision tables evaluated in this PBI.",
    surfaces:
      "`src/lib/auth/` (session exists as stub); `middleware.ts`; login/logout pages; nav filtered by DB role.",
    contracts: "Zod auth form schemas in `src/lib/schemas/` (to add).",
    extend: "Use existing `users` table + bcrypt; extend `requireRole()` in server actions.",
    ops: "Env: `SESSION_SECRET`. Demo accounts via `npm run seed`.",
    shipped: [
      { item: "iron-session + bcrypt login", status: "partial", notes: "Session helpers stubbed in PBI-001; UI not built" },
      { item: "Middleware route groups", status: "not started", notes: "" },
      { item: "Six demo role accounts on login page", status: "not started", notes: "Seed has 3 accounts only" },
    ],
    trace: "__PENDING__",
  },
  {
    n: "004",
    title: "Core data model, migrations and access scope",
    phase: 1,
    acs: ["AC-004-01", "AC-004-02", "AC-004-03", "AC-004-04"],
    tcs: ["TC-004-01", "TC-004-02", "TC-004-03", "TC-004-04", "TC-004-05"],
    rules: "Schema hosts all BR-* tables; no evaluation yet.",
    surfaces:
      "`src/lib/db/schema/*` (present); `src/lib/db/queries/*` (to add); `src/lib/auth/scope.ts` (stub).",
    contracts: "Drizzle schema types; query helpers return typed rows.",
    extend: "Add query modules per entity; never raw SQL in components.",
    ops: "`npm run db:push`; DB at `ljadev/data/aiinsclaim.db`.",
    shipped: [
      { item: "Drizzle schema all DATA-DICTIONARY tables", status: "done", notes: "Shipped in PBI-001 scaffold" },
      { item: "Query helpers per entity", status: "not started", notes: "" },
      { item: "Scope probe tests", status: "not started", notes: "Replaces Postgres RLS" },
      { item: "Append-only enforcement helpers", status: "not started", notes: "" },
    ],
    trace: "Schema partial in commit 797b2de",
  },
  {
    n: "005",
    title: "Seed / mock-data pipeline",
    phase: 1,
    acs: ["AC-005-01", "AC-005-02", "AC-005-03", "AC-005-04"],
    tcs: ["TC-005-01", "TC-005-02", "TC-005-03", "TC-005-04", "TC-005-05"],
    rules: "Seeds all BR-* rule sets v1 + parameters (requires PBI-006 evaluator).",
    surfaces: "`seed/` generators; `seed/assets/`; `npm run seed|seed:rules|seed:demo`.",
    contracts: "Deterministic faker seed 42; volumes per DATA-DICTIONARY §6.",
    extend: "Import `evaluateRuleSet` so seeded routes carry real `rule_audit_log` rows.",
    ops: "Refuses `NODE_ENV=production`. Copies docs to `ljadev/storage/claim-documents/`.",
    shipped: [
      { item: "Minimal demo user seed", status: "done", notes: "3 users only" },
      { item: "Full §6 volumes (120 claims)", status: "not started", notes: "" },
      { item: "Rules/parameters seed", status: "not started", notes: "Depends PBI-006" },
    ],
    trace: "Partial seed in 797b2de",
  },
  {
    n: "006",
    title: "Rules engine core + parameters",
    phase: 1,
    acs: ["AC-006-01", "AC-006-02", "AC-006-03", "AC-006-04", "AC-006-05"],
    tcs: ["TC-006-01", "TC-006-02", "TC-006-03", "TC-006-04", "TC-006-05", "TC-006-06"],
    rules:
      "Evaluator for all BR-* sets: BR-TRIAGE-001, BR-FRAUD-001, BR-ASSIGN-001, BR-RESERVE-001, BR-AUTH-001, BR-SLA-001, BR-ESC-001, BR-DOC-001, BR-STP-001 (IDs only — thresholds in `parameters` table).",
    surfaces: "`src/lib/rules/` — engine, operators, actions, schemas, params.",
    contracts: "`evaluateRuleSet(code, inputs, asOf)`; `getParameter(key, asOf)`; Zod input schemas per rule set.",
    extend: "Golden tests per BUSINESS-RULES worked example; audit writer on every eval.",
    ops: "Vitest golden suites in `tests/rules/`.",
    shipped: [{ item: "Rules engine", status: "not started", notes: "DESIGN §5.2" }],
    trace: "__PENDING__",
  },
  {
    n: "007",
    title: "Claim state machine",
    phase: 1,
    acs: ["AC-007-01", "AC-007-02", "AC-007-03", "AC-007-04"],
    tcs: ["TC-007-01", "TC-007-02", "TC-007-03", "TC-007-04"],
    rules: "BR-DOC-001 guard on draft→submitted; guards call rules engine where specified.",
    surfaces: "`src/lib/state-machine/`; `claim_transitions` table (to add); `transitionClaim()`.",
    contracts: "Typed errors: `IllegalTransition`; history in `claim_state_history`.",
    extend: "Seed DESIGN §4.2 transition table; hook SLA in PBI-014.",
    ops: "Unit tests over full transition matrix.",
    shipped: [{ item: "State machine", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "008",
    title: "Rules and decision-table admin UI",
    phase: 1,
    acs: ["AC-008-01", "AC-008-02", "AC-008-03", "AC-008-04", "AC-008-05"],
    tcs: ["TC-008-01", "TC-008-02", "TC-008-03", "TC-008-04", "TC-008-05"],
    rules: "Admin CRUD on all BR-* rule sets and `parameters` (admin role only).",
    surfaces: "`(admin)/rules/**`, `(admin)/parameters/page.tsx`, `DecisionTableGrid`.",
    contracts: "Server actions per API-CONTRACTS §admin; simulate dry-run (no audit write).",
    extend: "Draft-only edits; activation effective-dates prior version.",
    ops: "Admin role required server-side.",
    shipped: [{ item: "Rules admin UI", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "009",
    title: "FNOL intake wizard (+ AGT-INTAKE)",
    phase: 2,
    acs: ["AC-009-01", "AC-009-02", "AC-009-03", "AC-009-04", "AC-009-05"],
    tcs: ["TC-009-01", "TC-009-02", "TC-009-03", "TC-009-04", "TC-009-05", "TC-009-06"],
    rules: "BR-DOC-001 completeness checklist.",
    surfaces: "`(claimant)/claims/new`, `(staff)/intake/new`, `src/lib/agents/intake.ts`.",
    contracts: "API-CONTRACTS §claims; AGT-INTAKE per AGENT-OPS.",
    extend: "Autosave draft per step; redact PII in `agent_runs.input_json`.",
    ops: "Optional `AI_API_KEY`, `AI_BASE_URL` for live agent smoke.",
    shipped: [{ item: "FNOL wizard", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "010",
    title: "Document upload and extraction (AGT-EXTRACT)",
    phase: 2,
    acs: ["AC-010-01", "AC-010-02", "AC-010-03", "AC-010-04", "AC-010-05"],
    tcs: ["TC-010-01", "TC-010-02", "TC-010-03", "TC-010-04", "TC-010-05", "TC-010-06"],
    rules: "Confidence vs `parameters` (`stp.min_extraction_confidence`); feeds BR-STP-001, BR-DOC-001.",
    surfaces: "`src/lib/storage/local.ts` (upload stub); `src/lib/agents/extract.ts`; verify task UI.",
    contracts: "API-CONTRACTS §extraction per doc_type Zod schemas.",
    extend: "Mock gateway in CI; one live smoke optional.",
    ops: "`STORAGE_PATH` env; files under `ljadev/storage/claim-documents/`.",
    shipped: [
      { item: "Local storage helper", status: "done", notes: "saveClaimDocument in PBI-001" },
      { item: "Extraction pipeline", status: "not started", notes: "" },
    ],
    trace: "Storage stub in 797b2de",
  },
  {
    n: "011",
    title: "Triage, routing and STP (AGT-TRIAGE)",
    phase: 2,
    acs: ["AC-011-01", "AC-011-02", "AC-011-03", "AC-011-04", "AC-011-05"],
    tcs: ["TC-011-01", "TC-011-02", "TC-011-03", "TC-011-04", "TC-011-05"],
    rules: "BR-TRIAGE-001, BR-ASSIGN-001, BR-STP-001 (+ fraud stub until PBI-012).",
    surfaces: "`src/lib/agents/triage.ts`; triage card on claim detail.",
    contracts: "AGT-TRIAGE per AGENT-OPS; orchestration on submit + `retriageClaim`.",
    extend: "STP path must write full audit chain.",
    ops: "Mock AGT-TRIAGE fixtures in `tests/fixtures/gateway/`.",
    shipped: [{ item: "Triage orchestration", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "012",
    title: "Fraud scoring (AGT-FRAUD + BR-FRAUD-001)",
    phase: 2,
    acs: ["AC-012-01", "AC-012-02", "AC-012-03", "AC-012-04", "AC-012-05"],
    tcs: ["TC-012-01", "TC-012-02", "TC-012-03", "TC-012-04", "TC-012-05", "TC-012-06"],
    rules: "BR-FRAUD-001 (collect_sum); interacts BR-STP-001, BR-AUTH-001.",
    surfaces: "`src/lib/agents/fraud.ts`; `(staff)/siu`; fraud panel.",
    contracts: "AGT-FRAUD signals schema; `fraud_scores` persistence.",
    extend: "Agent never sets band — rules only.",
    ops: "Golden test reproduces worked example (score 65, band high).",
    shipped: [{ item: "Fraud scoring", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "013",
    title: "HITL task queues and worklists",
    phase: 2,
    acs: ["AC-013-01", "AC-013-02", "AC-013-03", "AC-013-04", "AC-013-05"],
    tcs: ["TC-013-01", "TC-013-02", "TC-013-03", "TC-013-04", "TC-013-05", "TC-013-06"],
    rules: "Consumes outputs of triage, fraud, extraction agents.",
    surfaces: "`(staff)/queue/**`; `resolveTask` server action; TaskCard, AgentProposalCard.",
    contracts: "API-CONTRACTS §tasks; mandatory `resolution_reason` on override.",
    extend: "Poll interval from `parameters.ui.queue_poll_seconds`.",
    ops: "TanStack Query polling.",
    shipped: [{ item: "Task queues", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "014",
    title: "SLA timers and escalation",
    phase: 2,
    acs: ["AC-014-01", "AC-014-02", "AC-014-03", "AC-014-04", "AC-014-05"],
    tcs: ["TC-014-01", "TC-014-02", "TC-014-03", "TC-014-04", "TC-014-05"],
    rules: "BR-SLA-001, BR-ESC-001.",
    surfaces: "`src/lib/sla/`; `/api/sweep/sla/route.ts`; admin dev trigger.",
    contracts: "Secured sweep endpoint (secret header).",
    extend: "Hook timer start/pause from state machine + task creation.",
    ops: "Injected clock in unit tests; durations from `parameters` only.",
    shipped: [{ item: "SLA timers", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "015",
    title: "Assessment workbench and reserves (AGT-RESERVE)",
    phase: 2,
    acs: ["AC-015-01", "AC-015-02", "AC-015-03", "AC-015-04", "AC-015-05"],
    tcs: ["TC-015-01", "TC-015-02", "TC-015-03", "TC-015-04", "TC-015-05"],
    rules: "BR-RESERVE-001, BR-DOC-001 settlement gate.",
    surfaces: "`(staff)/claims/[id]` workbench tabs; `src/lib/coverage.ts`; `src/lib/agents/reserve.ts`.",
    contracts: "Reserve chain with supersedes_id; approval task when change > param.",
    extend: "Reserve suggested never auto-set.",
    ops: "Playwright assessment flows on seeded claims.",
    shipped: [{ item: "Assessment workbench", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "016",
    title: "Settlement, authority and payments",
    phase: 2,
    acs: ["AC-016-01", "AC-016-02", "AC-016-03", "AC-016-04", "AC-016-05"],
    tcs: ["TC-016-01", "TC-016-02", "TC-016-03", "TC-016-04", "TC-016-05"],
    rules: "BR-AUTH-001; SIU hold check.",
    surfaces: "Settlement panel in workbench Financials tab; mock payment issuance.",
    contracts: "Payment mock (ach_mock, check_mock); closure checklist.",
    extend: "Authority checked server-side at approval time.",
    ops: "No real payment integrations.",
    shipped: [{ item: "Settlement flow", status: "not started", notes: "" }],
    trace: "__PENDING__",
  },
  {
    n: "017",
    title: "Claim summary agent and timeline (AGT-SUMMARY)",
    phase: 2,
    acs: ["AC-017-01", "AC-017-02", "AC-017-03"],
    tcs: ["TC-017-01", "TC-017-02", "TC-017-03"],
    rules: "None — no new decision tables; reads existing audit/history tables.",
    surfaces: "`src/lib/agents/summary.ts`; summary card; timeline tab.",
    contracts: "AGT-SUMMARY per AGENT-OPS; debounce param `ui.summary_debounce_s`.",
    extend: "Event registry for material changes from PBIs 010–016.",
    ops: "Mock gateway in CI.",
    shipped: [{ item: "Summary + timeline", status: "not started", notes: "MoSCoW Should" }],
    trace: "__PENDING__",
  },
  {
    n: "018",
    title: "Ops dashboards and audit viewer",
    phase: 2,
    acs: ["AC-018-01", "AC-018-02", "AC-018-03", "AC-018-04"],
    tcs: ["TC-018-01", "TC-018-02", "TC-018-03", "TC-018-04"],
    rules: "Reads `rule_audit_log` (read-only aggregates).",
    surfaces: "`(staff)/dashboard`; `(staff)/claims/[id]/audit`; SQL views.",
    contracts: "CSV export of audit chain.",
    extend: "Supervisor+ only for dashboard.",
    ops: "KPI views migration; axe on charts.",
    shipped: [{ item: "Dashboards", status: "not started", notes: "MoSCoW Should" }],
    trace: "__PENDING__",
  },
  {
    n: "019",
    title: "Claims copilot NL query (AGT-COPILOT)",
    phase: 3,
    acs: ["AC-019-01", "AC-019-02", "AC-019-03"],
    tcs: ["TC-019-01", "TC-019-02", "TC-019-03"],
    rules: "Read-only allowlisted views only.",
    surfaces: "Copilot panel; read-only SQL tool.",
    contracts: "AGT-COPILOT per AGENT-OPS; row-limit and timeout guardrails.",
    extend: "Never index `ljadoc/kb/` into copilot RAG.",
    ops: "Mock mutation-seeking prompt tests.",
    shipped: [{ item: "Claims copilot", status: "not started", notes: "MoSCoW Could" }],
    trace: "__PENDING__",
  },
  {
    n: "020",
    title: "Comms drafting agent (AGT-COMMS)",
    phase: 3,
    acs: ["AC-020-01", "AC-020-02", "AC-020-03"],
    tcs: ["TC-020-01", "TC-020-02", "TC-020-03"],
    rules: "Templates + coded denial reasons from claim record.",
    surfaces: "Comms draft UI; mock outbox.",
    contracts: "AGT-COMMS per AGENT-OPS; never auto-send.",
    extend: "Human edit required before send.",
    ops: "Agent runs logged with prompt version.",
    shipped: [{ item: "Comms drafter", status: "not started", notes: "MoSCoW Could" }],
    trace: "__PENDING__",
  },
];

function render(p: PbiMeta) {
  const shipRows = p.shipped
    .map((r) => `| ${r.item} | ${r.status} | ${r.notes} |`)
    .join("\n");

  return `# PBI-${p.n} — ${p.title}

## PBI / ACs / TCs

- PBI: [PBI-${p.n}](../PRD.md#pbi-${p.n})
- Phase: ${p.phase}
- ACs: ${p.acs.join(", ")} (see [TEST-PLAN](../TEST-PLAN.md))
- TCs: ${p.tcs.join(", ")}
- GitHub: [PBI issue #${Number(p.n)}](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/${Number(p.n)})

## Shipped vs spec

| Item | Status | Notes |
| --- | --- | --- |
${shipRows}

## Surfaces

${p.surfaces}

## Contracts

${p.contracts}

## Rules

${p.rules}

## How to extend

${p.extend}

## Ops

${p.ops}

## Trace

${p.trace === "__PENDING__" ? `Pending implementation — land with commit \`feat(PBI-${p.n}): …\` and record SHA here.` : p.trace}
`;
}

fs.mkdirSync(outDir, { recursive: true });
for (const p of pbis) {
  fs.writeFileSync(path.join(outDir, `PBI-${p.n}.md`), render(p));
}
console.log(`Generated ${pbis.length} as-built files (PBI-002..020).`);
