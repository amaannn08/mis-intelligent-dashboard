# MIS Intelligence Dashboard

Portfolio MIS Intelligence Dashboard for WEH Ventures — automated monthly MIS extraction, financial metric normalization, semantic retrieval (RAG) with grounded source citations, and portfolio KPI tracking.

---

## 1. What It Is

The **Portfolio MIS Intelligence Dashboard** transforms unstructured monthly portfolio MIS filings (Excel workbooks `.xlsx`, `.xls` and PDF board decks `.pdf`) into structured, verified financial intelligence for investment teams and general partners:

- **Deterministic & Grounded Normalization**: Ingests raw tabular statements, detects units (Lakhs, Crores, Millions, Thousands), parses fiscal periods (`Jun-25`, `Q1 FY26`, `2025-06`), resolves noisy row labels to canonical metric keys (`revenue`, `ebitda`, `gross_margin`, `burn`, `run_rate`), and rejects ungrounded metric fabrications.
- **pgvector Vector Retrieval & Semantic Search**: Chunks documents with overlap, generates 1536-dimensional embeddings via Google Gemini (`gemini-embedding-001`), and indexes vectors via HNSW cosine distance (`vector_cosine_ops`).
- **Grounded RAG with DeepSeek**: Answers natural language portfolio queries with streaming reasoning, strict refusal policies when data is absent, and clickable source citations `[1]`, `[2]` carrying sheet name, period, and row coordinates.
- **Executive Portfolio Terminal**: Next.js 15 App Router interface with responsive KPI cards, Recharts interactive MoM financial trend visualizations, document upload dropzone with asynchronous live status polling, and high-contrast light/dark themes.

---

## 2. System Architecture

### Monorepo Structure (npm workspaces)

```
mis-intelligent-dashboard/
├── package.json               # Root workspaces: ["apps/*", "packages/*"]
├── vercel.json                # Monorepo build and deploy configuration
├── vitest.config.ts           # Vitest configuration with workspace aliases
├── .env.example               # Documented template for environment variables
├── apps/
│   └── web/                   # Next.js 15 App Router (React 19, Tailwind CSS v4, shadcn/ui)
│       ├── src/app/           # Routes: /, /companies, /companies/[slug], /settings, /login, /api/*
│       ├── src/components/    # Reusable UI primitives, AppShell, KPI cards, charts, dropzone
│       ├── src/lib/           # Server-only utilities (auth, companies, documents, formatters)
│       └── src/middleware.ts  # Session authentication gating & public route whitelist
├── packages/
│   ├── db/                    # @mis/db — Drizzle ORM, schema definitions, migrations, seeds
│   │   ├── drizzle/           # SQL migration files (pgvector extension, HNSW index, tables)
│   │   ├── src/schema/        # Drizzle table schemas (companies, documents, chunks, metrics)
│   │   └── src/seed/          # Metric definitions and CRM portfolio company seed scripts
│   └── core/                  # @mis/core — Parsing, normalization, chunking, embeddings, RAG
│       ├── src/parsing/       # SheetJS (.xlsx/.xls) and unpdf (.pdf) extraction
│       ├── src/normalisation/ # Label aliases, number scaling, and fiscal period parsers
│       ├── src/chunking/      # Structured chunking with overlap and source metadata
│       ├── src/embeddings/    # Gemini 1536-dim vector embeddings
│       ├── src/rag/           # pgvector retrieval, numbered context, and citation parser
│       └── src/pipeline/      # 4-stage document processing engine (parse->extract->chunk->embed)
└── tests/                     # Vitest automated test suites protecting risky logic
```

### Data Pipeline & Retrieval Architecture

```
[Monthly MIS Upload (.xlsx, .xls, .pdf)]
                 │
                 ▼
         POST /api/documents
    (Validates size <= 4.5MB prod / 15MB dev, MIME, magic bytes, SHA-256 checksum)
                 │
                 ├── Store metadata & raw binary (Postgres `document_blobs` bytea)
                 ├── Return HTTP 202 Accepted immediately
                 │
                 ▼ (Detached Execution via Next.js after())
      ┌──────────────────────────────────────────────────────────┐
      │  Step 1: Parse (SheetJS / unpdf -> raw text + tables)    │
      │  Step 2: Normalise & Extract (Regex + Alias Map + Scale) │
      │  Step 3: Chunk (~800 tokens, 100 overlap + source refs)  │
      │  Step 4: Embed (Gemini 1536-dim vector embeddings)       │
      └──────────────────────────────────────────────────────────┘
                 │
                 ▼
      PostgreSQL 16 + pgvector
      ├── `companies` (portfolio directory)
      ├── `documents` & `document_blobs` (files & status)
      ├── `metrics` (structured financial time-series)
      ├── `document_chunks` (HNSW cosine similarity index)
      └── `processing_jobs` (audit log for pipeline steps)
                 │
                 ▼
         POST /api/query (RAG)
    (Gemini embedding -> pgvector cosine Top-K -> Numbered Context -> DeepSeek stream)
```

