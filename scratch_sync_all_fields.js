const BitrixClient = require('./src/bitrixClient');
const fs = require('fs');

async function syncAllFields() {
  const audit = JSON.parse(fs.readFileSync('scratch_fields_audit.json', 'utf8'));

  const listingSpecific = audit.listing.userfields.filter(f => f.key.startsWith('ufCrm16_'));
  const enquirySpecific = audit.enquiry.userfields.filter(f => f.key.startsWith('ufCrm18_'));

  console.log(`Listing specific fields count: ${listingSpecific.length}`);
  console.log(`Enquiry specific fields count: ${enquirySpecific.length}`);

  // Fetch current Lead fields
  const currentLeadUfs = await BitrixClient.call('crm.lead.userfield.list');
  const existingNames = new Set(currentLeadUfs.map(f => f.FIELD_NAME.toUpperCase()));

  console.log(`Current Lead userfields count: ${existingNames.size}`);

  // Detailed fields from SPAs to make sure everything is in Lead
  const listingFieldDefs = [
    { code: 'UF_CRM_LISTING_TYPE', spaKey: 'ufCrm16_1790154808', label: 'Listing Type', type: 'enumeration', options: ['Exclusive', 'Non-Exclusive', 'Sole Agency', 'Open', 'Pocket'] },
    { code: 'UF_CRM_AVAILABLE_TO', spaKey: 'ufCrm16_1790155067', label: 'Available To Date', type: 'date' },
    { code: 'UF_CRM_BANK_OWNED', spaKey: 'ufCrm16_1791172751', label: 'Bank Owned / Distressed', type: 'boolean' },
    { code: 'UF_CRM_BASEMENT', spaKey: 'ufCrm16_1791172769', label: 'Basement Area', type: 'double' },
    { code: 'UF_CRM_CITY_BAYUT', spaKey: 'ufCrm16_1791172830', label: 'City (Bayut)', type: 'string' },
    { code: 'UF_CRM_CITY_PF', spaKey: 'ufCrm16_1791172841', label: 'City (Propertyfinder)', type: 'string' },
    { code: 'UF_CRM_COUNTRY', spaKey: 'ufCrm16_1791172854', label: 'Country', type: 'string' },
    { code: 'UF_CRM_DATE_OFFLINE', spaKey: 'ufCrm16_1791172883', label: 'Date Made Offline', type: 'date' },
    { code: 'UF_CRM_DATE_ONLINE', spaKey: 'ufCrm16_1791172904', label: 'Date Made Online', type: 'date' },
    { code: 'UF_CRM_NEIGHBORHOOD', spaKey: 'ufCrm16_1791173032', label: 'Neighborhood', type: 'string' },
    { code: 'UF_CRM_PHASE', spaKey: 'ufCrm16_1791173088', label: 'Project Phase', type: 'string' },
    { code: 'UF_CRM_FORM_A_DATE', spaKey: 'ufCrm16_1791544328094', label: 'Form A Signed Date', type: 'date' },
    { code: 'UF_CRM_TRAKHEESI_EXPIRY', spaKey: 'ufCrm16_1791787502111', label: 'Trakheesi Permit Expiry', type: 'date' },
    { code: 'UF_CRM_PRIMARY_IMAGE', spaKey: 'ufCrm16_1791173118', label: 'Primary Listing Image', type: 'file' },
    { code: 'UF_CRM_DOCS', spaKey: 'ufCrm16_1791172957', label: 'Property Title / Deed Docs', type: 'file' },
    { code: 'UF_CRM_FORM_A_DOC', spaKey: 'ufCrm16_1791787381785', label: 'Form A Signed Document', type: 'file' }
  ];

  const enquiryFieldDefs = [
    { code: 'UF_CRM_DEAL_VALUE', spaKey: 'ufCrm18_1791795658986', label: 'Expected Deal Value (AED)', type: 'money' },
    { code: 'UF_CRM_BATHS_MAX', spaKey: 'ufCrm18_1791175423', label: 'Bathrooms Max', type: 'integer' },
    { code: 'UF_CRM_BEACHFRONT', spaKey: 'ufCrm18_1791175449', label: 'Beachfront / Waterfront Preferred', type: 'boolean' },
    { code: 'UF_CRM_WATER_BODY', spaKey: 'ufCrm18_1791175466', label: 'Body of Water / View', type: 'string' },
    { code: 'UF_CRM_HOUSEHOLD', spaKey: 'ufCrm18_1791175633', label: 'Household Members / Family Size', type: 'string' },
    { code: 'UF_CRM_PARKING_REQ', spaKey: 'ufCrm18_1791175666', label: 'Parking Spaces Required', type: 'boolean' },
    { code: 'UF_CRM_SCHOOL', spaKey: 'ufCrm18_1791175730', label: 'Nearby Schools Preference', type: 'string' },
    { code: 'UF_CRM_STORIES', spaKey: 'ufCrm18_1791175785', label: 'Floors / Stories Preferred', type: 'double' },
    { code: 'UF_CRM_STYLE', spaKey: 'ufCrm18_1791175808', label: 'Architectural Style', type: 'string' },
    { code: 'UF_CRM_WHATSAPP_RESP', spaKey: 'ufCrm18_1791435311439', label: 'WhatsApp Response Received', type: 'boolean' },
    { code: 'UF_CRM_ENQUIRY_LOCKED', spaKey: 'ufCrm18_1791483092895', label: 'Enquiry Locked / Assigned', type: 'boolean' }
  ];

  const toCreate = [...listingFieldDefs, ...enquiryFieldDefs].filter(f => !existingNames.has(f.code.toUpperCase()));

  console.log(`Need to create ${toCreate.length} new fields on Lead...`);

  for (const field of toCreate) {
    try {
      const payload = {
        FIELD_NAME: field.code,
        USER_TYPE_ID: field.type === 'money' ? 'money' : (field.type === 'enumeration' ? 'enumeration' : (field.type === 'boolean' ? 'boolean' : (field.type === 'file' ? 'file' : (field.type === 'date' ? 'date' : (field.type === 'double' ? 'double' : (field.type === 'integer' ? 'integer' : 'string')))))),
        XML_ID: field.code.toLowerCase(),
        SORT: 100,
        MULTIPLE: 'N',
        MANDATORY: 'N',
        SHOW_FILTER: 'Y',
        SHOW_IN_LIST: 'Y',
        EDIT_IN_LIST: 'Y',
        IS_SEARCHABLE: 'Y',
        EDIT_FORM_LABEL: { en: field.label, ar: field.label },
        LIST_COLUMN_LABEL: { en: field.label, ar: field.label },
        LIST_FILTER_LABEL: { en: field.label, ar: field.label }
      };

      if (field.type === 'enumeration' && field.options) {
        payload.LIST = field.options.map((opt, idx) => ({
          VALUE: opt,
          SORT: (idx + 1) * 10
        }));
      }

      const res = await BitrixClient.call('crm.lead.userfield.add', { fields: payload });
      console.log(`✓ Created field ${field.code} (${field.label}) -> ID: ${res}`);
    } catch (err) {
      console.error(`✗ Failed to create ${field.code}:`, err.message);
    }
  }

  const updatedLeadUfs = await BitrixClient.call('crm.lead.userfield.list');
  console.log(`Updated Lead total userfields count: ${updatedLeadUfs.length}`);
}

syncAllFields();
