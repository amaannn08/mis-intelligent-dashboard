# MIS Block-Aware Parser, Scale Normalization & Chat Verification Report

**Branch:** `feat/bulk-ingest`  
**Execution Date:** October 7, 2026  
**Environment:** Neon Serverless PostgreSQL (`ep-square-morning-b5bns5zk-pooler.c-7.us-east-2.aws.neon.tech/neondb`) + Vercel Blob Storage + DeepSeek Chat  
**Target Ingestion Population:** 57 Google Drive files + 5 direct dashboard uploads = 62 total documents  

---

## 1. Executive Summary & Verification Guardrails

This verification establishes end-to-end correctness for the block-aware parser, matrix scale inheritance, transactional atomic metric replacement, and grounded chat responses in the WEH Ventures MIS Intelligent Dashboard.

### Core Guardrail Implementation & Verification:

1. **Exact Cell Provenance (No Invented Fixtures):**
   - In `Masterchow MIS April 26.xlsx`, sheet `P&L Summary` cell A1 contains `"Particulars in INR Lac"`.
   - In Month 1 (April 2024 / Column B), the `Category` sheet Net Revenue values sum to:
     $$\text{Condiments (46.30)} + \text{Essential (33.68)} + \text{Stick Noodles (21.60)} + \text{Sauces (18.23)} + \text{Cup Noodles (11.85)} + \text{Noodle Kit (5.71)} + \text{Rice (1.67)} + \text{Pouch Noodle (0.69)} = \mathbf{139.73\text{ Lakh}}$$
   - In `P&L Summary`, row *Net Revenue* for April 2024 (Column B) is exactly $\mathbf{139.73\text{ Lakh}}$.
   - **Provenance Proof:** Mathematical and semantic 1:1 parity proves `Category` sheet monetary figures share the `INR Lac` scale ($100,000\times$) with `P&L Summary`.

2. **Dedicated Sheet Selection & Non-Duplication:**
   - When answering category queries, the query engine binds exclusively to the dedicated authoritative sheet (`Category`), filtering `parent_block_label IS NULL`.
   - This strictly prevents double-counting against matrix cross-tabs such as `Category X Channel` or multi-level pivot rollups.

3. **Current-Document Precedence & Transactional Atomic Replacement:**
   - Overlapping documents are ordered by reporting period (`2026-04` > `2025-09`).
   - During document reparsing, metric deletion and granular batch insertions in `packages/core/src/pipeline/index.ts` run inside a single PostgreSQL transaction (`db.transaction(async (tx) => { ... })`). Outside readers via PostgreSQL MVCC never encounter an empty/partial table or fall back to older historical snapshots.

4. **Mixed-Unit Integrity & Non-Override Protection:**
   - Global workbook banners do **not** override explicit per-sheet banners. Sheets with explicit headers (e.g. `USD '000` in Animall) preserve their currency and scale.
   - Non-monetary rows retain their intrinsic kinds:
     - Quantity / volume rows: `kind: 'count'`, `scale: 'units'`, unscaled integers.
     - Percentage / margin rows: `kind: 'percent'`, `scale: 'units'`, unscaled percentages.

5. **Anti-Double-Scaling Interface & Grounded Chat:**
   - Payload explicitly separates unscaled formatted source figures from normalized base INR:
     - `source_value_latest`: `326.31`, `source_value_latest_formatted`: `"326.31 Lakh"`
     - `source_value_cumulative`: `3034.87`, `source_value_cumulative_formatted`: `"3034.87 Lakh"`
     - `normalized_amount_latest_inr`: `32631000` ($\approx$ ₹3.26 Cr)
     - `normalized_amount_cumulative_inr`: `303487000` ($\approx$ ₹30.35 Cr)
     - `scale_multiplier_applied`: `true`, `value_unit`: `"INR"`, `do_not_scale_again`: `true`
   - Leading response requirement: Always report the latest single period leader first (April 2026: 326.31 Lakh / ₹3.26 Cr) before stating 25-month cumulative totals.

