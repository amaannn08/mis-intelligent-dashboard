import { pool } from '@mis/db';

export interface WorkbookMapOptions {
  companyId: string;
  maxExamplesPerSheet?: number;
}

interface SheetRow {
  filename: string;
  reporting_period: string | null;
  sheet_name: string;
  detected_layout: string;
  semantic_parsed: boolean;
  semantic_metric_count: number;
  row_count: number;
  col_count: number;
  document_id: string;
}

interface MetricAggRow {
  document_id: string;
  sheet_name: string;
  blocks: string[] | null;
  parents: string[] | null;
  min_period: string | null;
  max_period: string | null;
  distinct_raw_labels: string[] | null;
}

function joinWithMore(items: string[], max: number): string {
  if (items.length === 0) return '';
  const shown = items.slice(0, max);
  const remaining = items.length - shown.length;
  return remaining > 0 ? `${shown.join(', ')} (+${remaining} more)` : shown.join(', ');
}

/**
 * Builds a compact, per-sheet inventory of everything on file for a company:
 * every sheet (including notes/trial-balance/unparsed tabs via document_sheets),
 * its detected layout, and — where mis_metrics has data — example dimension
 * values (channels, categories, product names, line items) and the period
 * range covered. This is injected into the system prompt so the model knows
 * what exists before deciding a question is unanswerable, and knows which
 * exact names to pass into query_mis_metrics / query_structured_metrics /
 * query_raw_sheet_cells.
 */
export async function buildWorkbookMap(options: WorkbookMapOptions): Promise<string> {
  const { companyId, maxExamplesPerSheet = 10 } = options;

  const [sheetsRes, metricsRes] = await Promise.all([
    pool.query<SheetRow>(
      `SELECT d.filename, d.reporting_period, ds.sheet_name, ds.detected_layout,
              ds.semantic_parsed, ds.semantic_metric_count, ds.row_count, ds.col_count,
              ds.document_id
       FROM document_sheets ds
       JOIN documents d ON d.id = ds.document_id
       WHERE d.company_id = $1
       ORDER BY d.reporting_period DESC NULLS LAST, d.uploaded_at DESC, ds.sheet_index ASC;`,
      [companyId]
    ),
    pool.query<MetricAggRow>(
      `SELECT document_id, sheet_name,
              array_agg(DISTINCT block_label) FILTER (WHERE block_label IS NOT NULL) AS blocks,
              array_agg(DISTINCT parent_block_label) FILTER (WHERE parent_block_label IS NOT NULL) AS parents,
              min(reporting_period) AS min_period,
              max(reporting_period) AS max_period,
              array_agg(DISTINCT raw_label) AS distinct_raw_labels
       FROM mis_metrics
       WHERE company_id = $1
       GROUP BY document_id, sheet_name;`,
      [companyId]
    ),
  ]);

  if (sheetsRes.rows.length === 0) {
    return '';
  }

  const metricsByKey = new Map<string, MetricAggRow>();
  for (const row of metricsRes.rows) {
    metricsByKey.set(`${row.document_id}::${row.sheet_name}`, row);
  }

  const lines: string[] = [];
  let currentFile = '';

  for (const sheet of sheetsRes.rows) {
    if (sheet.filename !== currentFile) {
      currentFile = sheet.filename;
      lines.push(`\nFile "${sheet.filename}"${sheet.reporting_period ? ` (period: ${sheet.reporting_period})` : ''}:`);
    }

    const agg = metricsByKey.get(`${sheet.document_id}::${sheet.sheet_name}`);
    const periodRange = agg?.min_period
      ? agg.min_period === agg.max_period
        ? agg.min_period
        : `${agg.min_period} to ${agg.max_period}`
      : null;

    const parts: string[] = [`layout=${sheet.detected_layout}`];

    if (sheet.semantic_metric_count > 0 && agg) {
      const blocks = (agg.blocks || []).filter(Boolean);
      const lineItems = (agg.distinct_raw_labels || []).filter(Boolean);

      if (blocks.length > 0) {
        parts.push(`${blocks.length} item(s) e.g. ${joinWithMore(blocks, maxExamplesPerSheet)}`);
      }
      if (lineItems.length > 0 && lineItems.length <= 40) {
        parts.push(`line items: ${joinWithMore(lineItems, maxExamplesPerSheet)}`);
      } else if (lineItems.length > 40) {
        parts.push(`${lineItems.length} distinct line items`);
      }
      if (periodRange) parts.push(`periods ${periodRange}`);
    } else if (sheet.detected_layout === 'notes_and_metadata') {
      parts.push('free-text notes/commentary — use query_raw_sheet_cells to read it');
    } else if (!sheet.semantic_parsed) {
      parts.push(
        `not auto-parsed (${sheet.row_count}x${sheet.col_count} cells) — use query_raw_sheet_cells to inspect it directly`
      );
    }

    lines.push(`  - "${sheet.sheet_name}": ${parts.join(' · ')}`);
  }

  return lines.join('\n').trim();
}
