# MIS Intelligence Dashboard

Portfolio MIS Intelligence Dashboard for WEH Ventures — automated MIS extraction, financial metric normalization, semantic retrieval (RAG), and portfolio KPI tracking.

## Architecture

This project is structured as an npm workspaces monorepo:

- **`apps/web`**: Next.js 15 App Router frontend and API routes with Tailwind CSS v4 and shadcn/ui.
- **`packages/db`**: `@mis/db` database layer using Drizzle ORM, PostgreSQL, and pgvector (HNSW cosine similarity indexing).
- **`packages/core`**: `@mis/core` core pipeline for document parsing, metric normalization, chunking, embeddings, and RAG.

## Prerequisites

- **Node.js**: >= 20.x (tested on 26.8.1)
- **npm**: >= 10.x (tested on 12.0.2)
- **PostgreSQL**: 16+ with `vector` (pgvector 0.8+) extension enabled

## Environment Configuration

Copy `.env.example` to the required locations and configure the values:

```bash
cp .env.example apps/web/.env.local
cp .env.example packages/db/.env
```

Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://mis_app:mis_app_dev@127.0.0.1:5432/mis_dashboard`)
- `CRM_DATABASE_URL`: Optional direct read-only connection string to CRM database (defaults to reading `/home/amann/intern-weh/mvp/crm/backend/.env`)

## Database Management

From the root directory:

```bash
# Run migrations (creates tables, vector extension, HNSW index)
npm run db:migrate

# Seed canonical metric definitions (Revenue, EBITDA, Gross Margin, Net Burn, Run Rate + aliases)
npm run db:seed

# Seed portfolio companies read-only from the CRM database
npm run db:seed:crm
```

## Quality Gates & Building

```bash
# Typecheck all packages and apps
npm run typecheck

# Lint all packages and apps
npm run lint

# Build production bundle for apps/web
npm run build
```

## API Surface & Route Handlers (Run 3)

All `/api/*` endpoints (except `/api/health` and `/api/auth/login`) are protected by session authentication via Next.js `middleware.ts`. Payloads are strictly validated with Zod, and errors conform to a typed envelope `{ error: { code: string, message: string, details?: unknown } }`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | Health probe running `SELECT 1` against Postgres (`{ ok: true, db: 'up' }`). |
| `POST` | `/api/auth/login` | Public | Validates team credentials in constant time (`crypto.timingSafeEqual` over SHA-256 hashes) and sets signed HttpOnly `mis_session` cookie. |
| `POST` | `/api/auth/logout` | Session | Clears the `mis_session` cookie. |
| `GET` | `/api/auth/session` | Session | Returns authenticated session identity `{ authenticated: true, user: { username } }`. |
| `GET` | `/api/companies` | Session | Lists companies with search, industry filter, sort, pagination, and summary KPIs (latest period, revenue, EBITDA, doc count, last updated). |
| `POST` | `/api/companies` | Session | Creates a company with automatic unique slug generation. |
| `GET` | `/api/companies/[id]` | Session | Fetches company by UUID or slug with its latest metrics map. |
| `PATCH` | `/api/companies/[id]` | Session | Updates company details (name, industry, description). |
| `DELETE` | `/api/companies/[id]` | Session | Soft-archives company (`archived_at = now()`) by default; hard delete only with `?hard=true&confirm=true` cascading cleanly without orphans. |
| `GET` | `/api/companies/[id]/metrics` | Session | Returns metric time-series grouped by metric key for charts (`?from=&to=&keys=`). |
| `POST` | `/api/documents` | Session | Multipart upload (`file`, `companyId`): validates MIME, extension, magic bytes, checksum deduplication, returns `202 Accepted` immediately. |
| `GET` | `/api/documents` | Session | Lists documents filtered by `companyId` or `status`. |
| `GET` | `/api/documents/[id]` | Session | Fetches document status, step-by-step processing jobs log, and extracted metrics. |
| `GET` | `/api/documents/[id]/file` | Session | Streams retained original binary with `Content-Disposition: inline`. |
| `DELETE` | `/api/documents/[id]` | Session | Deletes document and cascades to chunks, metrics, jobs, and blobs. |
| `POST` | `/api/query` | Session | Grounded RAG query streaming answer over DeepSeek (OpenAI-compatible) with source citations in `X-Citations` header. |

## File Storage Architecture & Production Trade-offs (Locked Decision)

Vercel's serverless filesystem is ephemeral and read-only apart from `/tmp`, so traditional disk storage does not survive. The architecture implements:

1. **Database as Source of Truth**: All parsed text blocks, chunks, embeddings (`vector(1536)`), and structured metrics are permanently stored in PostgreSQL.
2. **Original File Retention (`document_blobs`)**:
   - For files **$\le 4$ MB** (~95% of monthly MIS spreadsheets), original binary bytes are persisted in the `document_blobs` table (`bytea`). Download and preview (`/api/documents/[id]/file`) work natively in production without any external storage bucket.
   - For files **$> 4$ MB**, processing, parsing, embedding, and metric extraction run in full, but the original raw binary is not retained (`original_retained = false`) to prevent Postgres memory exhaustion.
3. **Local Dev Mirror**: In development, files are mirrored to the gitignored `./uploads/` directory for developer convenience.
4. **Upgrade Path**: A future migration to Vercel Blob or Amazon S3 can swap the binary storage layer without changing document indexing or RAG pipelines.

## Upload Size Ceilings

Upload ceilings are strictly enforced server-side (and mirrored in the UI):
- **Production (`NODE_ENV === 'production'`)**: **4.5 MB** maximum request body ceiling (matching Vercel serverless payload limits).
- **Development**: **15 MB** maximum ceiling.
Files exceeding these limits are rejected with HTTP 400 `FILE_TOO_LARGE`.

## Asynchronous Processing Seam

To prevent serverless execution timeouts:
- `POST /api/documents` stores metadata and raw bytes, sets status to `pending`, and immediately returns **`202 Accepted`** with the document ID.
- The pipeline (`parse` $\to$ `normalise` $\to$ `extract` $\to$ `chunk` $\to$ `embed`) runs detached via Next.js `after()` or background task.
- The UI polls `GET /api/documents/[id]` for status and step-by-step progress.
- In dev, passing `?sync=true` allows awaiting the pipeline synchronously for debugging convenience.

## Authentication & Security Posture

- **Access Control**: MVP single shared team password configured via server environment variables `AUTH_USERNAME` and `AUTH_PASSWORD`.
- **Timing-Safe Comparison**: Utilizes Web Crypto SHA-256 hashing and constant-time comparison to prevent timing side-channel attacks.
- **Session Tokens**: Signed HMAC-SHA256 tokens stored in `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=7 days` cookies (`mis_session`).
- **Secret Isolation**: `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `DATABASE_URL`, and `COOKIE_SECRET` are strictly server-side. Production client bundles contain zero references to these secrets.

