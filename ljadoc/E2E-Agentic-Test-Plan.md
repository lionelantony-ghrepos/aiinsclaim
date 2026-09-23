# AI Insurance Claims (`aiinsclaim`) — End-to-End Agentic Testing Plan

**Product:** AI-native agentic insurance claims (Auto + Property/Home)  
**Repo:** `lionelantony-ghrepos/aiinsclaim`  
**GH Project:** https://github.com/users/lionelantony-ghrepos/projects/3/views/3  
**Owner (test function):** Q03-TEM / Team Test  
**Mode:** Plan only — no execution in this document  
**Date:** 2026-09-23 (IST)  
**Drive folder:** https://drive.google.com/drive/folders/11jjRgq54j2heNQHVjq7CTc9dyRoGSBpH

---

## 0. Goal

Repeatable, **harness-agnostic** E2E testing that:

1. Publishes **versioned, repo-committable seed packs** covering all PBI-001…020 features.
2. Loads them **idempotently** into the learning-stack target (**SQLite + Drizzle**, not InsForge).
3. Verifies behavior **like a user in the browser** (Playwright / agent browser) across all six demo roles.
4. Yields **observed** pass/fail with RTM to `ljadoc/TEST-PLAN.md` AC/TC — never invented results.
5. Can be re-run under Cursor, Claude Code, Codex, CI, or any agent stack via the prompts in §9.

**Out of scope this cycle:** paid cloud backends, live LLM text assertions (mock Gateway + schema/guardrail contracts only; one live smoke per agent max), Meridian/aitrad work (parked).

---

## 1. Sources of truth (do not invent)

| Artifact | Path | Use |
|---|---|---|
| PRD / PBIs 001–020 | `ljadoc/PRD.md` | Feature inventory |
| AC / TC SoT | `ljadoc/TEST-PLAN.md` | Gate; tick only after observed pass |
| Traceability | `ljadoc/kb/traceability.md` | PBI→AC→TC index (88 ACs / 92 TCs) |
| Business rules | `ljadoc/BUSINESS-RULES.md` | BR-* tables, parameters, expected bands |
| Data dictionary + seed volumes | `ljadoc/DATA-DICTIONARY.md` §6 | Pack design + verify counts |
| Architecture / APIs | `ljadoc/DESIGN.md`, `API-CONTRACTS.md` | Tech seams |
| Agent ops | `ljadoc/AGENT-OPS.md` | AGT-* contracts |
| User journeys | `ljadoc/08-User-Guide.md` | Browser scripts |
| As-built KB | `ljadoc/kb/as-built/PBI-*.md` | What shipped |
| Seed pipeline | `seed/` (`index.ts`, generators, loaders, assets, definitions) | Baseline fixtures |
| Local setup | `ljadev/README.md`, `AGENTS.md` | Env + demo accounts |

**Hard rules for every agent**

- Never invent rates, authority thresholds, fraud bands, STP limits, or expected values — cite BUSINESS-RULES / DATA-DICTIONARY / TEST-PLAN.
- Config/rules behavior is proven by **changing draft→activate rule versions or parameters**, not by editing application code.
- Hardcoded domain logic in app code = defect (raise to PE/AE).
- PII in parties/claims: never log full names/addresses; never commit secrets or real `.env`.
- Agent tests assert **schema conformance, guardrails, logging** — not exact LLM prose (mock AI Gateway fixtures).
- Demo password is for local demo only; do not paste secrets into group chat.

---

## 2. Environment matrix

| Env | Target | When |
|---|---|---|
| **Local (default)** | `npm run db:push` + `npm run seed` + `npm run dev` → `http://localhost:3000` | Full seed + browser E2E |
| **Unit/rules** | Vitest + rules fixtures | BR-* / state machine / authority |
| **Agent contract** | Vitest with mocked AI Gateway | AGT-* schema/guardrails |
| **CI** | GitHub Actions typecheck+lint+unit | Merge bar; E2E may be local Path B |

**Prereqs**

```bash
npm install
npm run db:push
npm run seed          # refuses if NODE_ENV=production
npm run seed:rules    # rules/parameters only
npm run seed:demo     # +3 pristine drafts for live walkthrough
npm run dev
```

Demo accounts (password `demo1234` per `ljadev/README.md`):  
`admin@demo.local`, `supervisor@demo.local`, `adjuster@demo.local`, `intake@demo.local`, `siu@demo.local`, `claimant@demo.local` (+ additional seeded users per §6.1).

---

## 3. RACI (Team Test)

