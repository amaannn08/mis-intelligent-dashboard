# MIS Completeness & Spreadsheet Preservation: Execution State

**Session Goal**: Execute Milestone 3 of the MIS Completeness & Preservation Roadmap
**Branch**: `feat/mis-completeness`
**Date**: October 9, 2026
**Status**: MILESTONE 3 COMPLETE — Stopped after Milestone 3 (Zero Production Writes / Deploys)

---

## Progress Summary

### Milestone 1 (Complete & Corrected)
- [x] Additive schema & idempotent migration `0006_add_raw_sheets_preservation.sql` for raw spreadsheet preservation.
- [x] Full cell coordinate, formula, merge, and error preservation in pipeline.
- [x] Recursive ZIP extraction with zip-slip protection and child provenance.
- [x] Ingestion scoping for root portfolio tracker (`MIS Tracker.xlsx`).
- [x] **Audited & Corrected Production DB Diagnostics**: Verified read-only on live host `ep-***tech`:
  - Exactly **62 documents** (all `processed`) across 23 companies.
  - Exactly **5 direct web uploads** (`Noto_Jun26_MIS-CC.xlsx`, `MIS_-_Unbox_Robotics_Apr_2023_to_Jan_2026.xlsx`, `Masterchow_MIS_June_2026.xlsx`, `Animall_MIS_Q1_2026.xlsx`, `Pratilipi_MIS_May_2026.xlsx`).
  - Corrected Section 6 of `milestone1.md` disclosing synthetic/mock IDs from early test harness stubs.

### Milestone 2 (Complete)
- [x] **Universal Multi-Layout Parser Implementation**:
  - [x] **Layout 1: Vertical Daily & Periodic Time-Series** (`parseVerticalTimeSeries`): Retains exact daily dates (`YYYY-MM-DD`, `granularity: 'daily'`) without lossy monthly rounding; maps unscaled counts (`users`, `impressions`) and percentages. Extracted 94,545 metrics from SVG Daily Tracker, 16,782 from Hopmate Cohort, 873 from NOTO POs.
  - [x] **Layout 2: Single-Period Dimensional Columns** (`parseSinglePeriodDimensional`): Scans business unit / entity columns (`blockLabel`) and amount/share splits. Extracted 96 metrics from Magma Dec25 MIS & CF, 29 metrics from SVG FY25-26 MIS.
  - [x] **Layout 3: Dual-Side Balance Sheets** (`parseDualSideBalanceSheet`): Dual Liabilities/Assets columns with snapshot granularity. Extracted 22 metrics from Segmind Provisional Bsheet.
  - [x] **Layout 4: Horizontal Metric Matrix** (`parseHorizontalMetricMatrix`): Cleans multi-line period headers, comparative prefixes, Indian FY quarters (`Q1 FY26`) and years (`FY26`, `FY 2025-26`). Extracted 85 metrics from Taozen Magma March 2026, >10,000 from Unbox Robotics.
  - [x] **Notes & Metadata Classification**: Classifies non-financial / unstructured legal commentary sheets as `notes_and_metadata` in `sheetLayouts`.
- [x] **Scale, Currency, & Unit Hardening**:
  - [x] Unknown currencies and units remain explicit `unknown`; never defaulted to `INR`.
  - [x] Boundary characters like `MIS Template_INR` properly matched via `(?:^|[^a-z0-9])(?:inr)`.
  - [x] Amounts scaled once; counts and percentages strictly exempt from currency scaling.
- [x] **Milestone 1 Flaw Hardening**:
  - [x] Archive extractor symlink attack checks (`fs.lstatSync().isSymbolicLink()`), realpath boundary enforcement, strict relative path checks, dynamic running size (500MB) and count (10,000) limits.
  - [x] Raw sheets query tool parameter bounds checking (`minRow <= maxRow`, max 200 rows, max 50 cols), cell truncation (1000 chars), control char stripping, `<untrusted_spreadsheet_content>` XML enclosure with escaped entities.
  - [x] Sheet semantic coverage dynamically populated with real parsed layout registry.
- [x] **Regression Suite & Verification**:
  - [x] `tests/semantic-layouts-m2.test.ts`: 11/11 tests passing against real audited portfolio workbooks with zero silent fixture absences.
  - [x] `npm test`: 21 test files, 191 tests passing, 0 failures, 252 tracked files clean.
  - [x] `npm run typecheck`: 0 errors.
  - [x] `nice -n15 ionice -c3 npm run build`: Next.js 15.5 production build compiled successfully.

