# TASK — MIS Intelligence Dashboard, RUN 2: @mis/core (parsing → metrics → embeddings → RAG)

Coding agent run. Project `/home/amann/intern-weh/mis-intelligent-dashboard`.
**Read `PLAN.md` §3 (pipeline) and §4 (RAG) first**, then inspect what Run 1 produced —
`packages/core/` already exists with a stub, `packages/db/` holds the Drizzle schema and the seeded
`metric_definitions` (with alias lists). Build on both; do not restructure them without saying why.

## EXECUTION RULES
- Commands in the **FOREGROUND**, waited on in the same step. Never `&` then idle (that has already cost 45 min once).
- Heavy work gets `nice -n 15 ionice -c3`. Kill by explicit PID, never `pkill -f`.
- Never print or commit secret values; read them from the app's env files.
- Env: `apps/web/.env.local` (dev DB = local Postgres) already exists. API keys will be present as
  `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`,
  `DEEPSEEK_MODEL`. If a key is missing, say exactly which — do not stub the AI calls and pretend they ran.

## IMPLEMENT (all of packages/core, typed, no `any` escapes)

1. **Parsing** — `parseFile(bytes, filename): Promise<ParsedDocument>`
   - `.xlsx`/`.xls` via SheetJS: preserve per-sheet structure; emit blocks with `{ text, sheet, rowStart, rowEnd }`.
   - `.pdf` via `unpdf`: emit blocks with `{ text, page }`.
   - Format the spreadsheet content so a model can reason over it (pipe/section-separated rows, sheet headers,
     repeated header rows dropped). Numbers must stay verbatim — never round or reformat a currency value.
2. **Normalisation** — resolve a document's own labels to canonical `metric_key`s using the alias lists stored in
   `metric_definitions` (data, not switch-cases). Handle: label variants, percent vs absolute (`EBITDA %` ≠
   `EBITDA`), unit detection (₹/lakh/crore/million), period detection (`June`, `Jun-25`, `FY25`, `2025-06`,
   `Q1 FY26` → canonical `YYYY-MM`), and parenthesised negatives `(1,234)` → `-1234`.
3. **Chunking** — ~800-token chunks, ~100-token overlap, metadata carrying `{ company, period, sheet|page, row
   range }` so a citation can point back at the source.
4. **Embeddings** — Gemini via `@google/genai`, batched, model + dimensions from env
   (`GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` — **pass `config: { outputDimensionality: 1536 }`**, the model's
   native output is 3072 while our column is `vector(1536)`; without it the insert fails).
   **Rate limits are real**: the free tier is ~100 RPM, and a 10-sheet workbook produces 50+ chunks at once — batch
   sequentially with a configurable delay (`EMBED_DELAY_MS`, default ~1000 ms) plus exponential backoff on 429/5xx.
   Fail loudly on a genuine failure; never silently return an empty vector.
   `PLAN_AGY.md` §4 is the authoritative design for chunking, retrieval and the answer contract — read it.
5. **Metric extraction** — deterministic pass first (alias resolution + row/column heuristics on parsed blocks);
   the LLM (DeepSeek, structured JSON output) only for what the deterministic pass could not resolve. Hard rules:
   - A metric row is written **only** with a real `source_reference` (document + sheet/page + row range).
   - `value_kind` is `reported` unless the number was derived, then `calculated` (with the arithmetic recorded in
     `source_reference`).
   - If a metric is absent from a document, write nothing — the UI must be able to say "not available".
6. **RAG** — `answerQuery({ question, companyId? })`:
   embed question → pgvector cosine top-k (k≈8, configurable, with a minimum-similarity floor) → build a numbered
   context block → DeepSeek → `{ answer, citations: [{ documentId, filename, reportingPeriod, company, chunkIndex,
   snippet }], usedChunks }`. Rules: answer first, then cite `[n]`; state plainly when retrieval is empty or does
   not contain the answer; label derived figures as calculated and show the arithmetic; never invent a number.
7. **Pipeline entrypoint** — `processDocument(documentId)` running parse → normalise → extract → chunk → embed →
   persist → status transitions (`pending → parsing → extracting → embedding → processed | failed`), recording a
   `processing_jobs` row per step so a background worker can take over later.

## VERIFY — with REAL API calls and REAL files (show the output)
1. Create **one** realistic MIS fixture as `.xlsx` under `packages/core/fixtures/` (a monthly MIS: header +
   revenue/COGS/gross margin/EBITDA/burn rows across 3-4 months, deliberately messy — mixed label spellings,
   a parenthesised negative, a `%` row, a merged header). Put **"SAMPLE — TEST FIXTURE"** in the file and in a
   `fixtures/README.md` so nobody mistakes it for real data. Commit it as a fixture.
2. `npm run typecheck` + `npm run lint` in `packages/core` → clean.
3. Run the pipeline CLI over that fixture against the **local** database. Show: documents row, chunks created,
   embedding dimension actually stored, and the metrics extracted (key / value / period / value_kind /
   source_reference).
4. Run the query CLI with at least three real questions, including one whose answer is **not** in the fixture.
   Show the answer + citations for each. The "not present" case must say so, not invent.
5. Report the exact commands and their real output. If Gemini or DeepSeek rejects something, show the error and
   fix it rather than working around it silently.

## COMMIT
Commit in reviewable steps (parsing, normalisation, embeddings, extraction, RAG, fixture). Do not push.

## REPORT
Files created, the verification output above, decisions you changed, anything a human must do next.
