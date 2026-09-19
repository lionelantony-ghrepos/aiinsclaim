import { execSync } from "node:child_process";
import fs from "node:fs";

/** Creates new PBI issues. To refresh existing issue bodies (main + KB prompts), run: npm run issues:pbi-update */

const repo = "lionelantony-ghrepos/aiinsclaim";
const projectOwner = "lionelantony-ghrepos";
const projectNumber = 3;

const pbis = [
  { id: "001", title: "Repo scaffolding, SQLite/Drizzle wiring, CI", phase: "phase-0", moscow: "must", depends: "—", story: "As the build agent, I need a strict, conventional codebase skeleton so every later feature lands in a predictable place.", scope: "Next.js App Router, Tailwind, TanStack Query, Zod, Drizzle/SQLite, Vitest, Playwright, CI workflow, folder layout per DESIGN §11.", dod: "Builds clean; CI green; AC-001-01..03 pass.", done: true },
  { id: "002", title: "Design tokens + app layout shell", phase: "phase-0", moscow: "must", depends: "PBI-001", story: "As any user, I get a coherent, accessible, dark-mode-first interface so the app feels like a professional claims workbench.", scope: "Ledger design system tokens, role-aware app shell, six signature component stubs, /dev/components demo page.", dod: "Shell renders in both themes; axe clean; AC-002-01..03.", done: false },
  { id: "003", title: "Auth, roles and route protection", phase: "phase-1", moscow: "must", depends: "PBI-001, PBI-002", story: "As a user, I sign in and see only what my role permits.", scope: "iron-session + bcrypt auth, middleware route groups, login/logout, demo accounts per role.", dod: "Six demo roles sign in correctly; AC-003-01..04.", done: false },
  { id: "004", title: "Core data model, migrations and access scope", phase: "phase-1", moscow: "must", depends: "PBI-001, PBI-003", story: "As the platform, I persist every domain entity with safe access by construction.", scope: "Complete Drizzle schema, query helpers, append-only enforcement, scope helpers in src/lib/auth/scope.ts.", dod: "Schema pushes cleanly; scope probe tests pass; AC-004-01..04.", done: false },
  { id: "005", title: "Seed / mock-data pipeline", phase: "phase-1", moscow: "must", depends: "PBI-004, PBI-006", story: "As a developer/demo presenter, I run one command and every screen has realistic data.", scope: "Deterministic seed (faker seed 42), 120 claims distribution, rules seeded via engine, local doc assets.", dod: "npm run seed under 2 min; AC-005-01..04.", done: false },
  { id: "006", title: "Rules engine core + parameters", phase: "phase-1", moscow: "must", depends: "PBI-004", story: "As the business, every operational decision comes from an editable, versioned, audited decision table.", scope: "evaluateRuleSet, getParameter, operators, hit policies, audit writer, golden tests for all 9 BR-* tables.", dod: "Golden tests pass; AC-006-01..05.", done: false },
  { id: "007", title: "Claim state machine", phase: "phase-1", moscow: "must", depends: "PBI-004, PBI-006", story: "As the platform, claims can only move through legal, guarded, audited transitions.", scope: "claim_transitions table, transitionClaim, guard registry, claim_state_history.", dod: "All transition tests green; AC-007-01..04.", done: false },
  { id: "008", title: "Rules and decision-table admin UI", phase: "phase-1", moscow: "must", depends: "PBI-002, PBI-003, PBI-006", story: "As a claims ops admin, I edit decision tables and parameters in a UI with draft/simulate/activate.", scope: "Admin rules pages, DecisionTableGrid editor, simulation drawer, parameters CRUD.", dod: "Admin can change stp.max_amount and see behavior change; AC-008-01..05.", done: false },
  { id: "009", title: "FNOL intake wizard (+ AGT-INTAKE)", phase: "phase-2", moscow: "must", depends: "PBI-002, PBI-003, PBI-005, PBI-007", story: "As a claimant, I file a claim through a guided wizard with live completeness checks.", scope: "Multi-step wizard, BR-DOC-001 checklist, AGT-INTAKE panel, draft autosave, submit flow.", dod: "Each claim type can be filed; AC-009-01..05.", done: false },
  { id: "010", title: "Document upload and extraction (AGT-EXTRACT)", phase: "phase-2", moscow: "must", depends: "PBI-009", story: "As a claimant/adjuster, uploaded documents become structured data with HITL when confidence is low.", scope: "Local storage upload, AGT-EXTRACT pipeline, verify_extraction task UI.", dod: "Demo docs extract correctly; AC-010-01..05.", done: false },
  { id: "011", title: "Triage, routing and STP (AGT-TRIAGE)", phase: "phase-2", moscow: "must", depends: "PBI-007, PBI-010", story: "As claims ops, every submitted claim is scored, routed, and low-risk claims can auto-approve with audit.", scope: "AGT-TRIAGE + BR-TRIAGE/ASSIGN/STP chain, re-triage on material change.", dod: "STP demo claim auto-approves with audit chain; AC-011-01..05.", done: false },
  { id: "012", title: "Fraud scoring (AGT-FRAUD + BR-FRAUD-001)", phase: "phase-2", moscow: "must", depends: "PBI-011", story: "As an SIU analyst, suspicious claims surface with explainable reason codes.", scope: "AGT-FRAUD signals, BR-FRAUD-001 banding, SIU queue, disposition workflow.", dod: "Seeded fraud cases show correct bands; AC-012-01..05.", done: false },
  { id: "013", title: "HITL task queues and worklists", phase: "phase-2", moscow: "must", depends: "PBI-011", story: "As staff, I see what needs me now with AI proposals and accept/override captured.", scope: "Role-scoped queues, TaskCard, AgentProposalCard, resolveTask with mandatory override reason.", dod: "All four queues work on seed data; AC-013-01..05.", done: false },
  { id: "014", title: "SLA timers and escalation", phase: "phase-2", moscow: "must", depends: "PBI-013", story: "As a supervisor, timers run on every stage and breaches escalate automatically.", scope: "BR-SLA-001 timers, sweep handler, BR-ESC-001 actions, SlaCountdown UI.", dod: "Breach ladder visible; sweep idempotent; AC-014-01..05.", done: false },
  { id: "015", title: "Assessment workbench and reserves (AGT-RESERVE)", phase: "phase-2", moscow: "must", depends: "PBI-013", story: "As an adjuster, one workspace gives me everything to assess a claim.", scope: "Claim workbench tabs, coverage panel, reserve proposal flow, request-info.", dod: "Full assessment on seeded claims; AC-015-01..05.", done: false },
  { id: "016", title: "Settlement, authority and payments", phase: "phase-2", moscow: "must", depends: "PBI-015", story: "As an adjuster I propose settlements; authority matrix decides approval; mock payments issue.", scope: "Settlement panel, BR-AUTH-001, mock payment, closure checklist, denial path.", dod: "Claim runs settlement to paid to closed; AC-016-01..05.", done: false },
  { id: "017", title: "Claim summary agent and timeline (AGT-SUMMARY)", phase: "phase-2", moscow: "should", depends: "PBI-011", story: "As staff, I read an AI-maintained summary and complete visual timeline.", scope: "AGT-SUMMARY on material events, unified timeline tab with filters.", dod: "Summary refreshes after changes; AC-017-01..03.", done: false },
  { id: "018", title: "Ops dashboards and audit viewer", phase: "phase-2", moscow: "should", depends: "PBI-014, PBI-016", story: "As supervisor/admin, I see operational health KPIs and inspect any decision chain.", scope: "Dashboard KPIs/charts, audit viewer with CSV export.", dod: "Dashboard matches seed; STP audit chain inspectable; AC-018-01..04.", done: false },
  { id: "019", title: "Claims copilot NL query (AGT-COPILOT)", phase: "phase-3", moscow: "could", depends: "PBI-018", story: "Natural-language questions over allowlisted read-only claim views.", scope: "Read-only SQL tool, table render, generated SQL disclosure, guardrails.", dod: "AC-019-01..03.", done: false },
  { id: "020", title: "Comms drafting agent (AGT-COMMS)", phase: "phase-3", moscow: "could", depends: "PBI-017", story: "Draft claimant communications from templates + summary; human edits and sends.", scope: "Ack/info/decision letter drafts, mock outbox, never auto-send.", dod: "AC-020-01..03.", done: false },
];

