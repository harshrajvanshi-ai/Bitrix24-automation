#!/usr/bin/env node
/**
 * scripts/daily-recalc.js
 * Executable cron job script for daily recalculation of Bitrix24 real estate formula fields.
 *
 * Usage:
 *   node scripts/daily-recalc.js
 */

require('dotenv').config();
const DailyCronEngine = require('../src/formulas/dailyCron');

async function main() {
  try {
    const summary = await DailyCronEngine.runDailyRecalc('latest');
    console.log('[CRON-CLI] Daily recalculation completed successfully:', summary);
    process.exit(0);
  } catch (err) {
    console.error('[CRON-CLI] Fatal error running daily recalculation:', err);
    process.exit(1);
  }
}

main();
