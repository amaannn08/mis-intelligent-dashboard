import { describe, it, expect, vi } from 'vitest';
import { runReconciliationDiagnostics } from '../scripts/reconcile-sources.js';

// Mock pg
vi.mock('pg', () => {
  const mClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: {
      Client: vi.fn().mockImplementation(function () {
        return mClient;
      }),
    },
  };
});

import pg from 'pg';

describe('Reconcile Direct Uploads: Diagnostics & Safety', () => {
  it('runs read-only diagnostic query and identifies unparsed direct uploads', async () => {
    const mockClientInstance = new (pg as any).Client();

    // Mock query calls:
    // Call 1: SET default_transaction_read_only = ON;
    mockClientInstance.query.mockResolvedValueOnce({ rows: [] });

    // Call 2: Select diagnostic documents
    mockClientInstance.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'b491598a-6f1c-47c4-b502-5b23cbd2b0f8',
          filename: 'Noto_Jun26_MIS-CC.xlsx',
          company_name: 'NOTO',
          company_slug: 'noto',
          reporting_period: '2026-06',
          uploaded_at: '2026-09-18T18:56:13.122Z',
          status: 'processed',
          drive_file_id: null,
          mis_metrics_count: '0',
          document_sheets_count: '0',
          chunks_count: '8',
        },
        {
          id: '0732c9cc-6c67-4b5b-925a-0626415b7a3c',
          filename: 'MIS_-_Unbox_Robotics_Apr_2023_to_Jan_2026.xlsx',
          company_name: 'Unbox Robotics',
          company_slug: 'unbox-robotics',
          reporting_period: '2026-01',
          uploaded_at: '2026-09-30T12:04:04.159Z',
          status: 'processed',
          drive_file_id: null,
          mis_metrics_count: '0',
          document_sheets_count: '0',
          chunks_count: '99',
        },
        {
          id: 'bf6ed3a5-5004-4461-9685-8b07c6f7c60c',
          filename: 'Masterchow_MIS_June_2026.xlsx',
          company_name: 'Masterchow',
          company_slug: 'masterchow',
          reporting_period: '2026-06',
          uploaded_at: '2026-10-01T05:40:00.725Z',
          status: 'processed',
          drive_file_id: null,
          mis_metrics_count: '2',
          document_sheets_count: '1',
          chunks_count: '1',
        },
      ],
    });

    const rows = await runReconciliationDiagnostics({
      connString: 'postgres://dummy:dummy@localhost:5432/testdb',
      readOnly: true,
    });

    expect(rows.length).toBe(3);

    // Verify read-only transaction was enforced
    expect(mockClientInstance.query).toHaveBeenCalledWith(
      'SET default_transaction_read_only = ON;'
    );

    // Filter unparsed
    const unparsed = rows.filter((r) => parseInt(r.mis_metrics_count, 10) === 0);
    expect(unparsed.length).toBe(2);
    expect(unparsed.map((r) => r.company_name)).toContain('NOTO');
    expect(unparsed.map((r) => r.company_name)).toContain('Unbox Robotics');
  });
});
