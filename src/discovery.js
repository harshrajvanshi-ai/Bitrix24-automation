/**
 * src/discovery.js
 * Automated discovery service for Lead Type custom field, enum item IDs,
 * pipeline stages (Enquiry Leads / Listing Leads), and field presence checks.
 */

const BitrixClient = require('./bitrixClient');
const StorageManager = require('./storage');
const config = require('./config');

class DiscoveryService {
  /**
   * Discover the Lead Type field and its enum item IDs for Enquiry & Listing
   */
  static async discoverLeadTypeField(identifier = 'latest') {
    const userFields = await BitrixClient.crmLeadUserfieldList({}, identifier);
    const fieldsConfig = config.loadFieldsConfig();
    const targetFieldCode = fieldsConfig.leadTypeField || 'UF_CRM_LEAD_TYPE';

    let matchedField = null;

    // 1. Try finding by exact configured code
    matchedField = userFields.find(f => f.FIELD_NAME === targetFieldCode);

    // 2. Fallback: Search by label containing "lead type" or "type"
    if (!matchedField) {
      matchedField = userFields.find(f => {
        const label = (f.EDIT_FORM_LABEL || f.LIST_COLUMN_LABEL || '').toLowerCase();
        return label.includes('lead type') || label.includes('type of lead');
      });
    }

    // 3. Fallback: Search any enumeration field whose LIST items contain "enq" and "list"
    if (!matchedField) {
      matchedField = userFields.find(f => {
        if (!Array.isArray(f.LIST)) return false;
        const vals = f.LIST.map(l => (l.VALUE || '').toLowerCase());
        return vals.some(v => v.includes('enq') || v.includes('inq')) && vals.some(v => v.includes('list'));
      });
    }

    if (!matchedField) {
      console.warn(`[DISCOVERY] Custom field for Lead Type not found (checked '${targetFieldCode}')`);
      return {
        fieldCode: targetFieldCode,
        found: false,
        enquiryItemId: null,
        listingItemId: null,
        items: []
      };
    }

    // Inspect enumeration items (if user type is enumeration)
    const items = matchedField.LIST || [];
    let enquiryItem = null;
    let listingItem = null;

    items.forEach(item => {
      const val = (item.VALUE || item.value || '').toLowerCase().trim();
      if (val === 'enquiry' || val === 'enqiry' || val === 'inquiry' || val.includes('enq')) enquiryItem = item;
      if (val === 'listing' || val.includes('list')) listingItem = item;
    });

    const result = {
      fieldCode: matchedField.FIELD_NAME,
      userTypeId: matchedField.USER_TYPE_ID,
      found: true,
      enquiryItemId: enquiryItem ? enquiryItem.ID : null,
      listingItemId: listingItem ? listingItem.ID : null,
      items: items.map(i => ({ id: i.ID, value: i.VALUE }))
    };

    console.log(`[DISCOVERY] Discovered Lead Type field '${result.fieldCode}':`, {
      enquiryItemId: result.enquiryItemId,
      listingItemId: result.listingItemId
    });

    return result;
  }

  /**
   * Discover Lead pipeline stages and resolve Enquiry Leads & Listing Leads stages
   */
  static async discoverStages(autoCreateIfMissing = false, identifier = 'latest') {
    const stages = await BitrixClient.crmStatusList({ ENTITY_ID: 'STATUS' }, identifier);
    const fieldsConfig = config.loadFieldsConfig();

    const targetEnquiryName = (fieldsConfig.stageMapping?.enquiryStage || 'Enquiry Leads').toLowerCase().trim();
    const targetListingName = (fieldsConfig.stageMapping?.listingStage || 'Listing Leads').toLowerCase().trim();

    let enquiryStage = null;
    let listingStage = null;
    const finalStages = [];
    const createdStages = [];

    stages.forEach(stage => {
      const name = (stage.NAME || '').toLowerCase().trim();
      // Track terminal stages (Success 'S' or Failure 'F' or known terminal IDs)
      if (stage.SEMANTICS === 'S' || stage.SEMANTICS === 'F' || stage.STATUS_ID === 'CONVERTED' || stage.STATUS_ID === 'JUNK') {
        finalStages.push(stage.STATUS_ID);
      }

      if (name === targetEnquiryName || name === 'enquiry leads' || name === 'enquiries') {
        enquiryStage = stage;
      }
      if (name === targetListingName || name === 'listing leads' || name === 'listings') {
        listingStage = stage;
      }
    });

    // Auto-create missing stages if requested
    if (!enquiryStage && autoCreateIfMissing) {
      console.log(`[DISCOVERY] Creating missing stage: "Enquiry Leads"...`);
      const newEnquiry = await BitrixClient.crmStatusAdd({
        ENTITY_ID: 'STATUS',
        STATUS_ID: 'ENQUIRY_LEADS',
        NAME: 'Enquiry Leads',
        SORT: 20
      }, identifier);
      enquiryStage = { STATUS_ID: 'ENQUIRY_LEADS', NAME: 'Enquiry Leads', id: newEnquiry };
      createdStages.push('Enquiry Leads');
    }

    if (!listingStage && autoCreateIfMissing) {
      console.log(`[DISCOVERY] Creating missing stage: "Listing Leads"...`);
      const newListing = await BitrixClient.crmStatusAdd({
        ENTITY_ID: 'STATUS',
        STATUS_ID: 'LISTING_LEADS',
        NAME: 'Listing Leads',
        SORT: 30
      }, identifier);
      listingStage = { STATUS_ID: 'LISTING_LEADS', NAME: 'Listing Leads', id: newListing };
      createdStages.push('Listing Leads');
    }

    const result = {
      enquiryStageId: enquiryStage ? enquiryStage.STATUS_ID : null,
      listingStageId: listingStage ? listingStage.STATUS_ID : null,
      enquiryStageName: enquiryStage ? enquiryStage.NAME : null,
      listingStageName: listingStage ? listingStage.NAME : null,
      finalStages,
      createdStages,
      allStages: stages.map(s => ({ id: s.STATUS_ID, name: s.NAME, semantics: s.SEMANTICS }))
    };

    console.log('[DISCOVERY] Discovered Lead Stages:', {
      enquiryStageId: result.enquiryStageId,
      listingStageId: result.listingStageId,
      finalStagesCount: finalStages.length
    });

    return result;
  }