---

## 2. Real Chat-Path Verification & Actual Model Output

### Command Run:
```bash
npx tsx scripts/test-chat-query.ts
```

### Raw Evidence & Stdout:
```text
======================================================
Testing Chat Query: "which category is best selling for Masterchow?"
======================================================

1. Structured Database Query Path (mis_metrics):
   Authoritative source: Sheet 'Category' in 'Masterchow MIS April 26.xlsx'.
- Latest reported period (2026-04): #1 best-selling category is 'Condiments' with 326.31 Lakh (normalized: ₹3,26,31,000, or ₹3.26 Cr).
- Cumulative across 25 months (2024-04 to 2026-04): #1 is 'Condiments' with total 3034.87 Lakh (normalized: ₹30,34,87,000, or ₹30.35 Cr).
- Scale provenance: Inherited from workbook P&L Summary banner 'Particulars in INR Lac' (scale: lakh, multiplier: 100000).
CRITICAL INSTRUCTION FOR LLM ASSISTANT: Quote the exact amounts: "326.31 Lakh" (latest month 2026-04) and "3034.87 Lakh" (cumulative). In Crores, these are ₹3.26 Cr and ₹30.35 Cr. DO NOT multiply these numbers by 100000 again!

   Ranked Category Breakdown:
   - Condiments       | Latest (2026-04): 326.31 Lakh    | Cumulative (2024-04-2026-04): 3034.87 Lakh     | Normalized INR: ₹30.35 Cr
   - Essential        | Latest (2026-04): 94.58 Lakh     | Cumulative (2024-04-2026-04): 1609.95 Lakh     | Normalized INR: ₹16.10 Cr
   - Stick Noodles    | Latest (2026-04): 119.5 Lakh     | Cumulative (2024-04-2026-04): 1581.25 Lakh     | Normalized INR: ₹15.81 Cr
   - Sauces           | Latest (2026-04): 87.13 Lakh     | Cumulative (2024-04-2026-04): 950.93 Lakh      | Normalized INR: ₹9.51 Cr
   - Cup Noodles      | Latest (2026-04): 18.96 Lakh     | Cumulative (2024-04-2026-04): 537.27 Lakh      | Normalized INR: ₹5.37 Cr
   - K-Noodles        | Latest (2026-04): 30.91 Lakh     | Cumulative (2024-09-2026-04): 422.96 Lakh      | Normalized INR: ₹4.23 Cr
   - Ready To eat     | Latest (2026-04): 11.93 Lakh     | Cumulative (2025-07-2026-04): 206.61 Lakh      | Normalized INR: ₹2.07 Cr
   - Noodle Kit       | Latest (2026-04): 0 Lakh         | Cumulative (2024-04-2026-04): 114.35 Lakh      | Normalized INR: ₹1.14 Cr
   - Pouch Noodle     | Latest (2026-04): 9.47 Lakh      | Cumulative (2024-04-2026-04): 86.08 Lakh       | Normalized INR: ₹0.86 Cr
   - Spout            | Latest (2026-04): 5.57 Lakh      | Cumulative (2025-04-2026-04): 72.85 Lakh       | Normalized INR: ₹0.73 Cr

2. AI Model Streaming Response (with query_mis_metrics tool):
   Assistant: 
I'll look up the category-level breakdown for Masterchow.   [Tool Call] query_mis_metrics(company=Masterchow, metric=net_revenue)
**Condiments is Masterchow's best-selling category.**

**Latest reported period (April 2026):**
- **Condiments: 326.31 Lakh (₹3.26 Cr)** — #1
- Stick Noodles: 119.5 Lakh (₹1.20 Cr)
- Essential: 94.58 Lakh (₹0.95 Cr)
- Sauces: 87.13 Lakh (₹0.87 Cr)
- K-Noodles: 30.91 Lakh (₹0.31 Cr)
- Cup Noodles: 18.96 Lakh (₹0.19 Cr)
- Ready To Eat: 11.93 Lakh (₹0.12 Cr)
- Pouch Noodle: 9.47 Lakh (₹0.09 Cr)
- Spout: 5.57 Lakh (₹0.06 Cr)
- Rice: 3.95 Lakh (₹0.04 Cr)
- Sachet: 3.57 Lakh (₹0.04 Cr)
- Noodle Kit & Others: 0 Lakh

**Cumulative (25 months, Apr 2024 – Apr 2026):**
- **Condiments: 3034.87 Lakh (₹30.35 Cr)** — #1
- Essential: 1609.95 Lakh (₹16.10 Cr)
- Stick Noodles: 1581.25 Lakh (₹15.81 Cr)
- Sauces: 950.93 Lakh (₹9.51 Cr)
- Cup Noodles: 537.27 Lakh (₹5.37 Cr)
- K-Noodles: 422.96 Lakh (₹4.23 Cr)
- Ready To Eat: 206.61 Lakh (₹2.07 Cr)
- Noodle Kit: 114.35 Lakh (₹1.14 Cr)
- Pouch Noodle: 86.08 Lakh (₹0.86 Cr)
- Spout: 72.85 Lakh (₹0.73 Cr)
- Rice: 52.72 Lakh (₹0.53 Cr)
- Sachet: 13.11 Lakh (₹0.13 Cr)
- Others: 11.88 Lakh (₹0.12 Cr)

Condiments leads on both a latest-month and cumulative basis, and notably widened its lead in April 2026 (326.31 Lakh vs. 234.32 Lakh in March 2026). Source: Sheet 'Category', Masterchow MIS April 26.xlsx.
```

