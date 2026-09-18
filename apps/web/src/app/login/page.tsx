/* eslint-disable @next/next/no-img-element */
import { Suspense } from 'react';
import { db, companies } from '@mis/db';
import { sql } from 'drizzle-orm';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

async function getCompanyCount(): Promise<number | null> {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(sql`archived_at IS NULL`);
    if (typeof result?.count === 'number' && Number.isFinite(result.count)) {
      return result.count;
    }
  } catch (err) {
    console.error('Failed to query company count for login page:', err);
  }
  return null;
}

export default async function LoginPage() {
  const companyCount = await getCompanyCount();

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#141210] text-[#1A1815] dark:text-[#FAFAF8] px-4 py-8 flex items-center justify-center relative selection:bg-[#FF7102]/10">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10 md:gap-12">
        {/* Left block */}
        <div className="space-y-4 text-left w-full max-w-md md:max-w-lg">
          <div>
            <img
              src="/images/logo-black.svg"
              alt="WEH Ventures"
              className="w-32 h-auto mb-3 dark:hidden"
            />
            <img
              src="/images/logo-white.svg"
              alt="WEH Ventures"
              className="w-32 h-auto mb-3 hidden dark:block"
            />
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#FF7102]">
              MIS INTELLIGENCE
            </div>
          </div>

          <h1 className="font-serif text-[34px] sm:text-[40px] leading-[1.2] text-[#1A1815] dark:text-[#FAFAF8]">
            Sign in to Access
            <br />
            <span className="text-[#FF7102]">MIS INTELLIGENCE</span>
          </h1>

          <div className="h-px w-24 bg-[#D4CFC4] dark:bg-[#2E2A24]" />

          <p className="max-w-md text-[13px] leading-relaxed text-[#5A5650] dark:text-[#9A958E]">
            Secure access to the WEH Ventures portfolio MIS intelligence dashboard — every filed MIS, indexed and answerable.
          </p>

          {companyCount !== null && (
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#9A958E] dark:text-[#C8C3BB]">
              {companyCount} PORTFOLIO COMPANIES TRACKED
            </div>
          )}
        </div>

        {/* Right block - Login Card */}
        <div className="w-full max-w-sm shrink-0">
          <Suspense
            fallback={
              <div className="h-64 flex items-center justify-center text-xs text-[#9A958E] font-mono rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17]">
                Loading…
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
