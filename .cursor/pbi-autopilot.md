# pbi-autopilot profile — aiinsclaim

## Ticket
- Ticket ID*: PBI-020
- Ticket issue*: lionelantony-ghrepos/aiinsclaim#20
- TC issues: lionelantony-ghrepos/aiinsclaim#110–#112
- Dependencies: PBI-017 — confirm `ljadoc/kb/as-built/PBI-017.md` is shipped and GitHub issue #17 is closed

## Settings
- BASE_BRANCH*: feature
- AUTO_MERGE: true
- MAX_FIX_LOOPS: 3
- Run folder*: `ljadev/runs/PBI-020/` (gitignored)
- Branch convention*: `feat_ph3_ai` (existing user-requested branch)
- Commit convention*: `feat(pbi-020): <summary>`

## Sources
- Conventions*: `AGENTS.md`, `ljadoc/AGENTS.md`, `.cursor/rules/aiinsclaim.mdc`
- Requirements*: `ljadoc/PRD.md` PBI-020
- Acceptance criteria / test cases*: `ljadoc/TEST-PLAN.md` AC/TC-020-01..03
- Design / architecture: `ljadoc/DESIGN.md`, `ljadoc/AGENT-OPS.md`
- Business rules / config: `ljadoc/BUSINESS-RULES.md`
- Data / API contracts: `ljadoc/DATA-DICTIONARY.md`, `ljadoc/API-CONTRACTS.md`
- Doc precedence on conflict: data dictionary > API contracts > design > PRD
- As-built / KB: `ljadoc/kb/INDEX.md`, `ljadoc/kb/as-built/PBI-020.md`, `ljadoc/kb/_template-as-built.md`

## Commands
- Fast verify*: `npm run typecheck && npm run lint && npm run test`
- Full verify*: `npm run test:e2e` plus fast verify; fresh SQLite push/seed as applicable
- Doc checks: `npm run docs:generate` if schemas/packages change, then `npm run docs:kb-check`

## Edit zones
- CODE: `src/**`, `seed/**`
- TEST: `tests/**`
- DOC: `ljadoc/kb/**`, `ljadoc/08-User-Guide.md` only for shipped user-visible UI, generated docs when required
- Never commit: local SQLite DBs, uploaded documents, `.env*`, `ljadev/runs/PBI-020/`

## Close-out
- Where "Done" lives: merge PR into `feature`, close issue #20 and TC issues #110–#112, update KB status/traceability
- Review-gate skill (optional): `grok-bot-review-gate`

## Project-specific overrides
- Use existing `feat_ph3_ai`; do not create or rename a branch.
- Human must explicitly send every communication; no real email/SMS integrations.
- Business values and output constraints must be schema/config driven; do not hard-code thresholds in components or actions.
- Preserve all pre-existing untracked local DB/upload artifacts.
