import { db, pool, metricDefinitions } from '@mis/db';
import { asc } from 'drizzle-orm';
import { AppShell } from '@/components/layout/app-shell';
import { PageShell } from '@/components/layout/page-shell';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  Database,
  Cpu,
  ShieldCheck,
  BookOpen,
  CheckCircle2,
  XCircle,
  Lock,
} from 'lucide-react';

export const revalidate = 60;

export default async function SettingsPage() {
  // 1. Check DB connectivity
  let dbStatus = 'healthy';
  try {
    await pool.query('SELECT 1');
  } catch {
    dbStatus = 'degraded';
  }

  // 2. Fetch canonical metric definitions
  const definitions = await db
    .select()
    .from(metricDefinitions)
    .orderBy(asc(metricDefinitions.key));

  // 3. Environment configuration audit (NAMES ONLY — NEVER VALUES)
  const envConfigAudit = [
    { name: 'DATABASE_URL', present: Boolean(process.env.DATABASE_URL), description: 'PostgreSQL + pgvector connection pool' },
    { name: 'AUTH_USERNAME', present: Boolean(process.env.AUTH_USERNAME), description: 'Team access authentication credential' },
    { name: 'AUTH_PASSWORD', present: Boolean(process.env.AUTH_PASSWORD), description: 'Team access password hash' },
    { name: 'COOKIE_SECRET', present: Boolean(process.env.COOKIE_SECRET), description: 'HMAC signature secret for session cookie' },
    { name: 'GEMINI_API_KEY', present: Boolean(process.env.GEMINI_API_KEY), description: 'Gemini embedding API key' },
    { name: 'GEMINI_EMBEDDING_MODEL', present: Boolean(process.env.GEMINI_EMBEDDING_MODEL), description: 'Embedding model (gemini-embedding-001)' },
    { name: 'EMBEDDING_DIMENSIONS', present: Boolean(process.env.EMBEDDING_DIMENSIONS), description: 'pgvector embedding dimensions (1536)' },
    { name: 'DEEPSEEK_API_KEY', present: Boolean(process.env.DEEPSEEK_API_KEY), description: 'DeepSeek LLM API key for structured extraction & RAG' },
    { name: 'DEEPSEEK_BASE_URL', present: Boolean(process.env.DEEPSEEK_BASE_URL), description: 'DeepSeek API endpoint' },
    { name: 'DEEPSEEK_MODEL', present: Boolean(process.env.DEEPSEEK_MODEL), description: 'DeepSeek model identifier (deepseek-chat)' },
  ];

  const statChips = [
    { label: 'Database Status', value: dbStatus === 'healthy' ? 'Active' : 'Degraded' },
    { label: 'Canonical Metrics', value: definitions.length },
    { label: 'Environment Keys', value: `${envConfigAudit.filter((c) => c.present).length} / ${envConfigAudit.length}` },
  ];

  return (
    <AppShell>
      <PageShell
        title="Diagnostics & Definitions"
        subtitle="System health audit, canonical metric dictionary, and environment configuration"
        statChips={statChips}
        rightSlot={
          <div className="flex items-center gap-2 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-3 py-1 text-xs shadow-xs">
            <span className="text-[#9A958E] font-mono text-[11px]">Theme:</span>
            <ThemeToggle />
          </div>
        }
      >
        {/* Top Cards: System Diagnostics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: DB Status */}
          <div className="p-4 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                Database & pgvector
              </span>
              <Database className="w-4 h-4 text-[#9A958E]" />
            </div>
            <div className="flex items-center gap-2">
              {dbStatus === 'healthy' ? (
                <CheckCircle2 className="w-4 h-4 text-[#3D7A58] shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-[#B42318] shrink-0" />
              )}
              <span className="text-sm font-semibold text-[#1A1815] dark:text-[#FAFAF8] capitalize font-mono">
                {dbStatus === 'healthy' ? 'PostgreSQL Connected' : 'Degraded'}
              </span>
            </div>
            <p className="text-[11px] text-[#9A958E] font-mono">
              HNSW vector index on document_chunks (1536-dim cosine)
            </p>
          </div>

          {/* Card 2: AI Pipeline Models */}
          <div className="p-4 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                Active AI Models
              </span>
              <Cpu className="w-4 h-4 text-[#9A958E]" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5A5650] dark:text-[#9A958E]">Embeddings:</span>
                <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FAFAF8] dark:bg-[#141210] border border-[#E8E5DE] dark:border-[#2E2A24] text-[#1A1815] dark:text-[#FAFAF8]">
                  {process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5A5650] dark:text-[#9A958E]">Generation:</span>
                <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FAFAF8] dark:bg-[#141210] border border-[#E8E5DE] dark:border-[#2E2A24] text-[#1A1815] dark:text-[#FAFAF8]">
                  {process.env.DEEPSEEK_MODEL || 'deepseek-chat'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Storage & Upload Ceilings */}
          <div className="p-4 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                Upload & Storage
              </span>
              <ShieldCheck className="w-4 h-4 text-[#9A958E]" />
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[#5A5650] dark:text-[#9A958E]">Upload Ceiling:</span>
                <span className="font-semibold text-[#1A1815] dark:text-[#FAFAF8]">4.5 MB (Prod) / 15 MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5A5650] dark:text-[#9A958E]">Storage Retention:</span>
                <span className="font-semibold text-[#1A1815] dark:text-[#FAFAF8]">Database BLOB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Canonical Metric Definitions Dictionary */}
        <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E8E5DE] dark:border-[#2E2A24] pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#FF7102]" />
              <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                Canonical Metric Definitions & Aliases
              </h2>
            </div>
            <span className="text-[11px] text-[#9A958E] font-mono">
              {definitions.length} standard metrics
            </span>
          </div>

          <p className="text-xs text-[#5A5650] dark:text-[#9A958E] max-w-2xl leading-relaxed">
            The MIS extraction engine normalizes non-standard spreadsheet row labels using this dictionary.
            Adding new metrics or aliases is done in the dictionary table with zero downtime.
          </p>

          <div className="border border-[#E8E5DE] dark:border-[#2E2A24] rounded-2xl divide-y divide-[#E8E5DE] dark:divide-[#2E2A24] overflow-hidden">
            {definitions.map((def) => (
              <div key={def.key} className="p-3.5 text-xs space-y-2 hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8]">{def.label}</span>
                    <span className="rounded-[4px] bg-[#EEECE7] dark:bg-[#26231F] px-1.5 py-0.5 font-mono text-[9px] text-[#5A5650] dark:text-[#9A958E]">
                      {def.key}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] px-2 py-0.5 text-[10px] font-mono text-[#5A5650] dark:text-[#9A958E] capitalize">
                      Unit: {def.unit}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${
                        def.directionality === 'up_is_good'
                          ? 'bg-[#E8F5EE] text-[#3D7A58]'
                          : 'bg-[#FFEFE2] text-[#FF7102]'
                      }`}
                    >
                      {def.directionality === 'up_is_good' ? 'Growth Desirable (↑)' : 'Low Burn Desirable (↓)'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[#9A958E] text-[10px] uppercase tracking-[0.14em] font-mono block mb-1">
                    Recognized Spreadsheet Row Aliases:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(def.aliases || []).map((alias, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-full bg-[#FAFAF8] dark:bg-[#141210] text-[#5A5650] dark:text-[#9A958E] border border-[#E8E5DE] dark:border-[#2E2A24] text-[10px] font-mono"
                      >
                        &quot;{alias}&quot;
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Environment Configuration Audit (Names Only) */}
        <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-[#E8E5DE] dark:border-[#2E2A24] pb-3">
            <ShieldCheck className="w-4 h-4 text-[#FF7102]" />
            <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
              Environment Configuration Status
            </h2>
          </div>

          <p className="text-xs text-[#5A5650] dark:text-[#9A958E]">
            Auditing presence of required server environment keys. Variable values and secrets are never rendered.
          </p>

          <div className="border border-[#E8E5DE] dark:border-[#2E2A24] rounded-2xl divide-y divide-[#E8E5DE] dark:divide-[#2E2A24] overflow-hidden">
            {envConfigAudit.map((cfg) => (
              <div
                key={cfg.name}
                className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-[#1A1815] dark:text-[#FAFAF8] text-xs">{cfg.name}</div>
                  <div className="text-[10px] text-[#9A958E] font-mono">{cfg.description}</div>
                </div>

                <div className="shrink-0">
                  {cfg.present ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F5EE] px-2.5 py-0.5 text-[10px] font-semibold text-[#3D7A58] font-mono">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Configured</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] px-2.5 py-0.5 text-[10px] font-semibold text-[#B42318] font-mono">
                      <XCircle className="w-3 h-3" />
                      <span>Missing</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Architecture Note */}
        <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] p-4 sm:p-5 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-[#1A1815] dark:text-[#FAFAF8] font-semibold text-xs">
            <Lock className="w-4 h-4 text-[#FF7102]" />
            <span>Architecture Note: Team Access & CRM Parity</span>
          </div>
          <p className="text-xs text-[#5A5650] dark:text-[#9A958E] leading-relaxed">
            The authentication architecture mirrors the WEH CRM&apos;s authentication model for team-internal tooling,
            using constant-time hash comparison and signed session cookies. The design pattern in this dashboard matches
            the sibling CRM layout, token system, and typography.
          </p>
        </div>
      </PageShell>
    </AppShell>
  );
}