| Workstream | R | A | C | I |
|---|---|---|---|---|
| Cadence / gates / residual risk | TEM | Lionel | CoS | Team |
| Versioned seed pack + inventory | TDE | TEM | BTPA/TTPA | TDS/QA |
| Idempotent SQLite load + verify | TDS | TEM | TDE | QA |
| Business scenarios BT-* | BTPA | TEM | TDE | QA |
| Tech cases TT-* (unit→e2e) | TTPA | TEM | PE | QA |
| Browser + Vitest execute + evidence | QA | TEM | BTPA/TTPA | Lionel |
| Defects in rules/runtime/UI | PE/AE | PDEM | TEM | QA |

**Anti-jobs:** TEM does not draft first-cut cases or invent fixtures. TDE does not load DBs. TDS does not design datasets. BTPA/TTPA do not execute. QA does not invent expected values.

**Note for TDS:** target is **SQLite/Drizzle** (`ljadev` DB path), not InsForge. Idempotent truncate+reload per DATA-DICTIONARY §6.

---

## 4. Feature coverage map (PBI → seed → browser)

### 4.1 Foundations (PBI-001–008)

| Capability | Seed | Browser / tech |
|---|---|---|
| Scaffold / CI | — | build, vitest, CI |
| Shell / a11y tokens | — | theme toggle; `/dev/components` axe |
| Auth + 6 roles | users (14) | Login each role → correct home; deep-link deny |
| Schema / append-only | full schema | Audit/history UPDATE fail |
| Seed pipeline | full §6 volumes | VERIFY counts |
| Rules engine + params | 9 BR sets @ v1, ~30 params | Admin simulate + activate |
| Claim state machine | claims across statuses | Illegal transitions rejected |
| Rules admin UI | rule versions | Draft → simulate → activate |

### 4.2 Intake → triage → fraud → HITL (PBI-009–014)

| Capability | Seed | Browser |
|---|---|---|
| FNOL wizard + AGT-INTAKE | drafts + STP-ready drafts | Intake agent assisted FNOL |
| Documents + AGT-EXTRACT | ~350 docs + extractions | Upload; confidence bands |
| Triage / STP + AGT-TRIAGE | route mix + ≥6 STP history | Submit → green/standard/complex |
| Fraud + AGT-FRAUD | banded fraud scores | SIU refer / clear |
| HITL queues | tasks for adjuster/supervisor | Worklist claim/complete |
| SLA + escalation | ~15 breached, 10 approaching | SLA sweep; escalation tiers |

### 4.3 Assessment → settlement → ops (PBI-015–018)

| Capability | Seed | Browser |
|---|---|---|
| Assessment + AGT-RESERVE | in_assessment claims | Suggest reserve → confirm; request info |
| Settlement / authority / pay | in_settlement + over-authority | Propose → approve/SIU block → pay → close/deny |
| Summary agent + timeline | summary_md | Timeline + AGT-SUMMARY |
| Ops dashboards + audit | mixed statuses | Supervisor ops; audit viewer |

### 4.4 Copilot / comms (PBI-019–020)

| Capability | Seed | Browser |
|---|---|---|
| AGT-COPILOT NL | seeded claims | Query under role scope; deny out-of-scope |
| AGT-COMMS draft | closed/paid samples | Draft letter; human send only |

---

## 5. Seed pack design (repo-committable)

### 5.1 Layout (TDE authors; TDS loads)

```
seed/                                    # existing generators/loaders (keep)
packs/aiinsclaim/v1.0/
  MANIFEST.json                          # version, source commit, READY|BLOCKED
  INVENTORY.md                           # what each fixture proves + citations
  expected-post-seed-counts.json         # from DATA-DICTIONARY §6.1–6.2
  users/                                 # stable IDs + roles/authority/specialties
  parties/
  policies/
  claims/                                # status/LOB/fraud/SLA/STP/authority examples
  documents/                             # refs into seed/assets/*
  rules/                                 # BR-* v1 snapshots + parameter defaults
  scenarios/                             # named contexts for BR/AGT tests (no invented rates)
  VERIFY.md
```

Prefer **extending** `seed/` generators with deterministic IDs (`seed/lib/deterministic-id.ts`) over parallel invent. Pack may be a **frozen export** of generator outputs at seed `42` for replay without re-running faker variance debates.

### 5.2 Expected verify counts (DATA-DICTIONARY §6)

| Entity | Count |
|---|---|
| users | 14 |
| parties | ~60 |
| policies | 40 (25 auto / 15 property; 34 active / 4 lapsed / 2 cancelled) |
| claims | 120 (status + LOB distribution per §6.2) |
| documents | ~350 |
| rule sets | 9 BR-* @ version 1 active (effective 2026-01-01) |
| parameters | ~30 |
| STP history | ≥6 green-lane auto-approved |
| STP demo drafts | ≥3 that pass STP on submit |
| Over-authority settlement | ≥3 with supervision tasks |
| SLA breached / approaching | ~15 / ~10 |

