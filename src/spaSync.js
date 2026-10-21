/**
 * src/spaSync.js
 * Cross-entity synchronizer between Bitrix24 Leads and Enquiry Smart Process Automation (SPA 1062).
 * Handles enum ID translation for Lead Source Type, Urgency, and State.
 */

const BitrixClient = require('./bitrixClient');

// 1. Lead Source Type Translation Map (Lead enum ID <-> SPA 1062 enum ID)
const LEAD_SOURCE_TYPE_MAP = {
  // Native Lead IDs -> SPA IDs
  '2506': 1234, // Inbound Portal
  '2504': 1236, // Paid Ad Campaign
  '2502': 1238, // Organic Search
  '2500': 1240, // Direct Message
  '2498': 1242, // Cold Outreach
  '2496': 1244, // Partner Broker
  // Legacy Lead IDs fallback
  '2324': 1234,
  '2326': 1236,
  '2328': 1238,
  '2330': 1240,
  '2332': 1242,
  '2334': 1244,
  // String label fallbacks
  'inbound portal': 1234,
  'paid ad campaign': 1236,
  'organic search': 1238,
  'direct message': 1240,
  'cold outreach': 1242,
  'partner broker': 1244
};

// 2. Urgency Translation Map (Lead enum ID <-> SPA 1062 enum ID)
const URGENCY_MAP = {
  '2370': 1294, // Low
  '2372': 1296, // Normal
  '2374': 1298, // High
  '2376': 1300, // Urgent
  // String label fallbacks
  'low': 1294,
  'normal': 1296,
  'high': 1298,
  'urgent': 1300
};

// 3. State Translation Map (Lead enum ID <-> SPA 1062 enum ID)
const STATE_MAP = {
  '2532': 1354, // Dubai
  '2534': 1356, // Abu Dhabi
  '2536': 1358, // Sharjah
  '2538': 1360, // Ajman
  '2540': 1362, // Ras Al Khaimah
  '2542': 1364, // Fujairah
  '2544': 1366, // Umm Al Quwain
  // String label fallbacks
  'dubai': 1354,
  'abu dhabi': 1356,
  'sharjah': 1358,
  'ajman': 1360,
  'ras al khaimah': 1362,
  'fujairah': 1364,
  'umm al quwain': 1366
};

// State enum to label map for native Bitrix ADDRESS_PROVINCE
const STATE_ENUM_TO_LABEL = {
  '2532': 'Dubai',
  '2534': 'Abu Dhabi',
  '2536': 'Sharjah',
  '2538': 'Ajman',
  '2540': 'Ras Al Khaimah',
  '2542': 'Fujairah',
  '2544': 'Umm Al Quwain'
};

const STATE_LABEL_TO_ENUM = {
  'dubai': '2532',
  'abu dhabi': '2534',
  'sharjah': '2536',
  'ajman': '2538',
  'ras al khaimah': '2540',
  'fujairah': '2542',
  'umm al quwain': '2544'
};

/**
 * Synchronize Lead fields (Lead Source Type, Urgency, State) to linked Enquiry SPA item
 * @param {string|number} leadId 
 * @param {string} domain 
 * @returns {Promise<Object|null>}
 */
