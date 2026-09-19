import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repo = "lionelantony-ghrepos/aiinsclaim";
const prdPath = path.join("ljadoc", "PRD.md");
const prd = fs.readFileSync(prdPath, "utf8");

const pbis = [
  { id: "001", issue: 1, title: "Repo scaffolding, SQLite/Drizzle wiring, CI", phase: "phase-0", moscow: "must", depends: "—", story: "As the build agent, I need a strict, conventional codebase skeleton so every later feature lands in a predictable place.", scope: "Next.js App Router, Tailwind, TanStack Query, Zod, Drizzle/SQLite, Vitest, Playwright, CI workflow, folder layout per DESIGN §11.", dod: "Builds clean; CI green; AC-001-01..03 pass.", done: true },
  { id: "002", issue: 2, title: "Design tokens + app layout shell", phase: "phase-0", moscow: "must", depends: "PBI-001", story: "As any user, I get a coherent, accessible, dark-mode-first interface so the app feels like a professional claims workbench.", scope: "Ledger design system tokens, role-aware app shell, six signature component stubs, /dev/components demo page.", dod: "Shell renders in both themes; axe clean; AC-002-01..03.", done: false },
  { id: "003", issue: 3, title: "Auth, roles and route protection", phase: "phase-1", moscow: "must", depends: "PBI-001, PBI-002", story: "As a user, I sign in and see only what my role permits.", scope: "iron-session + bcrypt auth, middleware route groups, login/logout, demo accounts per role.", dod: "Six demo roles sign in correctly; AC-003-01..04.", done: false },
  { id: "004", issue: 4, title: "Core data model, migrations and access scope", phase: "phase-1", moscow: "must", depends: "PBI-001, PBI-003", story: "As the platform, I persist every domain entity with safe access by construction.", scope: "Complete Drizzle schema, query helpers, append-only enforcement, scope helpers in src/lib/auth/scope.ts.", dod: "Schema pushes cleanly; scope probe tests pass; AC-004-01..04.", done: false },
  { id: "005", issue: 5, title: "Seed / mock-data pipeline", phase: "phase-1", moscow: "must", depends: "PBI-004, PBI-006", story: "As a developer/demo presenter, I run one command and every screen has realistic data.", scope: "Deterministic seed (faker seed 42), 120 claims distribution, rules seeded via engine, local doc assets.", dod: "npm run seed under 2 min; AC-005-01..04.", done: false },
  { id: "006", issue: 6, title: "Rules engine core + parameters", phase: "phase-1", moscow: "must", depends: "PBI-004", story: "As the business, every operational decision comes from an editable, versioned, audited decision table.", scope: "evaluateRuleSet, getParameter, operators, hit policies, audit writer, golden tests for all 9 BR-* tables.", dod: "Golden tests pass; AC-006-01..05.", done: false },
  { id: "007", issue: 7, title: "Claim state machine", phase: "phase-1", moscow: "must", depends: "PBI-004, PBI-006", story: "As the platform, claims can only move through legal, guarded, audited transitions.", scope: "claim_transitions table, transitionClaim, guard registry, claim_state_history.", dod: "All transition tests green; AC-007-01..04.", done: false },
  { id: "008", issue: 8, title: "Rules and decision-table admin UI", phase: "phase-1", moscow: "must", depends: "PBI-002, PBI-003, PBI-006", story: "As a claims ops admin, I edit decision tables and parameters in a UI with draft/simulate/activate.", scope: "Admin rules pages, DecisionTableGrid editor, simulation drawer, parameters CRUD.", dod: "Admin can change stp.max_amount and see behavior change; AC-008-01..05.", done: false },
  { id: "009", issue: 9, title: "FNOL intake wizard (+ AGT-INTAKE)", phase: "phase-2", moscow: "must", depends: "PBI-002, PBI-003, PBI-005, PBI-007", story: "As a claimant, I file a claim through a guided wizard with live completeness checks.", scope: "Multi-step wizard, BR-DOC-001 checklist, AGT-INTAKE panel, draft autosave, submit flow.", dod: "Each claim type can be filed; AC-009-01..05.", done: false },
  { id: "010", issue: 10, title: "Document upload and extraction (AGT-EXTRACT)", phase: "phase-2", moscow: "must", depends: "PBI-009", story: "As a claimant/adjuster, uploaded documents become structured data with HITL when confidence is low.", scope: "Local storage upload, AGT-EXTRACT pipeline, verify_extraction task UI.", dod: "Demo docs extract correctly; AC-010-01..05.", done: false },
  { id: "011", issue: 11, title: "Triage, routing and STP (AGT-TRIAGE)", phase: "phase-2", moscow: "must", depends: "PBI-007, PBI-010", story: "As claims ops, every submitted claim is scored, routed, and low-risk claims can auto-approve with audit.", scope: "AGT-TRIAGE + BR-TRIAGE/ASSIGN/STP chain, re-triage on material change.", dod: "STP demo claim auto-approves with audit chain; AC-011-01..05.", done: false },
  { id: "012", issue: 12, title: "Fraud scoring (AGT-FRAUD + BR-FRAUD-001)", phase: "phase-2", moscow: "must", depends: "PBI-011", story: "As an SIU analyst, suspicious claims surface with explainable reason codes.", scope: "AGT-FRAUD signals, BR-FRAUD-001 banding, SIU queue, disposition workflow.", dod: "Seeded fraud cases show correct bands; AC-012-01..05.", done: false },
  { id: "013", issue: 13, title: "HITL task queues and worklists", phase: "phase-2", moscow: "must", depends: "PBI-011", story: "As staff, I see what needs me now with AI proposals and accept/override captured.", scope: "Role-scoped queues, TaskCard, AgentProposalCard, resolveTask with mandatory override reason.", dod: "All four queues work on seed data; AC-013-01..05.", done: false },
  { id: "014", issue: 14, title: "SLA timers and escalation", phase: "phase-2", moscow: "must", depends: "PBI-013", story: "As a supervisor, timers run on every stage and breaches escalate automatically.", scope: "BR-SLA-001 timers, sweep handler, BR-ESC-001 actions, SlaCountdown UI.", dod: "Breach ladder visible; sweep idempotent; AC-014-01..05.", done: false },
  { id: "015", issue: 15, title: "Assessment workbench and reserves (AGT-RESERVE)", phase: "phase-2", moscow: "must", depends: "PBI-013", story: "As an adjuster, one workspace gives me everything to assess a claim.", scope: "Claim workbench tabs, coverage panel, reserve proposal flow, request-info.", dod: "Full assessment on seeded claims; AC-015-01..05.", done: false },
  { id: "016", issue: 16, title: "Settlement, authority and payments", phase: "phase-2", moscow: "must", depends: "PBI-015", story: "As an adjuster I propose settlements; authority matrix decides approval; mock payments issue.", scope: "Settlement panel, BR-AUTH-001, mock payment, closure checklist, denial path.", dod: "Claim runs settlement to paid to closed; AC-016-01..05.", done: false },
  { id: "017", issue: 17, title: "Claim summary agent and timeline (AGT-SUMMARY)", phase: "phase-2", moscow: "should", depends: "PBI-011", story: "As staff, I read an AI-maintained summary and complete visual timeline.", scope: "AGT-SUMMARY on material events, unified timeline tab with filters.", dod: "Summary refreshes after changes; AC-017-01..03.", done: false },
  { id: "018", issue: 18, title: "Ops dashboards and audit viewer", phase: "phase-2", moscow: "should", depends: "PBI-014, PBI-016", story: "As supervisor/admin, I see operational health KPIs and inspect any decision chain.", scope: "Dashboard KPIs/charts, audit viewer with CSV export.", dod: "Dashboard matches seed; STP audit chain inspectable; AC-018-01..04.", done: false },
  { id: "019", issue: 19, title: "Claims copilot NL query (AGT-COPILOT)", phase: "phase-3", moscow: "could", depends: "PBI-018", story: "Natural-language questions over allowlisted read-only claim views.", scope: "Read-only SQL tool, table render, generated SQL disclosure, guardrails.", dod: "AC-019-01..03.", done: false },
  { id: "020", issue: 20, title: "Comms drafting agent (AGT-COMMS)", phase: "phase-3", moscow: "could", depends: "PBI-017", story: "Draft claimant communications from templates + summary; human edits and sends.", scope: "Ack/info/decision letter drafts, mock outbox, never auto-send.", dod: "AC-020-01..03.", done: false },
];

