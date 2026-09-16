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

## Health Check Endpoint

When the web app is running:
`GET /api/health` returns:
```json
{ "ok": true, "db": "up" }
```