async function syncEnquirySpaFromLead(leadId, domain = 'latest') {
  if (!leadId) return null;
  const cleanLeadId = String(leadId).replace(/\D/g, '');
  if (!cleanLeadId) return null;

  try {
    const lead = await BitrixClient.crmLeadGet(cleanLeadId, domain);
    if (!lead) return null;

    // 1. Locate linked Enquiry SPA item (by lead.UF_CRM_ENQUIRY, xmlId, or ufCrm18Lead)
    let spaItemId = null;
    let spaItem = null;

    if (lead.UF_CRM_ENQUIRY) {
      const match = String(lead.UF_CRM_ENQUIRY).match(/\d+/);
      if (match) spaItemId = parseInt(match[0], 10);
    }

    if (!spaItemId) {
      const listByXml = await BitrixClient.call('crm.item.list', {
        entityTypeId: 1062,
        filter: { '=xmlId': cleanLeadId },
        select: ['id', 'xmlId', 'ufCrm18Lead', 'ufCrm18LeadSourceType', 'ufCrm18NormalLowHighUrgent', 'ufCrm18State']
      }, domain).catch(() => ({ items: [] }));

      if (listByXml?.items?.length > 0) {
        spaItem = listByXml.items[0];
        spaItemId = spaItem.id;
      }
    }

    if (!spaItemId) {
      const listByUf = await BitrixClient.call('crm.item.list', {
        entityTypeId: 1062,
        filter: { '=ufCrm18Lead': cleanLeadId },
        select: ['id', 'xmlId', 'ufCrm18Lead', 'ufCrm18LeadSourceType', 'ufCrm18NormalLowHighUrgent', 'ufCrm18State']
      }, domain).catch(() => ({ items: [] }));

      if (listByUf?.items?.length > 0) {
        spaItem = listByUf.items[0];
        spaItemId = spaItem.id;
      }
    }

    if (!spaItemId) {
      return { status: 'no_linked_spa', leadId: cleanLeadId };
    }

    if (!spaItem) {
      const getRes = await BitrixClient.call('crm.item.get', { entityTypeId: 1062, id: spaItemId }, domain).catch(() => null);
      spaItem = getRes?.item;
    }

    if (!spaItem) {
      return { status: 'spa_item_not_found', spaItemId };
    }

    // 2. Compute updates for Enquiry SPA item
    const updates = {};

    // Map Lead Source Type
    const rawSource = lead.UF_CRM_1792563228880 || lead.UF_CRM_LEAD_SOURCE_TYPE;
    if (rawSource !== undefined && rawSource !== null && rawSource !== '') {
      const key = String(rawSource).trim().toLowerCase();
      const targetSource = LEAD_SOURCE_TYPE_MAP[key] || LEAD_SOURCE_TYPE_MAP[String(rawSource).trim()];
      if (targetSource && String(spaItem.ufCrm18LeadSourceType) !== String(targetSource)) {
        updates.ufCrm18LeadSourceType = targetSource;
      }
    }

    // Map Urgency
    const rawUrgency = lead.UF_CRM_NORMAL_LOW_HIGH_URGENT;
    if (rawUrgency !== undefined && rawUrgency !== null && rawUrgency !== '') {
      const key = String(rawUrgency).trim().toLowerCase();
      const targetUrgency = URGENCY_MAP[key] || URGENCY_MAP[String(rawUrgency).trim()];
      if (targetUrgency && String(spaItem.ufCrm18NormalLowHighUrgent) !== String(targetUrgency)) {
        updates.ufCrm18NormalLowHighUrgent = targetUrgency;
      }
    }

    // Map State
    const rawState = lead.UF_CRM_STATE || lead.ADDRESS_PROVINCE;
    if (rawState !== undefined && rawState !== null && rawState !== '') {
      const key = String(rawState).trim().toLowerCase();
      const targetState = STATE_MAP[key] || STATE_MAP[String(rawState).trim()];
      if (targetState && String(spaItem.ufCrm18State) !== String(targetState)) {
        updates.ufCrm18State = targetState;
      }
    }

    // 3. Apply updates to Bitrix Enquiry SPA item
    if (Object.keys(updates).length > 0) {
      console.log(`[SPA SYNC] Updating Enquiry SPA Item #${spaItemId} from Lead #${cleanLeadId}:`, updates);
      await BitrixClient.call('crm.item.update', {
        entityTypeId: 1062,
        id: spaItemId,
        fields: updates
      }, domain);

      // Also ensure Lead is linked to Enquiry SPA if not set
      if (!lead.UF_CRM_ENQUIRY) {
        await BitrixClient.crmLeadUpdate(cleanLeadId, { UF_CRM_ENQUIRY: String(spaItemId) }, domain).catch(() => {});
      }

      return { status: 'updated', spaItemId, leadId: cleanLeadId, updates };
    }

    return { status: 'unchanged', spaItemId, leadId: cleanLeadId };
  } catch (err) {
    console.error(`[SPA SYNC] Error synchronizing Lead #${leadId}:`, err.message);
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  LEAD_SOURCE_TYPE_MAP,
  URGENCY_MAP,
  STATE_MAP,
  STATE_ENUM_TO_LABEL,
  STATE_LABEL_TO_ENUM,
  syncEnquirySpaFromLead
};
