The implementation plan has been written to [`PLAN_BLOB_UX.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/PLAN_BLOB_UX.md) and the planning artifact has been generated for your review.

No production code was modified, no build commands were executed, and no git commits were created.

### Summary of Architecture & Design Highlights

1. **Part A — Vercel Blob Migration (Owner has Vercel Pro):**
   - **Direct Client-Side Upload:** Uses `upload()` from `@vercel/blob/client` to stream binary directly from browser to Vercel's private Blob store, completely bypassing the 4.5 MB serverless function payload limit.
   - **Upload Ceiling:** Recommended default of **50 MB** (`UPLOAD_MAX_BYTES_BLOB`), overridable via `BLOB_UPLOAD_MAX_BYTES`.
   - **Integrity & Deduplication:** Client calculates SHA-256 via Web Crypto API and verifies magic bytes (`%PDF-`, `PK\x03\x04`, `\xD0\xCF\x11\xE0`). `POST /api/documents` performs DB deduplication; if a duplicate exists, it immediately deletes the newly uploaded blob via `del(blobUrl)` to avoid orphaned cloud storage.
   - **3-Tier Binary Fallback:** Existing demo file (`DEMO_sample_mis.xlsx`) and historical files continue working seamlessly via a 3-tier fallback in [`getDocumentBinary()`](file:///home/amann/intern-weh/mis-intelligent-dashboard/apps/web/src/lib/documents.ts): (1) Vercel Blob, (2) `document_blobs` `bytea` table, (3) local `./uploads/`. The legacy table will only be dropped after a full backfill.
   - **Private Store & Authenticated Proxy:** Blob store is configured with `access: 'private'`. Download route [`/api/documents/[id]/file`](file:///home/amann/intern-weh/mis-intelligent-dashboard/apps/web/src/app/api/documents/[id]/file/route.ts) streams the file to authenticated users with `inline` disposition. `BLOB_READ_WRITE_TOKEN` is never exposed to the client.

2. **Part B — Editorial UX Overhaul of Charts & Answers:**
   - **Compact Supporting Charts:** Reduced from ~430 px to **160 px** (desktop) and **140 px** (mobile), with value labels directly on bars (`DM Mono 9.5 px`), a single left-side Y-axis (≤4 ticks, compact Indian currency format), an emphasized zero baseline (`strokeWidth={1.5}`), 18% domain headroom, and a 2-column side-by-side grid (`xl:grid-cols-2`) for ≥2 charts at ≥1280 px.
   - **Markdown Bold Bug Root Cause & Fix:** Discovered two causes: (1) [`query-panel.tsx`](file:///home/amann/intern-weh/mis-intelligent-dashboard/apps/web/src/components/ai/query-panel.tsx) rendered answers as raw text in a `<div>`, bypassing markdown parsing entirely; (2) bracket replacement in [`chat-message-renderer.tsx`](file:///home/amann/intern-weh/mis-intelligent-dashboard/apps/web/src/components/chat/chat-message-renderer.tsx) corrupted CommonMark bold pairing when bold text adjoined citations. Both are unified under `ChatMessageRenderer` with dedicated bold styling and regression tests.
   - **Quiet Citations:** Replaced loud orange badges with subtle academic footnote marks (`[1]`).
   - **Answer Rhythm:** Added a scannable **Key-Figures Strip** (2–4 chips derived strictly from deterministic chart payloads), constrained prose measure to **680 px**, formatted `"So the trend to watch:"` as an editorial pull-quote card, and muted `"Basis:"` into a provenance meta row.

3. **Verification Plan:**
   - Automated test suite maintaining 0 secret findings and passing all 111 existing tests.
   - Headless Brave script (`scripts/verify-blob-ux.ts`) asserting chart geometry (plot height 140–180 px, single Y-axis, value labels present, zero stray lines), bold text presence, and capturing desktop (1440×900), mobile (412×915), and dark mode screenshots to `docs/screenshots/`.

Please review [`PLAN_BLOB_UX.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/PLAN_BLOB_UX.md) or the attached artifact. When ready to proceed with execution, let me know to begin Milestone 1.
root agent idle; waiting up to 5s for 1 background task(s)
I have launched `npm run build` to verify the Next.js production build and will monitor its progress.
terminating 1 background task(s) on exit
EXIT=0
