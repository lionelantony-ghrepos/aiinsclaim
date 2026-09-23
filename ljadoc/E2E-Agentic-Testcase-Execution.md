# Agentic E2E Testcase Execution

**Repository:** `lionelantony-ghrepos/aiinsclaim`  
**Canonical test definitions:** [`TEST-PLAN.md`](TEST-PLAN.md)  
**Operating plan:** [`E2E-Agentic-Test-Plan.md`](E2E-Agentic-Test-Plan.md)  
**Traceability:** [`kb/traceability.md`](kb/traceability.md)  
**Execution model:** one canonical testcase per execution issue

## 1. Purpose and scope

This document turns the 92 canonical test cases into repeatable execution units. It
defines how Team Test prepares the local SQLite/Drizzle learning stack, runs one
testcase, records observed evidence, and updates GitHub without changing the
canonical testcase definition.

This document covers:

- deterministic local seed and verification;
- Vitest, Playwright, accessibility, rules, and mocked-agent execution;
- GitHub execution issues linked to the existing canonical testcase issues;
- evidence, redaction, failure classification, rerun, and release-gate rules;
- the complete PBI-001 through PBI-020 testcase inventory.

This document does not add application behavior, alter business rules, create live
LLM dependencies, or claim that any testcase passed. A pass is valid only when an
execution issue contains observed results and evidence.

## 2. Source-of-truth hierarchy

Use sources in this order when they disagree:

1. [`DATA-DICTIONARY.md`](DATA-DICTIONARY.md) for schema and seed shape.
2. [`API-CONTRACTS.md`](API-CONTRACTS.md) for payloads and boundaries.
3. [`DESIGN.md`](DESIGN.md) for architecture and lifecycle.
4. [`BUSINESS-RULES.md`](BUSINESS-RULES.md) for decision tables and parameters.
5. [`TEST-PLAN.md`](TEST-PLAN.md) for ACs and canonical TC definitions.
6. [`E2E-Agentic-Test-Plan.md`](E2E-Agentic-Test-Plan.md) for the end-to-end operating
   cycle and browser journeys.
7. [`kb/as-built/`](kb/as-built/) for shipped behavior and known deviations.

If a testcase, implementation, or seed fixture disagrees with a higher source,
record the discrepancy as `Blocked: specification/data gap`. Do not silently
rewrite an expected result. The PBI-004 reference to a fresh InsForge project is
tracked as such a discrepancy: this learning stack executes against SQLite +
Drizzle, as defined by ADR-0002 and DESIGN §3.1.

## 3. Identifier and GitHub relationship

The stable relationship is:

```text
PBI → AC → TC → canonical testcase issue → execution issue → evidence
```

The existing issues #21–112 are canonical testcase records. They remain closed or
open according to their definition lifecycle and are not reused as run history.
Every run creates a new execution issue for exactly one canonical TC:

```text
ETC-<cycle>-<TC-ID>: <short observed execution title>
```

Example:

```text
ETC-2026-09-23-TC-003-01: execute all-role login and role-home routing
```

The execution issue body must link both the canonical testcase issue and the
commit/branch under test. A rerun creates a new execution issue with a new cycle
identifier; it never overwrites the original observation.

### Required GitHub labels and fields

Apply:

- `test-case`;
- the type label matching the canonical TC: `test-functional`, `test-rules`,
  `test-agent`, `test-ui`, or `test-negative`;
- the applicable phase label: `phase-0`, `phase-1`, `phase-2`, or `phase-3`;
- `bug` only when a reproducible product defect is opened;
- `accessibility` when the observed failure is an accessibility defect.

The execution issue must contain:

| Field | Required value |
|---|---|
| Cycle | `YYYY-MM-DD` or a unique CI run identifier |
| Canonical TC | `TC-NNN-NN` and link to issue #21–112 |
| PBI / AC | PBI and exactly one AC from `TEST-PLAN.md` |
| Type | `[F]`, `[R]`, `[A]`, `[U]`, or `[N]` |
| Commit | tested commit SHA and branch |
| Environment | OS, Node version, browser, base URL, DB path |
| Seed | pack version, seed command, verification result |
| Command | exact command(s) executed |
| Expected | copied from the canonical source |
| Observed | factual result, including actual counts/status/error |
| Evidence | repository-relative or CI artifact links |
| Result | `PASS`, `FAIL`, `BLOCKED`, or `SKIPPED` |
| Defect | linked bug issue when result is `FAIL` |

