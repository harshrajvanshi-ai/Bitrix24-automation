const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../config/fields.json');
const fields = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Fields to remove from listingLayout
const toRemove = new Set([
  // Commercial Terms & General Overview
  'UF_CRM_1791952409183', 'STATUS_ID', 'ASSIGNED_BY_ID', 'XML_ID',
  // Seller & Source
  'CONTACT_ID', 'UF_CRM_CONTACTS', 'UF_CRM_DEVELOPER_NAME', 'UF_CRM_DEVELOPER_1',
  // Property Specifications
  'UF_CRM_UNIT_NO',
  // Building, Location & Geography
  'UF_CRM_PROJECT_NAME', 'UF_CRM_BUILDING_DUBIZZLE', 'UF_CRM_COMMUNITY_PROPERTYFINDER',
  'UF_CRM_SUB_COMMUNITY_PROPERTYFINDER', 'UF_CRM_NEIGHBORHOOD', 'UF_CRM_CITY',
  'UF_CRM_COUNTRY', 'UF_CRM_STREET', 'UF_CRM_1791970638065', 'UF_CRM_LATITUDE', 'UF_CRM_LONGITUDE',
  // Portals & Marketing
  'UF_CRM_PORTAL_LISTING_ID', 'UF_CRM_DUBIZZLE_REGION', 'UF_CRM_LISTING',
  'UF_CRM_SYSTEMALLOWEDFORPORTALS', 'UF_CRM_UK_SUMMARY_DESCRIPTION', 'UF_CRM_DESCRIPTION'
]);

// Find Master Project field before filtering
let masterProjectField = null;
for (const s of fields.listingLayout.sections) {
  for (const f of s.fields) {
    if (f.code === 'UF_CRM_PROJECT') {
      masterProjectField = JSON.parse(JSON.stringify(f));
    }
  }
}

// Process sections
const updatedSections = [];

for (const s of fields.listingLayout.sections) {
  if (s.id === 'location') {
    // Location section is emptied / removed
    continue;
  }

  const remainingFields = [];
  for (const f of s.fields) {
    if (toRemove.has(f.code)) continue;

    const copy = JSON.parse(JSON.stringify(f));

    // Renames
    if (copy.code === 'COMPANY_ID') {
      copy.label = 'Developer';
      copy.bitrixLabel = 'Developer';
      copy.placeholder = 'Search Developer...';
    }
    if (copy.code === 'UF_CRM_COMPLETIONDATE') {
      copy.label = 'Handover Date';
      copy.bitrixLabel = 'Handover Date';
    }

    // Number of Cheques type change
    if (copy.code === 'UF_CRM_1792139023') {
      copy.type = 'number';
      copy.placeholder = 'e.g. 4';
      copy.min = 1;
      copy.max = 12;
      copy.step = 1;
      delete copy.options;
    }

    remainingFields.push(copy);
  }

  // If specs section, add master project at the beginning
  if (s.id === 'specs' && masterProjectField) {
    remainingFields.unshift(masterProjectField);
  }

  s.fields = remainingFields;
  updatedSections.push(s);
}

fields.listingLayout.sections = updatedSections;

// Also update UF_CRM_1792139023 in listingFields if present so types match
if (Array.isArray(fields.listingFields)) {
  const chequeField = fields.listingFields.find(f => f.code === 'UF_CRM_1792139023');
  if (chequeField) {
    chequeField.type = 'number';
    chequeField.placeholder = 'e.g. 4';
    chequeField.min = 1;
    chequeField.max = 12;
    chequeField.step = 1;
    delete chequeField.options;
  }
  const compField = fields.listingFields.find(f => f.code === 'UF_CRM_COMPLETIONDATE');
  if (compField) {
    compField.label = 'Handover Date';
    compField.bitrixLabel = 'Handover Date';
  }
  const devField = fields.listingFields.find(f => f.code === 'COMPANY_ID');
  if (devField) {
    devField.label = 'Developer';
    devField.bitrixLabel = 'Developer';
  }
}

fs.writeFileSync(configPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('Successfully updated config/fields.json');
console.log(`Remaining sections: ${updatedSections.length}`);
updatedSections.forEach(s => {
  console.log(`[${s.id}] ${s.title} (${s.fields.length} fields)`);
  s.fields.forEach(f => console.log(`   - ${f.code}: ${f.label} [${f.type}]`));
});
