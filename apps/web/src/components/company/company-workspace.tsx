'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TrendChart, type ChartDataPoint } from '@/components/dashboard/trend-chart';
import { MetricTable, type MetricRowData } from '@/components/dashboard/metric-table';
import { QueryPanel } from '@/components/ai/query-panel';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

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
      showDelta: true,
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

  const statChips = [
    { label: 'Industry', value: company.industry || 'Tech' },
    { label: 'Filings', value: documents.length },
    { label: 'Latest Period', value: latestPeriod ? formatPeriod(latestPeriod) : '—' },
  ];

  return (
    <PageShell
      title={company.name}
      subtitle={company.description || undefined}
      statChips={statChips}
      rightSlot={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-3 py-1.5 text-xs font-semibold text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] shadow-xs transition-colors cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </button>

          <Link
            href={`/companies/${company.slug}/documents`}
            prefetch
            className="inline-flex items-center gap-1.5 rounded-full bg-[#FF7102] hover:bg-[#ff8a3a] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(255,113,2,0.25)] transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload MIS</span>
          </Link>
        </div>
      }
    >
      {/* 5 Standard KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiCardsData.map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            showDelta={kpi.showDelta}
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
        {/* Metric Selector Tabs + Period Range Selector in CRM ScopePill style */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Metric Selector Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {standardKpiKeys.map((def) => {
              const isSelected = selectedMetric === def.key;
              return (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => setSelectedMetric(def.key)}
                  className={cn(
                    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer select-none shadow-xs',
                    isSelected
                      ? 'border-[#FFD0AB] bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102] font-semibold'
                      : 'border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F]'
                  )}
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
                className={cn(
                  'px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold transition-colors cursor-pointer border',
                  periodRange === range
                    ? 'bg-[#FF7102] text-white border-[#FF7102] shadow-xs'
                    : 'border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F]'
                )}
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#FF7102]" />
            <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
              Extracted Financial Metrics Matrix
            </h2>
          </div>
          <span className="text-[11px] text-[#9A958E] font-mono">
            Click any cell to inspect source coordinates
          </span>
        </div>

        <MetricTable
          metrics={metrics}
          onSelectDocument={() => router.push(`/companies/${company.slug}/documents`)}
        />
      </div>

      {/* Bottom Row: Scoped AI Query Panel + Recent MIS Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Scoped AI Query Panel */}
        <div className="lg:col-span-6">
          <QueryPanel
            companyId={company.id}
            placeholder={`Ask a question about ${company.name}'s performance or trends…`}
          />
        </div>

        {/* Recent MIS Documents Card */}
        <div className="lg:col-span-6 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-[#E8E5DE] dark:border-[#2E2A24] pb-3 mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#FF7102]" />
                <h3 className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                  Uploaded Filings
                </h3>
              </div>
              <Link
                href={`/companies/${company.slug}/documents`}
                prefetch
                className="text-xs font-semibold text-[#FF7102] hover:underline inline-flex items-center gap-1"
              >
                <span>Manage all ({documents.length})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {documents.length === 0 ? (
              <div className="text-xs text-[#9A958E] font-mono italic py-8 text-center">
                No filings uploaded for this company yet.
              </div>
            ) : (
              <div className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24]">
                {documents.slice(0, 4).map((doc) => (
                  <div
                    key={doc.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileSpreadsheet className="w-4 h-4 text-[#9A958E] shrink-0" />
                      <div className="truncate">
                        <div className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8] truncate">
                          {doc.filename}
                        </div>
                        <div className="text-[11px] text-[#9A958E] font-mono">
                          {doc.reportingPeriod ? formatPeriod(doc.reportingPeriod) : 'Unspecified period'} · {formatBytes(doc.sizeBytes)}
                        </div>
                      </div>
                    </div>
                    <StatusPill status={doc.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[#E8E5DE] dark:border-[#2E2A24] flex items-center justify-end">
            <Link
              href={`/companies/${company.slug}/documents`}
              prefetch
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FF7102] hover:bg-[#ff8a3a] text-white shadow-xs transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload New Filing</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Edit Company Modal Dialog */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Portfolio Company"
        description="Update company profile and sectoral tags."
        maxWidth="md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
          {editError && (
            <div className="p-3 rounded-xl border border-[#FECDCA] dark:border-[#B42318]/40 bg-[#FEF3F2] dark:bg-[#341618] text-[#B42318] dark:text-[#F87171] text-xs">
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
            placeholder="e.g. HealthTech, D2C, FinTech"
            disabled={isSaving}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="edit-company-desc"
              className="block text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono"
            >
              Description (Optional)
            </label>
            <textarea
              id="edit-company-desc"
              rows={3}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Brief overview of business model and core offerings…"
              disabled={isSaving}
              className="w-full rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] px-3 py-2 text-xs text-[#1A1815] dark:text-[#FAFAF8] placeholder:text-[#9A958E] focus:outline-none focus:border-[#FF7102]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E5DE] dark:border-[#2E2A24]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(false)}
              disabled={isSaving}
              className="text-xs rounded-xl"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-xl bg-[#FF7102] hover:bg-[#ff8a3a] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