## 4. Execution states

Use one of these states in the GitHub Project and issue body:

| State | Meaning | Close issue? |
|---|---|---|
| `Ready` | Preconditions are satisfied and no execution has started | No |
| `In Progress` | The single testcase is actively being run | No |
| `PASS` | Expected behavior was observed and evidence is attached | Yes |
| `FAIL` | Expected behavior was not observed and a reproducible defect is linked | Yes, after triage |
| `BLOCKED` | Execution could not start or complete because of environment, data, or spec gap | No; keep open |
| `SKIPPED` | TEM approved that the testcase is outside the current release gate | Yes, with approval link |

`PASS` is not inferred from an existing unit test, an as-built status, a closed
canonical issue, or a green neighboring testcase. The exact execution must be
observed for the tested commit and environment.

## 5. Preconditions and preflight

Run preflight once for a cycle. Capture the output in
`evidence/<date>-aiinsclaim-<pack>/VERIFY_REPORT.json` and reference it from each
execution issue.

```powershell
npm install
npm run typecheck
npm run lint
npm run db:push
npm run seed
npm run docs:kb-check
```

For a browser cycle, start the app with the Playwright web server configuration or:

```powershell
npm run dev
```

The preflight is valid only when:

- the target is local SQLite at `ljadev/data/aiinsclaim.db`;
- `NODE_ENV` is not `production`;
- the seed is deterministic and its counts/distributions are recorded;
- the expected mock Gateway fixtures are available;
- the tested branch and commit are recorded;
- no secrets or unredacted PII are placed in logs, screenshots, traces, or issues.

If the seed or preflight fails, stop the cycle and mark dependent executions
`BLOCKED`. Do not execute against partially seeded data.

## 6. One-test-at-a-time runbook

### 6.1 Select the next testcase

1. Choose the first `Ready` inventory row whose dependencies are green.
2. Create one execution issue using the template in §7.
3. Set the issue and Project item to `In Progress`.
4. Confirm the canonical AC, expected result, fixture IDs, and exact command.
5. Do not combine another TC into the same issue, even if the same process run
   exercises it incidentally.

Recommended dependency order:

1. build, unit, seed, and schema gates (PBI-001–005);
2. rules and state foundations (PBI-006–008);
3. intake through SLA (PBI-009–014);
4. assessment through dashboards (PBI-015–018);
5. copilot and communications (PBI-019–020);
6. repeat the P0 browser journeys after dependencies are green.

### 6.2 Execute exactly the selected testcase

Use the command from the inventory. Typical commands are:

```powershell
# A Vitest testcase
npx vitest run tests/<path>/<test-file>.test.ts

# A Playwright testcase
npx playwright test tests/e2e/<pbi-file>.spec.ts --project=chromium

# The complete unit suite, only when the testcase explicitly requires it
npm test

# The complete browser suite, only when the testcase explicitly requires it
npm run test:e2e
```

For browser tests, retain the Playwright trace, screenshot, and console/network
output required by the issue. For agent tests, use mocked Gateway fixtures and
assert schema conformance, guardrails, provenance, and logging; never assert
unstable LLM prose.

### 6.3 Record the observation

Update only the execution issue:

- exact command and exit status;
- actual UI/API/database observation;
- expected-versus-observed comparison;
- evidence paths;
- test commit and environment;
- result and defect/blocker links.

For `PASS`, close the execution issue and leave the canonical TC unchanged unless
the repository's traceability/as-built protocol explicitly requires a status
update. For `FAIL`, link a bug with reproduction evidence. For `BLOCKED`, state
the precise unblock condition and leave the execution issue open.

### 6.4 Rerun

