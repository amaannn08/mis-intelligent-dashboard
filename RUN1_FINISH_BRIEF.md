# TASK — MIS Intelligence Dashboard, RUN 1-FINISH (complete the database layer)

Coding agent run. Project `/home/amann/intern-weh/mis-intelligent-dashboard`.

**Why this run exists:** the previous agent got stuck waiting on a backgrounded `npm install` and burned its
timeout. It did finish real work first — the scaffold, the whole Drizzle schema, and a generated migration — but it
never applied anything, seeded nothing, and committed nothing. Finish that, then stop.

## ALREADY DONE — do not redo, do not rewrite
- npm workspaces scaffold: root `package.json`, `apps/web/`, `packages/db/`, `packages/core/`, `node_modules`
  installed (528 MB), `.env.example`, `.gitignore`, `.githooks/pre-commit`.
- `packages/db/src/schema/*.ts` (enums, companies, metric-definitions, documents, document-chunks, metrics,
  processing-jobs, chat, index), `src/client.ts`, `src/index.ts`, `drizzle.config.ts`.
- **The migration already exists**: `packages/db/drizzle/0000_petite_big_bertha.sql` + `drizzle/meta/`.
- The env files are already filled with real working values and are gitignored (`apps/web/.env.local`,
  `packages/db/.env`). **Do not print, rewrite or commit them.**

## EXECUTION RULE (this is what killed the last run)
Run **every** command in the FOREGROUND and wait for it in the same step. Never start something with `&` and then
sit idle — if a command takes minutes, just wait for it. Heavy commands get `nice -n 15 ionice -c3`. Kill by
explicit PID, never `pkill -f`. Never leave a server running.

## DO THIS
1. **Apply the migration to the local database** and prove it:
   - `psql` the table list, `\d+ document_chunks` to show the HNSW vector index, and confirm the `vector`
     extension is present. The DB is `postgresql://…@127.0.0.1:5432/mis_dashboard` (already in the env files).
   - If `drizzle-kit` needs a direct (non-pooled) URL or the `CREATE EXTENSION IF NOT EXISTS vector` statement is
     missing from the migration, fix the migration and re-apply — a fresh Neon database must work with the same
     single command later.
2. **Seed `metric_definitions`** with the standard five metrics plus their alias lists (`Revenue|Net Revenue|Sales|
   Total Income`, `EBITDA|EBITDA %|Operating EBITDA`, `Gross Margin|GM %|Gross Profit`, `Burn|Monthly Burn|Net
   Burn`, `Run Rate|ARR|Annualized Revenue`), units and directionality. Prove it with a `select`.
3. **Seed companies read-only from the CRM**: connection string is in
   `/home/amann/intern-weh/mvp/crm/backend/.env` (key `DATABASE_URL`). Inspect that schema read-only, `SELECT`
   only (**never** INSERT/UPDATE/DELETE there), upsert name/industry/description into this app's `companies`, and
   report how many rows landed. Never print that connection string.
4. **Green gates**: `npm run typecheck` and `npm run lint` at the root, then a production build of `apps/web`
   (`npm run build`) — all exit 0. Fix what breaks rather than disabling a check.
5. **Commit** in reviewable steps (schema, migration, seeds, fixes). `git init` if needed. Do not push, do not
   create a remote.

## REPORT
Exact commands + real output for each of 1-5 (table list, HNSW index proof, row counts, exit codes), plus anything
you could not finish and why. Then stop — the next run handles the AI/RAG layer.
