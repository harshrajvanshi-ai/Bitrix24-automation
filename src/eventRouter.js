/**
 * src/eventRouter.js
 * Event routing logic for ONCRMLEADADD and ONCRMLEADUPDATE
 * Automatically moves leads into 'Enquiry Leads' or 'Listing Leads' stages with recursion & loop guards.
 */

const BitrixClient = require('./bitrixClient');
const StorageManager = require('./storage');
const DiscoveryService = require('./discovery');
const { syncEnquirySpaFromLead } = require('./spaSync');

// In-memory debounce cache to prevent duplicate processing of the same lead (TTL: 5s)
const processedLeads = new Map();

class EventRouter {
  /**
   * Process incoming lead event (ADD or UPDATE)
   */
  static async handleLeadEvent(leadId, eventName, domain = 'latest') {
    const now = Date.now();
    const cacheKey = `${domain}:${leadId}`;

    // 1. Debounce check: skip duplicate events arriving within 4 seconds
    if (processedLeads.has(cacheKey) && (now - processedLeads.get(cacheKey) < 4000)) {
      console.log(`[ROUTER] Debounce: Skipping duplicate event for Lead #${leadId} received within 4s.`);
      return { status: 'skipped', reason: 'debounced' };
    }
    processedLeads.set(cacheKey, now);

    // 2. Fetch fresh lead state
    console.log(`[ROUTER] Fetching Lead #${leadId} via crm.lead.get (${eventName})...`);
    let lead;
    try {
      lead = await BitrixClient.crmLeadGet(leadId, domain);
    } catch (err) {
      console.error(`[ROUTER] Failed to fetch Lead #${leadId}:`, err.message);
      return { status: 'error', error: err.message };
    }

    if (!lead) {
      console.warn(`[ROUTER] Lead #${leadId} was not found in Bitrix24.`);
      return { status: 'not_found' };
    }

    // 3. Skip leads in final status (Won, Lost, Converted, Junk)
    let discovered = StorageManager.getDiscoveredConfig();
    const currentStatus = lead.STATUS_ID;
    const semanticId = lead.STATUS_SEMANTIC_ID;

    const isFinalStage = (
      semanticId === 'S' ||
      semanticId === 'F' ||
      lead.CONVERTED === 'Y' ||
      (discovered.finalStages && discovered.finalStages.includes(currentStatus))
    );

    if (isFinalStage) {
      console.log(`[ROUTER] Lead #${leadId} is in a final stage (${currentStatus}, semantic: ${semanticId}). Skipping routing.`);
      return { status: 'skipped', reason: 'final_stage', currentStatus };
    }

    // 4. Resolve Lead Type field value
    const candidateFields = [
      discovered.leadTypeField,
      'UF_CRM_1791354310417',
      'UF_CRM_LEAD_TYPE'
    ].filter(Boolean);

    let rawVal = null;
    for (const field of candidateFields) {
      if (lead[field] !== undefined && lead[field] !== null && lead[field] !== '') {
        rawVal = lead[field];
        break;
      }
    }

    // Scan all keys if not found
    if (rawVal === null || rawVal === undefined || rawVal === '') {
      for (const [key, val] of Object.entries(lead)) {
        if (val === '1594' || val === '1596' || val === 1594 || val === 1596) {
          rawVal = val;
          break;
        }
      }
    }

    if (rawVal === null || rawVal === undefined || rawVal === '') {
      console.log(`[ROUTER] Lead #${leadId} has empty Lead Type. Skipping routing.`);
      return { status: 'skipped', reason: 'empty_lead_type' };
    }

    // Normalize value (support string, enumeration ID, or object)
    let resolvedType = null;
    const strVal = String(typeof rawVal === 'object' ? (rawVal.VALUE || rawVal.value || rawVal.ID || '') : rawVal).trim().toLowerCase();

    const enquiryItemId = discovered.leadTypeItems?.enquiryId ? String(discovered.leadTypeItems.enquiryId) : '1594';
    const listingItemId = discovered.leadTypeItems?.listingId ? String(discovered.leadTypeItems.listingId) : '1596';

    if (strVal === 'enquiry' || strVal === 'enqiry' || strVal === 'inquiry' || strVal === '1594' || strVal.includes('enq') || strVal === enquiryItemId.toLowerCase()) {
      resolvedType = 'enquiry';
    } else if (strVal === 'listing' || strVal === '1596' || strVal.includes('list') || strVal === listingItemId.toLowerCase()) {
      resolvedType = 'listing';
    }

    if (!resolvedType) {
      console.warn(`[ROUTER] Lead #${leadId} has unrecognized Lead Type value: "${strVal}". No action taken.`);
      return { status: 'unmapped', rawVal };
    }

    // 5. Ensure stages are discovered
    let targetStageId = resolvedType === 'enquiry'
      ? discovered.stages?.enquiryStageId
      : discovered.stages?.listingStageId;

    if (!targetStageId) {
      console.log('[ROUTER] Target stage ID missing in cache. Running dynamic discovery...');
      const freshDiscovery = await DiscoveryService.discoverStages(true, domain);
      StorageManager.saveDiscoveredConfig({
        stages: {
          enquiryStageId: freshDiscovery.enquiryStageId,
          listingStageId: freshDiscovery.listingStageId,
          all: freshDiscovery.allStages
        },
        finalStages: freshDiscovery.finalStages
      });
      targetStageId = resolvedType === 'enquiry'
        ? freshDiscovery.enquiryStageId
        : freshDiscovery.listingStageId;
    }

    if (!targetStageId) {
      console.error(`[ROUTER] Could not resolve target stage for Lead Type "${resolvedType}".`);
      return { status: 'stage_not_found', resolvedType };
    }

    // 6. Loop Guard: If already at target stage, DO NOT UPDATE!
    if (currentStatus === targetStageId) {
      console.log(`[LOOP GUARD] Lead #${leadId} is already in target stage "${targetStageId}". Skipping update.`);
      if (resolvedType === 'enquiry') {
        setTimeout(() => {
          syncEnquirySpaFromLead(leadId, domain).catch(() => {});
        }, 1000);
      }
      return { status: 'unchanged', currentStatus, targetStageId };
    }

    // 7. Update Lead stage via crm.lead.update
    console.log(`[ROUTER] Shifting Lead #${leadId} (${resolvedType}) stage: "${currentStatus}" -> "${targetStageId}"`);
    await BitrixClient.crmLeadUpdate(leadId, { STATUS_ID: targetStageId }, domain);
    console.log(`[ROUTER] Lead #${leadId} successfully moved to "${targetStageId}".`);

    // Synchronize Enquiry SPA if enquiry lead
    if (resolvedType === 'enquiry') {
      setTimeout(() => {
        syncEnquirySpaFromLead(leadId, domain).catch(() => {});
      }, 1500);
    }

    return {
      status: 'updated',
      leadId,
      resolvedType,
      previousStatus: currentStatus,
      newStatus: targetStageId
    };
  }
}

module.exports = EventRouter;
