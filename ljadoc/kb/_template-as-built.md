# PBI-NNN — short title

Copy to `ljadoc/kb/as-built/PBI-NNN.md`. Replace placeholders. Keep to 1–2 pages. Facts only. Cite decision tables by **BR-* ID**; never copy business thresholds, fees, or limits into this file.

## PBI / ACs / TCs

- PBI: [PBI-NNN](../PRD.md#pbi-nnn)
- Phase:
- ACs: AC-NNN-xx (see [TEST-PLAN](../TEST-PLAN.md))
- TCs: TC-NNN-xx
- GitHub: PBI issue # · TC issues

## Shipped vs spec

| Item | Status |
| --- | --- |
| Spec intent | done / deferred / spec gap / not started |
| Notes | what differs from PRD/DESIGN and why |

## Surfaces

- Routes / panels:
- Packages / modules:
- DB / migrations:
- Agents:

## Contracts

- Zod schemas (`src/lib/schemas/`):
- Server actions / API routes:
- Generated reference: [generated/](../generated/) (after `npm run docs:generate`)

## Rules

- Decision tables evaluated or seeded: BR-* (IDs only)
- Entitlements / `requireRole()`: n/a or which actions

## How to extend

- Bullet for the next dependent PBI
- Where to register a new route / schema / agent
- What not to fork

## Ops

- Env vars (names only, never values):
- Seed / fixtures:
- Test harness notes:

## Trace

- Commit: `feat(PBI-NNN): …`
- SHA: (fill at commit time)