### Chat API Surface & Hybrid Retrieval Architecture

#### Chat Session Management Endpoints
- `GET /api/chat/sessions`: Lists the latest 50 chat sessions ordered by `updatedAt DESC` with `id`, `title`, `companyId`, `companyName`, `messageCount`, `lastMessagePreview`, and `updatedAt`.
- `POST /api/chat/sessions`: Creates a new session (`{ companyId?: uuid | null, title?: string }`, default title `'New chat'`). Returns `{ session: { id, title, companyId, companyName } }`.
- `GET /api/chat/sessions/[id]`: Returns session details and full chronological messages `[{ id, role, content, citations, createdAt }]`.
- `PATCH /api/chat/sessions/[id]`: Updates session title or company scope (`companyId: null` targets entire portfolio).
- `DELETE /api/chat/sessions/[id]`: Deletes session and cascades all messages. Returns `{ ok: true }`.
- All session endpoints require authenticated session cookie (`mis_session`).

#### Hybrid Retrieval Engine (`@mis/core`)
Vector search alone cannot answer aggregate ranking questions ("which company has the highest burn?") or multi-company comparisons ("compare NOTO and Jar revenue"). The hybrid retrieval system resolves this deterministically:
1. **Deterministic Question Router (`routeQuestion`)**:
   - **Company Scope**: Resolves company mentions (case-insensitive name, slug, or parenthetical alias e.g. "Flent (Slaash)" $\to$ "Slaash"). Explicit question mentions take precedence over session scope; multi-company mentions trigger portfolio-wide scope (`companyId: null`).
   - **Intent Classification**: Classifies intent as `'metrics'`, `'documents'`, or `'mixed'` based on metric keywords (`revenue`, `ebitda`, `gross_margin`, `burn`, `run_rate`), ranking words (`highest`, `lowest`, `top`, `compare`, `vs`), and narrative indicators (`why`, `how`, `commentary`).
2. **Structured Retrieval Path**:
   - For `'metrics'` and `'mixed'` intents, queries the `metrics` table with company and document joins.
   - Computes latest period value, previous period value, MoM % change (using $|V_{prev}|$ in denominator for correct calculation on negative burn/losses), and source coordinates.
   - For single-company queries, returns the series of the last 6 periods; for ranking queries, orders all portfolio companies by metric value.
3. **Document Vector Path**:
   - Runs pgvector cosine similarity search (`topK = 8` for company-scoped queries, `16` for portfolio-wide). Groups excerpts by company.
   - Unifies document chunks with structured metric sources so every metric cited corresponds to a verified `[n]` citation.
4. **Multi-turn Memory & Grounding Invariants**:
   - Loads the last 6 messages of the session as `Conversation so far:`, with assistant messages truncated to ~1200 characters to resolve conversational pronouns (e.g. "and their burn?").
   - Auto-titles initial sessions from the first 60 characters of the user prompt and updates `updatedAt`.
   - Strictly enforces prompt invariant: *Numbers may ONLY come from retrieved context/metrics, not from conversation history.*

---

## 3. Prerequisites

- **Node.js**: `>= 20.x` (tested on `26.8.1`)
- **npm**: `>= 10.x` (tested on `12.0.2`)
- **PostgreSQL**: `16+` with `vector` (pgvector 0.8+) extension enabled

---

## 4. Environment Setup

Copy `.env.example` to the required locations:

```bash
cp .env.example apps/web/.env.local
cp .env.example packages/db/.env
```

### Environment Variables Reference

| Variable | Required | Description | Example / Default |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string with pgvector support. | `postgresql://mis_app:mis_app_dev@127.0.0.1:5432/mis_dashboard` |
| `CRM_DATABASE_URL` | Optional | Direct read-only connection to CRM database for company seeding. | `postgresql://readonly@crm.example.com/crm` |
| `AUTH_USERNAME` | Yes | Team login username for MVP dashboard access. | `wehcrm` |
| `AUTH_PASSWORD` | Yes | Team login password. | `REDACTED_PASSWORD` |
| `COOKIE_SECRET` | Yes | HMAC-SHA256 secret key for signing session cookies (min 32 chars). | `openssl rand -hex 32` |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for generating 1536-dim embeddings. | `AIzaSy...` |
| `GEMINI_EMBEDDING_MODEL`| Yes | Embedding model identifier. | `gemini-embedding-001` |
| `EMBEDDING_DIMENSIONS` | Yes | Dimension size for vector columns and embeddings. | `1536` |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key for generative query answering. | `sk-...` |
| `DEEPSEEK_BASE_URL` | Yes | OpenAI-compatible endpoint URL for DeepSeek. | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Yes | Model identifier for generation. | `deepseek-chat` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public application URL for redirects and absolute links. | `http://localhost:3000` |
| `PORT` | No | Local web server port (default 3000). | `3000` |

