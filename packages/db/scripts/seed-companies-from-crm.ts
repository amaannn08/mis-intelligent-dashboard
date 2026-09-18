import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { db, pool } from '../src/client';
import { companies } from '../src/schema/companies';

interface CrmCompanyRow {
  name: string;
  slug: string;
  sector: string | null;
  stage: string | null;
  fund: string | null;
  status: string | null;
}

export async function seedCompaniesFromCrm(closePool = false) {
  let crmConnectionString = process.env.CRM_DATABASE_URL;

  if (!crmConnectionString && process.env.CRM_ENV_PATH) {
    const crmEnvPath = process.env.CRM_ENV_PATH;
    if (fs.existsSync(crmEnvPath)) {
      const crmEnvContent = fs.readFileSync(crmEnvPath, 'utf8');
      const parsed = dotenv.parse(crmEnvContent);
      crmConnectionString = parsed.DATABASE_URL;
    } else {
      throw new Error(`CRM .env file not found at ${crmEnvPath}`);
    }
  }

  if (!crmConnectionString) {
    throw new Error('CRM_DATABASE_URL environment variable is not defined.');
  }

  console.log('Connecting to CRM database in READ-ONLY mode...');
  const crmClient = new pg.Client({
    connectionString: crmConnectionString,
    ssl: { rejectUnauthorized: false },
  });

  await crmClient.connect();

  let crmRows: CrmCompanyRow[] = [];
  try {
    // Strictly SELECT only: never write to CRM database
    const result = await crmClient.query<CrmCompanyRow>(
      'SELECT name, slug, sector, stage, fund, status FROM companies ORDER BY name;'
    );
    crmRows = result.rows;
    console.log(`Fetched ${crmRows.length} companies from CRM database.`);
  } finally {
    await crmClient.end();
  }

  if (crmRows.length === 0) {
    console.log('CRM companies table is empty. No companies to seed.');
    await pool.end();
    return;
  }

  console.log(`Upserting ${crmRows.length} companies into local database...`);
  let upsertedCount = 0;

  for (const row of crmRows) {
    const industry = row.sector || null;
    const parts = [
      row.stage ? `Stage: ${row.stage}` : null,
      row.fund ? `Fund: ${row.fund}` : null,
      row.status ? `Status: ${row.status}` : null,
    ].filter(Boolean);
    const description = parts.length > 0 ? parts.join(' • ') : null;

    await db
      .insert(companies)
      .values({
        name: row.name,
        slug: row.slug,
        industry,
        description,
      })
      .onConflictDoUpdate({
        target: companies.slug,
        set: {
          name: row.name,
          industry,
          description,
          updatedAt: new Date(),
        },
      });

    upsertedCount++;
  }

  const localCompanies = await db.select().from(companies);
  console.log(`Successfully seeded ${upsertedCount} companies into local database.`);
  console.log(`Total companies currently in local database: ${localCompanies.length}`);

  console.table(
    localCompanies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      industry: c.industry,
      description: c.description,
    }))
  );

  if (closePool) {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seed-companies-from-crm.ts')) {
  seedCompaniesFromCrm(true).catch((err) => {
    console.error('Failed to seed companies from CRM:', err.message);
    process.exit(1);
  });
}
