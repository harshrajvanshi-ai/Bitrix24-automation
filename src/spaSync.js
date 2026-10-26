/**
 * src/spaSync.js
 * Cross-entity synchronizer between Bitrix24 Leads and Enquiry Smart Process Automation (SPA 1062).
 * Handles enum ID translation for Lead Source Type, Urgency, State, City - Bayut, and City - Propertyfinder.
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

// 4. City - Bayut Translation Map (Lead enum ID <-> SPA 1062 enum ID)
const CITY_BAYUT_MAP = {
  '2546': 1134, // Dubai
  '2548': 1136, // Abu Dhabi
  '2550': 1138, // Sharjah
  '2552': 1140, // Ajman
  '2554': 1142, // Ras Al Khaimah
  '2556': 1144, // Fujairah
  '2558': 1146, // Umm Al Quwain
  '2560': 1148, // Al Ain
  // String label fallbacks
  'dubai': 1134,
  'abu dhabi': 1136,
  'sharjah': 1138,
  'ajman': 1140,
  'ras al khaimah': 1142,
  'fujairah': 1144,
  'umm al quwain': 1146,
  'al ain': 1148
};

// 5. City - Propertyfinder Translation Map (Lead enum ID <-> SPA 1062 enum ID)
const CITY_PROPERTYFINDER_MAP = {
  '2562': 1150, // Dubai
  '2564': 1152, // Abu Dhabi
  '2566': 1154, // Sharjah
  '2568': 1156, // Ajman
  '2570': 1158, // Ras Al Khaimah
  '2572': 1160, // Fujairah
  '2574': 1162, // Umm Al Quwain
  '2576': 1164, // Al Ain
  // String label fallbacks
  'dubai': 1150,
  'abu dhabi': 1152,
  'sharjah': 1154,
  'ajman': 1156,
  'ras al khaimah': 1158,
  'fujairah': 1160,
  'umm al quwain': 1162,
  'al ain': 1164
};

/**
 * Synchronize Lead fields (Lead Source Type, Urgency, State, City Bayut, City PF) to linked Enquiry SPA item
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
      if (match) {
        const potentialId = parseInt(match[0], 10);
        const getRes = await BitrixClient.call('crm.item.get', { entityTypeId: 1062, id: potentialId }, domain).catch(() => null);
        if (getRes?.item) {
          spaItemId = potentialId;
          spaItem = getRes.item;
        }
      }
    }

    const selectFields = [
      'id', 'xmlId', 'ufCrm18Lead',
      'ufCrm18LeadSourceType',
      'ufCrm18NormalLowHighUrgent',
      'ufCrm18State',
      'ufCrm18CityBayut',
      'ufCrm18CityPropertyfinder'
    ];

    if (!spaItemId) {
      const listByXml = await BitrixClient.call('crm.item.list', {
        entityTypeId: 1062,
        filter: { '=xmlId': cleanLeadId },
        select: selectFields
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
        select: selectFields
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

    // Map City - Bayut
    const rawCityBayut = lead.UF_CRM_CITY_BAYUT;
    if (rawCityBayut !== undefined && rawCityBayut !== null && rawCityBayut !== '') {
      const key = String(rawCityBayut).trim().toLowerCase();
      const targetCityBayut = CITY_BAYUT_MAP[key] || CITY_BAYUT_MAP[String(rawCityBayut).trim()];
      if (targetCityBayut && String(spaItem.ufCrm18CityBayut) !== String(targetCityBayut)) {
        updates.ufCrm18CityBayut = targetCityBayut;
      }
    }

    // Map City - Propertyfinder
    const rawCityPf = lead.UF_CRM_CITY_PF || lead.UF_CRM_CITY_PROPERTYFINDER;
    if (rawCityPf !== undefined && rawCityPf !== null && rawCityPf !== '') {
      const key = String(rawCityPf).trim().toLowerCase();
      const targetCityPf = CITY_PROPERTYFINDER_MAP[key] || CITY_PROPERTYFINDER_MAP[String(rawCityPf).trim()];
      if (targetCityPf && String(spaItem.ufCrm18CityPropertyfinder) !== String(targetCityPf)) {
        updates.ufCrm18CityPropertyfinder = targetCityPf;
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

// ==============================================================================
// 6. Listing SPA (1058) <-> Lead Field Mapping & Enum Translation Dictionaries
// ==============================================================================

const LISTING_ENUM_MAPS = {
  // Listing Type: Lead (2578 RENT, 2580 Overseas Sale, 2582 Off-plan, 2584 External Stock) <-> SPA (158 Rent, 160 Overseas Sale, 162 Off-plan, 164 External Stock)
  listingType: {
    leadToSpa: {
      '2578': 158, 'rent': 158,
      '2580': 160, 'overseas sale': 160,
      '2582': 162, 'off-plan': 162, 'off-plan listing': 162,
      '2584': 164, 'external stock': 164
    },
    spaToLead: {
      '158': '2578',
      '160': '2580',
      '162': '2582',
      '164': '2584'
    }
  },

  // Property Type: Lead (1754 Apartment... 1770 Retail) <-> SPA (886 Apartment... 902 Retail)
  propertyType: {
    leadToSpa: {
      '1754': 886, 'apartment': 886,
      '1756': 888, 'villa': 888,
      '1758': 890, 'townhouse': 890,
      '1760': 892, 'penthouse': 892,
      '1762': 894, 'duplex': 894,
      '1764': 896, 'land': 896,
      '1766': 898, 'commercial': 898,
      '1768': 900, 'office': 900,
      '1770': 902, 'retail': 902
    },
    spaToLead: {
      '886': '1754',
      '888': '1756',
      '890': '1758',
      '892': '1760',
      '894': '1762',
      '896': '1764',
      '898': '1766',
      '900': '1768',
      '902': '1770'
    }
  },

  // Property Sub-type: Lead (2098 Standard... 2110 Penthouse) <-> SPA (872 Standard... 884 Penthouse)
  propertySubType: {
    leadToSpa: {
      '2098': 872, 'standard': 872,
      '2100': 874, 'luxury': 874,
      '2102': 876, 'ultra luxury': 876,
      '2104': 878, 'simplex': 878,
      '2106': 880, 'duplex': 880,
      '2108': 882, 'triplex': 882,
      '2110': 884, 'penthouse': 884
    },
    spaToLead: {
      '872': '2098',
      '874': '2100',
      '876': '2102',
      '878': '2104',
      '880': '2106',
      '882': '2108',
      '884': '2110'
    }
  },

  // Furnished: Lead (1794 Furnished, 1796 Semi, 1798 Unfurnished) <-> SPA (736 Furnished, 738 Semi, 740 Unfurnished)
  furnished: {
    leadToSpa: {
      '1794': 736, 'furnished': 736, 'fully-furnished': 736,
      '1796': 738, 'semi-furnished': 738,
      '1798': 740, 'unfurnished': 740
    },
    spaToLead: {
      '736': '1794',
      '738': '1796',
      '740': '1798'
    }
  },

  // Record Type: Lead (2230 Residential... 2240 Land/Plot) <-> SPA (1070 Residential... 1080 Land/Plot)
  recordType: {
    leadToSpa: {
      '2230': 1070, 'residential': 1070,
      '2232': 1072, 'commercial': 1072,
      '2234': 1074, 'off-plan': 1074,
      '2236': 1076, 'secondary / resale': 1076, 'resale': 1076,
      '2238': 1078, 'rental': 1078,
      '2240': 1080, 'land / plot': 1080, 'land': 1080
    },
    spaToLead: {
      '1070': '2230',
      '1072': '2232',
      '1074': '2234',
      '1076': '2236',
      '1078': '2238',
      '1080': '2240'
    }
  },

  // Rental Frequency: Lead (1998 Monthly... 2008 None) <-> SPA (762 Monthly... 772 None)
  hoaFrequency: {
    leadToSpa: {
      '1998': 762, 'monthly': 762,
      '2000': 764, 'quarterly': 764,
      '2002': 766, 'semi-annually': 766,
      '2004': 768, 'annually': 768,
      '2006': 770, 'included in rent': 770,
      '2008': 772, 'none': 772
    },
    spaToLead: {
      '762': '1998',
      '764': '2000',
      '766': '2002',
      '768': '2004',
      '770': '2006',
      '772': '2008'
    }
  },

  // Number of Cheques: Lead (2440/1846 1 Cheque... 2450/1854 12 Cheques) <-> SPA (2432 1 Cheque... 2440 12 Cheque)
  cheques: {
    leadToSpa: {
      '2440': 2432, '1846': 2432, '1 cheque': 2432, '1': 2432,
      '2442': 2434, '2444': 2434, '1848': 2434, '2 cheque': 2434, '2 cheques': 2434, '2': 2434,
      '2446': 2436, '1850': 2436, '4 cheque': 2436, '4 cheques': 2436, '4': 2436,
      '2448': 2438, '1852': 2438, '6 cheque': 2438, '6 cheques': 2438, '6': 2438,
      '2450': 2440, '1854': 2440, '12 cheque': 2440, '12 cheques': 2440, '12': 2440
    },
    spaToLead: {
      '2432': '2440',
      '2434': '2446',
      '2436': '2446',
      '2438': '2448',
      '2440': '2450'
    }
  },

  // Completion Status: Lead (1944 Off-Plan... 1952 Ready) <-> SPA (702 Off-Plan... 710 Ready)
  completionStatus: {
    leadToSpa: {
      '1944': 702, 'off-plan': 702,
      '1946': 704, 'under construction': 704,
      '1948': 706, 'completed': 706,
      '1950': 708, 'handover': 708,
      '1952': 710, 'ready': 710
    },
    spaToLead: {
      '702': '1944',
      '704': '1946',
      '706': '1948',
      '708': '1950',
      '710': '1952'
    }
  },

  // Tenancy / Occupancy Status: Lead (1824 Vacant on Transfer... 1832 Vacant) <-> SPA (836 Vacant on Transfer... 844 Vacant)
  occupancy: {
    leadToSpa: {
      '1824': 836, 'vacant on transfer': 836,
      '1826': 838, 'owner occupied': 838,
      '1828': 840, 'rented': 840,
      '1830': 842, 'under notice': 842,
      '1832': 844, 'vacant': 844
    },
    spaToLead: {
      '836': '1824',
      '838': '1826',
      '840': '1828',
      '842': '1830',
      '844': '1832'
    }
  }
};

/**
 * Complete bidirectional mapping dictionary between Lead field codes and Listing SPA (1058) properties
 */
