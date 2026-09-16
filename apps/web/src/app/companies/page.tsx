'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatIndianCurrency, formatPeriod } from '@/lib/formatters';
import {
  Plus,
  Search,
  ArrowRight,
} from 'lucide-react';

interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  description: string | null;
  documentCount: number;
  latestPeriod: string | null;
  latestRevenue: number | null;
  latestEbitda: number | null;
  lastUpdated: string;
}

export default function CompaniesDirectoryPage() {
  const router = useRouter();

  const [companies, setCompanies] = React.useState<CompanySummary[]>([]);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = React.useState('');
  const [industry, setIndustry] = React.useState('');
  const [sort, setSort] = React.useState<'name' | 'revenue' | 'period' | 'updated'>('updated');
  const [page, setPage] = React.useState(1);
  const limit = 15;

  // Add Company Modal State
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newIndustry, setNewIndustry] = React.useState('');
  const [newDescription, setNewDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Industry options collected dynamically
  const [availableIndustries, setAvailableIndustries] = React.useState<string[]>([]);

  const fetchCompanies = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (industry.trim()) params.set('industry', industry.trim());
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('limit', String(limit));

    try {
      const res = await fetch(`/api/companies?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load companies (${res.status})`);
      }
      const data = await res.json();
      setCompanies(data.companies || []);
      setTotal(data.total || 0);

      // Extract unique industries for filter dropdown
      if (data.companies && availableIndustries.length === 0) {
        const unique = Array.from(
          new Set(
            data.companies
              .map((c: CompanySummary) => c.industry)
              .filter((ind: string | null): ind is string => Boolean(ind))
          )
        ).sort();
        setAvailableIndustries(unique as string[]);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [search, industry, sort, page, availableIndustries.length]);

  React.useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setFormError('Company name is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          industry: newIndustry.trim() || undefined,
          description: newDescription.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create company.');
      }

      setIsAddOpen(false);
      setNewName('');
      setNewIndustry('');
      setNewDescription('');

      // Navigate directly to the new company workspace
      if (data.slug) {
        router.push(`/companies/${data.slug}`);
      } else {
        fetchCompanies();
      }
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<CompanySummary>[] = [
    {
      key: 'name',
      header: 'Company Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center font-bold text-xs shrink-0 uppercase text-muted-foreground">
            {row.name.slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold text-foreground hover:text-primary transition-colors">
              {row.name}
            </div>
            {row.description && (
              <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                {row.description}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'industry',
      header: 'Industry',
      render: (row) =>
        row.industry ? (
          <Badge variant="outline" className="text-[11px] font-normal">
            {row.industry}
          </Badge>
        ) : (
          <span className="text-muted-foreground/60 text-xs">—</span>
        ),
    },
    {
      key: 'latestPeriod',
      header: 'Latest Period',
      sortable: true,
      render: (row) =>
        row.latestPeriod ? (
          <span className="font-mono text-xs text-foreground">
            {formatPeriod(row.latestPeriod)}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-xs italic">No filings</span>
        ),
    },
    {
      key: 'latestRevenue',
      header: 'Latest Revenue',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-medium">
          {row.latestRevenue !== null
            ? formatIndianCurrency(row.latestRevenue)
            : 'Not available'}
        </span>
      ),
    },
    {
      key: 'latestEbitda',
      header: 'Latest EBITDA',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-medium">
          {row.latestEbitda !== null
            ? formatIndianCurrency(row.latestEbitda)
            : 'Not available'}
        </span>
      ),
    },
    {
      key: 'documentCount',
      header: 'Documents',
      align: 'center',
      render: (row) => (
        <span className="font-mono text-xs">
          {row.documentCount} {row.documentCount === 1 ? 'doc' : 'docs'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Link
          href={`/companies/${row.slug}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium p-1 rounded transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <span>Workspace</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ),
    },
  ];

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header with Title + "Add Company" button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Portfolio Companies
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Directory of all portfolio investments, reporting timelines, and extracted MIS metrics
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="gap-1.5 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Company</span>
          </Button>
        </div>

        {/* Filter Bar: Search + Industry Select + Sort Select */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card shadow-2xs">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by company name or description…"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-muted/40 rounded-lg border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card"
            />
          </div>

          {/* Industry Filter Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={industry}
              onChange={(e) => {
                setIndustry(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by industry"
              className="text-xs h-8 px-2.5 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              <option value="">All Industries</option>
              {availableIndustries.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>

            {/* Sort Dropdown */}
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as 'name' | 'revenue' | 'period' | 'updated');
                setPage(1);
              }}
              aria-label="Sort companies by"
              className="text-xs h-8 px-2.5 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              <option value="updated">Recently Updated</option>
              <option value="name">Company Name</option>
              <option value="revenue">Latest Revenue</option>
              <option value="period">Latest Period</option>
            </select>
          </div>
        </div>

        {/* Companies Table / Mobile Cards */}
        <DataTable
          columns={columns}
          data={companies}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
          error={error}
          onRowClick={(row) => router.push(`/companies/${row.slug}`)}
          emptyTitle="No companies match your query"
          emptyDescription="Try adjusting your search query or industry filter, or add a new portfolio company."
          emptyActionLabel="Clear filters"
          onEmptyAction={() => {
            setSearch('');
            setIndustry('');
            setSort('updated');
            setPage(1);
          }}
          pagination={{
            page,
            totalPages,
            totalCount: total,
            onPageChange: (p) => setPage(p),
          }}
          renderMobileCard={(row) => (
            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm text-foreground">{row.name}</div>
                  {row.industry && (
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {row.industry}
                    </Badge>
                  )}
                </div>
                <Button asChild size="sm" variant="outline" className="h-7 text-xs px-2">
                  <Link href={`/companies/${row.slug}`}>
                    <span>Workspace</span>
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Latest Revenue</span>
                  <span className="font-mono font-medium text-foreground">
                    {row.latestRevenue !== null
                      ? formatIndianCurrency(row.latestRevenue)
                      : 'Not available'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Reporting Period</span>
                  <span className="font-mono text-foreground">
                    {row.latestPeriod ? formatPeriod(row.latestPeriod) : 'None'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">EBITDA</span>
                  <span className="font-mono text-foreground">
                    {row.latestEbitda !== null
                      ? formatIndianCurrency(row.latestEbitda)
                      : 'Not available'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Filings</span>
                  <span className="font-mono text-foreground">
                    {row.documentCount} {row.documentCount === 1 ? 'doc' : 'docs'}
                  </span>
                </div>
              </div>
            </div>
          )}
        />
      </div>

      {/* Add Company Modal Dialog */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Portfolio Company"
        description="Register a new company into the MIS Intelligence Dashboard."
        maxWidth="md"
      >
        <form onSubmit={handleAddCompany} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
              {formError}
            </div>
          )}

          <Input
            label="Company Name"
            id="new-company-name"
            required
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Acme Health"
            disabled={isSubmitting}
          />

          <Input
            label="Industry / Sector"
            id="new-company-industry"
            value={newIndustry}
            onChange={(e) => setNewIndustry(e.target.value)}
            placeholder="e.g. HealthTech, D2C, FinTech"
            disabled={isSubmitting}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="new-company-desc"
              className="block text-xs font-medium text-muted-foreground"
            >
              Description (Optional)
            </label>
            <textarea
              id="new-company-desc"
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Brief summary of core product and model…"
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Company'}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
