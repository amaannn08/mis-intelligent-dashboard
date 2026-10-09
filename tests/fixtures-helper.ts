import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve an audited portfolio workbook fixture from uploads/ or the audited originals directory.
 * Explicitly asserts fixture presence so tests never silently pass when fixtures are missing.
 */
export function getAuditedFixture(filenameSubstring: string): string {
  const candidateDirs = [
    path.resolve(process.cwd(), 'uploads'),
    '/home/amann/.hermes/profiles/aman/workspaces/mis-completeness/originals',
    '/tmp/mis_samples',
  ];

  const sub = filenameSubstring.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const normalizedEntry = entry.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedEntry.includes(sub)) {
        return path.join(dir, entry);
      }
    }
  }

  throw new Error(
    `Audited fixture matching "${filenameSubstring}" was not found in: ${candidateDirs.join(', ')}`
  );
}
