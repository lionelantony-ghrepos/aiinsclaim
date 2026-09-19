# ADR-0001 — Docs-as-code knowledge layer beside the spec

Date: 2026-09-19  
Status: accepted

## Context

aiinsclaim has normative specs in `ljadoc/` (PRD, DESIGN, TEST-PLAN, BUSINESS-RULES, DATA-DICTIONARY). Agents and humans need a separate **as-built** record of what actually shipped, without rewriting the spec on every commit.

## Decision

Add `ljadoc/kb/` as the engineering knowledge base:

- **As-built** pages per PBI (`as-built/PBI-NNN.md`) updated in the same commit as code
- **ADRs** only for durable choices not already captured in DESIGN.md
- **Generated** snapshots (`generated/`) from `npm run docs:generate`
- **Completeness gate** via `npm run docs:kb-check` in CI

User-visible narrative lives in `ljadoc/08-User-Guide.md` (delta only when UI ships).

## Consequences

- Easier: agent sessions read dependency as-built files before implementing; traceability PBI → AC → TC
- Harder: every `feat(PBI-NNN)` commit must include/update as-built
- Forbidden: auto-rewriting PRD/DESIGN/TEST-PLAN; copying BR-* thresholds into KB files

## Alternatives considered

- Wiki / Notion — rejected (not versioned with code)
- Single PRD only — rejected (spec vs as-built conflated)