**Integrity:** every seeded route/fraud/reserve decision must come from **running the rules engine during seed** (real `rule_audit_log`), not faked outcomes.

### 5.3 Known risk flags (track; do not invent around)

| ID | Risk | Handling |
|---|---|---|
| BLK-LLM-TEXT | Exact LLM prose unstable | Mock Gateway; assert schema/guardrails only |
| BLK-PII-LOG | Party PII in logs | Redact; fail if full PII in evidence dumps |
| BLK-PROD-SEED | Seed in production | `assertNotProduction` must stay |
| GAP-LJAREQ | `ljareq/` may be thin vs `ljadoc/` | Prefer `ljadoc/*` as SoT until ljareq filled |

---

## 6. Execution phases (repeatable cycle)

```
Phase 0  Orient     TEM locks aiinsclaim + pack version + local env
Phase 1  Pack       TDE freezes packs/aiinsclaim/vX.Y (+ inventory)
Phase 2  Seed       TDS npm run seed / pack load; VERIFY counts + BR pins
Phase 3  Plan       BTPA BT-* + TTPA TT-* off TEST-PLAN + BUSINESS-RULES
Phase 4  Execute    QA: Vitest (F/R/A) → Playwright browser journeys by role
Phase 5  Gate       TEM residual risk; as-built/KB honesty; optional demo
```

**Stop conditions:** VERIFY fail; BR pin drift; P0 FAIL without Lionel waiver; secrets/PII in evidence.

---

## 7. Browser E2E journey pack (user-like)

| ID | Role | Journey | Negative / boundary |
|---|---|---|---|
| J-AUTH-01 | each role | Login → role home | Bad password; deep-link staff as claimant |
| J-ADM-01 | admin | Rules draft → simulate → activate | Activate note <10 chars fails |
| J-ADM-02 | admin | Parameter edit (e.g. stp.max_amount) | Non-admin 403 on /rules |
| J-INT-01 | intake | Assisted FNOL → submit | Invalid policy / incomplete wizard |
| J-DOC-01 | adjuster | Upload docs; view extraction | Low confidence blocks STP |
| J-TRI-01 | system/staff | Triage route + STP path | Complex/supervisor route |
| J-FRD-01 | siu | Fraud band + SIU queue | Clear vs confirm fraud |
| J-Q-01 | adjuster | Claim task from worklist | Unauthorized claim scope |
| J-SLA-01 | supervisor/admin | SLA sweep / escalation | Breached timer tiers |
| J-ASM-01 | adjuster | Assessment workbench; suggest reserve | Large reserve → supervisor |
| J-SET-01 | adjuster | Propose settlement within authority | Over-authority → supervisor task |
| J-SET-02 | supervisor | Approve over-authority; SIU hold blocks | Deny flow + confirmation |
| J-PAY-01 | adjuster/supervisor | Issue payment → paid → close | Close with open tasks fails |
| J-OPS-01 | supervisor | Ops dashboard + audit viewer | Claimant cannot open ops |
| J-AI-01 | staff | Copilot NL under scope | Out-of-scope deny |
| J-COM-01 | staff | Comms draft; human send only | Auto-send forbidden |

Evidence: Playwright trace/screenshot path + TC ids + observed outcome.

---

## 8. Pass / fail bars

| Gate | Clear when |
|---|---|
| **Seed** | VERIFY matches §6 counts (±documented tolerances); 9 BR sets active v1; parameters present |
| **Rules P0** | BR-* Vitest vectors PASS; state machine illegal transitions fail closed |
| **Browser P0** | J-AUTH-01 (all roles), J-INT-01, J-ASM-01, J-SET-01/02, J-PAY-01, J-ADM-01 |
| **Agent contract** | AGT-* schema/guardrail/logging tests PASS on fixtures |
| **Release** | P0 TCs for shipped PBIs green; as-built rows honest |

---

## 9. Copy-paste agent prompts

Defaults: `<REPO>=lionelantony-ghrepos/aiinsclaim`, `<PACK_VER>=v1.0`, `<BASE_URL>=http://localhost:3000`.

### 9.1 TEM

```
You are TEM for aiinsclaim (AI Insurance Claims). Cadence only unless asked to execute.
Lock: lionelantony-ghrepos/aiinsclaim, local SQLite/Drizzle, pack packs/aiinsclaim/<PACK_VER>.
SoT: ljadoc/TEST-PLAN.md, BUSINESS-RULES.md, DATA-DICTIONARY.md §6, seed/, kb/traceability.md.
Never invent rules/results. Do not draft first-cut cases or seed files. Do not ship app code.
Deliver: phase 0–5 checklist, open blockers, go/no-go seed→plan→execute, residual risk.
```

