import { describe, it, expect } from 'vitest';
import {
  scanContent,
  maskSecret,
  isPlaceholderPassword,
} from '../scripts/scan-secrets';

describe('Secret Scanner Unit Tests', () => {
  describe('maskSecret()', () => {
    it('masks short strings with stars', () => {
      expect(maskSecret('secret')).toBe('***');
    });

    it('masks medium strings leaving only 2 edge characters', () => {
      const masked = maskSecret('1234567890');
      expect(masked).toBe('12...90');
      expect(masked.length).toBeLessThan('1234567890'.length);
    });

    it('masks long strings leaving only 4 edge characters', () => {
      const sample = ['sk', 'abcdef1234567890ghijkl'].join('-');
      const masked = maskSecret(sample);
      expect(masked).toBe('sk-a...ijkl');
      expect(masked).not.toContain('1234567890');
    });
  });

  describe('isPlaceholderPassword()', () => {
    it('identifies standard placeholder passwords', () => {
      expect(isPlaceholderPassword('password', 'localhost')).toBe(true);
      expect(isPlaceholderPassword('pass', '127.0.0.1')).toBe(true);
      expect(isPlaceholderPassword('***', 'example.com')).toBe(true);
      expect(isPlaceholderPassword('your_secret_password', 'db.neon.tech')).toBe(true);
      expect(isPlaceholderPassword('replace_with_password', 'db.neon.tech')).toBe(true);
    });

    it('rejects real-looking non-placeholder passwords', () => {
      expect(isPlaceholderPassword('n9x!kL2#99z', 'db.neon.tech')).toBe(false);
      expect(isPlaceholderPassword('SuperSecret123', 'localhost')).toBe(false);
    });
  });

  describe('scanContent()', () => {
    it('passes clean source code and documentation with zero findings', () => {
      const cleanCode = `
        import { db } from '@mis/db';
        const apiKey = process.env.GEMINI_API_KEY;
        const password = process.env.AUTH_PASSWORD;
        // In local development, copy .env.example to .env.local
        export function computeHash(input: string) {
          return crypto.createHash('sha256').update(input).digest('hex');
        }
      `;
      const findings = scanContent(cleanCode, 'clean-file.ts', []);
      expect(findings).toHaveLength(0);
    });

    it('flags synthetic sk-... API key in source content', () => {
      // Synthetic key constructed dynamically so test file itself does not contain high-entropy string
      const syntheticKey = ['sk', 'FakeSyntheticKeyForTestingOnly12345678'].join('-');
      const dirtyCode = `const apiKey = "${syntheticKey}";`;
      const findings = scanContent(dirtyCode, 'dirty-file.ts', []);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const skFinding = findings.find((f) => f.rule.includes('sk-'));
      expect(skFinding).toBeDefined();
      expect(skFinding?.line).toBe(1);
      expect(skFinding?.masked).toContain('...');
      expect(skFinding?.masked).not.toBe(syntheticKey);
    });

    it('flags synthetic Google AIza... API key', () => {
      const syntheticKey = ['AIza', 'SyFakeSyntheticKeyForTesting1234567890'].join('');
      const dirtyCode = `const googleKey = "${syntheticKey}";`;
      const findings = scanContent(dirtyCode, 'test-key.ts', []);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const googleFinding = findings.find((f) => f.rule.includes('AIza'));
      expect(googleFinding).toBeDefined();
    });

    it('flags synthetic Neon Postgres npg_... key', () => {
      const syntheticKey = ['npg', 'FakeNeonApiKey12345678'].join('_');
      const dirtyCode = `const neonKey = "${syntheticKey}";`;
      const findings = scanContent(dirtyCode, 'test-neon.ts', []);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const neonFinding = findings.find((f) => f.rule.includes('npg_'));
      expect(neonFinding).toBeDefined();
    });

    it('flags synthetic GitHub personal access token', () => {
      const syntheticToken = ['ghp', 'FakeGithubTokenForTesting1234567890'].join('_');
      const dirtyCode = `const token = "${syntheticToken}";`;
      const findings = scanContent(dirtyCode, 'test-gh.ts', []);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const ghFinding = findings.find((f) => f.rule.includes('GitHub'));
      expect(ghFinding).toBeDefined();
    });

    it('flags raw JSON Web Tokens (JWT)', () => {
      const syntheticJwt = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0',
        'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      ].join('.');
      const dirtyCode = `const authHeader = "Bearer ${syntheticJwt}";`;
      const findings = scanContent(dirtyCode, 'test-jwt.ts', []);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const jwtFinding = findings.find((f) => f.rule.includes('JWT'));
      expect(jwtFinding).toBeDefined();
    });

    it('flags private key PEM blocks', () => {
      const dirtyPem = [
        '-----' + 'BEGIN RSA PRIVATE KEY-----',
        'MIIEowIBAAKCAQEA...',
        '-----' + 'END RSA PRIVATE KEY-----',
      ].join('\n');
      const findings = scanContent(dirtyPem, 'cert.txt', []);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const pemFinding = findings.find((f) => f.rule.includes('Private Key'));
      expect(pemFinding).toBeDefined();
    });

    it('flags database connection strings containing non-placeholder passwords', () => {
      const dirtyConn = ['postgres', 'ql://mis_user:VerySecretRealPass99@db.prod.internal:5432/mis_db'].join('');
      const findings = scanContent(dirtyConn, 'config.ts', []);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const dbFinding = findings.find((f) => f.rule.includes('Database Connection String'));
      expect(dbFinding).toBeDefined();
    });

    it('allows database connection strings using valid placeholders', () => {
      const placeholderConn1 = 'DATABASE_URL=postgresql://user:password@127.0.0.1:5432/mis_dashboard';
      const placeholderConn2 = 'DATABASE_URL=postgresql://user:your_password_here@db.neon.tech/mis_dashboard';
      expect(scanContent(placeholderConn1, 'sample.ts', [])).toHaveLength(0);
      expect(scanContent(placeholderConn2, 'sample.ts', [])).toHaveLength(0);
    });

    it('flags exact match against live secrets passed from environment', () => {
      const syntheticLiveSecret = 'customNonEntropyTeamSecretValue99';
      const dirtyCode = `const secret = "${syntheticLiveSecret}";`;
      const cleanCode = `const other = "unrelated code line";`;

      const findingsDirty = scanContent(dirtyCode, 'app.ts', [syntheticLiveSecret]);
      expect(findingsDirty.length).toBeGreaterThanOrEqual(1);
      expect(findingsDirty[0]?.rule).toContain('Live Environment Secret Value match');

      const findingsClean = scanContent(cleanCode, 'app.ts', [syntheticLiveSecret]);
      expect(findingsClean).toHaveLength(0);
    });
  });
});
