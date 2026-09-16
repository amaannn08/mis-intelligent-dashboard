# TASK — MIS Intelligence Dashboard, RUN 3: API layer (route handlers, validation, auth)

Coding agent run. Project `/home/amann/intern-weh/mis-intelligent-dashboard`.
Read `PLAN.md` (§2 data model, §5 UI), inspect Run 1 + Run 2 output, then build the HTTP surface **on top of
`@mis/db` and `@mis/core`** — do not duplicate pipeline or query logic inside route handlers.

## EXECUTION RULES
Same as every run: commands in the **foreground**; `nice -n 15 ionice -c3` for heavy work; kill by PID, never
`pkill -f`; never print or commit secrets; never leave a dev server running at the end (kill it by PID).

## LOCKED DECISION — where uploaded files live in production
Vercel's filesystem is read-only apart from `/tmp`, so "save to disk" cannot survive there. For this MVP:
- The **source of truth after processing is the database** (parsed text blocks, chunks, embeddings, metrics).
- The **original file bytes** are persisted in a `document_blobs` table (bytea) **when ≤ 4 MB**, so download and
  preview work in production with no extra service; above that, processing still runs and the original is not
  retained (record `original_retained = false` and surface it in the UI).
- In dev, also mirror the file to a gitignored `./uploads/` directory for convenience.
Add the table to `@mis/db` with a migration. Document the trade-off in the README (upgrade path: Vercel Blob or S3).

## LOCKED DECISION — do NOT process synchronously inside the upload handler
A parse + extract + 50-chunk Gemini embedding run will blow past Vercel's serverless execution limit, so:
- `POST /api/documents` validates, stores the metadata row + bytes, and returns **`202 Accepted` with the document
  id immediately**; the pipeline is kicked off detached (Next.js `after()`, or a fire-and-forget call with its own
  error capture that always writes a terminal `failed` state + `processing_jobs` row).
- The client polls `GET /api/documents/[id]` for status. In dev the handler may await the pipeline when
  `NODE_ENV !== 'production'` to make debugging pleasant — that branch must be explicit and documented.
- Enforce an upload ceiling server-side: **4.5 MB** (Vercel's request body limit) in production, 15 MB locally, and
  surface a clear error above it. Document the ceiling in the README.
- `PLAN_AGY.md` §6 and §9 are the authoritative design for storage and the async seam — read them.

## IMPLEMENT
Route handlers under `apps/web/src/app/api/…`, every input validated with **zod**, every error mapped to a typed
JSON shape `{ error: { code, message } }` with a correct status code:
- `GET  /api/health` → `{ ok, db }` (already exists — keep it honest: run `select 1`).
- `POST /api/auth/login` — **username + password** (`AUTH_USERNAME` + `AUTH_PASSWORD`), both compared in constant
  time; `POST /api/auth/logout`, `GET /api/auth/session`.
  Session = signed HttpOnly cookie (secret from `COOKIE_SECRET`), plus `middleware.ts` protecting every page and
  every `/api/*` route except health/login. Document it as MVP access control.
- `GET/POST /api/companies` (list with search/filter/sort/pagination + summary columns: latest period, latest
  revenue, latest EBITDA, document count, last updated; create with slug generation + uniqueness).
- `GET/PATCH/DELETE /api/companies/[id]` (DELETE = **archive** by default, hard delete only with `?hard=true` and
  a confirmation flag; deleting/archiving must never orphan metrics silently).
- `GET /api/companies/[id]/metrics?from=&to=&keys=` → series grouped by metric for charts.
- `POST /api/documents` (multipart upload: validate mime + extension + size, sanitise the filename, dedupe by
  checksum per company, insert metadata, persist bytes per the locked decision, then run `processDocument`),
  `GET /api/documents?companyId=`, `GET /api/documents/[id]` (status + job log + extracted metric summary),
  `GET /api/documents/[id]/file` (stream the original when retained), `DELETE /api/documents/[id]`.
  A failed pipeline must leave the document row in `failed` with the real error message — never a fake success.
- `POST /api/query` → streaming answer (Vercel AI SDK `streamText` over DeepSeek, OpenAI-compatible base URL) with
  citations in the stream metadata; accepts an optional `companyId` to scope retrieval. Persist the exchange to
  `chat_sessions`/`chat_messages` when a session id is supplied.
- Everything server-side only: no API key may reach the client bundle. Verify the built client bundle contains no
  `GEMINI`/`DEEPSEEK`/`DATABASE_URL` material before you finish (grep the `.next/static` output).
- Upload size/type limits enforced **server-side** (and mirrored client-side only as UX).

## VERIFY — real HTTP calls, real files
1. `npm run typecheck` + `npm run lint` + `npm run build` → all green.
2. Start the production server (`npm run start` after a build), then with `curl` (or a small node script) prove
   each endpoint end-to-end: login sets a cookie; an unauthenticated request to a protected route is rejected;
   create a company; upload the Run 2 fixture; poll the document until `processed`; read the metrics; ask a
   question through `/api/query` and show the streamed answer including its citation; fetch the retained original
   file and show its byte length. Show the actual command output.
3. Negative cases: upload a `.txt` (rejected), a duplicate file (handled), a query with no matching data (honest
   "not found"), an unauthenticated `/api/companies` (401).
4. Kill the server by PID when done.

## COMMIT
Commit per endpoint group. Do not push.

## REPORT
Route table (method, path, auth, purpose), the verification output above, the locked-decision trade-off, and
anything a human must do next.