---

## 5. Local Development

### Installation & Run

```bash
# Clean install dependencies across all workspaces
npm ci

# Start Next.js development server
npm run dev

# Open http://localhost:3000
```

### Quality Checks & Build

```bash
# Typecheck all workspaces with zero TypeScript errors
npm run typecheck

# Lint all workspaces with zero ESLint errors
npm run lint

# Build production bundle for apps/web
npm run build
```

---

## 6. Database Setup, Migrations & Seeding

### Running Migrations

Applies Drizzle schema migrations to PostgreSQL, creates the `vector` extension if not already present, and builds all tables and HNSW cosine distance indexes:

```bash
npm run db:migrate
```

### Seeding Data

Runs both canonical financial metric definitions and the read-only CRM company import:

```bash
# Seed both metric definitions and CRM portfolio companies
npm run db:seed

# Seed only canonical metric definitions (Revenue, EBITDA, Gross Margin, Net Burn, ARR)
npm run db:seed:metrics

# Seed only portfolio companies from the CRM database (strictly read-only SELECT)
npm run db:seed:crm
```

### Database GUI (Drizzle Studio)

```bash
npm run db:studio
```

---

## 7. Testing

Automated test suites are implemented in **Vitest** to protect the high-risk logic of the pipeline:

```bash
# Run all test suites
npm run test
```

### Test Coverage Summary (62 Passing Tests)

1. **`tests/normalisation.test.ts`**:
   - **Label Resolution**: Resolves labels (`Net Revenue`, `Operating EBITDA`, `ARR`, `Net Cash Burn`) to canonical keys.
   - **Percent vs Absolute**: Enforces invariant that percent metrics (`EBITDA %`, `Gross Margin %`) never match absolute currency metrics (`EBITDA`, `Gross Profit`).
   - **Parenthesised Accounting Negatives**: Verifies `(1,234.50)` $\to$ `-1234.50`, `1,234-` $\to$ `-1234`, `-1,234.75` $\to$ `-1234.75`.
   - **Period Parsing**: Correctly parses `2025-06`, `Jun-25`, `June 2025`, `06/2025`, `Q1 FY26` (Indian fiscal quarter), `FY25`, and filename year extraction.
   - **Unit Detection**: Detects scale multipliers (`Lakhs`, `Crores`, `Millions`, `Thousands`) and scales values accordingly.
2. **`tests/chunking.test.ts`**:
   - **Overlap Correctness**: Preserves line overlap between consecutive chunks when content exceeds target token ceiling.
   - **Source Metadata**: Verifies metadata carries `company`, `companyId`, `documentId`, `filename`, `reportingPeriod`, `sheetName`, `pageNumber`, `rowStart`, `rowEnd`.
   - **Coverage Invariant**: Confirms zero text is lost across chunk boundaries.
3. **`tests/rag-citations.test.ts`**:
   - **Numbered Context**: Builds `[1]`, `[2]` blocks containing document name, reporting period, company name, and sheet/row coordinates.
   - **Citation Objects**: Extracts citation markers from answers and maps them to structured citation objects.
   - **Empty Retrieval Path**: Returns honest guidance when context contains no matching data without hallucination.
4. **`tests/api-validation.test.ts`**:
   - **Zod Schemas**: Rejects empty usernames, passwords, empty questions, invalid pagination limits, non-UUID parameters, and validates chat session schemas.
   - **File Size Ceilings**: Enforces 4.5 MB production ceiling and 15 MB development ceiling.
   - **Magic Byte Validation**: Detects and validates genuine XLSX (`PK\x03\x04`) and PDF (`%PDF-`) headers; rejects disguised files.
5. **`tests/auth-middleware.test.ts`**:
   - **Session Tokens**: Verifies cryptographic HMAC-SHA256 signature verification and token expiration.
   - **Tamper Protection**: Rejects modified payloads with invalid signatures.
   - **Constant-time Auth**: Verifies credential checks run in constant time.
   - **Route Gating**: Enforces 401 JSON error envelopes on API routes (`/api/companies`, `/api/chat/sessions`) and redirects on page routes.
6. **`tests/hybrid-rag.test.ts`**:
   - **Deterministic Question Router**: Company detection (single, multiple, none, session scope vs explicit mention, parenthetical alias); intent detection (`metrics` for "which company has the highest burn?", `documents` for "summarise NOTO's commentary", `mixed` for "why did revenue grow and what's the burn?"); metric key extraction.
   - **Structured Context Builder**: MoM calculation with negative-value support; INR and percentage formatting; ranking and series context generation.
   - **Prompt Invariants**: 6-message window; assistant truncation to ~1200 chars; strict prohibition of conversation history as a source of numbers.
