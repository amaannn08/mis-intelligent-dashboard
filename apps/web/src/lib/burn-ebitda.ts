/**
 * Re-export pure calculation engine for Burn & EBITDA-% Month-over-Month metrics.
 * Defined canonically in @mis/core/dashboard.
 */

export {
  computeBurnEbitdaSeries,
  formatShortPeriod,
  parseCompanySlugs,
  type CompanyPeriodRow,
  type BurnEbitdaPoint,
} from '@mis/core/dashboard';