Create a new execution issue for every rerun, using a new cycle ID and linking the
original execution issue. Preserve the original evidence. A rerun may supersede
the release decision, but it does not erase the historical result.

## 7. Execution issue template

Copy this body into a new GitHub execution issue:

```markdown
## Execution

| Field | Value |
|---|---|
| Cycle | `YYYY-MM-DD` |
| Canonical TC | `TC-NNN-NN` — [canonical issue](URL) |
| PBI / AC | `PBI-NNN` / `AC-NNN-NN` |
| Type | `[F]` / `[R]` / `[A]` / `[U]` / `[N]` |
| Commit / branch | `<sha>` / `<branch>` |
| Environment | `<OS>`, Node `<version>`, Chromium `<version>` |
| Database | `ljadev/data/aiinsclaim.db` |
| Seed / pack | `<pack version>`; `<verification link>` |

## Given / When / Then

**Given:** <preconditions and fixture IDs>

**When:** <single testcase action>

**Then:** <expected result copied from TEST-PLAN.md>

## Execution command

```powershell
<exact command>
```

## Observed result

- Start/end: `<timestamps>`
- Exit status: `<status>`
- Expected: `<factual expected result>`
- Observed: `<factual observation>`

## Evidence

- `<relative path or CI artifact>`
- `<trace/screenshot/log/JSON path when applicable>`

## Result

`PASS` / `FAIL` / `BLOCKED` / `SKIPPED`

## Defects and follow-up

- Canonical TC: `<unchanged link>`
- Defect/blocker: `<issue link or none>`
- Rerun of: `<execution issue link or none>`
```

## 8. Evidence and redaction

Use this cycle layout:

```text
evidence/<date>-aiinsclaim-<pack>/
  VERIFY_REPORT.json
  BR_PINS.json
  vitest-summary.json
  browser/<TC-ID>/{trace.zip,screenshot.png,console.log}
  agent/<TC-ID>/{gateway-fixture.json,agent-run.json}
  SUMMARY.md
```

Evidence must contain IDs, statuses, rule/version identifiers, timestamps, and
reproducible commands. Redact names, emails, phone numbers, addresses, narrative
PII, session cookies, secrets, and authorization headers. Never attach `.env`.
When evidence cannot be safely redacted, record the result as `BLOCKED` and
describe the missing safe artifact.

## 9. Failure classification

| Classification | Use when | Required action |
|---|---|---|
| Product defect | Code produces a reproducible result contrary to the canonical expected behavior | Open/link `bug`; include minimal reproduction and evidence |
| Test defect | The executable test does not represent the canonical TC | Fix the test in a separate change; do not mark product pass |
| Environment blocker | Dependencies, browser, DB, port, or credentials prevent execution | Mark `BLOCKED`; record exact setup failure |
| Seed/data gap | Required fixture/count/distribution is absent or invalid | Mark `BLOCKED`; link seed/data issue |
| Specification gap | SoT documents conflict or expected behavior is undefined | Mark `BLOCKED`; request product/architecture decision |
| Expected failure | A negative testcase correctly rejects the invalid operation | Mark `PASS`; record the rejection and no-side-effect evidence |

An agent timeout, schema-invalid response, or prompt-injection fixture is not
automatically a product defect. Apply the canonical fallback/guardrail expected
by the relevant AC and record the observed contract.

## 10. Cycle summary and release gates

Commit a summary at `evidence/<date>-aiinsclaim-<pack>/SUMMARY.md`:

```markdown
# E2E Agentic Test Cycle

- Cycle:
- Commit:
- Seed/pack:
- Environment:
- Scope:

## Totals

- PASS:
- FAIL:
- BLOCKED:
- SKIPPED:

## P0 gate

- Seed verification:
- Rules golden tests:
- Agent contract tests:
- Auth for all six roles:
- FNOL:
- Assessment:
- Settlement authority:
- Payment/closure:
- Admin rule lifecycle:

## Defects and blockers

- `<issue link>` — `<classification and next action>`

## Next testcase

- `<TC-ID>` — `<reason it is next>`
```

