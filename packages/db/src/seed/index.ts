import 'dotenv/config';
import { pool } from '../client.js';
import { seedMetricDefinitions } from './seed-metric-definitions.js';
import { seedCompaniesFromCrm } from '../../scripts/seed-companies-from-crm.js';

export async function runAllSeeds() {
  console.log('=== Step 1: Seeding canonical metric definitions ===');
  await seedMetricDefinitions(false);

  console.log('\n=== Step 2: Seeding companies from CRM database (read-only) ===');
  try {
    await seedCompaniesFromCrm(false);
  } catch (err) {
    console.warn('Warning: Could not seed companies from CRM:', err instanceof Error ? err.message : String(err));
    console.log('Continuing with metric definitions seed.');
  }

  await pool.end();
  console.log('\nAll database seeds completed successfully!');
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.includes('seed')) {
  runAllSeeds().catch((err) => {
    console.error('Fatal: Database seed failed:', err);
    process.exit(1);
  });
}
