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

function maskUrl(conn: string): string {
  try {
    const u = new URL(conn);
    return `${u.protocol}//${u.username ? u.username + ':***@' : ''}${u.host}${u.pathname}`;
  } catch {
    return '***masked***';
  }
}

async function runMigrate() {
  const args = process.argv.slice(2);
  let target = 'prod'; // default to prod
  for (const a of args) {
    if (a.startsWith('--target=')) {
      target = a.split('=')[1]!.toLowerCase();
    } else if (a === '--local') {
      target = 'local';
    } else if (a === '--prod') {
      target = 'prod';
    }
  }

  // Load hermes secrets if available
  const hermesPath = '/home/amann/.hermes/private/mis-secrets.env';
  let hermesEnv: Record<string, string> = {};
  if (fs.existsSync(hermesPath)) {
    hermesEnv = dotenv.parse(fs.readFileSync(hermesPath, 'utf8'));
  }

  let connectionString: string | undefined;

  if (target === 'prod') {
    connectionString =
      process.env.MIS_PROD_DATABASE_URL_DIRECT ||
      process.env.MIS_PROD_DATABASE_URL ||
      hermesEnv.MIS_PROD_DATABASE_URL_DIRECT ||
      hermesEnv.MIS_PROD_DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'Production target requested, but MIS_PROD_DATABASE_URL_DIRECT / MIS_PROD_DATABASE_URL is not set in environment or /home/amann/.hermes/private/mis-secrets.env.'
      );
    }
  } else {
    // Local target
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
    connectionString = process.env.DATABASE_URL || hermesEnv.MIS_DEV_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'Local target requested, but DATABASE_URL is not set in environment or .env.local.'
      );
    }
  }

  console.log(`[Migration Target] ${target.toUpperCase()}: ${maskUrl(connectionString)}`);

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
