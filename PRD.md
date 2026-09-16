# PRD — Portfolio MIS Intelligence Dashboard

> Source: product owner's brief. This is the authoritative requirement set for the project in this folder.
> The engineering lead (Hermes) has separately recorded the executing plan in `PLAN.md`; this file is the input
> from which the coding agent must derive the **full implementation plan** (`PLAN_AGY.md`).

## 1. What we are building

An internal **portfolio-management intelligence platform** for WEH Ventures that tracks MIS reports from
**~30–40 portfolio companies**.

**Problem today:** portfolio managers track MIS files manually across Excel and PDF. Answering "What was Noto's
revenue in June?", "What is the monthly burn rate?", "Show EBITDA trend for the last 6 months", "Which companies have
declining gross margins?" means manually locating and opening individual files.

**Solution:** one web platform where portfolio companies are managed in one place, monthly MIS files are uploaded,
documents are parsed and indexed, standard financial metrics are extracted and visualised automatically, and users
can ask natural-language questions over the uploaded documents with answers grounded in retrieved source documents
that cite the relevant file.

The product should feel like a polished, modern internal portfolio CRM/MIS tool inspired by the simplicity of
WEHCRM, **without copying its branding or proprietary design**.

## 2. Required tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui or equally polished components,
  Recharts or similar, React Context API for lightweight global state.
- **Backend:** Next.js Route Handlers / server-side functions, Node/TypeScript, secure server-side API integrations.
- **Database:** PostgreSQL on Neon; Drizzle ORM or Prisma (choose the more appropriate); migrations and a clean
  schema; `pgvector` for semantic search if the Neon setup supports it.
- **AI:** Gemini API for embeddings; DeepSeek API for generation, reasoning and structured extraction; Vercel AI SDK
  where useful; Mastra **only** if it provides genuine value (do not add it merely because a PRD mentioned it).
- **File processing:** `.xlsx` (and `.xls` if practical) and `.pdf`, preserving enough source context to answer
  questions accurately.
- **Deployment:** Vercel (Vercel CLI) + Neon.

## 3. AI model strategy

- **Embeddings — Gemini:** document chunks, extracted financial text, and natural-language user queries. The model
  name must be configurable via environment variables (availability/naming changes).
- **Generation & reasoning — DeepSeek:** RAG answers, structured financial metric extraction where appropriate,
  interpreting retrieved financial context, producing concise accurate answers. Model also env-configurable.
- **Do not hardcode model names in multiple places.**

## 4. Project location and structure

- Live inside the existing `intern-weh` folder as a new project folder: **`mis-intelligent-dashboard`**.
- Inspect the existing repository first (structure, package manager, conventions, reusable components/config) and
  **do not blindly overwrite existing work**.
- Organise as a scalable **Next.js monorepo**, while avoiding unnecessary complexity for an MVP.

## 5. Core features

### A. Portfolio company directory
- Display ~30–40 companies in a clean table or grid; search; filter/sort where useful.
- Summary info per company: name, industry, latest reporting month, latest revenue (if available), latest EBITDA
  (if available), document count, last updated.
- Company management: create, edit, view profile, delete/archive with appropriate safeguards.
- Must not feel like a generic admin panel — it should feel like a thoughtful portfolio-management product.

### B. MIS document upload
- Upload PDF and Excel files; multiple uploads where practical; every document associated with a company.
- Store metadata: filename, company, reporting period, file type, upload timestamp, processing status, error status.
- Show upload and processing states clearly; prevent duplicate uploads where sensible; allow viewing uploaded
  documents and their processing status.
- Pipeline: `Upload → Store metadata → Parse file → Normalize content → Extract metrics → Chunk content → Generate
  embeddings → Store searchable data → Mark processed`.
- Synchronous or request-triggered processing is acceptable for the MVP **if reliable**, but the code must be
  structured so background processing can be introduced later.
- If Vercel execution limits make large-file processing unsuitable, design a practical workaround rather than
  ignoring the issue.

### C. Automated financial dashboard
- Standard metrics: Net Revenue, Gross Margin, EBITDA, Burn Rate, Run Rate.
- Architecture must allow additional metrics later without redesigning the database.
- Month-on-month trend charts, line charts for historical trends, bar charts where useful, current/latest metric
  cards, reporting-period selector, empty states when data is unavailable, clear indication of
  estimated/extracted/manually-verified values, and a source document reference for extracted metrics.
- **Do not fabricate financial data.** If a document does not contain a metric, show it as unavailable rather than
  inventing a value.
- **Extraction must handle inconsistency:** MIS files vary in layouts, sheet names, headers and metric labels.
  Build a normalisation layer covering variants such as Revenue/Net Revenue/Sales, EBITDA/EBITDA %, Gross
  Margin/GM %, Burn/Monthly Burn, Run Rate/ARR/Annualized Revenue. Do not assume every company uses the same
  spreadsheet format. Preserve raw extracted context and confidence/traceability where possible.

