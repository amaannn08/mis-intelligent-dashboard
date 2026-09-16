# TASK REPORT — MIS Intelligence Dashboard, RUN 2: @mis/core

**Status:** Complete (Parsing, Normalisation, Chunking, Embeddings, Metric Extraction, Grounded RAG, Pipeline Entrypoint, Fixture, and Verification finished).

---

## 1. Summary of Deliverables

All deliverables specified in `RUN2_BRIEF.md`, `PLAN.md` §3 & §4, and `PLAN_AGY.md` §4 have been fully implemented in `packages/core` with strict TypeScript typing (zero `any` escapes) and verified against the local Postgres database with real Gemini and DeepSeek API calls.

### Implemented Modules:
1. **Parsing (`packages/core/src/parsing/`)**:
   - `parseXlsx`: SheetJS (.xlsx/.xls) parser preserving sheet names, table structure, and verbatim numbers; drops repeated headers and formats rows as pipe-separated table blocks with row start/end tracking.
   - `parsePdf`: `unpdf` parser emitting structured per-page text blocks.
   - `parseFile`: Universal dispatcher returning `ParsedDocument` with `blocks` and `rawText`.

2. **Normalisation (`packages/core/src/normalisation/`)**:
   - `numbers.ts`: Parenthesised accounting negatives `(1,234.50)` -> `-1234.50`, trailing negatives `1,234-` -> `-1234`, Indian/Western comma handling, scale detection (Lakhs, Crores, Millions, Thousands) converting currency to absolute INR base values and percent to 0–100 scale.
   - `periods.ts`: Canonical `YYYY-MM` parser handling `Jun-25`, `June 2025`, `06/2025`, Indian FY quarters `Q1 FY26` -> `2025-06`, `FY25` -> `2025-03`, calendar quarters, and month names with document context year.
   - `aliases.ts`: Data-driven metric resolution using alias lists from `metric_definitions`; strictly differentiates percent vs currency (`EBITDA %` ≠ `EBITDA`, `Gross Profit` ≠ `Gross Margin`).

3. **Chunking (`packages/core/src/chunking/`)**:
   - `chunkDocument`: Structural chunking (~800 tokens, ~100 token overlap) carrying rich citation metadata (`company`, `companyId`, `documentId`, `filename`, `reportingPeriod`, `sheetName`, `pageNumber`, `rowStart`, `rowEnd`) and repeating table header contexts across slices.

4. **Embeddings (`packages/core/src/embeddings/`)**:
   - `embedTexts` & `embedQuery`: Gemini embedding client using `@google/genai` with `config: { outputDimensionality: 1536 }`, sequential batching, configurable delay (`EMBED_DELAY_MS`), and exponential backoff on HTTP 429 (`RESOURCE_EXHAUSTED`) or 5xx. Fails loudly on genuine failures.

5. **Metric Extraction (`packages/core/src/extraction/`)**:
   - `deterministic.ts`: Table locator scanning period headers, scale context, and alias matching; derives `gross_margin` if Gross Profit and Revenue are available; labels values as `reported` or `calculated` with source references.
   - `deepseek.ts`: LLM fallback using DeepSeek with structured JSON output for unresolved canonical metrics; enforces anti-hallucination verification asserting that reported figures exist in raw source text; enforces absent-never-invented rule.
   - `index.ts`: Orchestrates deterministic pass first, DeepSeek pass second for missing standard metrics.

6. **RAG Engine (`packages/core/src/rag/`)**:
   - `answerQuery`: Embeds question with Gemini (1536 dims), performs pgvector cosine distance search (`<=>`) with configurable similarity floor and top-k, constructs numbered `[n]` context blocks, prompts DeepSeek with the strict portfolio assistant contract, and parses structured citations with document IDs, periods, filenames, and snippets. Handles empty retrieval cleanly.

7. **Pipeline Entrypoint (`packages/core/src/pipeline/`)**:
   - `processDocument(documentId)`: Idempotent orchestration (`pending` -> `parsing` -> `extracting` -> `embedding` -> `processed` | `failed`) recording a `processing_jobs` row per step for worker readiness.

8. **Test Fixture & CLI Tools (`packages/core/fixtures/` and `packages/core/src/cli/`)**:
   - `packages/core/fixtures/sample_mis.xlsx`: Realistic multi-month MIS workbook with banner, scale in ₹ Lakhs, 4 periods (`Jun-25` to `Sep-25`), parenthesised negatives, percent rows, and varied labels.
   - `packages/core/fixtures/README.md`: Explaining fixture is synthetic sample test data.
   - `packages/core/src/cli/test-pipeline.ts`: Verification CLI running the entire pipeline over a file.
   - `packages/core/src/cli/test-query.ts`: Interactive RAG verification CLI.

