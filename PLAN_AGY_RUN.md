The complete, senior-level implementation plan has been derived directly from [`PRD.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/PRD.md), aligned with existing codebase assets, and written to:

* **File:** [`PLAN_AGY.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/PLAN_AGY.md)
* **Plan Artifact:** [`plan_agy.md`](file:///home/amann/.gemini/antigravity-cli/brain/64ac7de6-e4e2-4b4e-99a9-cdde8b83f1d7/plan_agy.md)

---

### Key Architectural Decisions Refining or Differing from `PLAN.md`

1. **File Storage under Vercel's Read-Only Filesystem**:
   * *The Issue:* `PLAN.md` initially assumed files could be saved to disk, which does not survive across invocations on Vercel's serverless environment.
   * *Decision:* Implemented a **Hybrid Postgres Blob Architecture**. Files $\le 4\text{ MB}$ (covering ~95% of monthly MIS spreadsheets) store raw binary in a `document_blobs` table (`bytea` in PostgreSQL) with cascading foreign keys. Files $> 4\text{ MB}$ have their text, chunks, embeddings, and metrics fully indexed, but mark `original_retained = false`. This guarantees zero third-party cloud dependencies for the MVP while preserving download and inspection capabilities.
2. **Embedding Model Dimensionality Reconciliation**:
   * *The Issue:* Gemini's embedding model (`gemini-embedding-001`) natively produces 3072 dimensions, but the database schema specifies `vector(1536)` with an HNSW cosine index.
   * *Decision:* Explicitly configure `@google/genai` calls with `config: { outputDimensionality: 1536 }`. This leverages Gemini's native Matryoshka Representation Learning (MRL) truncation, ensuring mathematical validity without schema mismatches.
3. **Decoupling File Upload from Pipeline Execution on Vercel**:
   * *The Issue:* `PLAN.md` suggested synchronous processing inside the upload request. Parsing multi-sheet spreadsheets, performing DeepSeek structured extraction, and calling throttled Gemini embeddings (with rate-limiting) can take 20–30+ seconds, which exceeds Vercel's 15s serverless execution limit.
   * *Decision:* The upload handler (`POST /api/documents`) persists metadata/blob and immediately responds with `202 Accepted`. Processing is triggered asynchronously using Next.js 15 `after()` (or dedicated dispatch), and the UI polls `GET /api/documents/[id]` for step-by-step progress.

---

### Questions Only a Human Can Answer

1. **Production Neon Database Connection String**:
   * Local development is fully configured against PostgreSQL 18.6 with `pgvector` (`postgresql://mis_app:mis_app_dev@127.0.0.1:5432/mis_dashboard`).
   * When promoting to Vercel (Milestone 6), what dedicated Neon connection string should be used for this application? *(Note: It must be distinct from the CRM's database to prevent mixing production deal data with portfolio MIS data).*
2. **Shared API Key Authorization**:
   * Please confirm that the existing `GEMINI_API_KEY` and `DEEPSEEK_API_KEY` configured locally in the workspace are authorized for use in the dashboard's preview and production deployments.

Please review the plan artifact and select **Proceed** when ready to begin execution.
# Portfolio MIS Intelligence Dashboard — Implementation Plan

The comprehensive technical implementation plan has been written to **[`PLAN_AGY.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/PLAN_AGY.md)** and captured in the implementation plan artifact.

No source code was modified, no database migrations were applied, and no git commits were made.

---

### Key Architectural Decisions Refining or Differing from `PLAN.md`

1. **Production File Retention under Vercel's Read-Only Filesystem (`PLAN.md` §2 & §3)**:
   * **Problem:** `PLAN.md` originally omitted how uploaded files are retained in Vercel's ephemeral serverless environment when users request downloads or previews.
   * **Decision:** Introduce a `document_blobs` table (`bytea` in PostgreSQL) for files $\le 4\text{ MB}$ (covering ~95% of monthly MIS spreadsheets). Files $> 4\text{ MB}$ have their text, chunks, embeddings, and metrics extracted into PostgreSQL, but mark `original_retained = false`. This guarantees zero third-party cloud dependencies (no S3 or Vercel Blob tokens required) for the MVP while preserving file download and preview capabilities. A clean `FileStorageProvider` abstraction allows upgrading to Vercel Blob or AWS S3 post-MVP without schema refactoring.

2. **Embedding Model Dimensionality Reconciliation (`PLAN.md` §0 & §4)**:
   * **Problem:** Gemini's `gemini-embedding-001` natively outputs 3072 dimensions, whereas the database schema specifies `vector(1536)` with an HNSW cosine index.
   * **Decision:** Explicitly configure `@google/genai` calls with `config: { outputDimensionality: 1536 }`. This utilizes Gemini's Matryoshka Representation Learning (MRL) truncation to guarantee 1536-dimensional vectors that cleanly match `vector(1536)` and prevent insertion errors.

3. **Decoupling File Upload from Pipeline Execution under Serverless Timeouts (`PLAN.md` §0 & §3)**:
   * **Problem:** Running multi-sheet parsing, DeepSeek structured extraction, and throttled Gemini embeddings (1s inter-call delay to respect the 100 RPM quota) synchronously inside `POST /api/documents` will exceed Vercel's 15s serverless execution timeout.
   * **Decision:** Decouple upload from processing: `POST /api/documents` persists the file and metadata, marks status as `pending`, and immediately returns `202 Accepted`. Processing runs asynchronously via Next.js 15 `after()`, updating `processing_jobs` across each stage (`parse` $\to$ `normalise` $\to$ `extract` $\to$ `chunk` $\to$ `embed`), while the client UI polls `GET /api/documents/[id]` for live status updates.

4. **Extensible Metrics Architecture without Schema Changes (`PLAN.md` §2)**:
   * **Mechanism:** The `metric_definitions` table stores canonical metric keys (`revenue`, `gross_margin`, `ebitda`, `burn`, `run_rate`), labels, units, directionality, and alias arrays. Adding future metrics (e.g. CAC, LTV, Headcount, Churn Rate) requires only an `INSERT` row—zero table alters or DDL migrations are required.

---

### Questions Only a Human Can Answer

1. **Production Neon Database URL**:
   * Local development is fully configured against PostgreSQL 18.6 with `pgvector` (`postgresql://mis_app:mis_app_dev@127.0.0.1:5432/mis_dashboard`).
   * When promoting to Vercel (Milestone 6), what dedicated Neon connection string should be used for this application? *(Note: It must be an isolated database, distinct from the CRM's database, to prevent mixing deal-flow and portfolio MIS data).*

2. **Shared API Key Authorization**:
   * Please confirm that the existing `GEMINI_API_KEY` and `DEEPSEEK_API_KEY` configured in the local development environment are authorized for the dashboard's preview and production deployments on Vercel.
EXIT=0
