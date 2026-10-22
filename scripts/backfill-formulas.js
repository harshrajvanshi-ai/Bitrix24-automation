#!/usr/bin/env node
/**
 * scripts/backfill-formulas.js
 * One-time backfill script to calculate and populate formula fields for all existing SPA records.
 *
 * Usage:
 *   node scripts/backfill-formulas.js [--entity=listing|enquiry|masterProject|all]
 */

require('dotenv').config();
const { CONFIG } = require('../src/formulas/config');
const CalcEngine = require('../src/formulas/calcEngine');
const DailyCronEngine = require('../src/formulas/dailyCron');
const BitrixClient = require('../src/bitrixClient');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function backfillEntity(entityConfig, domain = 'latest') {
  console.log(`\n=================================================================`);
  console.log(`[BACKFILL] Starting Backfill for ${entityConfig.name} (${entityConfig.entityTypeId})`);
  console.log(`=================================================================`);

  let start = 0;
  let totalRecords = 0;
  const pendingUpdates = [];

  while (true) {
    try {
      const res = await BitrixClient.call('crm.item.list', {
        entityTypeId: entityConfig.entityTypeId,
        start
      }, domain);

      const items = res?.items || (Array.isArray(res) ? res : []);
      totalRecords += items.length;

      for (const item of items) {
        const diff = CalcEngine.calc(entityConfig.entityTypeId, item);
        if (Object.keys(diff).length > 0) {
          pendingUpdates.push({
            entityTypeId: entityConfig.entityTypeId,
            id: item.id,
            fields: diff
          });
        }
      }

      console.log(`[BACKFILL] ${entityConfig.name}: Scanned ${totalRecords} items (start=${start}), ${pendingUpdates.length} pending updates...`);

      if (items.length < 50) break;
      start += 50;
      await sleep(250);
    } catch (err) {
      console.error(`[BACKFILL] Error fetching ${entityConfig.name} at start=${start}:`, err.message);
      break;
    }
  }

  console.log(`[BACKFILL] ${entityConfig.name}: Total scanned: ${totalRecords}. Updating ${pendingUpdates.length} records...`);
  const batchRes = await DailyCronEngine.executeBatchUpdates(pendingUpdates, domain);

  return {
    entity: entityConfig.name,
    entityTypeId: entityConfig.entityTypeId,
    scanned: totalRecords,
    needsUpdate: pendingUpdates.length,
    updated: batchRes.updatedCount
  };
}

async function backfillMasterProjectUnits(domain = 'latest') {
  console.log(`\n=================================================================`);
  console.log(`[BACKFILL] Rolling up Units for all Master Projects`);
  console.log(`=================================================================`);

  let start = 0;
  const mpIds = [];
  while (true) {
    try {
      const res = await BitrixClient.call('crm.item.list', {
        entityTypeId: CONFIG.ENTITIES.MASTER_PROJECT.entityTypeId,
        select: ['id'],
        start
      }, domain);
      const items = res?.items || (Array.isArray(res) ? res : []);
      mpIds.push(...items.map(i => i.id));
      if (items.length < 50) break;
      start += 50;
      await sleep(200);
    } catch (e) {
      break;
    }
  }

  let rollupsCount = 0;
  for (const mpId of mpIds) {
    const res = await CalcEngine.recalcMasterProjectUnits(mpId, domain);
    if (res && res.updated && Object.keys(res.updated).length > 0) {
      rollupsCount++;
    }
    await sleep(200);
  }

  return { entity: 'MasterProjectUnitsRollup', masterProjectsChecked: mpIds.length, rollupsUpdated: rollupsCount };
}

async function main() {
  const startTime = Date.now();
  console.log('Starting Bitrix24 Real Estate Formulas Backfill...');

  const results = [];

  // 1. Listings (Title Character Counter, CombinedTitle, Price/SqFt, Ratios, Yield)
  results.push(await backfillEntity(CONFIG.ENTITIES.LISTING));

  // 2. Enquiries (Conversion days, days since activity/contact)
  results.push(await backfillEntity(CONFIG.ENTITIES.ENQUIRY));

  // 3. Master Projects (Days since update)
  results.push(await backfillEntity(CONFIG.ENTITIES.MASTER_PROJECT));

  // 4. Master Project Units rollup across linked projects
  results.push(await backfillMasterProjectUnits());

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n=================================================================');
  console.log(`[BACKFILL] All Backfill Operations Completed in ${elapsed}s!`);
  console.log(JSON.stringify(results, null, 2));
  console.log('=================================================================');
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[BACKFILL] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { backfillEntity, backfillMasterProjectUnits };
