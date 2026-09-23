# aiinsclaim

AI-native, agentic insurance claims processing system — **learning project** on a lightweight local stack.

## Project Structure

| Folder | Purpose |
|--------|---------|
| `src/` | Next.js application source code |
| `ljareq/` | Requirements — specs, user stories, acceptance criteria |
| `ljatst/` | Testing — test plans, cases, and E2E scenarios |
| `ljadoc/` | Documentation — architecture, API refs, guides |
| `ljadev/` | Development — SQLite DB, local storage, dev setup |

## Stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16 (App Router) + TypeScript strict |
| UI | Tailwind CSS 4 |
| Data | SQLite + Drizzle ORM |
| Auth | iron-session + bcrypt (local demo accounts) |
| Storage | Local filesystem (`ljadev/storage/`) |
| Validation | Zod |
| Client data | TanStack Query |
| Tests | Vitest + Playwright |

See `ljadev/README.md` for local setup, `ljadoc/DESIGN.md` for architecture, and **`ljadoc/kb/INDEX.md`** for the as-built knowledge base (agents read this before each PBI).

## Getting Started

```bash
npm install
npm run db:push
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production SLA sweep

Schedule a cron job to `POST /api/sweep/sla` with header `x-sweep-secret` set to `SWEEP_SECRET` from your environment. Admins can also trigger the same sweep from **SLA sweep** in the sidebar during development.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:push` | Sync SQLite schema |
| `npm run seed` | Load demo users |
| `npm run test` | Unit tests |
| `npm run test:e2e` | Browser tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run docs:kb-check` | Validate knowledge base completeness |
| `npm run docs:generate` | Regenerate KB reference snapshots |
