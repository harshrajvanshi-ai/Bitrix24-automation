const BitrixClient = require('./src/bitrixClient');
const fs = require('fs');

async function inspect() {
  try {
    const listingFieldsRes = await BitrixClient.call('crm.item.fields', { entityTypeId: 1058 });
    const enquiryFieldsRes = await BitrixClient.call('crm.item.fields', { entityTypeId: 1062 });

    const listingFields = listingFieldsRes.fields || {};
    const enquiryFields = enquiryFieldsRes.fields || {};

    const leadFieldsRes = await BitrixClient.call('crm.lead.fields');
    const leadUserFieldsRes = await BitrixClient.call('crm.lead.userfield.list');

    const result = {
      listing: {
        totalFields: Object.keys(listingFields).length,
        userfields: Object.entries(listingFields)
          .filter(([k, v]) => k.startsWith('ufCrm') || k.startsWith('UF_') || v.isUserField)
          .map(([k, v]) => ({ key: k, title: v.title || v.formLabel || '', type: v.type, isRequired: v.isRequired, isMultiple: v.isMultiple }))
      },
      enquiry: {
        totalFields: Object.keys(enquiryFields).length,
        userfields: Object.entries(enquiryFields)
          .filter(([k, v]) => k.startsWith('ufCrm') || k.startsWith('UF_') || v.isUserField)
          .map(([k, v]) => ({ key: k, title: v.title || v.formLabel || '', type: v.type, isRequired: v.isRequired, isMultiple: v.isMultiple }))
      },
      leadUserfields: (leadUserFieldsRes || []).map(f => ({
        id: f.ID,
        fieldName: f.FIELD_NAME,
        label: f.EDIT_FORM_LABEL ? (typeof f.EDIT_FORM_LABEL === 'object' ? Object.values(f.EDIT_FORM_LABEL)[0] : f.EDIT_FORM_LABEL) : '',
        type: f.USER_TYPE_ID
      }))
    };

    fs.writeFileSync('scratch_fields_audit.json', JSON.stringify(result, null, 2), 'utf8');
    console.log('Audit completed!');
    console.log('Listing Userfields count:', result.listing.userfields.length);
    console.log('Enquiry Userfields count:', result.enquiry.userfields.length);
    console.log('Lead Userfields count:', result.leadUserfields.length);
  } catch (err) {
    console.error('Audit error:', err);
  }
}

inspect();
