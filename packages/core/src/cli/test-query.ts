import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from apps/web/.env.local if not already in env
const envPath = path.resolve(process.cwd(), 'apps/web/.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
dotenv.config();

import { pool, db, companies } from '@mis/db';
import { eq } from 'drizzle-orm';
import { answerQuery } from '../rag/index.js';

async function run() {
  const args = process.argv.slice(2);
  const question = args[0];
  const companySlug = args[1];

  if (!question) {
    console.error('Usage: npx tsx packages/core/src/cli/test-query.ts "<question>" [companySlug]');
    process.exit(1);
  }

  let companyId: string | undefined;
  let companyName = 'Global Portfolio';

  if (companySlug) {
    const [comp] = await db
      .select()
      .from(companies)
      .where(eq(companies.slug, companySlug));

    if (comp) {
      companyId = comp.id;
      companyName = comp.name;
    } else {
      console.warn(`Company slug '${companySlug}' not found. Searching globally across portfolio.`);
    }
  }

  console.log(`=== MIS Grounded RAG Query Verification ===`);
  console.log(`Question: "${question}"`);
  console.log(`Scope: ${companyName} (${companyId ?? 'All Companies'})`);
  console.log(`Searching vector index & querying DeepSeek...\n`);

  const startTime = Date.now();
  const result = await answerQuery({
    question,
    companyId,
    topK: 6,
    minSimilarity: 0.50,
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`--- AI Answer (${elapsed}s) ---`);
  console.log(result.answer);
  console.log(`\n--- Citations (${result.citations.length}) ---`);
  if (result.citations.length === 0) {
    console.log('No citations attached (empty retrieval or answer not present in documents).');
  } else {
    console.table(
      result.citations.map((c) => ({
        marker: `[${c.index}]`,
        company: c.company,
        period: c.reportingPeriod,
        file: c.filename,
        snippet: c.snippet.slice(0, 60) + '...',
      }))
    );
  }

  console.log(`\n--- Retrieved Chunks Evaluated (${result.usedChunks.length}) ---`);
  console.table(
    result.usedChunks.map((uc) => ({
      chunkIndex: uc.chunkIndex,
      similarity: (Number(uc.similarity) * 100).toFixed(1) + '%',
      sheet: (uc.metadata as Record<string, unknown>).sheetName,
    }))
  );

  await pool.end();
}

run().catch(async (err) => {
  console.error('Fatal Query CLI Error:', err);
  await pool.end();
  process.exit(1);
});
