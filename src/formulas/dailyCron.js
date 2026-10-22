/**
 * src/formulas/dailyCron.js
 * Daily Cron Recalculation Engine for Bitrix24 Real Estate SPAs
 *
 * Recalculates "Days Since" fields (#1, #4, #5):
 *  - Master Project (1040): Community Data - Days Since Last Update (ufCrm8CommunityDataDaysSinceLastUpdat)
 *  - Enquiry (1062): Days since last activity (ufCrm18DaysSinceLastActivity)
 *  - Enquiry (1062): Days since last contacted (ufCrm18DaysSinceLastContacted)
 *
 * Performance & Reliability:
 *  - Limits crm.item.list select strictly to required fields
 *  - Paginates 50 records per page
 *  - Computes diff and filters down to only changed records
 *  - Batches updates up to 50 commands per REST call
 *  - Rate-limit aware with configurable delays
 */

const { CONFIG, daysBetween } = require('./config');
const CalcEngine = require('./calcEngine');
const BitrixClient = require('../bitrixClient');

class DailyCronEngine {
  /**
   * Helper delay to respect Bitrix24 rate limits (2 requests per second)
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute batched crm.item.update commands (up to 50 per batch)
   */
  static async executeBatchUpdates(updates, domain = 'latest') {
    if (!updates || updates.length === 0) return { totalBatches: 0, updatedCount: 0 };

    let updatedCount = 0;
    const CHUNK_SIZE = 50;

    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      const batchCmds = {};

      chunk.forEach((item, idx) => {
        const cmdKey = `upd_${item.id}_${idx}`;
        const queryParams = new URLSearchParams();
        queryParams.append('entityTypeId', item.entityTypeId);
        queryParams.append('id', item.id);

        for (const [k, v] of Object.entries(item.fields)) {
          queryParams.append(`fields[${k}]`, v === null ? '' : v);
        }

        batchCmds[cmdKey] = `crm.item.update?${queryParams.toString()}`;
      });

      console.log(`[DAILY-CRON] Sending batch ${Math.floor(i / CHUNK_SIZE) + 1} with ${chunk.length} update commands...`);

      try {
        const batchRes = await BitrixClient.callBatch(batchCmds, false, domain);
        if (batchRes?.result_error && Object.keys(batchRes.result_error).length > 0) {
          console.warn('[DAILY-CRON] Some batch commands reported errors:', batchRes.result_error);
        }
        updatedCount += chunk.length;
      } catch (err) {
        console.error(`[DAILY-CRON] Batch execution failed: ${err.message}. Falling back to sequential calls for this chunk...`);
        // Fallback: sequential calls
        for (const item of chunk) {
          try {
            await BitrixClient.call('crm.item.update', {
              entityTypeId: item.entityTypeId,
              id: item.id,
              fields: item.fields
            }, domain);
            updatedCount++;
          } catch (itemErr) {
            console.error(`[DAILY-CRON] Sequential update failed for item #${item.id}:`, itemErr.message);
          }
          await this.sleep(250);
        }
      }

      // Delay 600ms between batches to stay under 2 req/sec Bitrix24 rate limit
      if (i + CHUNK_SIZE < updates.length) {
        await this.sleep(600);
      }
    }

