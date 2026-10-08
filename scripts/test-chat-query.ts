import fs from 'node:fs';
import dotenv from 'dotenv';
import { streamText, tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const hermesPath = '/home/amann/.hermes/private/mis-secrets.env';
if (fs.existsSync(hermesPath)) {
  const env = dotenv.parse(fs.readFileSync(hermesPath, 'utf8'));
  process.env.DATABASE_URL = env.MIS_PROD_DATABASE_URL;
  process.env.DEEPSEEK_API_KEY = env.MIS_DEEPSEEK_API_KEY;
  process.env.GEMINI_API_KEY = env.MIS_GEMINI_API_KEY;
  process.env.TARGET_ENV = 'prod';
}

async function main() {
  const { queryMisMetrics } = await import('../packages/core/src/rag/metrics-query.js');

  const question = 'which category is best selling for Masterchow?';
  console.log(`\n======================================================`);
  console.log(`Testing Chat Query: "${question}"`);
  console.log(`======================================================\n`);

  // 1. Structured query directly
  console.log('1. Structured Database Query Path (mis_metrics):');
  const metricsResult = await queryMisMetrics({
    companyName: 'Masterchow',
    metric: 'net_revenue',
    limit: 10,
  });

  console.log(`   ${metricsResult.explanation}`);
  console.log('\n   Ranked Category Breakdown:');
  for (const cat of metricsResult.rankedCategories) {
    console.log(
      `   - ${cat.blockLabel.padEnd(16)} | Latest (${cat.latestPeriod}): ${cat.source_value_latest_formatted.padEnd(14)} | Cumulative (${cat.minPeriod}-${cat.maxPeriod}): ${cat.source_value_cumulative_formatted.padEnd(16)} | Normalized INR: ₹${(cat.normalized_amount_cumulative_inr / 10_000_000).toFixed(2)} Cr`
    );
  }

  // 2. Chat completion with AI SDK tool calling
  console.log('\n2. AI Model Streaming Response (with query_mis_metrics tool):');
  const deepseek = createOpenAI({
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

  const tools = {
    query_mis_metrics: tool({
      description:
        'Query granular MIS metric breakdowns and rankings from the mis_metrics database table (e.g. category-level, channel-level, or product line data). Use this whenever the user asks about categories, channels, best-selling or lowest-selling segments, SKU/category revenue, volumes, or breakdowns for a company.',
      inputSchema: z.object({
        companyName: z.string().describe('Company name e.g. "Masterchow"'),
        metric: z
          .string()
          .default('net_revenue')
          .describe('Metric name: e.g. "net_revenue", "gross_revenue", "qty", or "revenue"'),
        parentBlock: z
          .string()
          .optional()
          .describe('Parent block filter e.g. "Blinkit", "Zepto", or channel name'),
        block: z
          .string()
          .optional()
          .describe('Block / category filter e.g. "Condiments", "Stick Noodles"'),
        period: z.string().optional().describe('Specific period filter YYYY-MM e.g. "2024-04"'),
      }),
      execute: async ({ companyName, metric, parentBlock, block, period }) => {
        console.log(`   [Tool Call] query_mis_metrics(company=${companyName}, metric=${metric})`);
        return await queryMisMetrics({
          companyName,
          metric,
          parentBlockLabel: parentBlock,
          blockLabel: block,
          period,
        });
      },
    }),
  };

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: `You are an expert investment analyst assistant for WEH Ventures portfolio monitoring dashboard.
When asked about categories, channels, or breakdowns, use the query_mis_metrics tool to look up structured data.
IMPORTANT RULE ON AMOUNTS: Quote the source amounts explicitly as formatted (e.g. "326.31 Lakh" in latest month, "3,034.87 Lakh" cumulatively) or in Crores (₹3.26 Cr, ₹30.35 Cr). NEVER multiply already normalized rupee amounts by the scale multiplier again!
Always lead with the latest reported period leader first, followed by cumulative figures.`,
    prompt: question,
    tools,
    stopWhen: stepCountIs(3),
    temperature: 0.1,
  });

  console.log('   Assistant: ');
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\n\n======================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
