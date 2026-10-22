/**
 * src/formulas/eventHandler.js
 * Asynchronous event router and processor for ONCRMDYNAMICITEMADD, ONCRMDYNAMICITEMUPDATE, ONCRMDYNAMICITEMDELETE
 * 
 * Capabilities:
 *  - Routes by entityTypeId (1040 Master Project, 1044 Project, 1058 Listing, 1062 Enquiry, 1070 Offer)
 *  - Recursion and update-loop guard with 5-second TTL memory cache
 *  - Selective updates: only calls crm.item.update when computed values differ
 *  - Project lifecycle hooks trigger Master Project unit total rollup
 *  - Full structured logging and error handling
 */

const { CONFIG } = require('./config');
const CalcEngine = require('./calcEngine');
const BitrixClient = require('../bitrixClient');

// In-memory update cache to prevent echo/loop recursion (Key: domain:entityTypeId:id -> Timestamp)
const recentUpdates = new Map();
const LOOP_GUARD_WINDOW_MS = 5000;

class FormulaEventHandler {
  /**
   * Handle incoming dynamic SPA event
   */
  static async handleEvent(event, entityTypeId, rawId, payload = {}, domain = 'latest') {
    const numericTypeId = parseInt(entityTypeId, 10);
    const numericId = parseInt(rawId, 10);

    if (isNaN(numericTypeId) || isNaN(numericId)) {
      console.warn(`[FORMULA-EVENT] Skipping event with invalid entityTypeId (${entityTypeId}) or ID (${rawId})`);
      return { status: 'skipped', reason: 'invalid_identifiers' };
    }

    const cacheKey = `${domain}:${numericTypeId}:${numericId}`;
    const now = Date.now();

    // 1. Debounce check: skip if updated by our automation within 5 seconds
    if (recentUpdates.has(cacheKey) && (now - recentUpdates.get(cacheKey) < LOOP_GUARD_WINDOW_MS)) {
      console.log(`[FORMULA-EVENT] Loop Guard: Skipping echo event for SPA ${numericTypeId} #${numericId} (processed ${now - recentUpdates.get(cacheKey)}ms ago).`);
      return { status: 'skipped', reason: 'loop_guard_active' };
    }

    console.log(`[FORMULA-EVENT] Processing ${event} for SPA ${numericTypeId} #${numericId} on domain: ${domain}`);

    // =========================================================================
    // CASE A: Project Events (1044) -> Roll-up recalculation for Master Project
    // =========================================================================
    if (numericTypeId === CONFIG.ENTITIES.PROJECT.entityTypeId) {
      return this.handleProjectEvent(event, numericId, payload, domain);
    }

    // =========================================================================
    // CASE B: Delete Events for other entities -> No formula calculation needed
    // =========================================================================
    if (event.includes('DELETE')) {
      return { status: 'ignored', reason: 'delete_on_leaf_entity' };
    }

    // =========================================================================
    // CASE C: Item Add / Update (1040 Master Project, 1058 Listing, 1062 Enquiry)
    // =========================================================================
    try {
      // 1. Fetch fresh item state
      const getRes = await BitrixClient.call('crm.item.get', {
        entityTypeId: numericTypeId,
        id: numericId
      }, domain);

      const item = getRes?.item || getRes;
      if (!item) {
        console.warn(`[FORMULA-EVENT] SPA ${numericTypeId} #${numericId} not found in Bitrix24`);
        return { status: 'not_found' };
      }

      // 2. Compute diff
      const diff = CalcEngine.calc(numericTypeId, item);
      const changedKeys = Object.keys(diff);

      if (changedKeys.length === 0) {
        console.log(`[FORMULA-EVENT] SPA ${numericTypeId} #${numericId}: All calculated values match stored state. No update needed.`);
        return { status: 'unchanged', id: numericId, entityTypeId: numericTypeId };
      }

      // 3. Mark in loop guard cache before calling crm.item.update
      recentUpdates.set(cacheKey, Date.now());

      console.log(`[FORMULA-EVENT] Updating SPA ${numericTypeId} #${numericId} with ${changedKeys.length} changed field(s):`, diff);

      await BitrixClient.call('crm.item.update', {
        entityTypeId: numericTypeId,
        id: numericId,
        fields: diff
      }, domain);

      console.log(`[FORMULA-EVENT] ✓ Successfully updated SPA ${numericTypeId} #${numericId}`);
      return {
        status: 'updated',
        entityTypeId: numericTypeId,
        id: numericId,
        fieldsUpdated: diff
      };
    } catch (err) {
      console.error(`[FORMULA-EVENT] Error processing SPA ${numericTypeId} #${numericId}:`, err.message);
      return { status: 'error', error: err.message };
    }
  }

  /**
   * Handle Project SPA events (Add/Update/Delete) to update parent Master Project
   */
  static async handleProjectEvent(event, projectId, payload, domain) {
    const pFields = CONFIG.ENTITIES.PROJECT.fields;
    let masterProjectId = null;

    // Check payload fields first
    const fields = payload.data?.FIELDS || payload['data[FIELDS]'] || {};
    masterProjectId = fields[pFields.parentId1040] || fields[pFields.masterProjectCrm];

    // If not in payload and not a delete event, fetch item
    if (!masterProjectId && !event.includes('DELETE')) {
      try {
        const res = await BitrixClient.call('crm.item.get', {
          entityTypeId: CONFIG.ENTITIES.PROJECT.entityTypeId,
          id: projectId
        }, domain);
        const item = res?.item || res;
        masterProjectId = item?.[pFields.parentId1040] || item?.[pFields.masterProjectCrm];
      } catch (e) {
        console.warn(`[FORMULA-EVENT] Could not fetch Project #${projectId} to find Master Project:`, e.message);
      }
    }

    if (masterProjectId) {
      console.log(`[FORMULA-EVENT] Project #${projectId} belongs to Master Project #${masterProjectId}. Triggering unit total rollup...`);
      const rollupRes = await CalcEngine.recalcMasterProjectUnits(masterProjectId, domain);
      return { status: 'rollup_triggered', masterProjectId, rollupRes };
    }

    console.log(`[FORMULA-EVENT] Project #${projectId} has no linked Master Project parent. No rollup needed.`);
    return { status: 'skipped', reason: 'no_master_project_linked' };
  }
}

module.exports = FormulaEventHandler;
