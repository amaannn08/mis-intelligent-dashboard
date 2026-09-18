import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

export interface SecretFinding {
  file: string;
  line: number;
  rule: string;
  masked: string;
}

export interface ScannerOptions {
  files?: string[];
  stagedOnly?: boolean;
  repoRoot?: string;
  additionalSecrets?: string[];
}

// Binary extensions to always skip
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.xlsx',
  '.xls',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.tar',
  '.gz',
  '.bin',
  '.lockb',
]);

// Obvious placeholder words for connection string passwords
const PLACEHOLDER_PASSWORDS = new Set([
  'password',
  'pass',
  '***',
  'secret',
  'dummy',
  'placeholder',
  'changeme',
  'none',
  '',
]);

// Known harmless test fixtures or template values to ignore during live env matching
const KNOWN_PLACEHOLDER_VALUES = new Set([
  'your_gemini_api_key_here',
  'your_deepseek_api_key_here',
  'your_secure_team_password_here',
  'replace_with_a_secure_random_32_plus_character_string',
  'CorrectHorseBatteryStaple123!',
  'test-secret-at-least-32-chars-long-12345',
  'gemini-embedding-001',
  'deepseek-chat',
  'https://api.deepseek.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function maskSecret(value: string): string {
  if (!value) return '***';
  if (value.length <= 6) return '***';
  if (value.length <= 12) {
    return value.slice(0, 2) + '...' + value.slice(-2);
  }
  return value.slice(0, 4) + '...' + value.slice(-4);
}

export function isPlaceholderPassword(password: string, host: string): boolean {
  const lowerPass = password.toLowerCase().trim();
  if (PLACEHOLDER_PASSWORDS.has(lowerPass)) return true;
  if (
    lowerPass.startsWith('your_') ||
    lowerPass.startsWith('replace_') ||
    lowerPass.startsWith('test_') ||
    lowerPass.startsWith('<')
  ) {
    return true;
  }

  // Dev localhost convenience: check if localhost/127.0.0.1 with standard placeholder
  const isDevHost =
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('example.com');
  if (isDevHost && (lowerPass === 'password' || lowerPass === 'pass')) {
    return true;
  }

  return false;
}

/**
 * Extracts live secrets from process.env and any local gitignored .env files.
 */
export function collectLiveSecrets(repoRoot = process.cwd()): string[] {
  const secretValues = new Set<string>();

  const targetEnvFiles = [
    '.env',
    '.env.local',
    'apps/web/.env.local',
    'packages/db/.env',
  ];

  const envMap: Record<string, string> = { ...(process.env as Record<string, string>) };

  for (const relPath of targetEnvFiles) {
    const fullPath = path.resolve(repoRoot, relPath);
    if (fs.existsSync(fullPath)) {
      try {
        const parsed = dotenv.parse(fs.readFileSync(fullPath, 'utf8'));
        Object.assign(envMap, parsed);
      } catch {
        // ignore read/parse errors
      }
    }
  }

  const SENSITIVE_KEY_PATTERNS = [
    /SECRET/i,
    /PASSWORD/i,
    /KEY/i,
    /TOKEN/i,
    /PRIVATE/i,
    /DATABASE_URL/i,
  ];

  for (const [k, v] of Object.entries(envMap)) {
    if (!v || typeof v !== 'string') continue;
    const trimmed = v.trim();

    // Must match a sensitive key pattern
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(k));
    if (!isSensitiveKey) continue;

    // Minimum length check to avoid matching short trivial values
    if (trimmed.length < 8) continue;

    // Ignore known template placeholders
    if (KNOWN_PLACEHOLDER_VALUES.has(trimmed)) continue;
    if (trimmed.startsWith('your_') || trimmed.startsWith('replace_with_')) continue;

    secretValues.add(trimmed);

    // If it's a database connection string, also register the password part
    const dbMatch = trimmed.match(/postgres(?:ql)?:\/\/[^:]+:([^@]+)@/);
    if (dbMatch && dbMatch[1]) {
      const dbPass = dbMatch[1].trim();
      if (dbPass.length >= 8 && !isPlaceholderPassword(dbPass, '')) {
        secretValues.add(dbPass);
      }
    }
  }

  return Array.from(secretValues);
}

/**
 * Scans a single string content for credential shapes and live secret leaks.
 */