const LISTING_FIELD_MAP = [
  // 1. General Overview
  { leadCode: 'UF_CRM_1791952409183', leadAltCodes: ['UF_CRM_LISTING_NAME', 'TITLE'], spaKey: 'title', spaCrmCode: 'TITLE', type: 'string', label: 'Listing Title' },
  { leadCode: 'STATUS_ID', spaKey: 'stageId', spaCrmCode: 'STAGE_ID', type: 'stage', label: 'Stage' },
  { leadCode: 'ASSIGNED_BY_ID', spaKey: 'assignedById', spaCrmCode: 'ASSIGNED_BY_ID', type: 'user', label: 'Responsible Person' },
  { leadCode: 'UF_CRM_1791952650167', leadAltCodes: ['UF_CRM_LISTING_TYPE'], spaKey: 'ufCrm16_1790154808', spaCrmCode: 'UF_CRM_16_1790154808', type: 'enumeration', enumCategory: 'listingType', label: 'Listing Type' },
  { leadCode: 'UF_CRM_1791970897872', leadAltCodes: ['UF_CRM_EXCLUSIVE'], spaKey: 'ufCrm16Exclusive', spaCrmCode: 'UF_CRM_16_EXCLUSIVE', type: 'boolean', label: 'Listing Agreement' },
  { leadCode: 'XML_ID', leadAltCodes: ['UF_CRM_LISTING_ID', 'ID'], spaKey: 'xmlId', spaCrmCode: 'XML_ID', type: 'string', label: 'External ID' },

  // 2. Seller & Source
  { leadCode: 'COMPANY_ID', leadAltCodes: ['UF_CRM_DEVELOPER_1'], spaKey: 'companyId', spaCrmCode: 'COMPANY_ID', type: 'crm_company', label: 'Company' },
  { leadCode: 'CONTACT_ID', spaKey: 'contactId', spaCrmCode: 'CONTACT_ID', type: 'crm_contact', label: 'Contact' },
  { leadCode: 'UF_CRM_CONTACTS', spaKey: 'contactIds', spaCrmCode: 'CONTACT_IDS', type: 'crm_contact_multi', label: 'Contacts' },
  { leadCode: 'UF_CRM_PROPERTY', spaKey: 'parentId1052', spaCrmCode: 'PARENT_ID_1052', type: 'crm_entity', label: 'Master Property' },
  { leadCode: 'UF_CRM_DEVELOPER_NAME', spaKey: 'ufCrm16DeveloperName', spaCrmCode: 'UF_CRM_16_DEVELOPER_NAME', type: 'string', label: 'Developer Name' },
  { leadCode: 'UF_CRM_DEVELOPER_1', spaKey: 'ufCrm16_1791172932', spaCrmCode: 'UF_CRM_16_1791172932', type: 'crm_entity', label: 'Developer CRM Entity' },

  // 3. Property Specifications
  { leadCode: 'UF_CRM_1791952050535', spaKey: 'ufCrm16PropertyType', spaCrmCode: 'UF_CRM_16_PROPERTY_TYPE', type: 'enumeration', enumCategory: 'propertyType', label: 'Property Type' },
  { leadCode: 'UF_CRM_PROPERTY_SUB_TYPE', spaKey: 'ufCrm16PropertySubType', spaCrmCode: 'UF_CRM_16_PROPERTY_SUB_TYPE', type: 'enumeration', enumCategory: 'propertySubType', label: 'Property Sub-type' },
  { leadCode: 'UF_CRM_BEDROOMS', leadAltCodes: ['UF_CRM_1791966366775'], spaKey: 'ufCrm16_1791172802', spaCrmCode: 'UF_CRM_16_1791172802', type: 'number', label: 'Bedrooms' },
  { leadCode: 'UF_CRM_BATHROOMS', leadAltCodes: ['UF_CRM_1791966408374'], spaKey: 'ufCrm16_1791172787', spaCrmCode: 'UF_CRM_16_1791172787', type: 'number', label: 'Bathrooms' },
  { leadCode: 'UF_CRM_BUA', spaKey: 'ufCrm16SqFt', spaCrmCode: 'UF_CRM_16_SQ_FT', type: 'number', label: 'Built-up Area (Sq Ft)' },
  { leadCode: 'UF_CRM_PLOT_AREA', spaKey: 'ufCrm16PlotSize', spaCrmCode: 'UF_CRM_16_PLOT_SIZE', type: 'number', label: 'Plot Area (Sq Ft)' },
  { leadCode: 'UF_CRM_UNIT_NO', spaKey: 'ufCrm16UnitNumber', spaCrmCode: 'UF_CRM_16_UNIT_NUMBER', type: 'string', label: 'Unit Number' },
  { leadCode: 'UF_CRM_FLOOR', spaKey: 'ufCrm16Floor', spaCrmCode: 'UF_CRM_16_FLOOR', type: 'integer', label: 'Floor Number' },
  { leadCode: 'UF_CRM_1791969936048', spaKey: 'ufCrm16Furnished', spaCrmCode: 'UF_CRM_16_FURNISHED', type: 'enumeration', enumCategory: 'furnished', label: 'Furnished Status' },
  { leadCode: 'UF_CRM_RECORDTYPEID', spaKey: 'ufCrm16RecordType', spaCrmCode: 'UF_CRM_16_RECORD_TYPE', type: 'enumeration', enumCategory: 'recordType', label: 'Offering / Record Type' },
  { leadCode: 'UF_CRM_NUMBEROFPARKINGSPACES', leadAltCodes: ['UF_CRM_PARKING'], spaKey: 'ufCrm16ParkingSpaces', spaCrmCode: 'UF_CRM_16_PARKING_SPACES', type: 'integer', label: 'Parking Spaces' },

  // 4. Location & Geography
  { leadCode: 'UF_CRM_PROJECT_NAME', leadAltCodes: ['UF_CRM_PROJECT_1'], spaKey: 'ufCrm16ProjectName', spaCrmCode: 'UF_CRM_16_PROJECT_NAME', type: 'string', label: 'Project / Building Name' },
  { leadCode: 'UF_CRM_BUILDING_DUBIZZLE', leadAltCodes: ['UF_CRM_BUILDING_BAYUT'], spaKey: 'ufCrm16BuildingBayut', spaCrmCode: 'UF_CRM_16_BUILDING_BAYUT', type: 'string', label: 'Building / Tower Name (Bayut)' },
  { leadCode: 'UF_CRM_COMMUNITY_PROPERTYFINDER', spaKey: 'ufCrm16CommunityPropertyfinder', spaCrmCode: 'UF_CRM_16_COMMUNITY_PROPERTYFINDER', type: 'string', label: 'Community - Propertyfinder' },
  { leadCode: 'UF_CRM_SUB_COMMUNITY_PROPERTYFINDER', spaKey: 'ufCrm16SubCommunityPropertyfinder', spaCrmCode: 'UF_CRM_16_SUB_COMMUNITY_PROPERTYFINDER', type: 'string', label: 'Sub-Community' },
  { leadCode: 'UF_CRM_NEIGHBORHOOD', spaKey: 'ufCrm16_1791173032', spaCrmCode: 'UF_CRM_16_1791173032', type: 'string', label: 'Neighborhood / Community' },
  { leadCode: 'UF_CRM_CITY', spaKey: 'ufCrm16_1791172815', spaCrmCode: 'UF_CRM_16_1791172815', type: 'string', label: 'City' },
  { leadCode: 'UF_CRM_COUNTRY', spaKey: 'ufCrm16_1791172854', spaCrmCode: 'UF_CRM_16_1791172854', type: 'string', label: 'Country' },
  { leadCode: 'UF_CRM_STREET', spaKey: 'ufCrm16Street', spaCrmCode: 'UF_CRM_16_STREET', type: 'string', label: 'Street' },
  { leadCode: 'UF_CRM_1791970638065', leadAltCodes: ['ADDRESS'], spaKey: 'ufCrm16_1791172676', spaCrmCode: 'UF_CRM_16_1791172676', type: 'address', label: 'Address' },
  { leadCode: 'UF_CRM_LATITUDE', spaKey: 'ufCrm16Latitude', spaCrmCode: 'UF_CRM_16_LATITUDE', type: 'number', label: 'Latitude' },
  { leadCode: 'UF_CRM_LONGITUDE', spaKey: 'ufCrm16Longitude', spaCrmCode: 'UF_CRM_16_LONGITUDE', type: 'number', label: 'Longitude' },

  // 5. Pricing & Terms
  { leadCode: 'UF_CRM_LISTING_PRICE', leadAltCodes: ['UF_CRM_1791963299133'], spaKey: 'ufCrm16_1790154936', spaCrmCode: 'UF_CRM_16_1790154936', type: 'money', label: 'Listing Price (AED)' },
  { leadCode: 'UF_CRM_PRICE_PER_SQUARE_FOOT', spaKey: 'ufCrm16ListPricePerSqFt', spaCrmCode: 'UF_CRM_16_LIST_PRICE_PER_SQ_FT', type: 'money', label: 'Price Per Sq Ft' },
  { leadCode: 'UF_CRM_BUYERAGENTCOMMISSION', spaKey: 'ufCrm16BuyersAgentCommission', spaCrmCode: 'UF_CRM_16_BUYERS_AGENT_COMMISSION', type: 'number', label: 'Agency Commission (%)' },
  { leadCode: 'UF_CRM_SERVICE_CHARGE', spaKey: 'ufCrm16ServiceCharge', spaCrmCode: 'UF_CRM_16_SERVICE_CHARGE', type: 'money', label: 'Service Charges (Annual)' },
  { leadCode: 'UF_CRM_HOAFREQUENCY', spaKey: 'ufCrm16HoaFrequency', spaCrmCode: 'UF_CRM_16_HOA_FREQUENCY', type: 'enumeration', enumCategory: 'hoaFrequency', label: 'Rental Frequency' },
  { leadCode: 'UF_CRM_PETDEPOSIT', spaKey: 'ufCrm16PetDeposit', spaCrmCode: 'UF_CRM_16_PET_DEPOSIT', type: 'money', label: 'Security Deposit (AED)' },
  { leadCode: 'UF_CRM_1792139023', leadAltCodes: ['UF_CRM_CHEQUES', 'UF_CRM_CHEQUES_1'], spaKey: 'ufCrm16_1792127520', spaCrmCode: 'UF_CRM_16_1792127520', type: 'enumeration', enumCategory: 'cheques', label: 'Number of Cheques' },

  // 6. Dates & Timeline
  { leadCode: 'UF_CRM_AVAIL_DATE', leadAltCodes: ['BEGINDATE'], spaKey: 'begindate', spaCrmCode: 'BEGINDATE', type: 'date', label: 'Started on' },
  { leadCode: 'UF_CRM_AVAILABLE_TO', leadAltCodes: ['CLOSEDATE'], spaKey: 'closedate', spaCrmCode: 'CLOSEDATE', type: 'date', label: 'Finished on' },
  { leadCode: 'UF_CRM_DATE_AVAILABLE', spaKey: 'ufCrm16_1790155057', spaCrmCode: 'UF_CRM_16_1790155057', type: 'date', label: 'Available From' },
  { leadCode: 'UF_CRM_COMPLETIONDATE', spaKey: 'ufCrm16CompletionDate', spaCrmCode: 'UF_CRM_16_COMPLETION_DATE', type: 'date', label: 'Handover / Completion Date' },
  { leadCode: 'UF_CRM_COMPLETION_STATUS', spaKey: 'ufCrm16CompletionStatus', spaCrmCode: 'UF_CRM_16_COMPLETION_STATUS', type: 'enumeration', enumCategory: 'completionStatus', label: 'Completion Status' },
  { leadCode: 'UF_CRM_1791970832589', spaKey: 'ufCrm16Occupancy', spaCrmCode: 'UF_CRM_16_OCCUPANCY', type: 'enumeration', enumCategory: 'occupancy', label: 'Tenancy Status' },
  { leadCode: 'UF_CRM_EXPIRATION_DATE', spaKey: 'ufCrm16ExpirationDate', spaCrmCode: 'UF_CRM_16_EXPIRATION_DATE', type: 'date', label: 'Tenancy End / Mandate Expiry Date' },

  // 7. Portals & Marketing
  { leadCode: 'UF_CRM_1791970864836', leadAltCodes: ['UF_CRM_RERA_PERMIT'], spaKey: 'ufCrm16ReraPermitNumber', spaCrmCode: 'UF_CRM_16_RERA_PERMIT_NUMBER', type: 'string', label: 'RERA Permit Number' },
  { leadCode: 'UF_CRM_TRAKHEESI_PERMIT_NO', spaKey: 'ufCrm16_1791787455285', spaCrmCode: 'UF_CRM_16_1791787455285', type: 'string', label: 'Trakheesi Permit No' },
  { leadCode: 'UF_CRM_TRAKHEESI_EXPIRY', leadAltCodes: ['UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE'], spaKey: 'ufCrm16_1791787502111', spaCrmCode: 'UF_CRM_16_1791787502111', type: 'date', label: 'Trakheesi Permit Expiry Date' },
  { leadCode: 'UF_CRM_QR_CODE_LINK', spaKey: 'ufCrm16QrCodeLink', spaCrmCode: 'UF_CRM_16_QR_CODE_LINK', type: 'url', label: 'DLD QR / Permit URL' },
  { leadCode: 'UF_CRM_BAYUT_ID', spaKey: 'ufCrm16_1790155092', spaCrmCode: 'UF_CRM_16_1790155092', type: 'string', label: 'Bayut Listing ID' },
  { leadCode: 'UF_CRM_PF_ID', leadAltCodes: ['UF_CRM_1792151466'], spaKey: 'ufCrm16PropertyFinderListingId', spaCrmCode: 'UF_CRM_16_PROPERTY_FINDER_LISTING_ID', type: 'string', label: 'Propertyfinder Listing ID' },
  { leadCode: 'UF_CRM_DUBIZZLE_REGION', spaKey: 'ufCrm16DubizzleRegion', spaCrmCode: 'UF_CRM_16_DUBIZZLE_REGION', type: 'string', label: 'Dubizzle Listing ID / Region' },
  { leadCode: 'UF_CRM_SYSTEMALLOWEDFORPORTALS', leadAltCodes: ['UF_CRM_PORTALS_ENABLED'], spaKey: 'ufCrm16SystemAllowedForPortals', spaCrmCode: 'UF_CRM_16_SYSTEM_ALLOWED_FOR_PORTALS', type: 'boolean', label: 'Bayut / Dubizzle Feed Toggle' },
  { leadCode: 'UF_CRM_UK_SUMMARY_DESCRIPTION', spaKey: 'ufCrm16SummaryDescription', spaCrmCode: 'UF_CRM_16_SUMMARY_DESCRIPTION', type: 'string', label: 'Portal Title' },
  { leadCode: 'UF_CRM_DESCRIPTION', spaKey: 'ufCrm16Description', spaCrmCode: 'UF_CRM_16_DESCRIPTION', type: 'textarea', label: 'Portal Description' },

  // 8. Media & Documents
  { leadCode: 'UF_CRM_PRIMARY_IMAGE', spaKey: 'ufCrm16_1791173118', spaCrmCode: 'UF_CRM_16_1791173118', type: 'file', label: 'Primary Listing Image' },
  { leadCode: 'UF_CRM_PHOTOS', spaKey: 'ufCrm16_1791881642219', spaCrmCode: 'UF_CRM_16_1791881642219', type: 'file', label: 'Photos (Gallery)' },
  { leadCode: 'UF_CRM_DOCS', spaKey: 'ufCrm16_1791172957', spaCrmCode: 'UF_CRM_16_1791172957', type: 'file', label: 'Docs & Attachments' },
  { leadCode: 'UF_CRM_PHOTOS_AND_DOCUMENTS', leadAltCodes: ['UF_CRM_FLOOR_PLAN'], spaKey: 'ufCrm16_1791544736052', spaCrmCode: 'UF_CRM_16_1791544736052', type: 'file', label: 'Floor Plan' },
  { leadCode: 'UF_CRM_TITLE_DEED', spaKey: 'ufCrm16TitleDeed', spaCrmCode: 'UF_CRM_16_TITLE_DEED', type: 'file', label: 'Title Deed / Ownership Proof' },
  { leadCode: 'UF_CRM_FORM_A_DOC', spaKey: 'ufCrm16_1791787381785', spaCrmCode: 'UF_CRM_16_1791787381785', type: 'file', label: 'Form A Document' },
  { leadCode: 'UF_CRM_WEBSITE_URL', spaKey: 'ufCrm16WebsiteUrl', spaCrmCode: 'UF_CRM_16_WEBSITE_URL', type: 'url', label: 'Brochure URL / File' },
  { leadCode: 'UF_CRM_LISTING_WEBSITE', spaKey: 'ufCrm16ListingWebsite', spaCrmCode: 'UF_CRM_16_LISTING_WEBSITE', type: 'tour_url', label: '360 Virtual Tour Link' }
];