---

## 2. Verification Proof

### A. TypeScript Typecheck and Linting
```bash
npm run typecheck && npm run lint
```
**Output:**
```
npm notice run mis-intelligent-dashboard@0.1.0 typecheck
npm notice run npm run typecheck --workspaces --if-present
npm notice run web@0.1.0 typecheck
npm notice run tsc --noEmit
npm notice run @mis/core@0.1.0 typecheck
npm notice run @mis/db@0.1.0 typecheck
npm notice run mis-intelligent-dashboard@0.1.0 lint
npm notice run npm run lint --workspaces --if-present
npm notice run web@0.1.0 lint
npm notice run eslint .
npm notice run @mis/core@0.1.0 lint
```
*(Exit code: 0 — zero errors, zero warnings across all workspaces)*

---

### B. Pipeline Execution over Test Fixture
```bash
nice -n 15 ionice -c3 npx tsx packages/core/src/cli/test-pipeline.ts packages/core/fixtures/sample_mis.xlsx noto
```
**Output:**
```
=== MIS Pipeline CLI Verification ===
Fixture: /home/amann/intern-weh/mis-intelligent-dashboard/packages/core/fixtures/sample_mis.xlsx
Company Slug: noto
Matched Company: NOTO (ID: 9b0c7854-5d10-47de-83dd-096af7af4144)
Using existing document record: 3924b037-fb8e-4b09-a28a-a3918cafb303

Executing processDocument(3924b037-fb8e-4b09-a28a-a3918cafb303)...

=== Pipeline Completed in 1.13s ===
Status: processed

--- Document Record ---
┌─────────┬────────────────────────────────────────┬───────────────────┬─────────────┬─────────────────┬───────────┬─────────────────────────┬────────────────────────────┐
│ (index) │ id                                     │ filename          │ status      │ reportingPeriod │ sizeBytes │ checksum                │ processedAt                │
├─────────┼────────────────────────────────────────┼───────────────────┼─────────────┼─────────────────┼───────────┼─────────────────────────┼────────────────────────────┤
│ 0       │ '3924b037-fb8e-4b09-a28a-a3918cafb303' │ 'sample_mis.xlsx' │ 'processed' │ '2025-09'       │ 18724     │ '73cd94b859e6378c...'   │ '2026-09-16T20:14:44.168Z' │
└─────────┴────────────────────────────────────────┴───────────────────┴─────────────┴─────────────────┴───────────┴─────────────────────────┴────────────────────────────┘

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
│ 0       │ 'revenue'      │ '15000000'  │ '2025-06' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 5, Col B 'Net Revenue from ..." │
│ 1       │ 'revenue'      │ '16550000'  │ '2025-07' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 5, Col C 'Net Revenue from ..." │
│ 2       │ 'revenue'      │ '18200000'  │ '2025-08' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 5, Col D 'Net Revenue from ..." │
│ 3       │ 'revenue'      │ '20000000'  │ '2025-09' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 5, Col E 'Net Revenue from ..." │
│ 4       │ 'gross_margin' │ '42'        │ '2025-06' │ 'percent'  │ 'reported' │ "Sheet 'P&L Summary', Row 8, Col B 'Gross Margin %' (..." │
│ 5       │ 'gross_margin' │ '42'        │ '2025-07' │ 'percent'  │ 'reported' │ "Sheet 'P&L Summary', Row 8, Col C 'Gross Margin %' (..." │
│ 6       │ 'gross_margin' │ '42'        │ '2025-08' │ 'percent'  │ 'reported' │ "Sheet 'P&L Summary', Row 8, Col D 'Gross Margin %' (..." │
│ 7       │ 'gross_margin' │ '42'        │ '2025-09' │ 'percent'  │ 'reported' │ "Sheet 'P&L Summary', Row 8, Col E 'Gross Margin %' (..." │
│ 8       │ 'ebitda'       │ '-1800000'  │ '2025-06' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 12, Col B 'Operating EBITDA..." │
│ 9       │ 'ebitda'       │ '-1849000'  │ '2025-07' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 12, Col C 'Operating EBITDA..." │
│ 10      │ 'ebitda'       │ '-1800000'  │ '2025-08' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 12, Col D 'Operating EBITDA..." │
│ 11      │ 'ebitda'       │ '-1800000'  │ '2025-09' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 12, Col E 'Operating EBITDA..." │
│ 12      │ 'burn'         │ '-2250000'  │ '2025-06' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 14, Col B 'Net Cash Burn' (..." │
│ 13      │ 'burn'         │ '-2180000'  │ '2025-07' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 14, Col C 'Net Cash Burn' (..." │
│ 14      │ 'burn'         │ '-2050000'  │ '2025-08' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 14, Col D 'Net Cash Burn' (..." │
│ 15      │ 'burn'         │ '-1980000'  │ '2025-09' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 14, Col E 'Net Cash Burn' (..." │
│ 16      │ 'run_rate'     │ '180000000' │ '2025-06' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 16, Col B 'Annual Run Rate ..." │
│ 17      │ 'run_rate'     │ '198600000' │ '2025-07' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 16, Col C 'Annual Run Rate ..." │
│ 18      │ 'run_rate'     │ '218400000' │ '2025-08' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 16, Col D 'Annual Run Rate ..." │
│ 19      │ 'run_rate'     │ '240000000' │ '2025-09' │ 'currency' │ 'reported' │ "Sheet 'P&L Summary', Row 16, Col E 'Annual Run Rate ..." │
└─────────┴────────────────┴─────────────┴───────────┴────────────┴────────────┴───────────────────────────────────────────────────────────┘

--- Processing Jobs Audit Log ---
┌─────────┬───────────┬─────────────┬────────────┬────────────┐
│ (index) │ step      │ status      │ startedAt  │ finishedAt │
├─────────┼───────────┼─────────────┼────────────┼────────────┤
│ 0       │ 'parse'   │ 'completed' │ '20:14:43' │ '20:14:43' │
│ 1       │ 'extract' │ 'completed' │ '20:14:43' │ '20:14:43' │
│ 2       │ 'chunk'   │ 'completed' │ '20:14:43' │ '20:14:43' │
│ 3       │ 'embed'   │ 'completed' │ '20:14:43' │ '20:14:44' │
└─────────┴───────────┴─────────────┴────────────┴────────────┘
```

