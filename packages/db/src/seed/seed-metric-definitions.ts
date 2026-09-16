import 'dotenv/config';
import { db, pool } from '../client';
import { metricDefinitions, type NewMetricDefinition } from '../schema/metric-definitions';

const METRIC_DEFINITIONS: NewMetricDefinition[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    unit: 'currency',
    aliases: ['Revenue', 'Net Revenue', 'Sales', 'Total Sales', 'Operating Revenue', 'Total Income', 'Turnover'],
    directionality: 'up_is_good',
  },
  {
    key: 'ebitda',
    label: 'EBITDA',
    unit: 'currency',
    aliases: ['EBITDA', 'Operating EBITDA', 'Earnings Before Interest Tax Depreciation'],
    directionality: 'up_is_good',
  },
  {
    key: 'gross_margin',
    label: 'Gross Margin',
    unit: 'percent',
    aliases: ['Gross Margin', 'Gross Margin %', 'GM %', 'GM Percentage', 'Gross Profit Margin %'],
    directionality: 'up_is_good',
  },
  {
    key: 'burn',
    label: 'Net Burn',
    unit: 'currency',
    aliases: ['Burn', 'Monthly Burn', 'Net Burn', 'Net Cash Burn', 'Cash Burn', 'Monthly Cash Burn'],
    directionality: 'down_is_good',
  },
  {
    key: 'run_rate',
    label: 'Run Rate',
    unit: 'currency',
    aliases: ['Run Rate', 'Annual Run Rate', 'ARR', 'Annualized Revenue'],
    directionality: 'up_is_good',
  },
];

async function seed() {
  console.log('Seeding metric_definitions...');

  for (const def of METRIC_DEFINITIONS) {
    await db
      .insert(metricDefinitions)
      .values(def)
      .onConflictDoUpdate({
        target: metricDefinitions.key,
        set: {
          label: def.label,
          unit: def.unit,
          aliases: def.aliases,
          directionality: def.directionality,
        },
      });
  }

  const allMetrics = await db.select().from(metricDefinitions);
  console.log(`Seeded ${allMetrics.length} metric definitions successfully:`);
  console.table(
    allMetrics.map((m) => ({
      key: m.key,
      label: m.label,
      unit: m.unit,
      aliases: m.aliases.join(' | '),
      directionality: m.directionality,
    }))
  );

  await pool.end();
}

seed().catch((err) => {
  console.error('Failed to seed metric_definitions:', err);
  process.exit(1);
});
