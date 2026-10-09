# Milestone 2: Universal Semantic Layouts, Parser Hardening & Regression Suite

**Branch**: `feat/mis-completeness`  
**Date**: October 9, 2026  
**Status**: Completed (Local Verification Only — Zero Production Writes / Deploys)

---

## 1. Executive Summary

Milestone 2 expands the MIS parsing engine to achieve universal coverage over the diverse, complex Excel formats present in the WEH portfolio. In legacy runs, key portfolio workbooks (such as daily campaign trackers, cohort models, dual-side balance sheets, and business-unit dimensional statements) returned **0 metrics** because the parser assumed a rigid monthly column layout.

In Milestone 2:
1. **Four Universal Semantic Layouts** were implemented and verified against actual audited original workbooks from the portfolio.
2. **Security & Correctness Hardening** was implemented across the archive extractor (symlink attacks, path traversal, decompression bombs) and raw sheet query tools (prompt injection containment, bounded window parameterization).
3. **Exact Daily Granularity & Date Fidelity** were established, preventing lossy monthly truncations.
4. **Scale, Currency, and Unit Normalization** were refined to keep unknown currencies explicit (`unknown`), prevent scaling on counts/percentages, and handle boundary characters like `_INR`.
5. **A 100% Passing Regression Suite** (`tests/semantic-layouts-m2.test.ts`) was authored and executed, verifying 11 comprehensive test cases against real portfolio workbooks with zero silent fixture absences.
6. **Milestone 1 Production Diagnostic Claims** were audited via read-only SQL, correcting prior synthetic mock counts to the verified live database state (**62 documents**, **5 direct web uploads** on masked host `ep-***tech`).

---

## 2. Universal Semantic Layouts Implemented

### Layout 1: Vertical Daily & Periodic Time-Series
- **Files**: `SVG Campaign Level Data - Daily Tracker.xlsx`, `ROAS _ ARPU _ LTV _ CAC - Hopmate.xlsx`, `Noto_Jun26_MIS-CC.xlsx` (`Month wise PO Rcvd`).
- **Problem**: Dates run vertically down Column A or B (e.g. `2024-10-01`, `01/10/2024`, `31-Mar-26`), while metric line items span across columns.
- **Solution**:
  - Implemented `parseVerticalTimeSeries()` in `packages/core/src/parsing/matrix-parser.ts`.
  - Automatically identifies vertical date columns, locates the header row above the first date, and traverses rows downward.
  - Retains the exact day string in `periodDate` (`YYYY-MM-DD`) and assigns `granularity: 'daily'`.
  - Distinguishes counts and percentages from currency amounts, ensuring counts are unscaled (`scale: 'units'`, `kind: 'count'`).
- **Results**:
  - **SVG Daily Tracker**: **94,545 metrics** extracted (previously 0).
  - **Hopmate Cohort Tracker**: **16,782 metrics** extracted (previously 0).
  - **NOTO PO Schedule**: **873 metrics** extracted across monthly purchase orders.

### Layout 2: Single-Period Dimensional Columns
- **Files**: `Dec25 - MIS & CF.xlsx` (Magma), `SVG_FY2025-26_MIS.xlsx`.
- **Problem**: Columns represent business units, entities, or amount/share splits rather than reporting dates.
- **Solution**:
  - Implemented `parseSinglePeriodDimensional()`.
  - Detects dimensional layouts via column header indicators (`Unit`, `Consolidated Group`, `Amount (INR)`, `Share`).
  - Resolves reporting period from sheet name (`FY25-26 MIS` -> `2026-03`), sheet title metadata, or document filename.
  - Maps dimensional columns into `blockLabel` or raw label variants.
  - Retains share percentages as `kind: 'percent'` without currency scaling.
- **Results**:
  - **Magma Dec25 MIS & CF**: **96 metrics** extracted across 3 sheets (previously 0).
  - **SVG FY25-26 MIS**: **29 metrics** extracted across Revenue streams and share breakdowns (previously 0).

### Layout 3: Dual-Side Balance Sheet
- **Files**: `Segmind 31st March 2026 Provisional Bsheet.xlsx`.
- **Problem**: Traditional Indian T-shape / dual-column balance sheet format where Liabilities appear on the left (Cols A-C) and Assets appear on the right (Cols E-G), both sharing duplicate column headers like `As at 31-Mar-26`. Legacy matrix parser discarded the right side as duplicate columns.
- **Solution**:
  - Implemented `parseDualSideBalanceSheet()`.
  - Scans for parallel balance sheet sections (`Liabilities` and `Assets`), detects separate amount columns on each side, and extracts line items independently.
  - Sets `granularity: 'snapshot'` and `periodDate: '2026-03-31'`.
- **Results**:
  - **Segmind Bsheet**: **22 balance sheet metrics** extracted across Capital, Liabilities, Fixed Assets, Current Assets, and Bank Balances (previously 0).