---

### C. Grounded RAG Query Verification

#### Query 1: Reported Revenue across Multiple Periods
```bash
nice -n 15 ionice -c3 npx tsx packages/core/src/cli/test-query.ts "What was Noto's Net Revenue in June 2025 and September 2025?" noto
```
**Output:**
```
=== MIS Grounded RAG Query Verification ===
Question: "What was Noto's Net Revenue in June 2025 and September 2025?"
Scope: NOTO (9b0c7854-5d10-47de-83dd-096af7af4144)
Searching vector index & querying DeepSeek...

--- AI Answer (2.02s) ---
Noto's Net Revenue from Operations was ₹150 Lakhs in June 2025 and ₹200 Lakhs in September 2025 [1].

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
│ 0       │ 0          │ '64.4%'    │ 'P&L Summary' │
└─────────┴────────────┴────────────┴───────────────┘
```

#### Query 2: Negative Figures (Net Cash Burn and Operating EBITDA)
```bash
nice -n 15 ionice -c3 npx tsx packages/core/src/cli/test-query.ts "What was Noto's Net Cash Burn and Operating EBITDA in July 2025?" noto
```
**Output:**
```
=== MIS Grounded RAG Query Verification ===
Question: "What was Noto's Net Cash Burn and Operating EBITDA in July 2025?"
Scope: NOTO (9b0c7854-5d10-47de-83dd-096af7af4144)
Searching vector index & querying DeepSeek...

--- AI Answer (2.19s) ---
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

#### Query 3: Non-Present Figure (Refusal Policy Test)
```bash
nice -n 15 ionice -c3 npx tsx packages/core/src/cli/test-query.ts "What was Noto's total marketing expenditure in FY24, and what were their international sales in London?" noto
```
**Output:**
```
=== MIS Grounded RAG Query Verification ===
Question: "What was Noto's total marketing expenditure in FY24, and what were their international sales in London?"
Scope: NOTO (9b0c7854-5d10-47de-83dd-096af7af4144)
Searching vector index & querying DeepSeek...

--- AI Answer (2.56s) ---
I cannot find this information in the uploaded MIS reports.

The retrieved context [1] covers only NOTO's monthly performance for Jun-25 through Sep-25 (FY26), and it contains no FY24 figures and no geographic or international sales breakdown (including any London-specific data). The only marketing-related line item available is "Marketing & Customer Acquisition" for Jun-25 to Sep-25 (₹24.5L, ₹27.8L, ₹31L, ₹34L respectively) [1], which does not answer either part of your question.

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

## 3. Git Commit History
```
802915a feat(core): add realistic MIS fixture and CLI verification tools for pipeline and RAG
08d9d65 feat(core): implement end-to-end document processing pipeline with job tracking
f821449 feat(core): implement grounded RAG query answering with citations and DeepSeek
05a96bf feat(core): implement metric extraction with deterministic pass and DeepSeek structured fallback
7ca138d feat(core): implement document chunking and Gemini embedding client with 1536 dims and rate-limit backoff
bbc08f7 feat(core): implement normalisation engine for numbers, periods, and aliases
e261771 feat(core): implement spreadsheet and pdf parsing module
```
