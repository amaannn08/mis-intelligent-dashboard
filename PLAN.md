# Portfolio MIS Intelligence Dashboard — Technical Implementation Plan

Target: `/home/amann/intern-weh/mis-intelligent-dashboard` · Branch-free new repo · Owner: Aman (WEH Ventures intern)
Status: **approved architecture, executing**

## 0. Decisions already locked (by the engineering lead, not the coding agent)

| Question | Decision | Why |
|---|---|---|
| Package manager | **npm** (workspaces) | node 26.8.1 / npm 12.0.2 present; no pnpm/yarn/bun installed; matches `mvp/crm` and `website` |
| DB in dev | **local PostgreSQL 18.6 + pgvector** (`/run/postgresql:5432`, `vector.control` present) | already running, zero latency, no prod risk |
| DB in prod | **Neon**, but a **separate database** — never the CRM's `ep-nameless-bread-…` prod DB | the CRM's DATABASE_URL belongs to a different app's production data |
| ORM | **Drizzle** | SQL-first, first-class custom types (so `vector(1536)` works), no generate binary, no shadow DB needed for migrations, ideal on serverless/Neon |
| Vector store | pgvector (HNSW index), same database | one system, transactional with the rest of the data |
| Auth | single shared team password from env → signed **HttpOnly cookie**, middleware-gated | MVP access control, mirrors the CRM's LOGIN_USERNAME/PASSWORD pattern; documented as MVP, not enterprise auth |
| Mastra | **not used** | adds an orchestration layer this MVP does not need; a small typed pipeline module is clearer and deployable |
| Vercel AI SDK | **used for the chat stream only** (`useChat` + `streamText` against a DeepSeek OpenAI-compatible endpoint) | genuine value: streaming + client state; everything else stays plain typed fetch |
| Embeddings | Gemini via `@google/genai`, `GEMINI_EMBEDDING_MODEL` env, 1536-dim | matches the CRM's proven setup |
| Generation | DeepSeek via `DEEPSEEK_BASE_URL` + `DEEPSEEK_MODEL` env | per spec |
| Heavy processing | synchronous on upload for files ≤ a documented cap, but every step is a separate function in a `pipeline/` module and every run is recorded in a `processing_jobs` row so moving to a background worker is a config change, not a rewrite | Vercel function limits |

## 1. Monorepo layout (npm workspaces)

```
mis-intelligent-dashboard/
├── package.json                 # workspaces: apps/*, packages/*
├── apps/web/                    # Next.js 15 App Router — all UI + route handlers
│   ├── src/app/…                # /, /companies, /companies/[slug], …/documents, /settings, /login, /api/*
│   ├── src/components/…         # shadcn/ui primitives + product components
│   └── src/lib/…                # server-only helpers (session, validation, formatting)
├── packages/db/                 # @mis/db  — Drizzle schema, migrations, client
├── packages/core/               # @mis/core — parsing, normalisation, chunking, embeddings, RAG, extraction
└── .env.example
```

`apps/web` sets `transpilePackages: ["@mis/db", "@mis/core"]`. Vercel Root Directory = `apps/web`.

## 2. Data model (packages/db)

`companies` (id, name, slug unique, industry, description, archived_at, created_at, updated_at)
`documents` (id, company_id FK, filename, storage_path, mime, file_type, reporting_period `YYYY-MM`, size_bytes, checksum unique-per-company, status enum `pending|parsing|extracting|embedding|processed|failed`, error, uploaded_at, processed_at)
`document_chunks` (id, document_id FK, company_id FK, chunk_index, content, token_count, metadata jsonb, **embedding vector(1536)**)
`metrics` (id, company_id FK, document_id FK, metric_key FK→metric_definitions, value numeric, unit, reporting_period `YYYY-MM`, source_reference, value_kind enum `reported|calculated|estimated`, confidence, created_at, updated_at) — unique (company_id, metric_key, reporting_period, document_id)
`metric_definitions` (key, label, unit, aliases text[], directionality) — seeded; **adding a metric later = one row**, no schema change
`processing_jobs` (id, document_id, step, status, started_at, finished_at, error, log jsonb)
`chat_sessions` / `chat_messages` (id, company_id nullable = global, role, content, citations jsonb, created_at)

Indexes: `companies.slug`, `documents(company_id, reporting_period)`, `metrics(company_id, metric_key, reporting_period)`, `document_chunks` HNSW on `embedding vector_cosine_ops`, GIN on `chunks.metadata`.

## 3. Pipeline (packages/core)

```
upload → store file + metadata (status=pending)
       → parse   (xlsx via SheetJS · pdf via unpdf)         → raw text + sheet/table structure
       → normalise (label → metric_key via alias table)      → candidate (key, value, period, source ref)
       → extract (LLM structured pass for anything ambiguous; numbers only accepted when a source ref exists)
       → chunk   (~800 tokens, 100 overlap, metadata: company, period, sheet/page, row refs)
       → embed   (Gemini, batched) → document_chunks.embedding
       → status=processed
```
Metric extraction is **deterministic first** (regex + alias table + header heuristics), LLM second. A metric with no source reference is never written. Missing metric = absent row → UI shows "unavailable", never a fabricated value.

## 4. RAG (packages/core)

`query → (optional company filter) → Gemini embed → pgvector cosine top-k (k=8, min score) → context block with [n] source markers → DeepSeek → answer + citations[]`
Citations carry `filename`, `reporting_period`, `company`, `chunk_index`. If retrieval is empty the answer says so plainly. Calculated values are labelled `calculated` with the arithmetic shown.

## 5. UI (apps/web)

Light-first, dark supported; Tailwind; shadcn/ui primitives; Recharts; responsive; keyboard-accessible.
Pages: `/` portfolio overview · `/companies` directory (search, filter, sort) · `/companies/[slug]` KPI cards + MoM charts + documents + scoped AI · `/companies/[slug]/documents` upload + status · `/settings` · `/login`.
Reusable: `KpiCard`, `TrendChart`, `MetricTable`, `UploadDropzone`, `StatusPill`, `CitationList`, `QueryPanel`, `EmptyState`, `DataTable`.

## 6. Seed data policy

Real portfolio companies are read **read-only** from the CRM's database (name, industry) so the directory is not fake. MIS documents themselves are uploaded by the user; test fixtures used during development are generated locally and clearly marked as fixtures, never shipped as real data.

## 7. Milestones (each independently verifiable)

M0 scaffold + workspace + Next + Tailwind + shadcn + TS strict → `npm run build` green
M1 `@mis/db` schema + migrations against local Postgres + pgvector smoke test + CRM company seed
M2 `@mis/core` parsing/embedding/extraction/RAG with real API calls, proven on real fixture files
M3 API route handlers (companies, documents, metrics, query stream, auth) + validation + auth middleware
M4 UI pages, charts, upload, chat, light/dark, empty/loading/error states
M5 validation: typecheck, lint, build, focused tests, Chrome DevTools flow pass
M6 Vercel preview → verify → production

## 8. Open items that need the human (not blocking the build)

1. **Production DATABASE_URL** (a Neon database for this app). Either create a new database inside the existing Neon project, or hand over a fresh connection string. Not needed until M6.
2. Confirm it is acceptable to use the already-present `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` for this app's production env vars (they exist locally in the CRM's `.env`).
