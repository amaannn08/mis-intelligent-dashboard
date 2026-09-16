import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

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
  new Pool({
    connectionString: connectionString || 'postgresql://mis_app:mis_app_dev@127.0.0.1:5432/mis_dashboard',
    max: 10,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;