function run(cmd: string) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const created: string[] = [];

for (const p of pbis) {
  const status = p.done ? "\n\n**Status:** ✅ Completed (commit 797b2de)" : "";
  const body = `## PBI-${p.id}: ${p.title}

| Field | Value |
|-------|-------|
| **Phase** | ${p.phase.replace("phase-", "")} |
| **MoSCoW** | ${p.moscow} |
| **Depends on** | ${p.depends} |

### User story
${p.story}

### Scope
${p.scope}

### Definition of done
${p.dod}

### References
- [PRD](https://github.com/${repo}/blob/feature/ljadoc/PRD.md#pbi-${p.id})
- [TEST-PLAN](https://github.com/${repo}/blob/feature/ljadoc/TEST-PLAN.md)
- [DESIGN](https://github.com/${repo}/blob/feature/ljadoc/DESIGN.md)${status}`;

  const bodyFile = `ljadev/.issue-body-${p.id}.md`;
  fs.writeFileSync(bodyFile, body);

  const issueUrl = run(
    `gh issue create --repo ${repo} --title "PBI-${p.id}: ${p.title}" --body-file ${bodyFile} --label "pbi,${p.phase},${p.moscow}"`,
  );
  console.log(`Created ${issueUrl}`);
  created.push(issueUrl);

  if (p.done) {
    run(`gh issue close ${issueUrl} --comment "Completed in commit 797b2de on feature branch."`);
  }

  try {
    run(
      `gh project item-add ${projectNumber} --owner ${projectOwner} --url ${issueUrl}`,
    );
    console.log(`  Added to project ${projectNumber}`);
  } catch {
    console.log("  Note: could not add to project (run: gh auth refresh -s project)");
  }
}

console.log(`\nDone. Created ${created.length} issues.`);