**Verification Finding:**
- The assistant immediately stated `Condiments` as #1 with ₹326.31 Lakh (₹3.26 Cr) in April 2026, and ₹3,034.87 Lakh (₹30.35 Cr) cumulative.
- Zero double-scaling: No incorrect "₹30,000 Crore" figures.
- Grounded in source document `Masterchow MIS April 26.xlsx` and sheet `Category`.

---

## 3. Ingest Population Accounting & Idempotency Verification

### Population Accounting:
- **Google Drive Candidate Files:** 58 files discovered in shared drive recursive scan.
- **Excluded Files:** 1 file located in folder without portfolio company mapping (`!f.companySlug`).
- **Selected Ingestion Targets:** 57 files.
- **Direct Web Uploads in Database:** 5 files (`Animall_MIS_Q1_2026.xlsx`, `Pratilipi_MIS_May_2026.xlsx`, `Masterchow_MIS_June_2026.xlsx`, `Sri Mandir MIS_vf.xlsx`, `MedMitra - Investor Updates (1).docx`).
- **Total Documents in Neon PROD:** 62 documents.
- **Database Status Breakdown:** **62 PROCESSED, 0 PENDING, 0 FAILED**.

### Idempotency Check Execution:
```bash
npx tsx scripts/ingest-gdrive.ts --prod
```

### Raw Ingest Summary Evidence:
```text
================================================================================
GOOGLE DRIVE INGESTION EXECUTION SUMMARY
================================================================================
Total Target Files: 57
✅ Processed:       0
⏭️  Skipped:         57
❌ Failed:          0
--------------------------------------------------------------------------------
⏭️  [Fund I] [animall] Animall MIS March 2026.xlsx: Duplicate / non-target
⏭️  [Fund II] [magma] Financials CFS Taozen_Magma March 2026 excel share.xlsx: Duplicate / non-target
⏭️  [Fund III] [praan-health] Draft MIS -Praan-Standalone March'26.xlsx: Duplicate / non-target
... (all 57 files skipped idempotently via checksum matching)
================================================================================
```

---

## 4. Large-File (>4MB) Streaming Download Verification

