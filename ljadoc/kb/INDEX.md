# aiinsclaim knowledge base

Living **as-built** handbook for humans (onboarding, ops) and coding agents (later PBI sessions). Normative specs remain in `ljadoc/` (PRD, DESIGN, TEST-PLAN, etc.). This folder records what actually shipped and how to extend it.

## How to use

1. **Agents:** before implementing PBI-N, read this index and as-built files for **dependency PBIs**. After shipping, add/update `as-built/PBI-NNN.md` from [`_template-as-built.md`](_template-as-built.md) in the **same commit** as code.
2. **Humans:** start here → as-built → ADRs → [generated reference](generated/). User-visible behavior belongs in [08-User-Guide](../08-User-Guide.md) (delta only when a panel or command ships).
3. **Do not** auto-rewrite PRD, DESIGN, or TEST-PLAN. Disagreements go in **Shipped vs spec** on the as-built page.

## Corpora (do not mix)

| Corpus | Location | Consumer |
| --- | --- | --- |
| Product spec | `ljadoc/` (PRD, DESIGN, TEST-PLAN, …) | Agents + humans |
| Engineering KB | `ljadoc/kb/` (this tree) | Agents + humans |
| User narrative | `ljadoc/08-User-Guide.md` | End users |
| Future claims RAG | sqlite-vec in `ljadev/data/aiinsclaim.db` (optional) | Copilot only — **must not** ingest `ljadoc/` or `ljadoc/kb/` unless explicitly scheduled |

## Traceability

Full PBI → AC → TC matrix: [traceability.md](traceability.md)

GitHub issues: [PBIs #1–20](https://github.com/lionelantony-ghrepos/aiinsclaim/issues?q=label%3Apbi) · [Test cases #21–112](https://github.com/lionelantony-ghrepos/aiinsclaim/issues?q=label%3Atest-case)

## As-built

| PBI | As-built | Phase | Status |
| --- | --- | --- | --- |
| 001 | [PBI-001](as-built/PBI-001.md) | 0 | Shipped |
| 002 | [PBI-002](as-built/PBI-002.md) | 0 | Shipped |
| 003 | [PBI-003](as-built/PBI-003.md) | 1 | Shipped |
| 004 | [PBI-004](as-built/PBI-004.md) | 1 | Shipped |
| 005 | [PBI-005](as-built/PBI-005.md) | 1 | Shipped |
| 006 | [PBI-006](as-built/PBI-006.md) | 1 | Shipped |
| 007 | [PBI-007](as-built/PBI-007.md) | 1 | Shipped |
| 008 | [PBI-008](as-built/PBI-008.md) | 1 | Shipped |
| 009 | [PBI-009](as-built/PBI-009.md) | 2 | Shipped |
| 010 | [PBI-010](as-built/PBI-010.md) | 2 | Shipped |
| 011 | [PBI-011](as-built/PBI-011.md) | 2 | Shipped |
| 012 | [PBI-012](as-built/PBI-012.md) | 2 | Planned |
| 013 | [PBI-013](as-built/PBI-013.md) | 2 | Planned |
| 014 | [PBI-014](as-built/PBI-014.md) | 2 | Planned |
| 015 | [PBI-015](as-built/PBI-015.md) | 2 | Planned |
| 016 | [PBI-016](as-built/PBI-016.md) | 2 | Planned |
| 017 | [PBI-017](as-built/PBI-017.md) | 2 | Planned (Should) |
| 018 | [PBI-018](as-built/PBI-018.md) | 2 | Planned (Should) |
| 019 | [PBI-019](as-built/PBI-019.md) | 3 | Planned (Could) |
| 020 | [PBI-020](as-built/PBI-020.md) | 3 | Planned (Could) |

## Architecture decision records

| ADR | Title |
| --- | --- |
| [0001](adr/0001-docs-as-code-knowledge-layer.md) | Docs-as-code knowledge layer beside the spec |
| [0002](adr/0002-sqlite-drizzle-learning-stack.md) | SQLite + Drizzle for learning stack |

Durable choices already in [DESIGN.md](../DESIGN.md) §8 ADR summaries — add a new ADR here only when refining or missing from DESIGN.

## Ops (local)

- Dev setup: [ljadev/README.md](../../ljadev/README.md)
- DB: `ljadev/data/aiinsclaim.db` · Storage: `ljadev/storage/claim-documents/`
- Seed: `npm run seed` (demo users); full seed in PBI-005

## Generated reference

Produced by `npm run docs:generate` (committed snapshots). CI fails if stale.

- [generated/README.md](generated/README.md)
- [generated/packages.md](generated/packages.md)
- [generated/schemas-catalog.md](generated/schemas-catalog.md)

## Completeness gate

- `npm run docs:kb-check` — required headings; reject empty/TBD sections; require as-built for each `feat(PBI-NNN)` in the commit range
- `npm run docs:kb-test` — unit tests for the gate script
- Agent session protocol: see [AGENTS.md](../AGENTS.md) § Knowledge base
