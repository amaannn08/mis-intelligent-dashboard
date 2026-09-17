import * as React from 'react';
import { notFound } from 'next/navigation';
import { db, companies, documents } from '@mis/db';
import { eq, desc } from 'drizzle-orm';
import { AppShell } from '@/components/layout/app-shell';
import { CompanyDocumentsView, type DocumentRow } from '@/components/documents/company-documents-view';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CompanyDocumentsPage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Fetch company by slug
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      industry: companies.industry,
    })
    .from(companies)
    .where(eq(companies.slug, slug));

  if (!company) {
    notFound();
  }

  // 2. Fetch documents for this company
  const compDocs = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      companyId: documents.companyId,
      reportingPeriod: documents.reportingPeriod,
      fileType: documents.fileType,
      sizeBytes: documents.sizeBytes,
      status: documents.status,
      error: documents.error,
      uploadedAt: documents.uploadedAt,
      processedAt: documents.processedAt,
    })
    .from(documents)
    .where(eq(documents.companyId, company.id))
    .orderBy(desc(documents.uploadedAt));

  const formattedDocs: DocumentRow[] = compDocs.map((d) => ({
    id: d.id,
    filename: d.filename,
    companyId: d.companyId,
    reportingPeriod: d.reportingPeriod,
    fileType: d.fileType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    error: d.error,
    uploadedAt: new Date(d.uploadedAt).toISOString(),
    processedAt: d.processedAt ? new Date(d.processedAt).toISOString() : null,
  }));

  return (
    <AppShell>
      <CompanyDocumentsView
        company={company}
        initialDocuments={formattedDocs}
      />
    </AppShell>
  );
}