/**
 * Returns complete field mapping metadata for external consumers, UI and test suites
 */
function getListingFieldMapping() {
  const fieldsConfig = require('./config').loadFieldsConfig();
  return {
    success: true,
    entityTypeId: 1058,
    layoutDriverLead: 'UF_CRM_1791952650167',
    layoutDriverSpa: 'ufCrm16_1790154808',
    layouts: fieldsConfig.listingDynamicLayout?.layoutMeta || {},
    fieldMap: LISTING_FIELD_MAP,
    enumMaps: LISTING_ENUM_MAPS,
    sections: fieldsConfig.listingLayout?.sections || []
  };
}

/**
 * Synchronize Lead fields to linked Listing Smart Process Item (SPA 1058)
 * @param {string|number} leadId 
 * @param {string} domain 
 * @returns {Promise<Object>}
 */
async function syncListingSpaFromLead(leadId, domain = 'latest') {
  if (!leadId) return null;
  const cleanLeadId = String(leadId).replace(/\D/g, '');
  if (!cleanLeadId) return null;

  try {
    const lead = await BitrixClient.crmLeadGet(cleanLeadId, domain);
    if (!lead) return null;

    // 1. Locate linked Listing SPA item (by lead.UF_CRM_LISTING or xmlId)
    let spaItemId = null;
    let spaItem = null;

    if (lead.UF_CRM_LISTING) {
      const match = String(lead.UF_CRM_LISTING).match(/\d+/);
      if (match) {
        const potentialId = parseInt(match[0], 10);
        const getRes = await BitrixClient.call('crm.item.get', { entityTypeId: 1058, id: potentialId }, domain).catch(() => null);
        if (getRes?.item) {
          spaItemId = potentialId;
          spaItem = getRes.item;
        }
      }
    }

    if (!spaItemId) {
      const listByXml = await BitrixClient.call('crm.item.list', {
        entityTypeId: 1058,
        filter: { '=xmlId': cleanLeadId }
      }, domain).catch(() => ({ items: [] }));

      if (listByXml?.items?.length > 0) {
        spaItem = listByXml.items[0];
        spaItemId = spaItem.id;
      }
    }

    if (!spaItemId) {
      return { status: 'no_linked_listing_spa', leadId: cleanLeadId };
    }

    if (!spaItem) {
      const getRes = await BitrixClient.call('crm.item.get', { entityTypeId: 1058, id: spaItemId }, domain).catch(() => null);
      spaItem = getRes?.item;
    }

    if (!spaItem) {
      return { status: 'listing_spa_not_found', spaItemId };
    }

    // 2. Map fields from Lead to Listing SPA item
    const updates = {};

    for (const mapping of LISTING_FIELD_MAP) {
      // Find value from lead using primary leadCode or any leadAltCodes
      let rawVal = lead[mapping.leadCode];
      if ((rawVal === undefined || rawVal === null || rawVal === '') && mapping.leadAltCodes) {
        for (const alt of mapping.leadAltCodes) {
          if (lead[alt] !== undefined && lead[alt] !== null && lead[alt] !== '') {
            rawVal = lead[alt];
            break;
          }
        }
      }

      if (rawVal === undefined || rawVal === null || rawVal === '') continue;

      const targetKey = mapping.spaKey;
      let targetVal = rawVal;

      // Handle enum translation
      if (mapping.type === 'enumeration' && mapping.enumCategory && LISTING_ENUM_MAPS[mapping.enumCategory]) {
        const mapCategory = LISTING_ENUM_MAPS[mapping.enumCategory];
        const key = String(rawVal).trim().toLowerCase();
        const mappedId = mapCategory.leadToSpa[key] || mapCategory.leadToSpa[String(rawVal).trim()];
        if (mappedId !== undefined) {
          targetVal = mappedId;
        }
      } else if (mapping.type === 'money') {
        const num = parseFloat(String(rawVal).split('|')[0]);
        if (!isNaN(num)) targetVal = num;
      } else if (mapping.type === 'number' || mapping.type === 'integer') {
        const num = parseFloat(rawVal);
        if (!isNaN(num)) targetVal = num;
      } else if (mapping.type === 'boolean') {
        targetVal = rawVal === 'Y' || rawVal === true || rawVal === 1 || rawVal === '1';
      }

      // Check if SPA item value actually differs
      const existingVal = spaItem[targetKey];
      if (String(existingVal ?? '') !== String(targetVal ?? '')) {
        updates[targetKey] = targetVal;
      }
    }

    // 3. Apply updates to Bitrix Listing SPA item
    if (Object.keys(updates).length > 0) {
      console.log(`[SPA SYNC] Updating Listing SPA Item #${spaItemId} from Lead #${cleanLeadId}:`, Object.keys(updates));
      await BitrixClient.call('crm.item.update', {
        entityTypeId: 1058,
        id: spaItemId,
        fields: updates
      }, domain);

      // Permanently record link on Lead if not already linked
      if (!lead.UF_CRM_LISTING) {
        await BitrixClient.crmLeadUpdate(cleanLeadId, { UF_CRM_LISTING: String(spaItemId) }, domain).catch(() => {});
      }

      return { status: 'updated', spaItemId, leadId: cleanLeadId, updates };
    }

    return { status: 'unchanged', spaItemId, leadId: cleanLeadId };
  } catch (err) {
    console.error(`[SPA SYNC] Error synchronizing Listing Lead #${leadId}:`, err.message);
    return { status: 'error', error: err.message };
  }
}