  /**
   * Verify which configured fields exist in Bitrix24 and which are missing
   */
  static async checkConfiguredFields(identifier = 'latest') {
    const userFields = await BitrixClient.crmLeadUserfieldList({}, identifier);
    const existingFieldMap = new Map();
    userFields.forEach(f => existingFieldMap.set(f.FIELD_NAME, f));

    const fieldsConfig = config.loadFieldsConfig();
    const allConfigured = [
      ...(fieldsConfig.enquiryFields || []),
      ...(fieldsConfig.listingFields || [])
    ];

    const uniqueConfigured = [];
    const seen = new Set();
    allConfigured.forEach(field => {
      if (!seen.has(field.code)) {
        seen.add(field.code);
        uniqueConfigured.push(field);
      }
    });

    const existing = [];
    const missing = [];

    uniqueConfigured.forEach(cfg => {
      if (existingFieldMap.has(cfg.code)) {
        existing.push({
          ...cfg,
          remoteField: existingFieldMap.get(cfg.code)
        });
      } else {
        missing.push(cfg);
      }
    });

    return {
      existing,
      missing,
      totalConfigured: uniqueConfigured.length,
      userFields
    };
  }

  /**
   * Create custom user field on CRM Lead
   */
  static async createCustomField(fieldDef, identifier = 'latest') {
    let userTypeId = 'string';
    switch (fieldDef.type) {
      case 'text':
      case 'string':
        userTypeId = fieldDef.type === 'text' ? 'string' : 'string';
        break;
      case 'number':
        userTypeId = 'double';
        break;
      case 'money':
        userTypeId = 'money';
        break;
      case 'date':
        userTypeId = 'date';
        break;
      case 'boolean':
        userTypeId = 'boolean';
        break;
      case 'enumeration':
        userTypeId = 'enumeration';
        break;
      default:
        userTypeId = 'string';
    }

    const payload = {
      FIELD_NAME: fieldDef.code.toUpperCase(),
      USER_TYPE_ID: userTypeId,
      MANDATORY: fieldDef.required ? 'Y' : 'N',
      MULTIPLE: fieldDef.multiple ? 'Y' : 'N',
      EDIT_FORM_LABEL: { en: fieldDef.label },
      LIST_COLUMN_LABEL: { en: fieldDef.label }
    };

    if (userTypeId === 'enumeration' && Array.isArray(fieldDef.options)) {
      payload.LIST = fieldDef.options.map((opt, idx) => ({
        VALUE: typeof opt === 'object' ? opt.value : opt,
        SORT: (idx + 1) * 10
      }));
    }

    console.log(`[DISCOVERY] Creating custom field '${payload.FIELD_NAME}' on Lead...`);
    const fieldId = await BitrixClient.crmLeadUserfieldAdd(payload, identifier);
    return { success: true, fieldId, code: payload.FIELD_NAME };
  }

  /**
   * Run full discovery suite and save discovered parameters into persistent storage
   */
  static async runFullDiscovery(autoCreateStages = false, identifier = 'latest') {
    console.log('[DISCOVERY] Running complete discovery cycle...');
    const leadTypeInfo = await this.discoverLeadTypeField(identifier);
    const stagesInfo = await this.discoverStages(autoCreateStages, identifier);
    const fieldsCheck = await this.checkConfiguredFields(identifier);

    const discoveredData = {
      leadTypeField: leadTypeInfo.fieldCode,
      leadTypeFound: leadTypeInfo.found,
      leadTypeItems: {
        enquiryId: leadTypeInfo.enquiryItemId,
        listingId: leadTypeInfo.listingItemId,
        rawItems: leadTypeInfo.items
      },
      stages: {
        enquiryStageId: stagesInfo.enquiryStageId,
        listingStageId: stagesInfo.listingStageId,
        all: stagesInfo.allStages
      },
      finalStages: stagesInfo.finalStages
    };

    StorageManager.saveDiscoveredConfig(discoveredData);
    console.log('[DISCOVERY] Discovery completed and saved to storage.');

    return {
      leadType: leadTypeInfo,
      stages: stagesInfo,
      fields: fieldsCheck
    };
  }
}

module.exports = DiscoveryService;