Release is clear only when seed verification passes, all required P0 TCs are
observed green, agent contracts pass against fixtures, no unresolved P0 defect
exists, and the TEM records residual risk. PBI-017 and PBI-018 remain subject to
their as-built status and must not be treated as shipped solely because a
canonical issue is closed.

## 11. Complete execution inventory

Every row below maps one canonical TC to exactly one AC and one existing canonical
GitHub issue. The command is the execution category; the exact path/selector is
confirmed in the execution issue before running.

### PBI-001 — Scaffolding

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-001-01 | AC-001-01 | [F] | [#21](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/21) | `npm run build` | build log |
| TC-001-02 | AC-001-02 | [F] | [#22](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/22) | `npm test` | Vitest summary |
| TC-001-03 | AC-001-03 | [F] | [#23](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/23) | CI workflow | CI run URL |

### PBI-002 — Design tokens and shell

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-002-01 | AC-002-01 | [U] | [#24](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/24) | Playwright UI | screenshots + trace |
| TC-002-02 | AC-002-02 | [U] | [#25](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/25) | Playwright + axe | axe report |
| TC-002-03 | AC-002-03 | [U] | [#26](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/26) | Playwright keyboard | trace + screenshot |

### PBI-003 — Auth and roles

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-003-01 | AC-003-01 | [F] | [#27](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/27) | `npx playwright test tests/e2e/pbi-003.spec.ts` | trace + role matrix |
| TC-003-02 | AC-003-02 | [N] | [#28](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/28) | Playwright deep-link | trace + response |
| TC-003-03 | AC-003-03 | [N] | [#29](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/29) | Playwright auth redirect | trace |
| TC-003-04 | AC-003-04 | [N] | [#30](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/30) | Playwright sign-out | trace |

### PBI-004 — Data model and scope

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-004-01 | AC-004-01 | [F] | [#31](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/31) | Vitest/schema probe | schema output |
| TC-004-02 | AC-004-02 | [N] | [#32](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/32) | Vitest scope probe | query result |
| TC-004-03 | AC-004-03 | [N] | [#33](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/33) | Vitest rules-write probe | rejection + audit |
| TC-004-04 | AC-004-04 | [N] | [#34](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/34) | Vitest append-only probe | rejection |
| TC-004-05 | AC-004-05 | [N] | [#35](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/35) | Vitest constraint probe | rejection |

### PBI-005 — Seed pipeline

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-005-01 | AC-005-01 | [F] | [#36](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/36) | `npm run seed` + verify | count report |
| TC-005-02 | AC-005-02 | [R] | [#37](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/37) | seed distribution verify | distribution report |
| TC-005-03 | AC-005-03 | [R] | [#38](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/38) | seed audit verify | BR pins |
| TC-005-04 | AC-005-04 | [F] | [#39](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/39) | seed twice + diff | deterministic diff |
| TC-005-05 | AC-005-05 | [N] | [#40](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/40) | production guard probe | refusal log |

### PBI-006 — Rules engine

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-006-01 | AC-006-01 | [R] | [#41](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/41) | Vitest golden vectors | test summary |
| TC-006-02 | AC-006-02 | [R] | [#42](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/42) | Vitest effective-date vectors | test summary |
| TC-006-03 | AC-006-03 | [N] | [#43](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/43) | Vitest schema errors | error + audit count |
| TC-006-04 | AC-006-04 | [R] | [#44](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/44) | Vitest audit assertions | audit row |
| TC-006-05 | AC-006-05 | [R] | [#45](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/45) | Vitest hit-policy vectors | test summary |
| TC-006-06 | AC-006-06 | [N] | [#46](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/46) | Vitest no-active-version | typed error |

### PBI-007 — State machine

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-007-01 | AC-007-01 | [F] | [#47](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/47) | Vitest transition matrix | history row |
| TC-007-02 | AC-007-02 | [N] | [#48](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/48) | Vitest illegal transitions | typed error |
| TC-007-03 | AC-007-03 | [R] | [#49](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/49) | Vitest document guard | missing-doc result |
| TC-007-04 | AC-007-04 | [R] | [#50](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/50) | Vitest DB transition toggle | rejection |

### PBI-008 — Rules admin UI

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-008-01 | AC-008-01 | [F] | [#51](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/51) | Playwright admin lifecycle | trace + DB rows |
| TC-008-02 | AC-008-02 | [R] | [#52](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/52) | Playwright simulation | output + audit count |
| TC-008-03 | AC-008-03 | [R] | [#53](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/53) | Playwright activation | version rows |
| TC-008-04 | AC-008-04 | [R] | [#54](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/54) | Playwright parameter proof | block reason |
| TC-008-05 | AC-008-05 | [U] | [#55](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/55) | Playwright + axe | audit + axe report |

### PBI-009 — FNOL wizard

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-009-01 | AC-009-01 | [F] | [#56](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/56) | Playwright wizard matrix | traces |
| TC-009-02 | AC-009-02 | [F] | [#57](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/57) | Playwright autosave | trace + draft row |
| TC-009-03 | AC-009-03 | [N] | [#58](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/58) | Playwright completeness | missing list |
| TC-009-04 | AC-009-04 | [A] | [#59](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/59) | Playwright + agent fixture | agent run + trace |
| TC-009-05 | AC-009-05 | [F] | [#60](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/60) | Playwright intake/claimant | claim scope |
| TC-009-06 | AC-009-06 | [A] | [#61](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/61) | agent injection fixture | no state change |

### PBI-010 — Document extraction

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-010-01 | AC-010-01 | [F] | [#62](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/62) | Playwright upload | storage/document rows |
| TC-010-02 | AC-010-02 | [A] | [#63](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/63) | Gateway fixture + Vitest | extraction rows |
| TC-010-03 | AC-010-03 | [F] | [#64](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/64) | Gateway fixture + UI | HITL task |
| TC-010-04 | AC-010-04 | [F] | [#65](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/65) | Playwright verification | task resolution |
| TC-010-05 | AC-010-05 | [N] | [#66](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/66) | Gateway failure fixture | fallback task |
| TC-010-06 | AC-010-06 | [A] | [#67](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/67) | injection fixture | schema-only output |

### PBI-011 — Triage and STP

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-011-01 | AC-011-01 | [R] | [#68](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/68) | Vitest triage matrix | route/priority |
| TC-011-02 | AC-011-02 | [A] | [#69](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/69) | orchestration fixture | full audit chain |
| TC-011-03 | AC-011-03 | [F] | [#70](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/70) | Vitest STP blocks | reason code |
| TC-011-04 | AC-011-04 | [F] | [#71](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/71) | orchestration re-triage | superseding audits |
| TC-011-05 | AC-011-05 | [N] | [#72](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/72) | schema-failure fixture | review task |

### PBI-012 — Fraud scoring

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-012-01 | AC-012-01 | [R] | [#73](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/73) | Vitest fraud golden | score/band/reasons |
| TC-012-02 | AC-012-02 | [R] | [#74](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/74) | Vitest band actions | tasks/hold |
| TC-012-03 | AC-012-03 | [A] | [#75](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/75) | agent fixture assertions | evidence quotes |
| TC-012-04 | AC-012-04 | [F] | [#76](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/76) | Playwright SIU flow | disposition/hold |
| TC-012-05 | AC-012-05 | [F] | [#77](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/77) | re-triage fixture | history rows |
| TC-012-06 | AC-012-06 | [N] | [#78](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/78) | agent proposal guard | rules-derived band |

### PBI-013 — Task queues

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-013-01 | AC-013-01 | [F] | [#79](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/79) | Playwright queue | order/filter trace |
| TC-013-02 | AC-013-02 | [F] | [#80](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/80) | Playwright/API scope | visible rows + probe |
| TC-013-03 | AC-013-03 | [F] | [#81](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/81) | Playwright accept | task + agent outcome |
| TC-013-04 | AC-013-04 | [N] | [#82](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/82) | Playwright/API override | rejection/resolution |
| TC-013-05 | AC-013-05 | [F] | [#83](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/83) | Playwright bulk reassign | notification/audit |
| TC-013-06 | AC-013-06 | [U] | [#84](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/84) | Playwright keyboard | trace + axe |

### PBI-014 — SLA and escalation

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-014-01 | AC-014-01 | [R] | [#85](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/85) | Vitest injected clock | timer rows |
| TC-014-02 | AC-014-02 | [F] | [#86](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/86) | Vitest pause/resume | timer state |
| TC-014-03 | AC-014-03 | [R] | [#87](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/87) | Vitest escalation tiers | notifications/tasks |
| TC-014-04 | AC-014-04 | [N] | [#88](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/88) | Vitest sweep twice | no duplicate |
| TC-014-05 | AC-014-05 | [N] | [#89](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/89) | endpoint probe | 401/admin result |

### PBI-015 — Assessment and reserves

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-015-01 | AC-015-01 | [F] | [#90](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/90) | Playwright workbench | trace/screenshots |
| TC-015-02 | AC-015-02 | [R] | [#91](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/91) | Vitest coverage fixtures | math output |
| TC-015-03 | AC-015-03 | [R] | [#92](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/92) | agent/rules fixture | suggestion/confirm |
| TC-015-04 | AC-015-04 | [F] | [#93](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/93) | Playwright reserve change | supervisor task |
| TC-015-05 | AC-015-05 | [R] | [#94](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/94) | Playwright doc gate | transition result |

### PBI-016 — Settlement and payments

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-016-01 | AC-016-01 | [R] | [#95](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/95) | Vitest authority fixture | supervision task |
| TC-016-02 | AC-016-02 | [R] | [#96](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/96) | Vitest authority matrix | approval result |
| TC-016-03 | AC-016-03 | [N] | [#97](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/97) | Playwright SIU hold | blocked reason |
| TC-016-04 | AC-016-04 | [F] | [#98](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/98) | Playwright payment path | payment/closure rows |
| TC-016-05 | AC-016-05 | [F] | [#99](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/99) | Playwright denial path | reason/notification |

### PBI-017 — Summary and timeline

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-017-01 | AC-017-01 | [A] | [#100](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/100) | agent fixture + Playwright | summary/provenance |
| TC-017-02 | AC-017-02 | [F] | [#101](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/101) | Playwright timeline | trace/drill-down |
| TC-017-03 | AC-017-03 | [A] | [#102](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/102) | failure fixture | stale summary |

### PBI-018 — Dashboards and audit viewer

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-018-01 | AC-018-01 | [F] | [#103](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/103) | Vitest KPI + Playwright | SQL comparison |
| TC-018-02 | AC-018-02 | [N] | [#104](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/104) | Playwright role gate | redirect/deny |
| TC-018-03 | AC-018-03 | [F] | [#105](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/105) | Playwright audit chain | CSV + trace |
| TC-018-04 | AC-018-04 | [U] | [#106](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/106) | Playwright + axe | axe report |

### PBI-019 — Copilot

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-019-01 | AC-019-01 | [A] | [#107](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/107) | Vitest agent contract | SQL/result schema |
| TC-019-02 | AC-019-02 | [N] | [#108](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/108) | Vitest mutation guard | refusal/read-only proof |
| TC-019-03 | AC-019-03 | [N] | [#109](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/109) | Vitest timeout/limit | guardrail result |

### PBI-020 — Communications drafter

| TC | AC | Type | Canonical issue | Command | Evidence |
|---|---|---|---:|---|---|
| TC-020-01 | AC-020-01 | [A] | [#110](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/110) | Playwright + agent fixture | editable draft/no send |
| TC-020-02 | AC-020-02 | [F] | [#111](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/111) | Vitest persistence | agent run row |
| TC-020-03 | AC-020-03 | [A] | [#112](https://github.com/lionelantony-ghrepos/aiinsclaim/issues/112) | Vitest schema contract | tone/reading result |

## 12. Change control

Changes to this document must preserve the one-row-per-TC inventory and must
explain any change to identifiers, source links, expected behavior, evidence, or
execution order. Changes to canonical expected behavior belong in
[`TEST-PLAN.md`](TEST-PLAN.md) and the relevant PBI/as-built record; do not hide
them in an execution issue.