### Milestone 3 (Complete & Audited Locally)
- [x] **Real Chat Model Tools in `/api/query` Route (`apps/web/src/app/api/query/route.ts`)**:
  - [x] `discover_raw_sheets`: Paginated discovery of notes, unparsed tabs, and statements with cell counts and layout metadata.
  - [x] `query_raw_sheet_cells`: Exact coordinate/range queries with bounded text paging (`textOffset`, `textLimit`), truncation indicators (`isTruncated`, `totalTextLength`), and `<untrusted_spreadsheet_content>` XML encapsulation mitigating prompt injection risks.
  - [x] `query_structured_metrics`: Read-only parameterized SQL with current document precedence (`DISTINCT ON`), exact daily dates, units, and granularity. Never arbitrary model SQL.
  - [x] `query_mis_metrics`: Granular dimensional MIS metric breakdowns.
  - [x] **Migration 0006 Resilience**: Wrapped raw sheet tools in defensive try-catch handlers to gracefully degrade in un-migrated databases (staged for Milestone 4) and guide model to structured metrics/chunks.
- [x] **100% Text Chunk Retention & Lexical RAG Fallback**:
  - [x] Replaced 50-chunk deletion cap with full batch DB insertion of all text chunks in `document_chunks`.
  - [x] Proportional per-sheet embedding budget allocation ensuring legal notes, footnotes, and statements are all embedded.
  - [x] Lexical search fallback in `retrieveRelevantChunks` (`packages/core/src/rag/index.ts`) for non-embedded or low-similarity chunks.
- [x] **Dashboard & Company Workspace Temporal Semantics**:
  - [x] Decoupled company overall reporting period from metric-specific latest periods in `company-workspace.tsx`.
  - [x] Masterchow: overall company latest `2026-06` (P&L Summary), while category/channel breakdown latest `2026-04` (Category X Channel). Rendered with explicit badges and tooltips.
  - [x] Pratilipi: Net Revenue/EBITDA `Mar 2026`, Net Cash Burn `Mar 2025` displayed accurately.
  - [x] `PortfolioPeriodSelector` added with explicit aggregate period switching, company coverage percentages, and currency separation (INR vs foreign currencies) without synthetic FX.
- [x] **M2 Defect Review Fixes & Performance**:
  - [x] `inferMetricKindAndUnit`: Monetary "Gross Margin", "Channel Margin", and "Cost Rate" strictly classified as `currency`; only `%` or explicit `GM %` / `margin %` / `mix` / `share` classified as `percent`; ratios categorized as `ratio`.
  - [x] PO vertical time-series preserves true `monthly` granularity with `YYYY-MM-01` dates.
  - [x] FY ranges parse to `annual` granularity ending March 31 with explicit `periodProvenance`.
  - [x] Archive extractor symlink pre-extraction defense accelerated via native `Buffer.indexOf` SIMD search, removing redundant duplicate loops.
- [x] **Performance & Contention Status**:
  - [x] **Baseline Observation**: Full test suite achieved 22 files and 208 tests passing in **8.01s** under quiet system load.
  - [x] **External Contention Blocker**: Under live concurrent Python ML workloads (>1100% CPU, 12+ GiB RAM, 5 GiB swap), test workers suffer thread starvation and large workbook parsing (Pratilipi 5.5MB) times out at 30s (taking 97s individually, suite 143s).
  - [x] Reproducibility is blocked under external contention and is **not resolved conclusively**.
  - [x] Global timeouts preserved at standard 30s with zero artificial timeout increases.
- [x] **Verification, Safety & Screenshot Confidentiality**:
  - [x] `npm run scan:secrets`: 0 secrets or credential leaks across tracked files.
  - [x] `npm run typecheck`: 0 errors.
  - [x] `npm run lint`: 0 errors.
  - [x] `npm run build`: Next.js 15.5 production build successful.
  - [x] Sensitive review screenshots containing live portfolio financials excluded via `.gitignore` (`docs/review/m3_*.png`, `docs/review/*_live*.png`) to protect public repo confidentiality.
  - [x] Generated `workspace/milestone3.md` and updated `workspace/state.md`.

---

## Remaining Gaps & Next Milestones

### Milestone 4: Staged Production Re-Parse & Live Acceptance
- Staged production database migration `0006_add_raw_sheets_preservation.sql`.
- Atomic re-parsing of all 62 production original documents and unpacked ZIP archives (including portfolio tracker).
- Reconcile cell and metric counts against audit baseline.
- Live acceptance testing across portfolio companies with zero production downtime.
- Push and PR review.
