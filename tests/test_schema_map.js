/**
 * tests/test_schema_map.js
 * Unit test suite for SchemaMap resolver
 */

const assert = require('assert');
const SchemaMap = require('../src/schemaMap');

console.log('===============================================================');
console.log('   Running SchemaMap Unit Tests');
console.log('===============================================================\n');

// 1. resolveFieldCode under v1
console.log('--- Test 1: Field code resolution under v1 ---');
process.env.LAYOUT_VERSION = 'v1';
assert.strictEqual(SchemaMap.resolveFieldCode('lead_type', 'lead'), 'UF_CRM_1791354310417');
assert.strictEqual(SchemaMap.resolveFieldCode('transaction', 'lead'), 'UF_CRM_1791952650167');
assert.strictEqual(SchemaMap.resolveFieldCode('transaction', 'spa_1058'), 'UF_CRM_16_1790154808');
assert.strictEqual(SchemaMap.resolveFieldCode('property_type', 'lead'), 'UF_CRM_1791952050535');
console.log('  ✓ PASS: v1 field codes resolve correctly');

// 2. resolveFieldCode under v2
console.log('\n--- Test 2: Field code resolution under v2 ---');
process.env.LAYOUT_VERSION = 'v2';
assert.strictEqual(SchemaMap.resolveFieldCode('transaction', 'lead'), 'UF_CRM_RE_TRANSACTION');
assert.strictEqual(SchemaMap.resolveFieldCode('transaction', 'spa_1058'), 'UF_CRM_16_RE_TRANSACTION');
assert.strictEqual(SchemaMap.resolveFieldCode('market_segment', 'lead'), 'UF_CRM_RE_MARKET_SEGMENT');
assert.strictEqual(SchemaMap.resolveFieldCode('stock_source', 'lead'), 'UF_CRM_RE_STOCK_SOURCE');
assert.strictEqual(SchemaMap.resolveFieldCode('purpose', 'lead'), 'UF_CRM_RE_PURPOSE');
assert.strictEqual(SchemaMap.resolveFieldCode('security_deposit', 'lead'), 'UF_CRM_RE_SECURITY_DEPOSIT');
assert.strictEqual(SchemaMap.resolveFieldCode('commission_pct', 'lead'), 'UF_CRM_RE_COMMISSION_PCT');
// Reused field under A5/A6 returns same code in v2
assert.strictEqual(SchemaMap.resolveFieldCode('available_from', 'lead'), 'UF_CRM_DATE_AVAILABLE');
assert.strictEqual(SchemaMap.resolveFieldCode('form_a_expiry', 'lead'), 'UF_CRM_FORM_A_EXPIRY_DATE');
console.log('  ✓ PASS: v2 canonical field codes resolve correctly');

// Reset to v1
process.env.LAYOUT_VERSION = 'v1';

// 3. resolveEnumId
console.log('\n--- Test 3: Enum resolution by XML_ID and Label ---');
assert.strictEqual(String(SchemaMap.resolveEnumId('lead_type', 'ENQUIRY', 'lead')), '1594');
assert.strictEqual(String(SchemaMap.resolveEnumId('lead_type', 'LISTING', 'lead')), '1596');
assert.strictEqual(String(SchemaMap.resolveEnumId('lead_type', 'enquiry', 'lead')), '1594');
assert.strictEqual(String(SchemaMap.resolveEnumId('property_type', 'APARTMENT', 'lead')), '1754');
assert.strictEqual(String(SchemaMap.resolveEnumId('property_type', 'VILLA', 'lead')), '1756');
assert.strictEqual(String(SchemaMap.resolveEnumId('property_type', 'villa', 'spa_1058')), '888');
assert.strictEqual(String(SchemaMap.resolveEnumId('property_type', 'villa', 'spa_1062')), '2528');
assert.strictEqual(String(SchemaMap.resolveEnumId('property_type', 'villa', 'spa_1048')), '348');
console.log('  ✓ PASS: Enum IDs resolve correctly across entities');

// 4. resolveCanonicalXmlId
console.log('\n--- Test 4: Reverse XML_ID resolution ---');
assert.strictEqual(SchemaMap.resolveCanonicalXmlId('lead_type', '1594'), 'ENQUIRY');
assert.strictEqual(SchemaMap.resolveCanonicalXmlId('lead_type', '1596'), 'LISTING');
assert.strictEqual(SchemaMap.resolveCanonicalXmlId('property_type', '1754'), 'APARTMENT');
assert.strictEqual(SchemaMap.resolveCanonicalXmlId('property_type', '888'), 'VILLA');
console.log('  ✓ PASS: Canonical XML_IDs reverse-resolve accurately');

// 5. resolveEntityTypeId and buildPlacementCode
console.log('\n--- Test 5: Entity Type IDs and Placements ---');
assert.strictEqual(SchemaMap.resolveEntityTypeId('master_project'), 1040);
assert.strictEqual(SchemaMap.resolveEntityTypeId('project'), 1044);
assert.strictEqual(SchemaMap.resolveEntityTypeId('layout'), 1048);
assert.strictEqual(SchemaMap.resolveEntityTypeId('property'), 1052);
assert.strictEqual(SchemaMap.resolveEntityTypeId('listing'), 1058);
assert.strictEqual(SchemaMap.resolveEntityTypeId('enquiry'), 1062);
assert.strictEqual(SchemaMap.resolveEntityTypeId('broker'), 1094);

assert.strictEqual(SchemaMap.buildPlacementCode('lead'), 'CRM_LEAD_DETAIL_TAB');
assert.strictEqual(SchemaMap.buildPlacementCode('listing'), 'CRM_DYNAMIC_1058_DETAIL_TAB');
assert.strictEqual(SchemaMap.buildPlacementCode('enquiry'), 'CRM_DYNAMIC_1062_DETAIL_TAB');
console.log('  ✓ PASS: Entity IDs and Placements built properly');

// 6. Fail loudly on missing/invalid concept
console.log('\n--- Test 6: Loud failure diagnostics ---');
SchemaMap.clearResolutionErrors();
assert.throws(() => {
  SchemaMap.resolveFieldCode('non_existent_concept', 'lead');
}, /is not registered in config\/concepts\.json/);

assert.throws(() => {
  SchemaMap.resolveEnumId('lead_type', 'INVALID_OPTION', 'lead');
}, /Unable to resolve enum value/);

const errors = SchemaMap.getResolutionErrors();
assert.strictEqual(errors.length, 2);
console.log('  ✓ PASS: Loud errors recorded and thrown successfully');

console.log('\n===============================================================');
console.log('✓ ALL SCHEMAMAP UNIT TESTS PASSED!');
console.log('===============================================================\n');

