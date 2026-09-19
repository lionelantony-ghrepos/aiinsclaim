# ADR-0002 — SQLite + Drizzle for learning stack

Date: 2026-09-19  
Status: accepted

## Context

Original DESIGN.md targeted InsForge (Postgres, Auth, Storage, AI Gateway). This repo is a **learning project** requiring zero cloud infra locally.

## Decision

Use a lightweight local stack:

- **SQLite** file at `ljadev/data/aiinsclaim.db`
- **Drizzle ORM** schema in `src/lib/db/schema/`
- **iron-session + bcrypt** for auth (no external auth provider)
- **Local filesystem** for documents at `ljadev/storage/claim-documents/`
- **Mock / optional OpenAI-compatible API** for agents

Postgres RLS is replaced by **application-layer scope** in `src/lib/auth/scope.ts`.

## Consequences

- Easier: one-command local setup; same domain model and BR-* rules as production-grade spec
- Harder: no native RLS; server-side scope checks mandatory on every query
- Forbidden: assuming InsForge MCP or cloud Storage in PBIs unless explicitly migrating
- Upgrade path: Postgres/Turso + hosted auth when deploying (Drizzle eases migration)

## Alternatives considered

- InsForge/Postgres — deferred to production path (DESIGN ADR-01 original)
- JSON/file DB — rejected (claims domain is relational)

Related as-built: [PBI-001](../as-built/PBI-001.md)
