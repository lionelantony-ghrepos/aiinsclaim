# ljadev — Development

Local development resources for the lightweight learning stack.

## Stack (learning mode)

| Layer | Choice | Location |
|-------|--------|----------|
| Database | SQLite file | `ljadev/data/aiinsclaim.db` |
| ORM | Drizzle | `src/lib/db/` |
| Vector search | sqlite-vec (`vec0` + distance functions) | loaded in seed/scripts via `src/lib/db/vec.ts` (app wiring in RAG PBI) |
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
| supervisor | supervisor@demo.local | demo1234 |
| adjuster | adjuster@demo.local | demo1234 |
| intake agent | intake@demo.local | demo1234 |
| SIU analyst | siu@demo.local | demo1234 |
| claimant | claimant@demo.local | demo1234 |

Sign in at [http://localhost:3000/login](http://localhost:3000/login). Demo accounts are also listed on the login page.

## Vector search (sqlite-vec)

The `sqlite-vec` extension is loaded in seed/scripts via `loadSqliteVec()` in `src/lib/db/vec.ts`. The Next.js app DB client stays vec-free until the RAG PBI wires vector search in. Relational tables stay in Drizzle; embeddings for future RAG/copilot features can use `vec0` virtual tables in the same database file.

Example (in-memory or via app connection):

```sql
CREATE VIRTUAL TABLE doc_embeddings USING vec0(
  document_id INTEGER PRIMARY KEY,
  embedding float[768]
);

-- KNN: find nearest neighbours to a query vector
SELECT rowid, distance
FROM doc_embeddings
WHERE embedding MATCH ?
ORDER BY distance
LIMIT 10;
```

In Node/better-sqlite3, pass query vectors as `Float32Array`. No separate vector DB is required for the learning stack.

## Reset database

Delete `ljadev/data/aiinsclaim.db` (and `-wal`/`-shm` files if present), then:

```bash
npm run db:push
npm run seed
```