Tested large-file binary download for Pratilipi MIS (`Pratilipi MIS_ Mar_ 26.xlsx`, 5,500,092 bytes):
```bash
node -e '
const fs = require("fs");
const dotenv = require("dotenv");
const env = dotenv.parse(fs.readFileSync("/home/amann/.hermes/private/mis-secrets.env", "utf8"));
fetch("https://niwxmp8dk1zg1b9g.private.blob.vercel-storage.com/mis-drive/pratilipi/Pratilipi%20MIS_%20Mar_%2026.xlsx", {
  headers: { Authorization: `Bearer ${env.MIS_BLOB_READ_WRITE_TOKEN}` }
}).then(async r => {
  console.log("Status:", r.status);
  console.log("Content-Length:", r.headers.get("content-length"));
  const b = await r.arrayBuffer();
  console.log("Downloaded Bytes:", b.byteLength);
  console.log("Match:", b.byteLength === 5500092 ? "PERFECT MATCH" : "Mismatch");
});
'
```

### Raw Result:
```text
Status: 200
Content-Length: 5500092
Downloaded Bytes: 5500092
Match: PERFECT MATCH
```

---

## 5. Portfolio Scale Refresh Inventory (292 Sheet-Scale Groups)

A full database audit across `mis_metrics` was executed to disclose which documents have explicit sheet banners vs inherited workbook banners vs unscaled units:

| Company | Document Name | Scale(s) in `mis_metrics` | Currency | Row Count | Banner Type & Provenance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Animall** | `Animall MIS March 2026.xlsx` | `thousand` | `USD` | 709 | Explicit sheet banner (`USD '000`) |
| **Animall** | `Animall MIS Dec 2025 (1).xlsx` | `thousand` | `USD` | 664 | Explicit sheet banner (`USD '000`) |
| **Animall** | `Animall MIS Sep 2025.xlsx` | `thousand` | `USD` | 619 | Explicit sheet banner (`USD '000`) |
| **Animall** | `Animall_MIS_Q1_2026.xlsx` | `units` | `INR` | 2 | Single KPI upload (no sheet banner) |
| **Apps for Bharat** | `Sri Mandir MIS_vf.xlsx` | `units` | `INR` | 9,234 | Standard unit counts / INR (no scale banner) |
| **Apps for Bharat** | `Sri Mandir - MIS Jan 25.xlsx` | `units` | `INR` | 6,428 | Standard unit counts / INR |
| **Clinikk** | `Clinikk_MIS Mar 26.xlsx` | `units` | `USD`, `INR` | 5,603 | Multi-currency raw units |
| **Clinikk** | `MIS_Clinikk_Dec_25 (INR).xlsx`| `units` | `INR` | 1,552 | Raw INR units |
| **Flent** | `Flent MIS upto apr 26.xlsx` | `lakh`, `units` | `INR` | 649 | Mixed: P&L in Lakhs, metrics in units |
| **Game Theory** | `ITD MIS April 2026 breakup.xlsx`| `lakh`, `million`, `units` | `INR` | 18,670 | Explicit per-sheet banners (`in Lakhs`, `in Millions`) |
| **Game Theory** | `Entity MIS Summary April 2026` | `units` | `INR` | 2,081 | Raw unit matrix |
| **Hectar** | `Hector MIS upto Mar 26.xlsx` | `units` | `USD` | 62 | Raw USD metrics |
| **Jar** | `Jar MIS September-25.xlsx` | `million`, `crore` | `INR` | 15,479 | Explicit headers: AUM in Crores, P&L in Millions |
| **Jar** | `Jar MIS upto March - 26.xlsx` | `million`, `crore` | `INR` | 9,400 | Explicit headers: AUM in Crores, P&L in Millions |
| **Jar** | `Jar MIS upto Dec 5.xlsx` | `million`, `crore` | `INR` | 8,449 | Explicit headers: AUM in Crores, P&L in Millions |
| **Jar** | `Jar MIS October - 25.xlsx` | `crore`, `million` | `INR` | 6,933 | Explicit headers: AUM in Crores, P&L in Millions |
| **KNOT (Slick)** | `KNOT MIS - FY27.xlsx` | `million`, `units` | `INR` | 4,984 | P&L in Millions, engagement in units |
| **KNOT (Slick)** | `KNOT MIS Sept 25.xlsx` | `crore` | `INR` | 181 | Explicit banner: `INR Cr` |
| **Masterchow** | `Masterchow MIS April 26.xlsx`| `lakh`, `crore` | `INR` | 47,661 | Inherited from `P&L Summary` A1 (`INR Lac`) |
| **Masterchow** | `Masterchow MIS Sep 25.xlsx` | `lakh`, `units` | `INR` | 30,776 | Inherited from `P&L Summary` A1 (`INR Lac`) |
| **Mitigata** | `Mitigata MIS [TCWF _ WEH].xlsx`| `crore`, `units` | `INR` | 1,619 | Explicit banner: `INR Cr` |
| **Praan Health** | `Draft MIS -Praan-Standalone March'26`| `units` | `INR` | 757 | Raw INR units |
| **Pratilipi** | `Pratilipi MIS_ Mar_ 26.xlsx` | `crore`, `units` | `INR` | 72,325 | Balance Sheet in Crores, operations in units |
| **Pratilipi** | `MIS_ Jun_25_.xlsx` | `crore`, `units` | `INR` | 18,889 | Balance Sheet in Crores, operations in units |
| **Sustvest** | `Sustvest detailed MIS Dec 25.xlsx`| `million`, `units` | `INR` | 2,578 | Explicit banner: `INR Mn` |
| **Unbox Robotics** | `Unbox Robotics Apr 2023 to Dec 2025`| `million`, `units` | `INR` | 10,907 | Explicit sheet banner: `INR Mn` |

