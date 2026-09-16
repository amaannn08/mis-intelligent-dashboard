# TASK — MIS Intelligence Dashboard, RUN 5: hardening, tests, seed, deploy-readiness

Final coding-agent run. Project `/home/amann/intern-weh/mis-intelligent-dashboard`.
Read `PLAN.md` and the README, then make the repository **actually deployable and provably working**. Nothing here
is optional polish — each item is a gate.

## EXECUTION RULES
Foreground commands; `nice -n 15 ionice -c3`; kill by PID; **no dev server left running**; never print or commit
secrets.

## GATES (fix, do not merely report)
1. **Quality gates green from a clean tree**: `npm ci` → `npm run typecheck` → `npm run lint` → `npm run build`
   at the workspace root, all exit 0. No `any` escapes added, no `@ts-ignore` without a written reason, no ESLint
   disables without a reason on the same line.
2. **Tests that protect the risky logic** (Vitest; at least the first three groups):
   - normalisation: label→metric_key resolution, percent-vs-absolute, parenthesised negatives, period parsing
     (`Jun-25`, `June 2025`, `2025-06`, `Q1 FY26`), unit detection (lakh/crore/million);
   - chunking: overlap correctness, metadata carries source refs, no text lost between chunks;
   - RAG citation formatting: numbered context, citation objects carry filename + period, empty-retrieval path;
   - API validation: zod schemas reject malformed bodies; auth middleware rejects unauthenticated requests.
   `npm run test` must pass and be runnable in CI.
3. **Secret hygiene — prove it, do not assert it**:
   - `git grep -nE "sk-[A-Za-z0-9]{20,}|npg_[A-Za-z0-9]{12,}|AQ\.[A-Za-z0-9_-]{20,}" $(git rev-list --all)` → no hits.
   - grep the production client bundle (`.next/static/**`) for `GEMINI`, `DEEPSEEK`, `DATABASE_URL`,
     `AUTH_PASSWORD`, `COOKIE_SECRET` → no hits.
   - `.env.example` documents every variable with placeholder values only.
4. **Migration readiness for a fresh database**: a documented, tested path `npm run db:migrate` that works against
   an empty Postgres **including `CREATE EXTENSION IF NOT EXISTS vector`** and the HNSW index, plus
   `npm run db:seed` (metric definitions + the CRM company import). Prove it by creating a throwaway database
   locally (e.g. `mis_fresh_check`), running migrate + seed against it, showing the resulting table list and row
   counts, then dropping it.
5. **Vercel deploy-readiness** (do this in the repo, do not deploy):
   - A root `vercel.json` configured for the monorepo (root directory `apps/web`, npm workspaces install from the
     repo root, `outputDirectory` correct, no `canvaskit`-style dead weight).
   - Document exactly which environment variables must exist in Vercel for **Production and Preview**, without
     values: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `DEEPSEEK_API_KEY`,
     `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `AUTH_USERNAME`, `AUTH_PASSWORD`, `COOKIE_SECRET`, `NEXT_PUBLIC_APP_URL`.
   - Confirm no route depends on the local filesystem outside the documented `document_blobs` behaviour.
6. **README** (the entry point a reviewer will read): what it is, architecture diagram in text, prerequisites, env
   setup, local run, database setup/migrate/seed, testing, deployment steps, the locked decisions and their
   trade-offs, known limitations, and next steps. Include the screenshots from Run 4.

## VERIFY AND REPORT
For each gate: the exact command and its real output (counts, exit codes, the greps). Then a short list of
anything you could not complete with the honest reason.
Commit per gate. Do not push.