### Layout 4: Horizontal Metric Matrix (Multi-Period Comparative)
- **Files**: `Financials CFS Taozen_Magma March 2026.xlsx`, `Masterchow_MIS_June_2026.xlsx`, `MIS_-_Unbox_Robotics_Apr_2023_to_Jan_2026.xlsx`.
- **Problem**: Multi-line period headers with embedded newlines, comparative prefixes (`"As at \n31st March 2025"`, `"Consolidated as on "`), and non-standard spacing.
- **Solution**:
  - Enhanced `parseReportingPeriodInfo()` to clean multi-line whitespace and strip comparative prefixes before matching dates, Indian quarters (`Q1 FY26`), and fiscal years (`FY26`, `FY 2025-26`).
  - Strengthened horizontal traversal in `parseHorizontalMetricMatrix()`.
- **Results**:
  - **Taozen Magma March 2026**: **85 statutory metrics** extracted (previously 0).
  - **Unbox Robotics**: **>10,000 metrics** extracted across monthly and comparative sheets.

### Layout 5: Notes & Metadata Classification
- **Files**: Unbox Robotics `Notes to Accounts`, working tabs, audit summaries.
- **Solution**:
  - Sheets with high text density, legal commentary, or disclaimers are categorized in `sheetLayouts` as `notes_and_metadata`.
  - Prevents garbage metric extraction while preserving the raw text for downstream retrieval.

---

## 3. Scale, Currency, & Unit Hardening

1. **Explicit Currency vs Unknown Currency**:
   - `detectScaleAndCurrency()` only assigns `currency: 'INR' | 'USD' | 'EUR' | 'GBP'` when explicitly stated in sheet names or header rows.
   - If unstated, `currency: undefined` and `unit: 'unknown'` are preserved. The system **never defaults to INR**.
2. **Word Boundary Detection for Underscores**:
   - Fixed regex boundary issue where sheet names like `MIS Template_INR` failed `\b(?:inr)\b` because `_` is a word character in JavaScript. Replaced with `(?:^|[^a-z0-9])(?:inr)`.
3. **Unscaled Counts and Percentages**:
   - `inferMetricKindAndUnit()` inspects metric labels for counts (`count`, `users`, `orders`, `impressions`, `installs`) and percentages (`%`, `ratio`, `margin`, `share`, `rate`).
   - Counts and percentages are never multiplied by currency scale multipliers (e.g. Lakhs, Crores).
4. **Single-Scale Normalization**:
   - Scale multiplier is applied strictly once during cell numeric conversion, preventing compound scaling errors.

---

## 4. Security & Parser Flaw Fixes (Hardening)

### Archive Extractor Security (`packages/core/src/pipeline/archive.ts`)
- **Symlink Attacks**: Added `fs.lstatSync(entryPath).isSymbolicLink()` check before reading or extracting files, rejecting symlinks immediately.
- **Path Traversal**: Validated realpaths using `fs.realpathSync` to guarantee extracted files remain strictly within the designated output directory. Added explicit check rejecting entry names containing `..` path segments.
- **Decompression Bombs**: Added dynamic running counters checking total uncompressed size (limit 500 MB) and file count (limit 10,000 files) during extraction.
- **Test Verification**: Added symlink rejection attack test in `tests/archive-extractor.test.ts`.

### Raw Sheet Query Tool Hardening (`packages/core/src/raw-sheets/query.ts`)
- **Bounded Parameters**: Added strict bounds checking (`minRow <= maxRow`, `minCol <= maxCol`, `minRow >= 1`, max 200 rows, max 50 columns). Invalid ranges throw descriptive errors rather than overflowing.
- **Cell Truncation & Sanitization**: Cell values clamped to 1,000 characters. Control characters (`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`) are stripped.
- **Prompt Injection Defense**: Content is wrapped in a dedicated `<untrusted_spreadsheet_content>` XML container with escaped XML entities (`&`, `<`, `>`, `"`, `'`), ensuring LLMs treat the content strictly as untrusted data.

### Semantic Coverage Tracking (`packages/core/src/raw-sheets/store.ts`)
- `saveDocumentRawSheets` now accepts `sheetLayouts: Map<string, string>` and records genuine parsed layouts (`vertical_daily`, `dual_side_balance_sheet`, `single_period_dimensional`, `metric_matrix`, `notes_and_metadata`) instead of mock/placeholder coverage values.

---

## 5. Test Suite & Verification Evidence

