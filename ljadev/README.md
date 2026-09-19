# ljadev — Development

Local development resources for the lightweight learning stack.

## Stack (learning mode)

| Layer | Choice | Location |
|-------|--------|----------|
| Database | SQLite file | `ljadev/data/aiinsclaim.db` |
| ORM | Drizzle | `src/lib/db/` |
| Auth | iron-session + bcrypt | `src/lib/auth/` |
| Document storage | Local filesystem | `ljadev/storage/claim-documents/` |
| AI agents | Mock / optional OpenAI API | `src/lib/agents/` (later PBIs) |

Postgres RLS from the original spec is replaced by **application-layer scoping** in `src/lib/auth/scope.ts` — sufficient for local learning.

## Setup

```bash
cp .env.example .env.local   # optional — defaults work locally
npm install
npm run db:push              # create/update SQLite schema
npm run seed                 # demo users (password: demo1234)
npm run dev
```

## Useful commands

| Command | Purpose |
|---------|---------|
| `npm run db:push` | Sync schema to SQLite (no server needed) |
| `npm run db:studio` | Browse data in Drizzle Studio |
| `npm run db:generate` | Generate SQL migration files into `ljadev/drizzle/` |
| `npm run seed` | Insert demo users |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright browser tests |

## Demo accounts (after seed)

| Role | Email | Password |
|------|-------|----------|
| admin | admin@demo.local | demo1234 |
| adjuster | adjuster@demo.local | demo1234 |
| claimant | claimant@demo.local | demo1234 |

## Reset database

Delete `ljadev/data/aiinsclaim.db` (and `-wal`/`-shm` files if present), then:

```bash
npm run db:push
npm run seed
```
