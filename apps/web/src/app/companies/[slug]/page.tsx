import * as React from 'react';
import { notFound } from 'next/navigation';
import { db, companies, documents, metrics, metricDefinitions } from '@mis/db';
import { eq, desc, asc } from 'drizzle-orm';
import { AppShell } from '@/components/layout/app-shell';
import { CompanyWorkspace } from '@/components/company/company-workspace';
import { type MetricRowData } from '@/components/dashboard/metric-table';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CompanyWorkspacePage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Fetch company by slug
  const [company] = await db
    .select()
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
      reportingPeriod: documents.reportingPeriod,
      status: documents.status,
      sizeBytes: documents.sizeBytes,
      uploadedAt: documents.uploadedAt,
      error: documents.error,
    })
    .from(documents)
    .where(eq(documents.companyId, company.id))
    .orderBy(desc(documents.uploadedAt));

  // 3. Fetch metrics for this company
  const compMetrics = await db
    .select({
      id: metrics.id,
      metricKey: metrics.metricKey,
      value: metrics.value,
      unit: metrics.unit,
      reportingPeriod: metrics.reportingPeriod,
      valueKind: metrics.valueKind,
      sourceReference: metrics.sourceReference,
      confidence: metrics.confidence,
      label: metricDefinitions.label,
      directionality: metricDefinitions.directionality,
      documentId: metrics.documentId,
    })
    .from(metrics)
    .leftJoin(metricDefinitions, eq(metrics.metricKey, metricDefinitions.key))
    .where(eq(metrics.companyId, company.id))
    .orderBy(asc(metrics.reportingPeriod));

  const formattedMetrics: MetricRowData[] = compMetrics.map((m) => ({
    id: m.id,
    metricKey: m.metricKey,
    label: m.label || m.metricKey,
    unit: m.unit,
    value: m.value,
    reportingPeriod: m.reportingPeriod,
    valueKind: m.valueKind,
    sourceReference: m.sourceReference,
    confidence: m.confidence ? parseFloat(m.confidence) : null,
    documentId: m.documentId,
  }));

  const formattedDocs = compDocs.map((d) => ({
    id: d.id,
    filename: d.filename,
    reportingPeriod: d.reportingPeriod,
    status: d.status,
    sizeBytes: d.sizeBytes,
    uploadedAt: new Date(d.uploadedAt).toISOString(),
    error: d.error,
  }));

  const companyData = {
    id: company.id,
    name: company.name,
    slug: company.slug,
    industry: company.industry,
    description: company.description,
    createdAt: new Date(company.createdAt).toISOString(),
  };

  return (
    <AppShell>
      <CompanyWorkspace
        company={companyData}
        documents={formattedDocs}
        metrics={formattedMetrics}
      />
    </AppShell>
  );
}
