import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function CompaniesLoading() {
  return (
    <AppShell>
      <div className="space-y-6 animate-pulse">
        {/* Header / PageShell skeleton */}
        <div className="space-y-3 pb-2 border-b border-[#E8E5DE] dark:border-[#2E2A24]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-48 rounded-md bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
              <Skeleton className="h-4 w-72 rounded-md bg-[#E8E5DE]/40 dark:bg-[#2E2A24]/60" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-32 rounded-lg bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
            </div>
          </div>
          {/* Stat chips row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Skeleton className="h-6 w-36 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-6 w-40 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-6 w-48 rounded-full bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
          </div>
        </div>

        {/* Filter Bar Skeleton */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs">
          <Skeleton className="h-8 w-full sm:w-80 rounded-md bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-36 rounded-md bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-8 w-36 rounded-md bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
          </div>
        </div>

        {/* Companies Table Skeleton */}
        <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs overflow-hidden">
          <div className="h-10 px-4 border-b border-[#E8E5DE] dark:border-[#2E2A24] flex items-center justify-between bg-[#F5F4F0] dark:bg-[#201D1A]">
            <Skeleton className="h-3 w-28 rounded bg-[#E8E5DE]/70 dark:bg-[#2E2A24]" />
            <Skeleton className="h-3 w-20 rounded bg-[#E8E5DE]/70 dark:bg-[#2E2A24]" />
            <Skeleton className="h-3 w-24 rounded bg-[#E8E5DE]/70 dark:bg-[#2E2A24]" />
            <Skeleton className="h-3 w-24 rounded bg-[#E8E5DE]/70 dark:bg-[#2E2A24]" />
            <Skeleton className="h-3 w-16 rounded bg-[#E8E5DE]/70 dark:bg-[#2E2A24]" />
          </div>
          <div className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24]">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-14 px-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-64">
                  <Skeleton className="h-8 w-8 rounded-lg bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-32 rounded bg-[#E8E5DE]/70 dark:bg-[#2E2A24]" />
                    <Skeleton className="h-2.5 w-20 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                  </div>
                </div>
                <Skeleton className="h-5 w-24 rounded-full bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                <Skeleton className="h-5 w-20 rounded-full bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
                <Skeleton className="h-4 w-28 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
                <Skeleton className="h-6 w-6 rounded bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
              </div>
            ))}
          </div>
        </div>

        {/* Pagination Skeleton */}
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-32 rounded bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-8 w-20 rounded-md bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            <Skeleton className="h-8 w-20 rounded-md bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