### D. Global AI query / RAG interface
- Global search/chat interface, also available on individual company pages.
- Example queries: "What was Noto's revenue in June?", "What was the EBITDA margin last month?", "Show me the burn
  rate trend for this company", "Compare revenue between April and June", "What changed in the latest MIS?",
  "Which document contains the June gross margin?"
- RAG flow: `User Query → Query Understanding → Gemini Embedding → pgvector Similarity Search → Retrieve Relevant
  Chunks → DeepSeek → Grounded Answer + Sources`.
- Requirements: global + company-scoped querying (retrieval restricted to the selected company on a company page),
  relevant source citations, source filename and reporting period in citations, clear handling when information is
  not found, no unsupported claims beyond retrieved context, loading/error/empty states, conversation history within
  the session if practical.
- Answer quality: answer directly first; mention the relevant reporting period; use retrieved context; cite the
  document used; never pretend missing information exists; distinguish reported from calculated figures; explain
  calculations when deriving a number, labelling it clearly as calculated.

## 6. Suggested database design (minimum)

- **companies:** id, name, slug, industry, description, createdAt, updatedAt
- **documents:** id, companyId, filename, storage reference, file type, reporting period, processing status,
  processing error, uploadedAt, processedAt
- **document chunks:** id, documentId, companyId, content, metadata, embedding, chunk index
- **metrics:** id, companyId, documentId, metric name, metric value, unit, reporting period, source reference,
  extraction confidence/status, createdAt, updatedAt
- Optional (only if they improve the real architecture): query history, chat sessions, metric definitions,
  document processing jobs, audit logs.
- Proper indexes, foreign keys, constraints and vector indexes where appropriate.

## 7. UI/UX direction

Simple, bright, polished, modern dashboard: light mode primary with dark mode support, clean typography, excellent
spacing, subtle borders, soft neutral backgrounds, clear visual hierarchy, responsive design, smooth but restrained
interactions, professional charts, excellent loading and empty states, keyboard-accessible interactions,
mobile-friendly layouts. Think modern internal SaaS / portfolio intelligence terminal / clean CRM — **not** a
cluttered enterprise admin template.

**Pages:** `/` (portfolio overview: company summary cards, recent uploads, portfolio-level insights, global AI query
entry), `/companies` (directory, search/filters, add company), `/companies/[slug]` (overview, KPI cards, MoM charts,
documents, AI query), `/companies/[slug]/documents` (document list, upload interface, processing statuses, document
details), `/settings` (basic settings if needed). Create reusable components rather than duplicating UI.

## 8. Security and reliability

Never expose API keys to the browser; keep DeepSeek/Gemini/database credentials server-side; use environment
variables; validate uploaded file types and sizes; sanitise filenames and metadata; validate all API inputs; avoid
SQL injection and unsafe query construction; handle failed AI requests gracefully; do not log secrets or sensitive
document contents unnecessarily; add basic authentication or a clearly documented MVP access-control approach; do
not claim enterprise-grade security if it has not been implemented. `.env.example` with variable names only.

## 9. Environment variables

Provided separately and securely: `DATABASE_URL`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`. Also consider
`GEMINI_EMBEDDING_MODEL`, `DEEPSEEK_MODEL`, `NEXT_PUBLIC_APP_URL`. Never ask the owner to paste secrets into source
files; if a key is already available in the environment, use it; if not, state exactly which variable is missing.

## 10. Deployment requirements

Vercel CLI workflow: verify the project builds locally → verify env var requirements → link or create the Vercel
project → configure the correct framework and root directory → deploy a preview → test the deployed application →
deploy to production if the preview is healthy. The project lives at `intern-weh/mis-intelligent-dashboard`; Vercel's
root directory and build configuration must be correct for the chosen monorepo structure. **Do not claim deployment
succeeded unless it was actually verified.**

## 11. Engineering quality bar

No fake buttons. No dead navigation. No hardcoded demo data presented as real data. No placeholder AI responses
pretending to be real. No unhandled TypeScript errors. No broken responsive layouts. No unnecessary dependencies. No
overcomplicated architecture for a small MVP. No skipping validation because the UI looks good. No stopping after
generating a plan. Clean folder structure, typed APIs, reusable services, proper error handling, maintainable code.
When a feature cannot be fully implemented due to an external limitation, implement the best working version,
clearly document the limitation, and continue building the rest.

## 12. Deliverables

1. Working project in `intern-weh/mis-intelligent-dashboard`
2. Polished responsive frontend
3. Neon PostgreSQL integration
4. Database schema and migrations
5. PDF/XLSX upload and processing pipeline
6. Financial metric extraction and storage
7. MoM dashboard visualizations
8. Gemini embeddings integration
9. DeepSeek RAG query integration
10. Source-cited AI answers
11. Proper environment configuration
12. README with setup and deployment instructions
13. `.env.example`
14. Tests / validation
15. Successful Vercel deployment, if credentials and access permit

Plus a final engineering summary: what was built, architecture decisions, files/packages created, how to run
locally, required environment variables, tests/build results, deployment URL, known limitations, recommended next
steps.