### 9.2 TDE

```
You are TDE for aiinsclaim. Read ljadoc/DATA-DICTIONARY.md §6, BUSINESS-RULES.md, seed/ generators,
and TEST-PLAN data notes. Produce packs/aiinsclaim/<PACK_VER>/ with MANIFEST + INVENTORY.

Requirements:
- Deterministic seed 42; stable IDs; CSV/JSON/SQL-ready exports covering users(14), parties(~60),
  policies(40), claims(120) with §6.2 distributions, documents(~350), 9 BR sets, ~30 parameters,
  STP / authority / SLA / fraud examples.
- Cite every field to dictionary/rules/seed code. Flag gaps; never invent rates or BR rows.
- Do NOT load the DB (TDS). Do NOT change schemas.
```

### 9.3 TDS

```
You are TDS for aiinsclaim. Load ONLY packs/aiinsclaim/<PACK_VER> (or npm run seed if pack is
generator-backed) into local SQLite (ljadev DB path). Idempotent truncate+reload.
Verify expected-post-seed-counts.json vs DATA-DICTIONARY §6. Confirm 9 BR-* active v1 and
parameters present. Refuse production. Report VERIFY_REPORT.json with row-level failures.
Do not invent fixtures or alter schema without explicit migration ownership.
```

### 9.4 BTPA

```
You are BTPA for aiinsclaim. From ljadoc/PRD.md, TEST-PLAN.md, BUSINESS-RULES.md, 08-User-Guide.md,
write BT-* tables: id | role | precondition | data | steps | expected | negative/boundary | audit | RTM(AC/TC/BR).
Cover: auth roles, FNOL, docs, triage/STP, fraud/SIU, queues, SLA, assessment/reserves,
settlement/authority/pay/close/deny, ops/audit, copilot/comms.
Never invent domain rules or results. Do not execute or write app code.
```

### 9.5 TTPA

```
You are TTPA for aiinsclaim. From DESIGN.md, API-CONTRACTS.md, BUSINESS-RULES.md, TEST-PLAN.md, AGENT-OPS.md,
write TT-* across unit, contract, integration, E2E:
rules hit-policies, parameters effective dating, claim state machine, scope/RLS-app-layer,
append-only audit, agent tool contracts (mocked Gateway), SLA sweep API, CFG-change proofs
(activate draft / change parameter → behavior change).
Never invent expected values. Flag hardcoded domain logic as defects. Do not execute or ship code.
```

### 9.6 QA

```
You are QA for aiinsclaim. Execute only after TDS VERIFY PASS and BTPA/TTPA packs exist.

1) Vitest: unit + rules + agent-contract (mocked Gateway).
2) Browser: journeys J-AUTH-01 … J-COM-01 (or Playwright under tests/) as real users on seeded app.
3) Update TEST-PLAN / as-built status ONLY for observed passes.
4) Evidence folder with traces; SUMMARY.md = PASS/FAIL/SKIP/BLOCKED.
5) No merges except Lionel. PII redacted in evidence.
```

### 9.7 Single-agent full cycle (harness-agnostic)

```
Run aiinsclaim E2E agentic test cycle on <REPO> (plan+execute):
A. Freeze packs/aiinsclaim/<PACK_VER> from seed/ + DATA-DICTIONARY §6 (no invented rules).
B. db:push + seed; WRITE VERIFY_REPORT + BR/parameter pins.
C. Generate BT-* and TT-* with RTM to TEST-PLAN.
D. Vitest then Playwright browser journeys for all roles.
E. Publish evidence + SUMMARY; tick only observed ACs/TCs.
F. Stop for human review before demo. Never commit secrets. Feature branch only.
```

---

## 10. Evidence template

```
/evidence/<date>-aiinsclaim-<PACK_VER>/
  VERIFY_REPORT.json
  BR_PINS.json
  vitest-summary.json
  browser/<journey-id>/{trace,png,log}
  SUMMARY.md
```

SUMMARY leads with: status, gaps, next move.

---

## 11. Immediate next actions (when Lionel says execute)

1. @Q01-TDE — cut `packs/aiinsclaim/v1.0` from `seed/` + DATA-DICTIONARY §6.  
2. @Q01-TDS — load SQLite; post VERIFY + BR pins.  
3. @Q02-BTPA / @Q02-TTPA — freeze BT-* / TT-*.  
4. @Q01-QA — Vitest + browser journeys; evidence pack.  
5. TEM — go/no-go + residuals.

---

## 12. Versioning

| Plan ver | Date | Notes |
|---|---|---|
| 1.0 | 2026-09-23 | Initial AI Insurance Claims agentic E2E plan + prompts |

Bump pack MANIFEST and this plan together when seed shape or BR pins change.