/**
 * Synchronize Listing SPA fields back to Lead
 * @param {string|number} listingId 
 * @param {string} domain 
 * @returns {Promise<Object>}
 */
async function syncLeadFromListingSpa(listingId, domain = 'latest') {
  if (!listingId) return null;
  const cleanListingId = String(listingId).replace(/\D/g, '');
  if (!cleanListingId) return null;

  try {
    const itemRes = await BitrixClient.call('crm.item.get', { entityTypeId: 1058, id: cleanListingId }, domain);
    const item = itemRes?.item;
    if (!item) return { status: 'listing_not_found', listingId: cleanListingId };

    // Locate linked Lead
    const leadId = item.xmlId;
    if (!leadId) {
      return { status: 'no_linked_lead', listingId: cleanListingId };
    }

    const leadUpdates = {};
    for (const mapping of LISTING_FIELD_MAP) {
      const rawVal = item[mapping.spaKey];
      if (rawVal === undefined || rawVal === null || rawVal === '') continue;

      let targetVal = rawVal;
      if (mapping.type === 'enumeration' && mapping.enumCategory && LISTING_ENUM_MAPS[mapping.enumCategory]) {
        const mapCategory = LISTING_ENUM_MAPS[mapping.enumCategory];
        const key = String(rawVal).trim().toLowerCase();
        const mappedLeadId = mapCategory.spaToLead[key] || mapCategory.spaToLead[String(rawVal).trim()];
        if (mappedLeadId !== undefined) {
          targetVal = mappedLeadId;
        }
      }

      leadUpdates[mapping.leadCode] = targetVal;
    }

    if (Object.keys(leadUpdates).length > 0) {
      await BitrixClient.crmLeadUpdate(leadId, leadUpdates, domain);
      return { status: 'updated', leadId, listingId: cleanListingId, updates: leadUpdates };
    }

    return { status: 'unchanged', leadId, listingId: cleanListingId };
  } catch (err) {
    console.error(`[SPA SYNC] Error synchronizing Lead from Listing #${listingId}:`, err.message);
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  LEAD_SOURCE_TYPE_MAP,
  URGENCY_MAP,
  STATE_MAP,
  STATE_ENUM_TO_LABEL,
  STATE_LABEL_TO_ENUM,
  CITY_BAYUT_MAP,
  CITY_PROPERTYFINDER_MAP,
  syncEnquirySpaFromLead,
  LISTING_ENUM_MAPS,
  LISTING_FIELD_MAP,
  getListingFieldMapping,
  syncListingSpaFromLead,
  syncLeadFromListingSpa
};

