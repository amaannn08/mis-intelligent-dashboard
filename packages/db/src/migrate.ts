import 'dotenv/config';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrate() {
  if (!process.env.DATABASE_URL) {
    for (const envFile of [
      path.resolve(__dirname, '../.env'),
      path.resolve(process.cwd(), 'packages/db/.env'),
      path.resolve(process.cwd(), 'apps/web/.env.local'),
      path.resolve(process.cwd(), '.env'),
    ]) {
      if (fs.existsSync(envFile)) {
        dotenv.config({ path: envFile });
        if (process.env.DATABASE_URL) break;
      }
    }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not defined.');
  }

  const client = new pg.Client({
    connectionString,
  });

  await client.connect();
  const db = drizzle(client);

  console.log('Applying migrations from drizzle folder...');
  const migrationsFolder = path.resolve(__dirname, '../drizzle');
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied successfully!');

  await client.end();
}

runMigrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
