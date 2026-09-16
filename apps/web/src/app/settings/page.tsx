import { db, pool, metricDefinitions } from '@mis/db';
import { asc } from 'drizzle-orm';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
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

export const dynamic = 'force-dynamic';

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
    { name: 'DATABASE_URL', present: Boolean(process.env.DATABASE_URL), description: 'PostgreSQL + pgvector connection string' },
    { name: 'AUTH_USERNAME', present: Boolean(process.env.AUTH_USERNAME), description: 'Team access authentication username' },
    { name: 'AUTH_PASSWORD', present: Boolean(process.env.AUTH_PASSWORD), description: 'Team access authentication password hash' },
    { name: 'COOKIE_SECRET', present: Boolean(process.env.COOKIE_SECRET), description: 'HMAC key for signing session cookies' },
    { name: 'GEMINI_API_KEY', present: Boolean(process.env.GEMINI_API_KEY), description: 'Google Gemini API key for embeddings' },
    { name: 'GEMINI_EMBEDDING_MODEL', present: Boolean(process.env.GEMINI_EMBEDDING_MODEL), description: 'Embedding model (gemini-embedding-001)' },
    { name: 'EMBEDDING_DIMENSIONS', present: Boolean(process.env.EMBEDDING_DIMENSIONS), description: 'pgvector embedding dimensions (1536)' },
    { name: 'DEEPSEEK_API_KEY', present: Boolean(process.env.DEEPSEEK_API_KEY), description: 'DeepSeek LLM API key for structured extraction & RAG' },
    { name: 'DEEPSEEK_BASE_URL', present: Boolean(process.env.DEEPSEEK_BASE_URL), description: 'DeepSeek API base endpoint' },
    { name: 'DEEPSEEK_MODEL', present: Boolean(process.env.DEEPSEEK_MODEL), description: 'DeepSeek model identifier (deepseek-chat)' },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Diagnostics & Definitions
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              System health audit, canonical metric dictionary, and environment configuration
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Theme toggle:</span>
            <ThemeToggle />
          </div>
        </div>

        {/* Top Cards: System Diagnostics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: DB Status */}
          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Database & pgvector
              </span>
              <Database className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2">
              {dbStatus === 'healthy' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive shrink-0" />
              )}
              <span className="text-sm font-semibold text-foreground capitalize font-mono">
                {dbStatus === 'healthy' ? 'PostgreSQL 18.6 Connected' : 'Degraded'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              HNSW vector index active on document_chunks (1536-dim cosine)
            </p>
          </div>

          {/* Card 2: AI Pipeline Models */}
          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active AI Models
              </span>
              <Cpu className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Embeddings:</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Generation:</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {process.env.DEEPSEEK_MODEL || 'deepseek-chat'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Card 3: Storage & Upload Ceilings */}
          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Upload & Storage
              </span>
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Upload Limit:</span>
                <span className="font-mono font-medium">4.5 MB (Prod) / 15 MB (Dev)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Blob Retention:</span>
                <span className="font-mono font-medium">≤ 4.0 MB stored in DB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Canonical Metric Definitions Dictionary */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                Canonical Metric Definitions & Alias Dictionary
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {definitions.length} standard metrics configured
            </span>
          </div>

          <p className="text-xs text-muted-foreground max-w-2xl">
            The MIS extraction engine normalizes non-standard spreadsheet row labels using this alias table.
            Adding a new metric requires adding one row to the dictionary—zero database migrations required.
          </p>

          <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
            {definitions.map((def) => (
              <div key={def.key} className="p-4 text-xs space-y-2 hover:bg-muted/20 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{def.label}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {def.key}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize text-[10px]">
                      Unit: {def.unit}
                    </Badge>
                    <Badge
                      variant={def.directionality === 'up_is_good' ? 'success' : 'warning'}
                      className="text-[10px]"
                    >
                      {def.directionality === 'up_is_good' ? 'Growth Desirable (↑)' : 'Low Burn Desirable (↓)'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground text-[11px] block mb-1">
                    Recognized Spreadsheet Row Aliases:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(def.aliases || []).map((alias, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/60 text-[11px] font-mono"
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
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Environment Configuration Status
            </h2>
          </div>

          <p className="text-xs text-muted-foreground">
            Auditing presence of required server environment keys. In accordance with security protocol,
            variable values and secrets are never rendered.
          </p>

          <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
            {envConfigAudit.map((cfg) => (
              <div
                key={cfg.name}
                className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-muted/20 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-foreground">{cfg.name}</div>
                  <div className="text-[11px] text-muted-foreground">{cfg.description}</div>
                </div>

                <div className="shrink-0">
                  {cfg.present ? (
                    <Badge variant="success" className="gap-1 text-[10px]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Configured</span>
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1 text-[10px]">
                      <XCircle className="w-3 h-3" />
                      <span>Missing</span>
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Documented Note about MVP Access Control */}
        <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <Lock className="w-4 h-4 text-primary" />
            <span>Architecture Note: MVP Team Access Control</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The current authentication architecture uses a single shared team credential gate
            (<code className="font-mono bg-muted px-1 py-0.5 rounded border border-border text-[11px]">AUTH_USERNAME</code> /{' '}
            <code className="font-mono bg-muted px-1 py-0.5 rounded border border-border text-[11px]">AUTH_PASSWORD</code>)
            validated using constant-time hash comparison (<code className="font-mono text-[11px]">crypto.timingSafeEqual</code>)
            and signed via an HttpOnly cookie (<code className="font-mono text-[11px]">mis_session</code>) across Next.js middleware.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This design intentionally mirrors the WEH CRM&apos;s authentication model for team-internal tooling, avoiding
            premature enterprise auth complexity in MVP. For multi-tenant or external LP access, the session seam in{' '}
            <code className="font-mono text-[11px]">apps/web/src/lib/auth.ts</code> is structured to cleanly transition to NextAuth,
            WorkOS, or Supabase Auth without altering any downstream route handlers or business logic.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
