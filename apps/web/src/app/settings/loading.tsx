import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <AppShell>
      <div className="space-y-6 animate-pulse">
        {/* Header / PageShell skeleton */}
        <div className="space-y-3 pb-2 border-b border-[#E8E5DE] dark:border-[#2E2A24]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-56 rounded-md bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
              <Skeleton className="h-4 w-80 rounded-md bg-[#E8E5DE]/40 dark:bg-[#2E2A24]/60" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            </div>
          </div>
          {/* Stat chips row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Skeleton className="h-6 w-36 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-6 w-40 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-6 w-36 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
          </div>
        </div>

        {/* Section 1: System Health Skeleton */}
        <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 shadow-xs space-y-4">
          <Skeleton className="h-4 w-40 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#F5F4F0] dark:bg-[#201D1A] space-y-2">
                <Skeleton className="h-3 w-20 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
                <Skeleton className="h-6 w-24 rounded bg-[#E8E5DE]/80 dark:bg-[#2E2A24]" />
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Canonical Metric Definitions Skeleton */}
        <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#E8E5DE] dark:border-[#2E2A24] flex items-center justify-between">
            <Skeleton className="h-4 w-48 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
            <Skeleton className="h-4 w-24 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
          </div>
          <div className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24]">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 px-4 flex items-center justify-between">
                <Skeleton className="h-3.5 w-36 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
                <Skeleton className="h-3.5 w-24 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                <Skeleton className="h-3.5 w-48 rounded bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
