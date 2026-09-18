# PLAN_BLOB_UX.md — ARCHITECT REVIEW (approved with refinements)

Reviewed by the engineering lead. The plan is approved as written; the four open questions are answered below, plus
binding additions for the build run. Where this file and the plan disagree, **this file wins**.

## Decisions
1. **Upload ceiling — APPROVED: 50 MB default** via `UPLOAD_MAX_BYTES_BLOB`, overridable with
   `BLOB_UPLOAD_MAX_BYTES`. Client-side upload means there is no serverless body limit in the path; 50 MB covers real
   MIS exports (multi-sheet Excel with charts) with headroom.
2. **Dropping `document_blobs` — APPROVED: staged.** Keep the table and the read fallback so the existing document
   keeps working; drop it only in a follow-up once history is backfilled. Nothing may break for the current demo file.
3. **Key-figures strip — APPROVED** (2–4 chips at the top of the answer), with two conditions: it must be derived from
   the **same deterministic chart payload** (no extra query, no new computation, no model involvement), and it must be
   visually quiet — DM Mono 11 px, muted `#9A958E`/`#5A5650`, warm ring border, no colour fill beyond the accent for the
   primary figure.
4. **Blob store region — ALREADY DONE: `iad1` (Washington DC), and that is the right call.** The store
   `mis-uploads` (private) is provisioned and connected to the project, and the database lives in **Neon `us-east-2`
   (Ohio)**, while the serverless functions run in **iad1**. Keeping the blob next to the functions and the database
   keeps the server-side fetch/parse fast; a Mumbai store would move the blob closer to the browser but put a
   cross-region hop in front of every extraction. Upload speed is a one-off cost, processing is per-file — so `iad1`
   stays. `BLOB_READ_WRITE_TOKEN` is already on the project env and in the private local store; do not print it.

## Binding additions
5. **Regression test for the bold bug.** The markdown renderer must be asserted to emit `<strong>` for `**text**`
   (and render lists/tables), so critique #8 cannot silently come back. Cover it in a component/unit test.
6. **Verification must be structural, not eyeballed.** The headless check must assert: plot height within the
   specified range, **no duplicate Y axis**, value labels present on every bar, no stray dotted/connector series, the
   key-figures strip exists, the trend callout exists, and `<strong>` appears in the rendered answer. Capture
   screenshots for the owner and save the raw evidence (payload + assertion output) under `docs/review/`.
7. **The demo document must still open and download after the migration** (fallback path proven with a real request),
   and deleting a document must clean up its blob (state what happens if the blob is already gone).
8. **`.env.example` gains `BLOB_READ_WRITE_TOKEN` (name + comment only).** `npm test` (scanner + all existing tests)
   must stay green; the scanner must be run against the staged changes before committing.
9. **Commits and shipping:** two conventional commits (Blob migration; UX overhaul), then `git push origin main` and a
   production deploy. Keep the streaming text contract and the `X-Citations` / `X-Charts` header names unchanged.
10. **Chart determinism is untouched:** charts still come only from `metrics` rows, and the numeric-consistency guard
    from the previous review stays.

## Cleanliness — binding (owner: "responses should be clean and the charts should also be clean, overall UX and UI clean")

Restraint is the primary design goal. Concretely, and these outrank any other formatting idea:

**Answer text**
- **Say each fact once, in its best place.** The key-figures strip carries the headline numbers; the prose explains
  the *movement* rather than re-listing every value; the chart carries the series; the `Basis:` row carries
  provenance. Repeating the same figure in the strip, the prose, the chart labels and a table is the main slop to
  avoid.
- No markdown headings inside an answer, no `Summary:` labels, no emoji, no nested bullets, no horizontal rules.
- **Bold sparingly** — only the 3–5 figures that matter, never whole clauses or sentences.
- Bullets only for enumerations of 3+ peer items (e.g. proxy options); otherwise prose.
- A table only when comparing ≥2 companies or ≥3 metrics — never for a single series (that is what the chart is for).
- Max 4 key-figure chips; drop the strip entirely if the answer has fewer than 2 meaningful figures.
- Citations stay quiet and out of the reading path; one grouped sources row per answer.

**Charts**
- No legend unless a chart genuinely carries ≥2 series; no axis titles (the unit lives in the chart header);
  no value labels when a chart has more than ~8 bars (crowding is worse than a tooltip); no gradient fills,
  no bar shadows, no dot markers on bars, no decorative series of any kind.
- One gridline treatment only: thin horizontal dashes in the border colour at low emphasis.
- ≤4 ticks, left axis only, compact currency (`₹2.0 Cr`, `₹50 L`) — the same formatter the table uses.
- Whitespace is the separator: generous padding inside the chart card, clear gap between the chart, the strip and
  the prose.
- Every chart must be legible at 412 px with no horizontal overflow and no clipped tick labels.

**Overall UI**
- One spacing scale, one card per answer, warm ring borders instead of nested boxes or heavy dividers.
- Accent colour appears at most once per visual block (the primary action or the single highest-signal figure).
- Nothing animates for decoration; no layout shift when charts or fonts load.

## Definition of done
- Milestones 1–4 complete with their verification gates met.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` green from a clean tree.
- An end-to-end pass on the deployed build: upload a file through the Blob path (proving the new flow), ask a
  company-scoped multi-metric question, and produce the screenshot + assertion output proving the new chart and
  answer formatting. Report the raw numbers (plot height, bar widths, tick counts) you observed, not impressions.