    return { totalBatches: Math.ceil(updates.length / CHUNK_SIZE), updatedCount };
  }

  // ============================================================================
  // 1. RECALCULATE MASTER PROJECT (Formula #1)
  // ============================================================================
  static async recalcMasterProjects(domain = 'latest') {
    const mpConfig = CONFIG.ENTITIES.MASTER_PROJECT;
    const fields = mpConfig.fields;
    console.log(`\n[DAILY-CRON] --- Scanning Master Projects (${mpConfig.entityTypeId}) ---`);

    const select = [fields.id, fields.dateUpdated, fields.daysSinceLastUpdate];
    const pendingUpdates = [];
    let start = 0;
    let totalScanned = 0;

    while (true) {
      try {
        const res = await BitrixClient.call('crm.item.list', {
          entityTypeId: mpConfig.entityTypeId,
          select,
          start
        }, domain);

        const items = res?.items || (Array.isArray(res) ? res : []);
        totalScanned += items.length;

        for (const item of items) {
          const dateVal = item[fields.dateUpdated];
          const calculated = dateVal ? daysBetween(dateVal, new Date()) : null;
          const current = item[fields.daysSinceLastUpdate];

          if (CalcEngine.hasChanged(calculated, current)) {
            pendingUpdates.push({
              entityTypeId: mpConfig.entityTypeId,
              id: item.id,
              fields: {
                [fields.daysSinceLastUpdate]: calculated
              }
            });
          }
        }

        if (items.length < 50) break;
        start += 50;
        await this.sleep(250);
      } catch (err) {
        console.error(`[DAILY-CRON] Error listing Master Projects at start=${start}:`, err.message);
        break;
      }
    }

    console.log(`[DAILY-CRON] Master Projects: Scanned ${totalScanned}, found ${pendingUpdates.length} needing update.`);
    const result = await this.executeBatchUpdates(pendingUpdates, domain);
    return { entity: 'MasterProject', scanned: totalScanned, changed: pendingUpdates.length, updated: result.updatedCount };
  }

  // ============================================================================
  // 2. RECALCULATE ENQUIRIES (Formulas #4 & #5)
  // ============================================================================
  static async recalcEnquiries(domain = 'latest') {
    const eConfig = CONFIG.ENTITIES.ENQUIRY;
    const fields = eConfig.fields;
    console.log(`\n[DAILY-CRON] --- Scanning Enquiries (${eConfig.entityTypeId}) ---`);

    const select = [
      fields.id,
      fields.lastActivityTime,
      fields.lastContactedDate,
      fields.lastCommunicationTime,
      'updatedTime',
      fields.daysSinceLastActivity,
      fields.daysSinceLastContacted
    ];

    const pendingUpdates = [];
    let start = 0;
    let totalScanned = 0;

    while (true) {
      try {
        const res = await BitrixClient.call('crm.item.list', {
          entityTypeId: eConfig.entityTypeId,
          select,
          start
        }, domain);

        const items = res?.items || (Array.isArray(res) ? res : []);
        totalScanned += items.length;

        for (const item of items) {
          const diff = {};

          // Formula 4: Days since last activity
          const lastActivity = item[fields.lastActivityTime] || item[fields.lastCommunicationTime] || item.updatedTime;
          const calcActivityDays = lastActivity ? Math.max(0, daysBetween(lastActivity, new Date())) : null;
          if (CalcEngine.hasChanged(calcActivityDays, item[fields.daysSinceLastActivity])) {
            diff[fields.daysSinceLastActivity] = calcActivityDays;
          }

          // Formula 5: Days since last contacted
          const lastContacted = item[fields.lastContactedDate] || item[fields.lastCommunicationTime];
          const calcContactDays = lastContacted ? Math.max(0, daysBetween(lastContacted, new Date())) : null;
          if (CalcEngine.hasChanged(calcContactDays, item[fields.daysSinceLastContacted])) {
            diff[fields.daysSinceLastContacted] = calcContactDays;
          }

          if (Object.keys(diff).length > 0) {
            pendingUpdates.push({
              entityTypeId: eConfig.entityTypeId,
              id: item.id,
              fields: diff
            });
          }
        }

        if (items.length < 50) break;
        start += 50;
        await this.sleep(250);
      } catch (err) {
        console.error(`[DAILY-CRON] Error listing Enquiries at start=${start}:`, err.message);
        break;
      }
    }

    console.log(`[DAILY-CRON] Enquiries: Scanned ${totalScanned}, found ${pendingUpdates.length} needing update.`);
    const result = await this.executeBatchUpdates(pendingUpdates, domain);
    return { entity: 'Enquiry', scanned: totalScanned, changed: pendingUpdates.length, updated: result.updatedCount };
  }

  // ============================================================================
  // 3. MAIN RUNNER
  // ============================================================================
  static async runDailyRecalc(domain = 'latest') {
    const startTime = Date.now();
    console.log(`=================================================================`);
    console.log(`[DAILY-CRON] Starting Daily Recalculation (${new Date().toISOString()})`);
    console.log(`=================================================================`);

    const mpResult = await this.recalcMasterProjects(domain);
    const enqResult = await this.recalcEnquiries(domain);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n=================================================================`);
    console.log(`[DAILY-CRON] Completed in ${elapsed}s. Summary:`);
    console.log(`  - Master Projects: ${mpResult.updated}/${mpResult.changed} updated (${mpResult.scanned} scanned)`);
    console.log(`  - Enquiries: ${enqResult.updated}/${enqResult.changed} updated (${enqResult.scanned} scanned)`);
    console.log(`=================================================================\n`);

    return {
      timestamp: new Date().toISOString(),
      durationSeconds: elapsed,
      results: [mpResult, enqResult]
    };
  }
}

module.exports = DailyCronEngine;
