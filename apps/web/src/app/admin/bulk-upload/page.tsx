import * as React from 'react';
import { db, companies } from '@mis/db';
import { asc } from 'drizzle-orm';
import { AppShell } from '@/components/layout/app-shell';
import { PageShell } from '@/components/layout/page-shell';
import { BulkUploadDropzone } from '@/components/documents/bulk-upload-dropzone';

export const metadata = {
  title: 'Bulk MIS Upload | WEH MIS Intelligence',
  description: 'Upload multiple portfolio company MIS spreadsheets simultaneously with live extraction status.',
};

export const dynamic = 'force-dynamic';

export default async function BulkUploadPage() {
  const allCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
    })
    .from(companies)
    .orderBy(asc(companies.name));

  return (
    <AppShell>
      <PageShell
        title="Bulk MIS Ingestion"
        subtitle="Select multiple spreadsheets or drop an entire folder to ingest, validate, and extract financial metrics."
      >
        <div className="max-w-5xl mx-auto py-4">
          <BulkUploadDropzone companies={allCompanies} />
        </div>
      </PageShell>
    </AppShell>
  );
}
