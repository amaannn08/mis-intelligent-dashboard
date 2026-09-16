'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TrendChart, type ChartDataPoint } from '@/components/dashboard/trend-chart';
import { MetricTable, type MetricRowData } from '@/components/dashboard/metric-table';
import { QueryPanel } from '@/components/ai/query-panel';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  formatBytes,
  formatIndianCurrency,
  formatPercent,
  formatPeriod,
} from '@/lib/formatters';
import {
  Upload,
  Edit2,
  ArrowRight,
  Clock,
  FileSpreadsheet,
} from 'lucide-react';

interface CompanyData {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  description: string | null;
  createdAt: string;
}

interface DocumentItem {
  id: string;
  filename: string;
  reportingPeriod: string | null;
  status: string;
  sizeBytes: number;
  uploadedAt: string;
  error: string | null;
}

interface CompanyWorkspaceProps {
  company: CompanyData;
  documents: DocumentItem[];
  metrics: MetricRowData[];
}

export function CompanyWorkspace({
  company: initialCompany,
  documents,
  metrics,
}: CompanyWorkspaceProps) {
  const router = useRouter();
  const [company, setCompany] = React.useState(initialCompany);

  // Edit Company State
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editName, setEditName] = React.useState(company.name);
  const [editIndustry, setEditIndustry] = React.useState(company.industry || '');
  const [editDesc, setEditDesc] = React.useState(company.description || '');
  const [isSaving, setIsSaving] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  // Trend Chart State: Metric Selector + Period Range
  const [selectedMetric, setSelectedMetric] = React.useState<string>('revenue');
  const [periodRange, setPeriodRange] = React.useState<'6M' | '12M' | 'ALL'>('ALL');

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError('Company name cannot be empty.');
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          industry: editIndustry.trim() || undefined,
          description: editDesc.trim() || undefined,
        }),
      });

      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.error?.message || 'Failed to update company.');
      }

      setCompany(updated);
      setIsEditOpen(false);

      if (updated.slug !== company.slug) {
        router.push(`/companies/${updated.slug}`);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      setEditError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  // Find unique periods sorted
  const allPeriods = Array.from(new Set(metrics.map((m) => m.reportingPeriod))).sort();
  const latestPeriod = allPeriods[allPeriods.length - 1] || null;
  const previousPeriod = allPeriods.length >= 2 ? allPeriods[allPeriods.length - 2] : null;

  // Filter metrics by range
  let activePeriods = [...allPeriods];
  if (periodRange === '6M') {
    activePeriods = activePeriods.slice(-6);
  } else if (periodRange === '12M') {
    activePeriods = activePeriods.slice(-12);
  }

  // Build standard KPI card data for the 5 metrics
  const standardKpiKeys = [
    { key: 'revenue', label: 'Net Revenue', unit: 'currency', direction: 'up_is_good' as const },
    { key: 'gross_margin', label: 'Gross Margin', unit: 'percent', direction: 'up_is_good' as const },
    { key: 'ebitda', label: 'EBITDA', unit: 'currency', direction: 'up_is_good' as const },
    { key: 'burn', label: 'Net Cash Burn', unit: 'currency', direction: 'down_is_good' as const },
    { key: 'run_rate', label: 'Annual Run Rate', unit: 'currency', direction: 'up_is_good' as const },
  ];

  const kpiCardsData = standardKpiKeys.map((def) => {
    const latestItem = metrics
      .filter((m) => m.metricKey === def.key && m.reportingPeriod === latestPeriod)
      .sort((a, b) => (b.id || '').localeCompare(a.id || ''))[0];

    const prevItem = previousPeriod
      ? metrics
          .filter((m) => m.metricKey === def.key && m.reportingPeriod === previousPeriod)
          .sort((a, b) => (b.id || '').localeCompare(a.id || ''))[0]
      : null;

    let formattedValue: string | null = null;
    let delta: number | null = null;

    if (latestItem && latestItem.value !== null && latestItem.value !== '') {
      const currentNum =
        typeof latestItem.value === 'string'
          ? parseFloat(latestItem.value)
          : latestItem.value;

      if (!isNaN(currentNum)) {
        if (def.unit === 'percent') {
          formattedValue = formatPercent(currentNum);
        } else {
          formattedValue = formatIndianCurrency(currentNum);
        }

        if (prevItem && prevItem.value !== null && prevItem.value !== '') {
          const prevNum =
            typeof prevItem.value === 'string'
              ? parseFloat(prevItem.value)
              : prevItem.value;
          if (!isNaN(prevNum) && prevNum !== 0) {
            delta = ((currentNum - prevNum) / Math.abs(prevNum)) * 100;
          }
        }
      }
    }

    return {
      key: def.key,
      label: def.label,
      value: formattedValue,
      delta,
      period: latestPeriod ? formatPeriod(latestPeriod) : null,
      kind: (latestItem?.valueKind as 'reported' | 'calculated' | 'estimated') || null,
      derivation: latestItem?.valueKind === 'calculated' ? latestItem.sourceReference : null,
      directionality: def.direction,
      tooltip: !formattedValue
        ? `No ${def.label.toLowerCase()} reported in the MIS filings for ${company.name}.`
        : undefined,
    };
  });

  // Chart data for selected metric
  const selectedMetricDef =
    standardKpiKeys.find((k) => k.key === selectedMetric) || standardKpiKeys[0];

  const chartDataPoints: ChartDataPoint[] = [];
  for (const period of activePeriods) {
    const match = metrics.find(
      (m) => m.metricKey === selectedMetric && m.reportingPeriod === period
    );
    if (!match || match.value === null || match.value === '') continue;
    const num = typeof match.value === 'string' ? parseFloat(match.value) : match.value;
    if (isNaN(num)) continue;

    chartDataPoints.push({
      period,
      value: num,
      valueKind: match.valueKind,
      sourceReference: match.sourceReference,
    });
  }

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card shadow-2xs">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {company.name}
            </h1>
            {company.industry && (
              <Badge variant="outline" className="text-xs font-normal">
                {company.industry}
              </Badge>
            )}
            {latestPeriod && (
              <Badge variant="secondary" className="text-xs font-mono">
                Latest: {formatPeriod(latestPeriod)}
              </Badge>
            )}
          </div>
          {company.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 max-w-2xl">
              {company.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            className="gap-1.5 text-xs h-8"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </Button>

          <Button asChild size="sm" className="gap-1.5 text-xs h-8">
            <Link href={`/companies/${company.slug}/documents`}>
              <Upload className="w-3.5 h-3.5" />
              <span>Upload MIS</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* 5 Standard KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {kpiCardsData.map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            period={kpi.period}
            kind={kpi.kind}
            derivation={kpi.derivation}
            directionality={kpi.directionality}
            tooltip={kpi.tooltip}
          />
        ))}
      </div>

      {/* Historical Trend Chart Section */}
      <div className="space-y-3">
        {/* Metric Selector Tabs + Period Range Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Metric Selector Tabs */}
          <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border border-border">
            {standardKpiKeys.map((def) => {
              const isSelected = selectedMetric === def.key;
              return (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => setSelectedMetric(def.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-card text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {def.label}
                </button>
              );
            })}
          </div>

          {/* Period Range Filter */}
          <div className="flex items-center gap-1 self-end sm:self-auto">
            {(['6M', '12M', 'ALL'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setPeriodRange(range)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                  periodRange === range
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* The Recharts Trend Chart */}
        <TrendChart
          title={`${company.name} — ${selectedMetricDef.label} Trend`}
          data={chartDataPoints}
          metricKey={selectedMetric}
          unit={selectedMetricDef.unit}
          height={260}
        />
      </div>

      {/* Complete Financial Metrics Matrix Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Extracted Financial Metrics Matrix
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Click any cell to inspect source coordinates
          </span>
        </div>

        <MetricTable
          metrics={metrics}
          onSelectDocument={() => router.push(`/companies/${company.slug}/documents`)}
        />
      </div>

      {/* Bottom Row: Scoped AI Query Panel + Recent MIS Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Company-Scoped AI Query Panel (7 cols on lg) */}
        <div className="lg:col-span-7">
          <QueryPanel
            companyId={company.id}
            companyName={company.name}
            placeholder={`Ask about ${company.name}'s revenue, margins, cash burn, or filings…`}
          />
        </div>

        {/* Recent Documents Card (5 cols on lg) */}
        <div className="lg:col-span-5 rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Recent MIS Filings</h3>
            </div>
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs px-2">
              <Link href={`/companies/${company.slug}/documents`}>
                <span>Manage</span>
                <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </div>

          {documents.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-8 text-center border border-dashed border-border rounded-lg space-y-2">
              <p>No MIS reports uploaded for {company.name} yet.</p>
              <Button asChild size="sm">
                <Link href={`/companies/${company.slug}/documents`}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  <span>Upload First MIS</span>
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {documents.slice(0, 5).map((doc) => (
                <div
                  key={doc.id}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-xs"
                >
                  <div className="truncate min-w-0">
                    <div className="font-medium text-foreground truncate">{doc.filename}</div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      {doc.reportingPeriod && (
                        <span>{formatPeriod(doc.reportingPeriod)}</span>
                      )}
                      <span>· {formatBytes(doc.sizeBytes)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={doc.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Company Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Company Details"
        description="Update company name, industry sector, or description."
        maxWidth="md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
          {editError && (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
              {editError}
            </div>
          )}

          <Input
            label="Company Name"
            id="edit-company-name"
            required
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={isSaving}
          />

          <Input
            label="Industry / Sector"
            id="edit-company-industry"
            value={editIndustry}
            onChange={(e) => setEditIndustry(e.target.value)}
            disabled={isSaving}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="edit-company-desc"
              className="block text-xs font-medium text-muted-foreground"
            >
              Description
            </label>
            <textarea
              id="edit-company-desc"
              rows={3}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              disabled={isSaving}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