const MAIN_PROMPT = `You are building **aiinsclaim**, an AI-native agentic insurance claims system (Auto + Property, learning stack on mock data). Obey \`.cursor/rules/\` and \`ljadoc/AGENTS.md\`. Read \`ljadoc/DESIGN.md\` and \`ljadoc/BUSINESS-RULES.md\` before coding. Read \`ljadoc/kb/INDEX.md\` and dependency as-built files for the current PBI.

TypeScript strict; Zod-validate all boundaries (\`src/lib/schemas/\`). No business logic hard-coded in components — logic lives in BR-* decision tables (\`parameters\` table) or packages under \`src/lib/rules/\`. SQLite + Drizzle for data; scope every query via \`src/lib/auth/scope.ts\`.

Write Vitest unit tests and Playwright e2e per \`ljadoc/TEST-PLAN.md\` TC IDs for the PBI. Update the traceability status in \`ljadoc/kb/as-built/PBI-NNN.md\` (and \`ljadoc/kb/INDEX.md\` if status changed) when tests pass — same commit as code. Run \`npm run docs:kb-check\` before done.`;

const EXTRA_CURSOR: Record<string, string> = {
  "019": `> **Context:** AGENT-OPS §AGT-COPILOT; depends on PBI-018.
> **Task:** Build read-only NL query copilot: allowlisted SQL views only, agent generates SQL from natural language, executes via read-only role, renders result table + disclosed generated SQL; guardrails per AGENT-OPS (row limits, view allowlist, injection resistance, no writes).
> **Constraints:** never auto-execute destructive SQL; no indexing of \`ljadoc/\` into copilot RAG; all queries logged to agent_runs.
> **Files expected:** \`src/lib/agents/copilot.ts\`, copilot UI route, view allowlist config, server actions.
> **Acceptance check:** AC-019-01..03.
> **Out of scope:** write queries, external data sources.`,
  "020": `> **Context:** AGENT-OPS §AGT-COMMS; depends on PBI-017.
> **Task:** Implement comms drafting agent: ack/info-request/decision letter drafts from templates + claim summary; editable preview; mock outbox (never auto-send); tone/reading-level validated on output schema; drafts logged to agent_runs with prompt version.
> **Constraints:** human must explicitly send; no autonomous outbound comms; no PII in logs beyond claim IDs.
> **Files expected:** \`src/lib/agents/comms.ts\`, draft UI in workbench, mock outbox, server actions.
> **Acceptance check:** AC-020-01..03.
> **Out of scope:** real email/SMS integrations.`,
};

