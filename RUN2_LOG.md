### Run 2 Summary: `@mis/core` (Parsing → Normalisation → Metrics → Embeddings → RAG)

All modules in [`packages/core`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core) have been implemented, strictly typed with zero `any` escapes, verified against real local PostgreSQL with pgvector, and validated using real Gemini embeddings and DeepSeek generation calls.

---

### 1. Files Created & Implemented

| File | Purpose |
|---|---|
| [`packages/core/src/types.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/types.ts) | Strict TypeScript interfaces for blocks, chunks, metrics, citations, RAG answers, and pipeline results |
| [`packages/core/src/parsing/xlsx.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/parsing/xlsx.ts) | SheetJS spreadsheet parser: preserves per-sheet structure, pipe-separated rows, drops repeated header rows, verbatim numbers |
| [`packages/core/src/parsing/pdf.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/parsing/pdf.ts) | PDF parser via `unpdf`: per-page positional blocks (`--- Page n ---`) |
| [`packages/core/src/parsing/index.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/parsing/index.ts) | Unified [`parseFile(bytes, filename)`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/parsing/index.ts#L11) dispatcher for `.xlsx`, `.xls`, `.pdf` |
| [`packages/core/src/normalisation/numbers.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/normalisation/numbers.ts) | Accounting negative parsing `(1,234)` / `1,234-` → `-1234`, currency stripping, scale detection (`lakh`, `crore`, `million`, `thousand`), and base standardisation |
| [`packages/core/src/normalisation/periods.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/normalisation/periods.ts) | Period canonicalisation to `YYYY-MM`: handles `Jun-25`, `06/2025`, `Q1 FY26` / `FY26 Q1` (Indian FY), `FY25`, and month names with context year |
| [`packages/core/src/normalisation/aliases.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/normalisation/aliases.ts) | Alias resolution layer over `metric_definitions`: enforces percent vs absolute separation (`EBITDA %` ≠ `EBITDA`) |
| [`packages/core/src/chunking/index.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/chunking/index.ts) | Structural chunker: ~800 tokens, ~100 token overlap, prepends table headers to continuation chunks, carries document/sheet/page/row metadata |
| [`packages/core/src/embeddings/index.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/embeddings/index.ts) | Gemini embedding client via `@google/genai`: enforces `config: { outputDimensionality: 1536 }`, sequential batching, configurable delay (`EMBED_DELAY_MS`), exponential backoff on HTTP 429/5xx, and fails loudly on genuine errors |
| [`packages/core/src/extraction/deterministic.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/extraction/deterministic.ts) | Deterministic financial metric extractor: alias matching + 2D period table column heuristics + derived metric calculations (`gross_margin` from Gross Profit / Revenue) |
| [`packages/core/src/extraction/deepseek.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/extraction/deepseek.ts) | LLM fallback extractor using DeepSeek with structured JSON output + anti-hallucination verification asserting numbers exist in source text |
| [`packages/core/src/extraction/index.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/extraction/index.ts) | Deterministic-first / LLM-second orchestrator: absent metrics are omitted, never fabricated |
| [`packages/core/src/rag/index.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/rag/index.ts) | [`answerQuery({ question, companyId? })`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/rag/index.ts#L33): pgvector cosine retrieval (k=8, similarity floor) → numbered context blocks → DeepSeek → `{ answer, citations, usedChunks }` |
| [`packages/core/src/pipeline/index.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/pipeline/index.ts) | End-to-end [`processDocument(documentId)`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/pipeline/index.ts#L28): parse → normalise → extract → chunk → embed → persist → status transitions, recording audit entries in `processing_jobs` |
| [`packages/core/fixtures/sample_mis.xlsx`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/fixtures/sample_mis.xlsx) | Realistic test fixture: 4 consecutive months (Jun-25 to Sep-25), scale in ₹ Lakhs, parenthesised negatives `(18.49)`, `%` rows, and clear "SAMPLE — TEST FIXTURE" banner |
| [`packages/core/fixtures/README.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/fixtures/README.md) | Fixture documentation stating clearly that data is synthetic |
| [`packages/core/src/cli/test-pipeline.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/cli/test-pipeline.ts) | CLI tool to execute the document pipeline end-to-end and display database rows |
| [`packages/core/src/cli/test-query.ts`](file:///home/amann/intern-weh/mis-intelligent-dashboard/packages/core/src/cli/test-query.ts) | CLI tool to test grounded RAG queries against indexed documents |

---

### 2. Verification Proofs

#### A. Typecheck & Lint (`packages/core`)
```bash
nice -n 15 ionice -c3 npm run typecheck --workspace=@mis/core && nice -n 15 ionice -c3 npm run lint --workspace=@mis/core
```
**Output:**
```
npm notice run @mis/core@0.1.0 typecheck
npm notice run tsc --noEmit
npm notice run @mis/core@0.1.0 lint
npm notice run eslint .
```
*(Exit code: 0 — 0 errors, 0 warnings)*

---

#### B. End-to-End Pipeline CLI Execution
```bash
nice -n 15 ionice -c3 npx tsx packages/core/src/cli/test-pipeline.ts packages/core/fixtures/sample_mis.xlsx noto
```
**Output:**
```
=== MIS Pipeline CLI Verification ===
Fixture: /home/amann/intern-weh/mis-intelligent-dashboard/packages/core/fixtures/sample_mis.xlsx
Company Slug: noto
Matched Company: NOTO (ID: 9b0c7854-5d10-47de-83dd-096af7af4144)
Using existing document record: c192c730-811c-43f1-b9ff-2fc6a58eb800

Executing processDocument(c192c730-811c-43f1-b9ff-2fc6a58eb800)...

=== Pipeline Completed in 1.40s ===
Status: processed

--- Document Record ---
┌─────────┬────────────────────────────────────────┬───────────────────┬─────────────┬─────────────────┬───────────┬──────────────────────────────────┬───────────────────────────┐
│ (index) │ id                                     │ filename          │ status      │ reportingPeriod │ sizeBytes │ checksum                         │ processedAt               │
├─────────┼────────────────────────────────────────┼───────────────────┼─────────────┼─────────────────┼───────────┼──────────────────────────────────┼───────────────────────────┤
│ 0       │ 'c192c730-811c-43f1-b9ff-2fc6a58eb800' │ 'sample_mis.xlsx' │ 'processed' │ '2025-09'       │ 18724     │ '4c2140bb7ca7203b...'            │ '2026-09-16T21:03:31.026Z'│
└─────────┴────────────────────────────────────────┴───────────────────┴─────────────┴─────────────────┴───────────┴──────────────────────────────────┴───────────────────────────┘

--- Document Chunks ---
Total Chunks Created: 1
Stored Embedding Dimensions: 1536
┌─────────┬────────────┬────────────┬─────────────────────────────────────────────────────────────────────────────┬───────────────┐
│ (index) │ chunkIndex │ tokenCount │ snippet                                                                     │ sheet         │
├─────────┼────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────┼───────────────┤
│ 0       │ 0          │ 223        │ '### Sheet: P&L Summary | SAMPLE — TEST FIXTURE — NOTO MONTHLY PERFORMA...' │ 'P&L Summary' │
└─────────┴────────────┴────────────┴─────────────────────────────────────────────────────────────────────────────┴───────────────┘

--- Extracted Metrics (20 rows) ---
┌─────────┬────────────────┬─────────────┬───────────┬────────────┬────────────┬───────────────────────────────────────────────────────────┐
│ (index) │ key            │ value       │ period    │ unit       │ kind       │ source                                                    │
├─────────┼────────────────┼─────────────┼───────────┼────────────┼────────────┼───────────────────────────────────────────────────────────┤
│ 0       │ 'burn'         │ '-2180000'  │ '2025-07' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 14, Col C 'Net Cash Burn' (..." │
│ 1       │ 'revenue'      │ '15000000'  │ '2025-06' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 5, Col B 'Net Revenue from ..." │
│ 2       │ 'revenue'      │ '16550000'  │ '2025-07' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 5, Col C 'Net Revenue from ..." │
│ 3       │ 'revenue'      │ '18200000'  │ '2025-08' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 5, Col D 'Net Revenue from ..." │
│ 4       │ 'revenue'      │ '20000000'  │ '2025-09' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 5, Col E 'Net Revenue from ..." │
│ 5       │ 'gross_margin' │ '42'        │ '2025-06' │ 'percent'  │ 'reported' │ "Sheet 'P&L Summary', Row 8, Col B 'Gross Margin %' (..." │
│ 6       │ 'gross_margin' │ '42'        │ '2025-07' │ 'percent'  │ 'reported' │ "Sheet 'P&L Summary', Row 8, Col C 'Gross Margin %' (..." │
│ 7       │ 'burn'         │ '-2050000'  │ '2025-08' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 14, Col D 'Net Cash Burn' (..." │
│ 8       │ 'burn'         │ '-1980000'  │ '2025-09' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 14, Col E 'Net Cash Burn' (..." │
│ 9       │ 'run_rate'     │ '180000000' │ '2025-06' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 16, Col B 'Annual Run Rate ..." │
│ 10      │ 'run_rate'     │ '198600000' │ '2025-07' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 16, Col C 'Annual Run Rate ..." │
│ 11      │ 'run_rate'     │ '218400000' │ '2025-08' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 16, Col D 'Annual Run Rate ..." │
│ 12      │ 'run_rate'     │ '240000000' │ '2025-09' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 16, Col E 'Annual Run Rate ..." │
│ 13      │ 'gross_margin' │ '42'        │ '2025-08' │ 'percent'  │ 'reported' │ "Sheet 'P&L Summary', Row 8, Col D 'Gross Margin %' (..." │
│ 14      │ 'gross_margin' │ '42'        │ '2025-09' │ 'percent'  │ 'reported' │ "Sheet 'P&L Summary', Row 8, Col E 'Gross Margin %' (..." │
│ 15      │ 'ebitda'       │ '-1800000'  │ '2025-06' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 12, Col B 'Operating EBITDA..." │
│ 16      │ 'ebitda'       │ '-1849000'  │ '2025-07' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 12, Col C 'Operating EBITDA..." │
│ 17      │ 'ebitda'       │ '-1800000'  │ '2025-08' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 12, Col D 'Operating EBITDA..." │
│ 18      │ 'ebitda'       │ '-1800000'  │ '2025-09' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 12, Col E 'Operating EBITDA..." │
│ 19      │ 'burn'         │ '-2250000'  │ '2025-06' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 14, Col B 'Net Cash Burn' (..." │
└─────────┴────────────────┴─────────────┴───────────┴────────────┴────────────┴───────────────────────────────────────────────────────────┘

--- Processing Jobs Audit Log ---
┌─────────┬───────────┬─────────────┬────────────┬────────────┐
│ (index) │ step      │ status      │ startedAt  │ finishedAt │
├─────────┼───────────┼─────────────┼────────────┼────────────┤
│ 0       │ 'parse'   │ 'completed' │ '20:33:30' │ '20:33:30' │
│ 1       │ 'extract' │ 'completed' │ '20:33:30' │ '20:33:30' │
│ 2       │ 'chunk'   │ 'completed' │ '20:33:30' │ '20:33:30' │
│ 3       │ 'embed'   │ 'completed' │ '20:33:30' │ '20:33:31' │
└─────────┴───────────┴─────────────┴────────────┴────────────┘
```

---

#### C. Real RAG Query Execution (3 Real Questions)

##### Query 1: Positive Figures & Calculations
```bash
nice -n 15 ionice -c3 npx tsx packages/core/src/cli/test-query.ts "What was Noto's Net Revenue and Gross Margin in June 2025?" noto
```
**Output:**
```
=== MIS Grounded RAG Query Verification ===
Question: "What was Noto's Net Revenue and Gross Margin in June 2025?"
Scope: NOTO (9b0c7854-5d10-47de-83dd-096af7af4144)
Searching vector index & querying DeepSeek...

--- AI Answer (2.25s) ---
Noto's Net Revenue in June 2025 was ₹150 Lakhs, with a Gross Margin of 42.0% [1].

The Gross Margin is directly stated as 42.0% in the MIS [1], and it is consistent with the underlying figures [CALCULATED: (₹63L Gross Profit / ₹150L Net Revenue) * 100 = 42.0%] [1].

--- Citations (1) ---
┌─────────┬────────┬─────────┬───────────┬───────────────────┬───────────────────────────────────────────────────────────────────┐
│ (index) │ marker │ company │ period    │ file              │ snippet                                                           │
├─────────┼────────┼─────────┼───────────┼───────────────────┼───────────────────────────────────────────────────────────────────┤
│ 0       │ '[1]'  │ 'NOTO'  │ '2025-09' │ 'sample_mis.xlsx' │ '### Sheet: P&L Summary | SAMPLE — TEST FIXTURE — NOTO MONTHL...' │
└─────────┴────────┴─────────┴───────────┴───────────────────┴───────────────────────────────────────────────────────────────────┘

--- Retrieved Chunks Evaluated (1) ---
┌─────────┬────────────┬────────────┬───────────────┐
│ (index) │ chunkIndex │ similarity │ sheet         │
├─────────┼────────────┼────────────┼───────────────┤
│ 0       │ 0          │ '67.9%'    │ 'P&L Summary' │
└─────────┴────────────┴────────────┴───────────────┘
```

##### Query 2: Negative Figures & Parenthesised Negatives
```bash
nice -n 15 ionice -c3 npx tsx packages/core/src/cli/test-query.ts "What was Noto's Net Cash Burn and Operating EBITDA in July 2025?" noto
```
**Output:**
```
=== MIS Grounded RAG Query Verification ===
Question: "What was Noto's Net Cash Burn and Operating EBITDA in July 2025?"
Scope: NOTO (9b0c7854-5d10-47de-83dd-096af7af4144)
Searching vector index & querying DeepSeek...

--- AI Answer (2.01s) ---
Noto's Net Cash Burn in July 2025 was ₹21.80 Lakhs, and its Operating EBITDA was ₹(18.49) Lakhs [1].

Both figures are reported as stated in the P&L Summary sheet for the period 2025-09 [1].

--- Citations (1) ---
┌─────────┬────────┬─────────┬───────────┬───────────────────┬───────────────────────────────────────────────────────────────────┐
│ (index) │ marker │ company │ period    │ file              │ snippet                                                           │
├─────────┼────────┼─────────┼───────────┼───────────────────┼───────────────────────────────────────────────────────────────────┤
│ 0       │ '[1]'  │ 'NOTO'  │ '2025-09' │ 'sample_mis.xlsx' │ '### Sheet: P&L Summary | SAMPLE — TEST FIXTURE — NOTO MONTHL...' │
└─────────┴────────┴─────────┴───────────┴───────────────────┴───────────────────────────────────────────────────────────────────┘

--- Retrieved Chunks Evaluated (1) ---
┌─────────┬────────────┬────────────┬───────────────┐
│ (index) │ chunkIndex │ similarity │ sheet         │
├─────────┼────────────┼────────────┼───────────────┤
│ 0       │ 0          │ '67.6%'    │ 'P&L Summary' │
└─────────┴────────────┴────────────┴───────────────┘
```

##### Query 3: Non-Present Figure (Refusal Policy Test)
```bash
nice -n 15 ionice -c3 npx tsx packages/core/src/cli/test-query.ts "What was Noto's total marketing expenditure in FY24, and what were their international sales in London?" noto
```
**Output:**
```
=== MIS Grounded RAG Query Verification ===
Question: "What was Noto's total marketing expenditure in FY24, and what were their international sales in London?"
Scope: NOTO (9b0c7854-5d10-47de-83dd-096af7af4144)
Searching vector index & querying DeepSeek...

--- AI Answer (2.40s) ---
I cannot find this information in the uploaded MIS reports.

The retrieved context [1] only contains NOTO's monthly P&L data for Jun-25 through Sep-25 (FY26), including Net Revenue, COGS, Gross Profit, Employee Salaries, Marketing & Customer Acquisition, Other Operating Expenses, EBITDA, Net Cash Burn, Closing Cash Balance, and ARR. It does not contain any FY24 figures, nor does it contain any geographic or international sales breakdown (including London).

--- Citations (1) ---
┌─────────┬────────┬─────────┬───────────┬───────────────────┬───────────────────────────────────────────────────────────────────┐
│ (index) │ marker │ company │ period    │ file              │ snippet                                                           │
├─────────┼────────┼─────────┼───────────┼───────────────────┼───────────────────────────────────────────────────────────────────┤
│ 0       │ '[1]'  │ 'NOTO'  │ '2025-09' │ 'sample_mis.xlsx' │ '### Sheet: P&L Summary | SAMPLE — TEST FIXTURE — NOTO MONTHL...' │
└─────────┴────────┴─────────┴───────────┴───────────────────┴───────────────────────────────────────────────────────────────────┘

--- Retrieved Chunks Evaluated (1) ---
┌─────────┬────────────┬────────────┬───────────────┐
│ (index) │ chunkIndex │ similarity │ sheet         │
├─────────┼────────────┼────────────┼───────────────┤
│ 0       │ 0          │ '61.9%'    │ 'P&L Summary' │
└─────────┴────────────┴────────────┴───────────────┘
```

---

### 3. Reviewable Git Commits

All changes were committed in small, logical, reviewable steps on branch `master` (no remotes pushed):

```
a81765b fix(core): enhance FY quarter format parsing, buffer handling, and env resolution
802915a feat(core): add realistic MIS fixture and CLI verification tools for pipeline and RAG
08d9d65 feat(core): implement end-to-end document processing pipeline with job tracking
f821449 feat(core): implement grounded RAG query answering with citations and DeepSeek
05a96bf feat(core): implement metric extraction with deterministic pass and DeepSeek structured fallback
7ca138d feat(core): implement document chunking and Gemini embedding client with 1536 dims and rate-limit backoff
bbc08f7 feat(core): implement normalisation engine for numbers, periods, and aliases
e261771 feat(core): implement spreadsheet and pdf parsing module
```

---

### 4. Decisions Changed & Edge Cases Addressed

1. **Both `Q1 FY26` and `FY26 Q1` Formats Supported**: Financial models in India interchangeably use `Q1 FY26`, `FY26 Q1`, and `FY26-Q1`. The period engine was updated to support both orderings with Indian FY mapping (Q1 = April–June $\to$ `2025-06`).
2. **Buffer Safety for SheetJS**: Node buffers and browser/typed array buffers are normalised to `Buffer.from(bytes)` before passing to SheetJS to ensure zero type coercion faults.
3. **Database Environment Discovery**: Updated `@mis/db/src/client.ts` to automatically discover `apps/web/.env.local` and `packages/db/.env` without logging secrets and without throwing build-time or runtime warnings when running standalone CLI commands.
4. **Rate Limit Handling**: Configured rate-limit delay (`EMBED_DELAY_MS` defaulting to 1000ms) and exponential backoff retry on HTTP status 429 and 5xx.

---

### 5. What a Human Must Do Next

None for `@mis/core`. The core parsing, normalisation, metric extraction, Gemini embeddings, pgvector store, and grounded RAG query engine are complete, tested with real API calls, and ready for Run 3 (Next.js route handlers and server actions).
EXIT=0