export function scanContent(
  content: string,
  filePath = '<buffer>',
  liveSecrets: string[] = []
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split(/\r?\n/);

  // High-entropy regex patterns
  const patterns: Array<{ rule: string; regex: RegExp }> = [
    { rule: 'OpenAI / Generic API Key (sk-...)', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
    { rule: 'Anthropic / Provider Token (AQ...)', regex: /\bAQ\.[A-Za-z0-9_-]{20,}\b/g },
    { rule: 'Google API Key (AIza...)', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
    { rule: 'Neon Postgres Key (npg_...)', regex: /\bnpg_[A-Za-z0-9]{10,}\b/g },
    { rule: 'GitHub Personal Token (gho/ghp/github_pat)', regex: /\b(?:gho|ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g },
    { rule: 'Raw JSON Web Token (JWT)', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?\b/g },
    { rule: 'Private Key / Certificate Block', regex: /-----BEGIN (?:[A-Z0-9_-]+ )?(?:PRIVATE KEY|CERTIFICATE|SECRET KEY)-----/g },
  ];

  // Connection string regex: postgresql://user:pass@host...
  const dbRegex = /\bpostgres(?:ql)?:\/\/([^\s:@]+):([^\s:@]+)@([^\s:\/?#]+)/g;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // 1. High entropy rules
    for (const { rule, regex } of patterns) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        findings.push({
          file: filePath,
          line: lineNum,
          rule,
          masked: maskSecret(match[0]),
        });
      }
    }

    // 2. Database connection string rule
    dbRegex.lastIndex = 0;
    let connMatch: RegExpExecArray | null;
    while ((connMatch = dbRegex.exec(line)) !== null) {
      const pass = connMatch[2];
      const host = connMatch[3];
      if (!isPlaceholderPassword(pass, host)) {
        findings.push({
          file: filePath,
          line: lineNum,
          rule: 'Database Connection String with non-placeholder password',
          masked: maskSecret(connMatch[0]),
        });
      }
    }

    // 3. Comparison against live secrets in environment / .env.local
    for (const secret of liveSecrets) {
      if (!secret || secret.length < 8) continue;
      if (line.includes(secret)) {
        findings.push({
          file: filePath,
          line: lineNum,
          rule: 'Live Environment Secret Value match',
          masked: maskSecret(secret),
        });
      }
    }
  });

  return findings;
}

/**
 * Main scanner execution across tracked files or staged files.
 */
export function runSecretScan(options: ScannerOptions = {}): {
  success: boolean;
  scannedFiles: number;
  findings: SecretFinding[];
} {
  const repoRoot = options.repoRoot || process.cwd();
  let fileList: string[] = [];

  if (options.files && options.files.length > 0) {
    fileList = options.files;
  } else if (options.stagedOnly) {
    try {
      const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      fileList = output
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    } catch {
      fileList = [];
    }
  } else {
    try {
      const output = execSync('git ls-files', {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      fileList = output
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    } catch {
      fileList = [];
    }
  }

  // Pre-filter files: check for blocked secret file names if staged
  const findings: SecretFinding[] = [];
  const validFilesToScan: string[] = [];

  const BLOCKED_FILE_NAME_PATTERN = /(^|\/)\.env($|\.)|\.(pem|key|p12|pfx)$|credentials\.json$|google-token\.json$/;

  for (const relPath of fileList) {
    // If staged, also enforce blocked filenames directly
    if (options.stagedOnly && relPath !== '.env.example' && !relPath.endsWith('/.env.example')) {
      if (BLOCKED_FILE_NAME_PATTERN.test(relPath)) {
        findings.push({
          file: relPath,
          line: 1,
          rule: 'Blocked secret file committed to git',
          masked: relPath,
        });
        continue;
      }
    }

    const ext = path.extname(relPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      continue;
    }

    validFilesToScan.push(relPath);
  }

  // Collect live secrets
  const liveSecrets = [
    ...collectLiveSecrets(repoRoot),
    ...(options.additionalSecrets || []),
  ];

  for (const relPath of validFilesToScan) {
    const fullPath = path.resolve(repoRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;

    // Check if file is a directory or binary
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    try {
      const buffer = fs.readFileSync(fullPath);
      // Fast check for binary null bytes in first 8000 bytes
      const isBinary = buffer.slice(0, 8000).includes(0);
      if (isBinary) continue;

      const content = buffer.toString('utf8');
      const fileFindings = scanContent(content, relPath, liveSecrets);
      findings.push(...fileFindings);
    } catch {
      // Ignore unreadable files
    }
  }

  return {
    success: findings.length === 0,
    scannedFiles: validFilesToScan.length,
    findings,
  };
}

// CLI entry point
if (process.argv[1]?.endsWith('scan-secrets.ts')) {
  const isStaged = process.argv.includes('--staged');
  console.log(`[SECRETS] Running secret scanner (${isStaged ? 'staged files' : 'git tracked files'})...`);

  const result = runSecretScan({ stagedOnly: isStaged });

  if (!result.success) {
    console.error(`\n❌ [SECRETS] ${result.findings.length} secret leak(s) detected:`);
    for (const f of result.findings) {
      console.error(`   - ${f.file}:${f.line} [${f.rule}] (match: ${f.masked})`);
    }
    console.error('\nAction required: Remove the secrets from source control before proceeding.');
    console.error('Use environment variables (process.env) or gitignored .env.local instead.\n');
    process.exit(1);
  } else {
    console.log(`✓ [SECRETS] Scanned ${result.scannedFiles} tracked files. Zero secrets or credential leaks found.\n`);
    process.exit(0);
  }
}
