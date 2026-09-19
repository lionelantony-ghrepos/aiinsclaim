# AGENTS.md — Conventions for Coding Agents

Rules every coding agent must follow when building aiinsclaim. Read DESIGN.md first; this file governs *how* you write, DESIGN governs *what*.

## Main prompt

> You are building **aiinsclaim**, an AI-native agentic insurance claims system (Auto + Property, learning stack on mock data). Obey `.cursor/rules/` and this file. Read `DESIGN.md` and `BUSINESS-RULES.md` before coding. Read `kb/INDEX.md` and dependency as-built files for the current PBI. TypeScript strict; Zod-validate all boundaries. No business logic hard-coded in components — logic lives in BR-* decision tables or `src/lib/rules/`. Write Vitest/Playwright tests per `TEST-PLAN.md` TC IDs; update `kb/as-built/PBI-NNN.md` when tests pass.

Full copy-paste version: [00-MAIN-PROMPT.md](00-MAIN-PROMPT.md). Cursor loads `.cursor/rules/aiinsclaim.mdc` automatically.

## Golden rules

1. **No hard-coded business values.** Thresholds, durations, limits, amounts → `parameters` table or decision tables (BUSINESS-RULES.md). If you type a business number into TS/TSX, stop and move it.
2. **One PBI per session.** Build exactly the scoped PBI; its "Out of scope" list is binding. Don't refactor neighbors opportunistically.
3. **Docs are canonical.** On conflict: DATA-DICTIONARY (schema) > API-CONTRACTS (payloads) > DESIGN (architecture) > PRD (feature detail). If truly ambiguous, add a `// QUESTION(pbi-xxx):` comment and choose the most conservative reading.
4. **Self-verify before done:** run `npm run typecheck && npm run lint && npm run test`, seed if schema changed, then execute the PBI's acceptance checks (TEST-PLAN).
5. **Knowledge base (required every PBI):** read [kb/INDEX.md](kb/INDEX.md) and dependency as-built files before coding. After shipping, update `ljadoc/kb/as-built/PBI-NNN.md` in the **same commit** as code. Run `npm run docs:generate` if packages or `src/lib/schemas` changed; run `npm run docs:kb-check`. Patch `08-User-Guide.md` only if user-visible UI shipped. Do not index `ljadoc/` or `ljadoc/kb/` into any future claims RAG unless explicitly scheduled.

## Stack & structure

- Next.js App Router, TypeScript `strict`; no `any`, no `@ts-ignore` (use `@ts-expect-error` with reason if unavoidable).
- Folder layout per DESIGN §11 — never introduce new top-level dirs.
- Server Components by default; `"use client"` only for interactivity; data mutations only via server actions in `src/app/**/actions.ts` or `src/lib/**`.
- All validation via shared Zod schemas in `src/lib/schemas/` — never inline-duplicate a schema.
- DB access only through `src/lib/db/` helpers (Drizzle); no raw SQL in components/actions.
- Access control via `src/lib/auth/scope.ts` — SQLite has no RLS; every query must respect user role.
- Styling: Tailwind + shadcn/ui + CSS-var tokens; no raw hex/px colors in components; icons from lucide-react.

## Naming

- Files kebab-case; components PascalCase; hooks `useX`; server actions verbNoun (`resolveTask`); DB snake_case; enums singular (`claim_status`); IDs in code `claimId` style.
- Branches `pbi-XXX-short-slug`; commits Conventional Commits with PBI ref: `feat(pbi-013): queue ordering and filters`.

## Schema (Drizzle + SQLite)

- Schema lives in `src/lib/db/schema/`; sync with `npm run db:push` (dev) or `npm run db:generate` (migration files → `ljadev/drizzle/`).
- One logical change per schema update; never edit applied migration SQL after commit.
- Every new table: add to Drizzle schema with `created_at/updated_at`, FKs, and scope checks in query helpers.
- Append-only tables (`claim_state_history`, `rule_audit_log`, `agent_runs`, `audit_log`): expose INSERT-only helpers; no update/delete functions.

## Testing

- Vitest unit tests colocated in `/tests` mirroring `src/`; rules golden tests per BUSINESS-RULES worked examples are mandatory when touching rules.
- Agent code: contract tests against fixtures in `/tests/fixtures/gateway/` (never call live gateway in CI default).
- Playwright e2e per PBI acceptance flows in `/tests/e2e/pbi-XXX.spec.ts`.
- A PBI is done only when its TEST-PLAN ACs have executable tests and pass.

## Security & logging

- Never log PII (names, emails, addresses, phone, narratives) — log IDs; use `redactForAgent()` before agent calls.
- Secrets only via env; never committed; `.env.example` updated when adding vars.
- Every server action starts with auth check (`requireRole`) then Zod parse; trust nothing from the client, including role claims in UI state.
- Errors returned as `Result<T>` envelopes (API-CONTRACTS); never leak stack traces to clients.

## Accessibility (standing AC)

Keyboard operability, visible focus, labels on all inputs, aria-live for async status, contrast via tokens, status = icon + label (never color-only). Run axe on new pages.

## Knowledge base

Before each PBI session:

1. Read [kb/INDEX.md](kb/INDEX.md) and as-built files for **dependency PBIs**
2. Read [kb/traceability.md](kb/traceability.md) for AC/TC IDs

After shipping:

1. Copy [kb/_template-as-built.md](kb/_template-as-built.md) → `kb/as-built/PBI-NNN.md` (or update existing)
2. Fill all required headings with facts (shipped vs spec, surfaces, contracts, BR-* IDs only, ops, trace)
3. Update [kb/INDEX.md](kb/INDEX.md) status column if needed
4. Add [kb/adr/](kb/adr/) only if a durable choice is missing from DESIGN.md
5. Run `npm run docs:generate` if schemas/packages changed; `npm run docs:kb-check`

## Definition of Done (every PBI)

- [ ] Scope matches PRD; out-of-scope untouched
- [ ] typecheck + lint + unit + e2e green; axe clean on new pages
- [ ] Schema pushes cleanly to fresh SQLite; `npm run seed` still works
- [ ] No hard-coded business values; no PII in logs; access scope on new queries
- [ ] TEST-PLAN ACs for the PBI demonstrably pass
- [ ] `ljadoc/kb/as-built/PBI-NNN.md` updated; `npm run docs:kb-check` passes
- [ ] Conventional Commit(s) referencing the PBI
