import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function OverviewLoading() {
  return (
    <AppShell>
      <div className="space-y-6 animate-pulse">
        {/* Header / PageShell skeleton */}
        <div className="space-y-3 pb-2 border-b border-[#E8E5DE] dark:border-[#2E2A24]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-36 rounded-md bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
              <Skeleton className="h-4 w-64 rounded-md bg-[#E8E5DE]/40 dark:bg-[#2E2A24]/60" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-28 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            </div>
          </div>
          {/* Stat chips row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Skeleton className="h-6 w-32 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-6 w-36 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-6 w-40 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-6 w-44 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
          </div>
        </div>

        {/* 5 KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex flex-col justify-between rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-4 py-3 shadow-xs space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
                  <Skeleton className="h-3 w-10 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                </div>
                <Skeleton className="h-7 w-28 rounded bg-[#E8E5DE]/80 dark:bg-[#2E2A24]" />
              </div>
              {i === 5 && (
                <div className="flex items-center justify-between pt-1 border-t border-[#E8E5DE] dark:border-[#2E2A24]">
                  <Skeleton className="h-3 w-12 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                  <Skeleton className="h-3 w-12 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Middle Section: Chart + Query Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-48 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
              <Skeleton className="h-4 w-20 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
            </div>
            <Skeleton className="h-64 w-full rounded-xl bg-[#E8E5DE]/30 dark:bg-[#2E2A24]/40" />
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 shadow-xs space-y-4">
            <Skeleton className="h-4 w-32 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
            <Skeleton className="h-20 w-full rounded-xl bg-[#E8E5DE]/30 dark:bg-[#2E2A24]/40" />
            <div className="space-y-2 pt-2">
              <Skeleton className="h-8 w-full rounded-lg bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
              <Skeleton className="h-8 w-full rounded-lg bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
            </div>
          </div>
        </div>

        {/* Recent Filings Section */}
        <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#E8E5DE] dark:border-[#2E2A24] pb-3">
            <Skeleton className="h-3.5 w-32 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
            <Skeleton className="h-3.5 w-24 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
          </div>
          <div className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24]">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="py-3 px-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-36 rounded bg-[#E8E5DE]/70 dark:bg-[#2E2A24]" />
                    <Skeleton className="h-3 w-24 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-5 w-20 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
                  <Skeleton className="h-3.5 w-16 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
