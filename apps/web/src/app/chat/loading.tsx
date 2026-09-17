import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function ChatLoading() {
  return (
    <AppShell noPadding>
      <div className="flex h-full w-full overflow-hidden animate-pulse">
        {/* Chat sidebar skeleton */}
        <div className="hidden md:flex w-64 border-r border-[#E8E5DE] dark:border-[#2E2A24] bg-[#F5F4F0] dark:bg-[#181614] flex-col p-3 gap-3">
          <Skeleton className="h-9 w-full rounded-xl bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3 w-20 rounded bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg bg-[#E8E5DE]/50 dark:bg-[#2E2A24]" />
            ))}
          </div>
        </div>

        {/* Chat main workspace skeleton */}
        <div className="flex-1 flex flex-col h-full bg-[#FAFAF8] dark:bg-[#141210]">
          {/* Top scope bar */}
          <div className="h-12 border-b border-[#E8E5DE] dark:border-[#2E2A24] px-4 flex items-center justify-between bg-white/60 dark:bg-[#1C1A17]/60">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-24 rounded-full bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
              <Skeleton className="h-6 w-32 rounded-full bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
            </div>
            <Skeleton className="h-6 w-20 rounded-md bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
          </div>

          {/* Messages thread skeleton */}
          <div className="flex-1 p-6 space-y-6 overflow-hidden max-w-4xl w-full mx-auto">
            {/* Assistant message */}
            <div className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-[#E8E5DE]/70 dark:bg-[#2E2A24] shrink-0" />
              <div className="space-y-2 w-full max-w-md">
                <Skeleton className="h-4 w-40 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
                <Skeleton className="h-16 w-full rounded-xl bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
              </div>
            </div>

            {/* User message */}
            <div className="flex justify-end">
              <Skeleton className="h-12 w-64 rounded-2xl bg-[#FFEFE2] dark:bg-[#3D2514]" />
            </div>

            {/* Assistant answer */}
            <div className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-[#E8E5DE]/70 dark:bg-[#2E2A24] shrink-0" />
              <div className="space-y-2 w-full max-w-lg">
                <Skeleton className="h-4 w-32 rounded bg-[#E8E5DE]/60 dark:bg-[#2E2A24]" />
                <Skeleton className="h-28 w-full rounded-xl bg-[#E8E5DE]/40 dark:bg-[#2E2A24]" />
              </div>
            </div>
          </div>

          {/* Composer skeleton */}
          <div className="p-4 border-t border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17]">
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              <Skeleton className="h-12 flex-1 rounded-2xl bg-[#F5F4F0] dark:bg-[#201D1A]" />
              <Skeleton className="h-10 w-10 rounded-xl bg-[#FF7102]/30 shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
