# pbi-autopilot profile — aiinsclaim

Project profile for the global `pbi-autopilot` skill (install: https://github.com/lionelantony-ghrepos/pbi-autopilot). The skill holds the pipeline, gates, escalation rules, and generic role charters; this file holds everything aiinsclaim-specific and **overrides the skill where they differ**.

## Ticket

- Ticket ID: `PBI-NNN` (from the user's prompt)
- Ticket issue and TC issues: look up in `ljadoc/kb/traceability.md` (columns "GitHub PBI" and "Test case issues")
- Dependencies: "Depends on" in `ljadoc/PRD.md` §PBI-NNN; done = status `Shipped` in `ljadoc/kb/INDEX.md`

## Settings

- BASE_BRANCH: current integration branch (ask if unclear; `main` otherwise)
- REPO: `lionelantony-ghrepos/aiinsclaim`
- AUTO_MERGE: false
- MAX_FIX_LOOPS: 3
- Run folder: `ljadev/runs/PBI-NNN/` (gitignored)
- Branch: `pbi-NNN-short-slug`
- Commits: Conventional Commits with PBI ref, e.g. `feat(pbi-NNN): queue ordering and filters`

## Sources

- Conventions: `AGENTS.md`, `ljadoc/AGENTS.md`, `.cursor/rules/aiinsclaim.mdc`, `ljadoc/00-MAIN-PROMPT.md`
- Requirements: `ljadoc/PRD.md` §PBI-NNN (including its Cursor prompt and Out of scope)
- AC/TC: `ljadoc/TEST-PLAN.md` (`AC-NNN-xx`, `TC-NNN-xx`); matrix in `ljadoc/kb/traceability.md`
- Design: `ljadoc/DESIGN.md` · Rules: `ljadoc/BUSINESS-RULES.md` · Data: `ljadoc/DATA-DICTIONARY.md` · API: `ljadoc/API-CONTRACTS.md` · Agents: `ljadoc/AGENT-OPS.md`
- Doc precedence: DATA-DICTIONARY > API-CONTRACTS > DESIGN > PRD; unresolved → `// QUESTION(pbi-NNN):` + most conservative reading
- KB: `ljadoc/kb/INDEX.md`, dependency `ljadoc/kb/as-built/PBI-*.md`, template `ljadoc/kb/_template-as-built.md`
- Next.js: this is a newer Next.js than training data — read `node_modules/next/dist/docs/` before using its APIs

## Commands

- Fast verify: `npm run typecheck && npm run lint && npm run test`
- Full verify: fast verify + `npm run test:e2e` + fresh-DB `npm run db:push` + `npm run seed` + axe on new pages
- Doc checks: `npm run docs:generate` (only if packages or `src/lib/schemas` changed), `npm run docs:kb-check`

## Edit zones

- CODE: `src/**`, `seed/**`, `ljadev/drizzle/**` (new migrations only), `.env.example`
- TEST: `tests/**` (unit mirrors `src/`; e2e `tests/e2e/pbi-NNN.spec.ts`; gateway fixtures `tests/fixtures/gateway/`)
- DOC: `ljadoc/kb/**`, `ljadoc/08-User-Guide.md`, `ljadev/update-pbi-issues.ts` (`done` flag only)
- Never edit: `ljadoc/PRD.md`, `ljadoc/DESIGN.md`, `ljadoc/TEST-PLAN.md` (record disagreements in as-built "Shipped vs spec")
- Never commit: `ljadev/*.db*`, `ljadev/data/*.db*`, `ljadev/storage/claim-documents/**`, `ljadev/runs/`

## Close-out

- "Done" lives in: PBI issue closed (`Closes #N` in PR body) · TC issues commented (test file + PR link) and closed on merge · `ljadoc/kb/INDEX.md` status `Shipped` · `done: true` for the PBI in `ljadev/update-pbi-issues.ts`
- Review gate: follow the `grok-bot-review-gate` skill before marking the PR ready

## Project-specific overrides

**SPEC:** `brief.md` lists BR-* IDs and `parameters` keys only — never literal thresholds. Copy the PRD "Out of scope" verbatim.

**TEST (author):** put the TC ID in every `describe`/`it` title. Rules golden tests per BUSINESS-RULES worked examples when rules are touched. Agent contract tests use `tests/fixtures/gateway/` — never the live gateway. `@axe-core/playwright` check on each new page.

**CODE:** every server action starts with `requireRole` then Zod parse; schemas only in `src/lib/schemas/`; DB only via `src/lib/db/` helpers (Drizzle, no raw SQL in components/actions); every query scoped via `src/lib/auth/scope.ts`; business values from `parameters`/BR-* decision tables or `src/lib/rules/`; append-only tables get INSERT-only helpers; `Result<T>` envelopes, no stack traces to clients; no PII in logs (IDs only, `redactForAgent()` before agent calls); Tailwind + shadcn/ui + CSS-var tokens, lucide-react icons; no `any`, no `@ts-ignore`.

**REVIEW:** in addition to the generic checklist, check every golden rule and the Definition of Done in `ljadoc/AGENTS.md`, and a11y: labels, visible focus, `aria-live` for async status, status = icon + label.

**DOC:** fill every heading of `_template-as-built.md` (shipped vs spec, surfaces, contracts, BR-* IDs only, ops, AC/TC trace with test file paths); ADR in `ljadoc/kb/adr/` only if a durable choice is missing from DESIGN.md; patch `08-User-Guide.md` only for user-visible UI; never index `ljadoc/` into claims RAG.

**PR:** docs, code and tests in the same commit set; PR body includes AC/TC table with test file links, verification evidence, `QUESTION(pbi-NNN)` notes, out-of-scope confirmation.
