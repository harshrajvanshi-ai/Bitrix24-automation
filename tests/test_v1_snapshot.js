/**
 * tests/test_v1_snapshot.js
 * Verifies that under LAYOUT_VERSION=v1, all resolved fields, enum IDs, and placements
 * match the legacy codebase snapshots 100% identically with zero regression.
 */

const assert = require('assert');
const SchemaMap = require('../src/schemaMap');

console.log('===============================================================');
console.log('   Running LAYOUT_VERSION=v1 Snapshot Parity Test');
console.log('===============================================================\n');

// Force v1 mode
process.env.LAYOUT_VERSION = 'v1';

// Snapshot of expected v1 field mappings
const V1_EXPECTED_SNAPSHOT = {
  lead_type: {
    fieldCode: 'UF_CRM_1791354310417',
    enquiryId: '1594',
    listingId: '1596'
  },
  transaction: {
    leadCode: 'UF_CRM_1791952650167',
    spa1058Code: 'UF_CRM_16_1790154808'
  },
  property_type: {
    leadCode: 'UF_CRM_1791952050535',
    apartmentLead: '1754',
    villaLead: '1756',
    townhouseLead: '1758',
    penthouseLead: '1760',
    duplexLead: '1762',
    landLead: '1764',
    commercialLead: '1766',
    officeLead: '1768',
    retailLead: '1770',
    apartmentSpa1048: '346',
    villaSpa1048: '348',
    townhouseSpa1048: '350',
    penthouseSpa1048: '352',
    duplexSpa1048: '354',
    landSpa1048: '356',
    commercialSpa1048: '358',
    officeSpa1048: '360',
    retailSpa1048: '362'
  },
  entities: {
    master_project: 1040,
    project: 1044,
    layout: 1048,
    property: 1052,
    listing: 1058,
    enquiry: 1062,
    broker: 1094
  },
  placements: {
    lead: 'CRM_LEAD_DETAIL_TAB',
    listing: 'CRM_DYNAMIC_1058_DETAIL_TAB',
    enquiry: 'CRM_DYNAMIC_1062_DETAIL_TAB'
  }
};

// 1. Verify Lead Type
assert.strictEqual(SchemaMap.resolveFieldCode('lead_type', 'lead'), V1_EXPECTED_SNAPSHOT.lead_type.fieldCode);
assert.strictEqual(String(SchemaMap.resolveEnumId('lead_type', 'ENQUIRY', 'lead')), V1_EXPECTED_SNAPSHOT.lead_type.enquiryId);
assert.strictEqual(String(SchemaMap.resolveEnumId('lead_type', 'LISTING', 'lead')), V1_EXPECTED_SNAPSHOT.lead_type.listingId);
console.log('  ✓ PASS: Lead Type v1 snapshot matches exactly');

// 2. Verify Transaction / Layout driver
assert.strictEqual(SchemaMap.resolveFieldCode('transaction', 'lead'), V1_EXPECTED_SNAPSHOT.transaction.leadCode);
assert.strictEqual(SchemaMap.resolveFieldCode('transaction', 'spa_1058'), V1_EXPECTED_SNAPSHOT.transaction.spa1058Code);
console.log('  ✓ PASS: Transaction v1 codes match exactly');

// 3. Verify Property Type enum parity (all 9 types)
const types = [
  ['APARTMENT', 'apartmentLead', 'apartmentSpa1048'],
  ['VILLA', 'villaLead', 'villaSpa1048'],
  ['TOWNHOUSE', 'townhouseLead', 'townhouseSpa1048'],
  ['PENTHOUSE', 'penthouseLead', 'penthouseSpa1048'],
  ['DUPLEX', 'duplexLead', 'duplexSpa1048'],
  ['LAND', 'landLead', 'landSpa1048'],
  ['COMMERCIAL', 'commercialLead', 'commercialSpa1048'],
  ['OFFICE', 'officeLead', 'officeSpa1048'],
  ['RETAIL', 'retailLead', 'retailSpa1048']
];

for (const [t, leadKey, spa1048Key] of types) {
  assert.strictEqual(String(SchemaMap.resolveEnumId('property_type', t, 'lead')), V1_EXPECTED_SNAPSHOT.property_type[leadKey]);
  assert.strictEqual(String(SchemaMap.resolveEnumId('property_type', t, 'spa_1048')), V1_EXPECTED_SNAPSHOT.property_type[spa1048Key]);
}
console.log('  ✓ PASS: All 9 Property Type enum IDs match v1 snapshot exactly');

// 4. Verify Entity Type IDs
for (const [name, id] of Object.entries(V1_EXPECTED_SNAPSHOT.entities)) {
  assert.strictEqual(SchemaMap.resolveEntityTypeId(name), id);
}
console.log('  ✓ PASS: All 7 entityTypeIds match v1 snapshot exactly');

// 5. Verify Placements
for (const [name, code] of Object.entries(V1_EXPECTED_SNAPSHOT.placements)) {
  assert.strictEqual(SchemaMap.buildPlacementCode(name), code);
}
console.log('  ✓ PASS: All placement codes match v1 snapshot exactly');

console.log('\n===============================================================');
console.log('✓ V1 SNAPSHOT TEST PASSED — 100% REGRESSION-FREE PARITY!');
console.log('===============================================================\n');

