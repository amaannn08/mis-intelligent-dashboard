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

## Product UI & Design Architecture (Run 4)

The product interface is designed as a polished portfolio intelligence terminal tailored for investment teams and general partners. Built with Next.js 15 App Router, React 19, Tailwind CSS v4, Recharts, and shadcn/ui primitives.

### Design Principles
- **Light-First, Dark Supported**: System, light, and dark mode toggles with immediate persistence via `next-themes`.
- **Numbers are First-Class**: Tabular numbers (`font-mono`), right-aligned numeric data, consistent compact Indian currency formatting (`₹1.2 Cr`, `₹45.6 L`, `12.4%`, `-₹8.3 L`), and explicit "Not available" states with contextual tooltips instead of deceptive zeros.
- **Restrained Motion**: Sub-200ms subtle opacity and translation transitions; no gratuitous animation.
- **Resilient States**: Every view implements explicit **Loading (Skeleton)**, **Empty (Actionable guidance)**, and **Error (Recovery action)** states.
- **Asynchronous Live Processing**: Multi-file dropzone displays and enforces the 4.5 MB upload ceiling (15 MB in dev). The UI accepts `202 Accepted` and polls status transitions live (`pending` → `parsing` → `extracting` → `embedding` → `processed`/`failed`) with spinners and failure reason surfacing.
- **Full Responsiveness**: Adaptive layouts from 380px mobile viewports up to 1440px+ ultra-wide displays. Tables collapse to native card views on narrow viewports without horizontal scrolling.
- **Keyboard Accessibility**: Focus-visible rings, semantic buttons and links, labelled inputs, Escape closes modals/drawers, and global <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> opens the portfolio query palette.

### Page Directory
1. **`/login`**: Team authentication gate with autofocus, labelled credentials, honest validation errors, and redirect handling.
2. **`/` (Portfolio Overview)**: 5 KPI cards (tracked companies, processed docs, latest month, reporting rate, total revenue), aggregated monthly revenue trend chart, recent MIS uploads list, and an inline global RAG query box.
3. **`/companies`**: Searchable and filterable investment directory with industry dropdown, multi-criteria sorting (name, revenue, reporting period, updated), pagination, desktop table + mobile cards, and an "Add Company" modal.
4. **`/companies/[slug]`**: Company workspace displaying company metadata, 5 standard KPI cards (Net Revenue, Gross Margin, EBITDA, Net Cash Burn, Annual Run Rate) with MoM delta indicators, interactive Recharts trend chart with metric selector tabs & period range filters, extracted financial metrics matrix table with source coordinate inspection popover, scoped streaming AI query panel, and recent filings.
5. **`/companies/[slug]/documents`**: Document Center with drag & drop file upload, upload queue with per-file progress, documents table with status pills, error surfacing, original file download (when retained), delete confirmation dialog, and a document detail drawer showing extracted metrics, job execution timeline, and source references.
6. **`/settings`**: Diagnostics and definitions displaying live database connectivity, pgvector index health, active AI models, canonical metric definitions with recognized aliases, environment configuration audit (variable names only, never secrets), and documented MVP access control notes.

### Verification Screenshots

All routes and interactions have been verified via a headless Chromium browser over CDP at 1440×900 and 412×915 (and 380px width) with 0 console errors:

| Screen | Viewport | Preview | Description |
|---|---|---|---|
| **Login** | Desktop 1440×900 | [`docs/screenshots/01_login_desktop.png`](docs/screenshots/01_login_desktop.png) | Team login card with autofocus and theme toggle |
| **Portfolio Overview** | Desktop 1440×900 | [`docs/screenshots/02_overview_desktop.png`](docs/screenshots/02_overview_desktop.png) | KPI strip, portfolio revenue chart, recent uploads, global AI query |
| **Company Directory** | Desktop 1440×900 | [`docs/screenshots/03_companies_desktop.png`](docs/screenshots/03_companies_desktop.png) | Directory table, industry filter, search, sort, "Add Company" trigger |
| **Company Workspace** | Desktop 1440×900 | [`docs/screenshots/04_company_workspace_desktop.png`](docs/screenshots/04_company_workspace_desktop.png) | 5 KPI cards with MoM deltas, Recharts area trend, metrics matrix |
| **Document Center** | Desktop 1440×900 | [`docs/screenshots/05_documents_desktop.png`](docs/screenshots/05_documents_desktop.png) | Dropzone with 4.5 MB ceiling notice, filings table, status pills |
| **Document Detail Drawer** | Desktop 1440×900 | [`docs/screenshots/06_document_drawer_desktop.png`](docs/screenshots/06_document_drawer_desktop.png) | Slide-over drawer with 4-stage job log, extracted metrics, download/delete |
| **Streaming AI Query** | Desktop 1440×900 | [`docs/screenshots/07_query_stream_desktop.png`](docs/screenshots/07_query_stream_desktop.png) | Live streaming DeepSeek answer with clickable grounding citations |
| **Diagnostics & Definitions** | Desktop 1440×900 | [`docs/screenshots/08_settings_desktop.png`](docs/screenshots/08_settings_desktop.png) | Database status, active AI models, canonical metric alias dictionary |
| **Dark Mode Theme** | Desktop 1440×900 | [`docs/screenshots/09_dark_mode_desktop.png`](docs/screenshots/09_dark_mode_desktop.png) | High-contrast dark theme across UI surfaces and charts |
| **Login (Mobile)** | Mobile 412×915 | [`docs/screenshots/10_login_mobile.png`](docs/screenshots/10_login_mobile.png) | Mobile responsive login card |
| **Portfolio Overview (Mobile)** | Mobile 412×915 | [`docs/screenshots/11_overview_mobile.png`](docs/screenshots/11_overview_mobile.png) | Mobile stack with KPI cards and responsive charts |
| **Company Directory (Mobile)** | Mobile 412×915 | [`docs/screenshots/12_companies_mobile.png`](docs/screenshots/12_companies_mobile.png) | Collapsed card view replacing tables on narrow viewports |
| **Company Workspace (Mobile)** | Mobile 412×915 | [`docs/screenshots/13_company_workspace_mobile.png`](docs/screenshots/13_company_workspace_mobile.png) | Responsive mobile workspace with stacked KPIs and controls |
| **Document Center (Mobile)** | Mobile 412×915 | [`docs/screenshots/14_documents_mobile.png`](docs/screenshots/14_documents_mobile.png) | Mobile upload queue, filing cards, and action buttons |
| **Settings (Mobile)** | Mobile 412×915 | [`docs/screenshots/15_settings_mobile.png`](docs/screenshots/15_settings_mobile.png) | Responsive diagnostics cards on mobile |
| **Narrow Viewport (380px)** | Mobile 380×800 | [`docs/screenshots/16_viewport_380px.png`](docs/screenshots/16_viewport_380px.png) | Verified 0 horizontal overflow (`scrollWidth <= clientWidth`) |