**Conclusion on Scope of Reparse:**
Only Masterchow required workbook-level scale inheritance recovery (from `P&L Summary` to `Category`), which has been completely reparsed with atomic safety (47,661 granular rows). All other multi-scale workbooks (Jar, Game Theory, Unbox Robotics, Pratilipi, Animall) had explicit sheet banners that were correctly parsed. No unbounded reparse is required or authorized.

---

## 6. Regression Test Suite & Production Build

### Unit & Regression Test Results:
```bash
npm test
```
- **Tracked Files Scanned for Secrets:** 232 files, 0 leaks.
- **Vitest Test Files:** 16 passed (16).
- **Total Tests:** 163 passed (163).
- **Key Targeted Suites:**
  - `tests/matrix-parser.test.ts`: 12 tests passing (including mixed-unit workbook preservation, global banner inheritance, and count/percent non-override).
  - `tests/metrics-query.test.ts`: 9 tests passing (exact net vs gross revenue, dedicated sheet selection, overlapping document precedence, count/percent/currency segregation, period ranges).

### Next.js Production Build:
```bash
npm run build
```
- Compiled successfully in 3.3s.
- 0 lint or TypeScript errors across all 20 API and UI routes.

---

## 7. Disclosures & Known Limitations

1. **Non-Tabular / Narrative Content:**
   - The matrix parser operates on tabular worksheets structured with reporting period columns (dates/months). Spreadsheets containing unstructured narrative notes, meeting minutes, or freeform text blocks are not matrix-parsed into `mis_metrics`. They are segmented into document chunks and queried via hybrid vector embeddings.
2. **Spreadsheets Without Any Scale Banners:**
   - In workbooks where neither the sheet header nor any workbook summary sheet contains an explicit unit banner (e.g. `Fragaria MIS Mar 26.xlsx`), the parser assigns `scale: 'units'` and `currency: 'INR'`. The system refrains from guessing whether unstated numbers are thousands or lakhs.
3. **Multi-Currency Segregation:**
   - The dashboard enforces strict currency segregation: metrics in `USD` (e.g. Animall) and `INR` (e.g. Masterchow) are never aggregated or compared without explicit currency labeling.
4. **Git Operations:**
   - In accordance with instructions, all verified code is committed locally on branch `feat/bulk-ingest`. No push to remote and no deployment to hosting environments was executed.
