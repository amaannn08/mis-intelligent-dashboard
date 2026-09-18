# TASK — MIS Intelligence Dashboard, RUN 1 of 6: M0 scaffold + M1 database layer

You are the coding agent. **Read `/home/amann/intern-weh/mis-intelligent-dashboard/PLAN.md` first** — it holds the
locked architecture decisions (npm workspaces, Drizzle, pgvector, AI SDK for chat only, no Mastra, auth model,
data model, milestone list). Implement exactly that; do not re-litigate the decisions unless a decision is
impossible, in which case say so in your report instead of silently deviating.

Project root: `/home/amann/intern-weh/mis-intelligent-dashboard` (only `PLAN.md` exists there today).
Node 26.8.1 · npm 12.0.2 · no pnpm/yarn/bun → **use npm workspaces**.

## EXECUTION RULES (a previous agent lost 45 minutes by ignoring these)
- Run commands in the **FOREGROUND** and wait for them in the same step. Never `&` a build/install and then idle.
- Heavy commands (`npm install`, `next build`, `tsc`) get `nice -n 15 ionice -c3`. The user works on this laptop.
- Kill processes by explicit PID — **never `pkill -f <pattern>`** (it has killed the invoking shell repeatedly).
- Never print secret values; inspect `.env` files for KEY NAMES only.
- Do not start long-running dev servers you then leave behind; if you must, kill them by PID at the end.

## M0 — scaffold (npm workspaces monorepo)
Create, at the project root:
```
package.json            # "workspaces": ["apps/*","packages/*"], root scripts (build/lint/typecheck/dev/db:*)
apps/web/               # Next.js (App Router, TypeScript strict) + Tailwind + shadcn/ui
packages/db/            # @mis/db
packages/core/          # @mis/core  (leave a minimal typed stub for now; M2 fills it)
.env.example            # variable NAMES only
README.md               # setup + run + deploy (write it up as you go, not at the end)
.gitignore              # must ignore .env* (except .env.example), .next, node_modules, *.local
```
- Next.js **15** + React 19 + Tailwind **v4** + shadcn/ui, TypeScript `strict: true`, ESLint + `tsc --noEmit` both clean.
  If the shadcn/ui CLI or Tailwind v4 fights the toolchain, fall back to Next 14 + React 18 + Tailwind 3 and **say so
  in the report** — a working, conventional setup beats a fashionable one.
- `apps/web` must set `transpilePackages: ["@mis/db", "@mis/core"]` so workspace packages compile.
- No `any` escapes, no `@ts-ignore` without a written reason on the same line.
- Add a `GET /api/health` route that returns `{ ok, db: "up"|"down" }` by actually running `select 1`.

## M1 — @mis/db (Drizzle + pgvector + migrations)
Schema exactly as specified in PLAN.md §2: `companies`, `documents`, `document_chunks`, `metrics`,
`metric_definitions`, `processing_jobs`, `chat_sessions`, `chat_messages`, with the stated enums, FKs, unique
constraints and indexes (including an **HNSW cosine index** on `document_chunks.embedding` and GIN on `metadata`).
- `embedding` is `vector(1536)` — get the Drizzle custom type right.
- Migration tooling: drizzle-kit, migrations committed under `packages/db/drizzle/` (or `migrations/`), with a
  documented `npm run db:generate` / `db:migrate` / `db:studio` flow.
- Seed `metric_definitions` with the standard set from PLAN.md §3 (net revenue, gross margin, EBITDA, burn, run
  rate) **plus** the alias lists (`Revenue|Net Revenue|Sales|Total Income`, `EBITDA|EBITDA %|Operating EBITDA`,
  `Gross Margin|GM %|Gross Profit`, `Burn|Monthly Burn|Net Burn`, `Run Rate|ARR|Annualized Revenue`) — the alias
  table is the normalisation layer's backbone, so make it data, not hard-coded switches.

### Local database — already provisioned and verified, use it as-is
```
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/mis_dashboard
```
(role `mis_app`, database `mis_dashboard`, **pgvector 0.8.6 already enabled** — verified working, including a
`vector(3)` distance query.) Put that in `apps/web/.env.local` and `packages/db/.env` (both gitignored) and use it
for every M1 verification. `CREATE EXTENSION IF NOT EXISTS vector;` must also be part of the migration so a fresh
Neon database works later without manual steps.

### Company seed — real data, read-only
The portfolio company list lives in the CRM's database, whose credentials are in
`/home/amann/intern-weh/mvp/crm/backend/.env` (key `DATABASE_URL`). Write a **one-shot script**
(`packages/db/scripts/seed-companies-from-crm.ts` or equivalent) that reads that connection string, runs **only**
`SELECT` statements (company name / industry / any obvious descriptive column — inspect the CRM schema read-only
first and adapt), and upserts into this app's `companies`. Rules:
- **Never write to the CRM database.** No INSERT/UPDATE/DELETE there, ever.
- Never print or commit the CRM connection string.
- If the CRM schema has nothing usable, do not invent companies: leave the table empty and report it.

## VERIFY (show real command output, not summaries)
1. `npm install` at the root succeeds; `npm run typecheck` clean; `npm run lint` clean.
2. `npm run build` in `apps/web` exits 0 (production build).
3. Migrations apply to the local database, and `psql` proves the schema: list the created tables and show the
   HNSW index exists (`\d+ document_chunks`).
4. `GET /api/health` returns `{"ok":true,"db":"up"}` when run against the local DB (start the server, curl it,
   kill it by PID).
5. The company seed script runs and reports how many companies it inserted — or explains why it inserted none.

## COMMIT
`git init` at the project root, then commit in reviewable steps (scaffold, db package, migrations, seed script).
Do **not** create a GitHub remote or push.

## REPORT BACK
What you built (paths), the exact commands + their output for every verification above, any decision you had to
change (with the reason), and anything a human must do next. If something did not work, say exactly what failed —
do not paper over it.
