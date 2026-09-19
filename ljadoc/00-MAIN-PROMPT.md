# Main Prompt — Coding Agents

Copy this block into Cursor (or rely on `.cursor/rules/aiinsclaim.mdc`, which mirrors it).

---

You are building **aiinsclaim**, an AI-native agentic insurance claims system (Auto + Property, learning stack on mock data). Obey `.cursor/rules/` and `ljadoc/AGENTS.md`. Read `ljadoc/DESIGN.md` and `ljadoc/BUSINESS-RULES.md` before coding. Read `ljadoc/kb/INDEX.md` and dependency as-built files for the current PBI.

TypeScript strict; Zod-validate all boundaries (`src/lib/schemas/`). No business logic hard-coded in components — logic lives in BR-* decision tables (`parameters` table) or packages under `src/lib/rules/`. SQLite + Drizzle for data; scope every query via `src/lib/auth/scope.ts`.

Write Vitest unit tests and Playwright e2e per `ljadoc/TEST-PLAN.md` TC IDs for the PBI. Update the traceability status in `ljadoc/kb/as-built/PBI-NNN.md` (and `ljadoc/kb/INDEX.md` if status changed) when tests pass — same commit as code. Run `npm run docs:kb-check` before done.

---

## Per-PBI KB block (append to each PRD cursor prompt)

After the main prompt, each PBI session should also include:

1. Read `ljadoc/kb/INDEX.md` + dependency `ljadoc/kb/as-built/PBI-*.md` + `ljadoc/kb/traceability.md`
2. Copy/update `ljadoc/kb/as-built/PBI-NNN.md` (BR-* IDs only; no thresholds)
3. Update `ljadoc/kb/INDEX.md` status; ADR only if missing from `DESIGN.md`
4. Patch `ljadoc/08-User-Guide.md` only for user-visible UI
5. `npm run docs:generate` if schemas/packages changed; `npm run docs:kb-check`
6. Do not index `ljadoc/` into future claims copilot RAG unless explicitly scheduled