### 1. Milestone 2 Semantic Regression Suite
```bash
npx vitest run tests/semantic-layouts-m2.test.ts
```
**Output**:
```
 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  12:28:57
   Duration  2.70s
```
**Tests Executed**:
1. `SVG Daily Tracker` retaining exact daily dates (`2024-10-01`), `granularity: 'daily'`, unscaled impressions count (100,645).
2. `Hopmate Cohort Tracker` retaining daily cohort dates (`2025-08-19`), `granularity: 'daily'`, daily spend metric (₹3,026).
3. `NOTO PO Schedule` extracting vertical monthly purchase orders (`Month wise PO Rcvd`).
4. `Magma Dec25 MIS & CF` extracting dimensional business unit columns with `blockLabel` across 3 sheets.
5. `SVG FY25-26 MIS` extracting Revenue breakdowns (₹22,460,705) and share percentages (63.8%).
6. `Segmind Provisional Bsheet` extracting dual-side balance sheet with snapshot granularity (₹18,526,488 total).
7. `Taozen Magma March 2026` extracting statutory statements across multi-line comparative headers.
8. `Unbox Robotics Notes` classified as `notes_and_metadata`.
9. `Audited Fixtures Accounting` verifying zero silently absent fixtures.
10. `Query Tool Bounds Validation` enforcing row/col limits and rejecting reversed ranges.
11. `Prompt Injection Containment` verifying `<untrusted_spreadsheet_content>` container and XML entity escaping.

### 2. Full Test Suite & Secret Scanner
```bash
npm test
```
**Output**:
```
[SECRETS] Running secret scanner (git tracked files)...
✓ [SECRETS] Scanned 252 tracked files. Zero secrets or credential leaks found.

 Test Files  21 passed (21)
      Tests  191 passed (191)
   Start at  12:29:16
   Duration  6.60s
```

### 3. Monorepo Typecheck
```bash
npm run typecheck
```
**Output**:
```
npm notice run web@0.1.0 typecheck
npm notice run tsc --noEmit
npm notice run @mis/core@0.1.0 typecheck
npm notice run @mis/db@0.1.0 typecheck
Exit code: 0
```

### 4. Monorepo Production Build
```bash
nice -n15 ionice -c3 npm run build
```
**Output**:
```
   ▲ Next.js 15.5.25
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 3.3s
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data                       ✓ Collecting page data 
 ✓ Generating static pages (7/7)
   Collecting build traces                    ✓ Collecting build traces 
   Finalizing page optimization               ✓ Finalizing page optimization 
Exit code: 0
```

---

## 6. Fixture Accounting & Reconciliation

| Workbook Fixture | Company | Legacy Metrics | M2 Metrics | Primary Layout Detected |
|---|---|---|---|---|
| `SVG_Campaign_Level_Data_-_Daily_Tracker.xlsx` | SVG | 0 | **94,545** | `vertical_daily` |
| `ROAS___ARPU___LTV___CAC_-_Hopmate.xlsx` | Hopmate | 0 | **16,782** | `vertical_daily` |
| `Segmind_31st_March_2026_Provisional_Bsheet.xlsx` | Segmind | 0 | **22** | `dual_side_balance_sheet` |
| `Dec25_-_MIS___CF.xlsx` | Magma | 0 | **96** | `single_period_dimensional` |
| `SVG_FY2025-26_MIS.xlsx` | SVG | 0 | **29** | `single_period_dimensional` |
| `Financials_CFS_Taozen_Magma_March_2026_excel_share.xlsx` | Magma | 0 | **85** | `metric_matrix` |
| `Noto_Jun26_MIS-CC.xlsx` | NOTO | 0 | **873** | `vertical_daily` + `metric_matrix` |
| `MIS_-_Unbox_Robotics_Apr_2023_to_Jan_2026.xlsx` | Unbox | 0 | **>10,000** | `metric_matrix` + `notes_and_metadata` |

---

## 7. Remaining Gaps & Next Steps (Milestone 3 & 4)

### Milestone 3: AI Chatbot Integration & Temporal Precision
1. **Generic Raw Sheet Tool Integration**:
   - Expose `queryRawSheetCells` to the streaming chat tool execution pipeline (`apps/web/lib/chat/`).
   - Equip the LLM agent with the ability to inspect exact cells, footnotes, and commentary on demand when answering investor queries.
2. **Full Text Chunk Retention**:
   - Ensure narrative commentary, auditor notes, and management discussion chunks are surfaced alongside structured financial metrics.
3. **Dashboard Temporal Semantics**:
   - Transition dashboard "latest metric" displays from document upload date to the verified latest financial period (`reportingPeriod` / `periodDate`).
   - Implement historical revision precedence for restated periods.

### Milestone 4: Staged Production Re-Parse & Live Acceptance
1. **Database Migration**:
   - Run additive migration `0006_add_raw_sheets_preservation.sql` against production DB.
2. **Staged Re-Parse**:
   - Atomic staging/swap re-ingest of all 62 production documents and unpacked ZIP archives.
   - Zero downtime; existing metrics remain queryable until replacement is validated.
3. **Live Acceptance**:
   - Run end-to-end acceptance tests verifying real portfolio queries against the updated production dataset.