7. **`tests/chat-sessions.test.ts`**:
   - **Lifecycle CRUD**: Session creation with default title `New chat`, listing with previews and message counts, retrieving session history, patching title and company scope (`null` for portfolio), and cascading deletion.
   - **Auth Gate & Error Handling**: 401 for unauthenticated calls; 404 for non-existent session UUIDs.

---

## 8. Deployment to Vercel

The repository is configured for one-shot Vercel monorepo deployment via root `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "npm run build --workspace=apps/web",
  "installCommand": "npm ci",
  "outputDirectory": "apps/web/.next"
}
```

### Required Vercel Environment Variables

The following environment variables **must be configured in Vercel for both Production and Preview environments**:

1. `DATABASE_URL` (Dedicated Neon Postgres instance with pgvector)
2. `GEMINI_API_KEY` (Google Gemini API access)
3. `GEMINI_EMBEDDING_MODEL` (`gemini-embedding-001`)
4. `EMBEDDING_DIMENSIONS` (`1536`)
5. `DEEPSEEK_API_KEY` (DeepSeek generative model access)
6. `DEEPSEEK_BASE_URL` (`https://api.deepseek.com`)
7. `DEEPSEEK_MODEL` (`deepseek-chat`)
8. `AUTH_USERNAME` (Dashboard team login username)
9. `AUTH_PASSWORD` (Dashboard team login password)
10. `COOKIE_SECRET` (Random 32+ character hex string for cookie signing)
11. `NEXT_PUBLIC_APP_URL` (Canonical Vercel deployment URL)

### Filesystem Independence Guarantee

Vercel functions run in an ephemeral, read-only serverless filesystem. The application guarantees 100% filesystem independence:
- **Zero Local Disk Dependencies**: Files $\le 4$ MB store raw bytes in PostgreSQL `document_blobs` (`bytea`).
- **Download Route**: `/api/documents/[id]/file` streams retained bytes directly from PostgreSQL.
- **Detached Pipeline**: `processDocument` reads binary data directly from `document_blobs` when disk files do not exist.

---

## 9. Locked Architectural Decisions & Trade-offs

| Decision | Implementation | Trade-off & Rationale |
|---|---|---|
| **Package Manager** | npm workspaces | Native to Node.js without extra runtime tools; aligns with WEH stack. |
| **Database** | PostgreSQL 16+ with pgvector | Single transactional source of truth for tabular data, metrics, and vector embeddings. |
| **ORM** | Drizzle ORM | Zero-binary, SQL-first, first-class custom type support for `vector(1536)`. |
| **Vector Index** | HNSW (`vector_cosine_ops`) | Sub-millisecond approximate nearest neighbor retrieval directly inside Postgres. |
| **Authentication** | Shared team password + HttpOnly cookie | Lightweight MVP access control; avoids heavy auth infrastructure while protecting internal portfolio data. |
| **Original File Retention** | `document_blobs` table (`bytea`) for $\le 4$ MB | Eliminates external S3/Blob dependency for 95% of monthly MIS spreadsheets; files $> 4$ MB parse in full but omit binary retention to preserve database memory. |
| **Upload Ceilings** | 4.5 MB prod / 15 MB dev | Conforms strictly to Vercel serverless request body limits (4.5 MB). |
| **Processing Seam** | Detached execution via Next.js `after()` | Upload returns `202 Accepted` immediately; pipeline executes asynchronously with live UI status polling. |

---

## 10. Known Limitations

1. **Shared Team Credentials**: Authentication uses a single team password rather than multi-tenant user accounts with role-based access control (RBAC).
2. **Original Binary Retention Ceiling**: Files larger than 4 MB are fully indexed and chunked, but their raw spreadsheet binary is not retained in PostgreSQL.
3. **Serverless Execution Timeout**: Extremely large workbooks with 50+ sheets may exceed the Vercel standard 60-second function timeout during detached processing.

---

## 11. Next Steps

1. **Background Job Queue**: Offload `processDocument` from Next.js `after()` to a dedicated worker queue (e.g. BullMQ, Inngest, or QStash) for multi-minute document processing.
2. **External Blob Storage**: Connect Vercel Blob or AWS S3 for raw file retention exceeding 4 MB.
3. **Multi-User Auth**: Integrate Google OAuth or WorkOS for individual partner audit trails.
4. **Automated MIS Email Ingestion**: Add an inbound webhook to parse MIS attachments directly from founder emails.

---

## 12. Verification Screenshots (Run 4)

All routes and responsive breakpoints have been verified via headless Chromium with **0 console errors** and **0 failed requests**:

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
