import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

const envPaths = ['.env', 'packages/db/.env', 'apps/web/.env.local', '../../apps/web/.env.local'];
for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
  if (process.env.DATABASE_URL) break;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required for drizzle-kit.');
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