function run(cmd: string) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function extractCursorPrompt(pbiId: string): string {
  const sectionRe = new RegExp(
    `## PBI-${pbiId}[^\\n]*\\n([\\s\\S]*?)(?=\\n## PBI-|\\n# Phase |\\n---\\n\\n\\*Traceability)`,
  );
  const section = prd.match(sectionRe)?.[1] ?? "";
  const promptMatch = section.match(/\*\*Cursor prompt:\*\*\n([\s\S]*?)\n\n\*\*DoD:/);
  if (promptMatch) {
    return promptMatch[1].trim();
  }
  const extra = EXTRA_CURSOR[pbiId];
  if (extra) return extra;
  throw new Error(`No cursor prompt found for PBI-${pbiId}`);
}

function dependencyAsBuilt(depends: string): string {
  if (depends === "—") return "none (first PBI)";
  return depends
    .split(",")
    .map((d) => d.trim())
    .map((d) => `\`ljadoc/kb/as-built/${d}.md\``)
    .join(", ");
}

function buildBody(p: (typeof pbis)[number]): string {
  const cursorPrompt = extractCursorPrompt(p.id).replace(/PBI-NNN/g, `PBI-${p.id}`);
  const status = p.done ? "\n\n**Status:** ✅ Completed (commit 797b2de)" : "";
  const kbAsBuilt = `ljadoc/kb/as-built/PBI-${p.id}.md`;

  return `## PBI-${p.id}: ${p.title}

| Field | Value |
|-------|-------|
| **Phase** | ${p.phase.replace("phase-", "")} |
| **MoSCoW** | ${p.moscow} |
| **Depends on** | ${p.depends} |

### Main prompt (every session)

${MAIN_PROMPT.replace(/PBI-NNN/g, `PBI-${p.id}`)}

### Knowledge base (this PBI)

**Before coding:**
1. Read \`ljadoc/kb/INDEX.md\`, \`ljadoc/kb/traceability.md\`, and dependency as-built: ${dependencyAsBuilt(p.depends)}
2. Confirm AC/TC IDs for PBI-${p.id} in TEST-PLAN

**After shipping:**
1. Copy/update \`${kbAsBuilt}\` from \`ljadoc/kb/_template-as-built.md\` (BR-* IDs only; no thresholds)
2. Update \`ljadoc/kb/INDEX.md\` status column if changed
3. Add \`ljadoc/kb/adr/\` only if a durable choice is missing from DESIGN.md
4. Patch \`ljadoc/08-User-Guide.md\` only for user-visible UI
5. Run \`npm run docs:generate\` if schemas/packages changed; \`npm run docs:kb-check\`
6. Do not index \`ljadoc/\` into future claims copilot RAG unless explicitly scheduled

### User story

${p.story}

### Scope

${p.scope}

### Definition of done

${p.dod}

### Cursor prompt

${cursorPrompt}

### References

- [00-MAIN-PROMPT](https://github.com/${repo}/blob/feature/ljadoc/00-MAIN-PROMPT.md)
- [PRD](https://github.com/${repo}/blob/feature/ljadoc/PRD.md#pbi-${p.id})
- [TEST-PLAN](https://github.com/${repo}/blob/feature/ljadoc/TEST-PLAN.md)
- [DESIGN](https://github.com/${repo}/blob/feature/ljadoc/DESIGN.md)
- [KB INDEX](https://github.com/${repo}/blob/feature/ljadoc/kb/INDEX.md)
- [As-built PBI-${p.id}](https://github.com/${repo}/blob/feature/ljadoc/kb/as-built/PBI-${p.id}.md)${status}`;
}

for (const p of pbis) {
  const body = buildBody(p);
  const bodyFile = path.join("ljadev", `.issue-body-${p.id}.md`);
  fs.writeFileSync(bodyFile, body, "utf8");
  run(`gh issue edit ${p.issue} --repo ${repo} --body-file ${bodyFile}`);
  console.log(`Updated issue #${p.issue} (PBI-${p.id})`);
}

console.log(`\nDone. Updated ${pbis.length} PBI issues.`);
