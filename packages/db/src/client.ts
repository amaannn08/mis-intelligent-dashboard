import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

if (!process.env.DATABASE_URL) {
  for (const envFile of ['apps/web/.env.local', 'packages/db/.env', '.env']) {
    const resolved = path.resolve(process.cwd(), envFile);
    if (fs.existsSync(resolved)) {
      dotenv.config({ path: resolved });
      if (process.env.DATABASE_URL) break;
    }
  }
}
dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Allow importing schema/types without erroring if DATABASE_URL is not set at build time
  console.warn('@mis/db: DATABASE_URL environment variable is not defined.');
}

const globalForDb = globalThis as unknown as {
  pool: pg.Pool | undefined;
};

export const pool =
  globalForDb.pool ??
  new Pool(
    connectionString
      ? {
          connectionString,
          max: 10,
          idleTimeoutMillis: 30000,
        }
      : {
          max: 10,
          idleTimeoutMillis: 30000,
        }
  );

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;
