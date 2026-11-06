/**
 * tests/test_matching_interim.js
 * Unit test suite for Section C1 interim matching fix
 */

const assert = require('assert');
const matchingModule = require('../public/js/matching-listings');

console.log('===============================================================');
console.log('   Running Section C1 Interim Matching Tests');
console.log('===============================================================\n');

// 1. Label Mapping Verification (Live Inversion Fix)
console.log('--- Test 1: Listing Type Label Resolution ---');
assert.strictEqual(matchingModule.mapListingTypeToLabel('158'), 'Rent', '158 must map to Rent (not Sale!)');
assert.strictEqual(matchingModule.mapListingTypeToLabel(158), 'Rent', 'Numeric 158 must map to Rent');
assert.strictEqual(matchingModule.mapListingTypeToLabel('160'), 'Overseas Sale', '160 must map to Overseas Sale');
assert.strictEqual(matchingModule.mapListingTypeToLabel(160), 'Overseas Sale', 'Numeric 160 must map to Overseas Sale');
assert.strictEqual(matchingModule.mapListingTypeToLabel('162'), 'Off-Plan', '162 must map to Off-Plan');
assert.strictEqual(matchingModule.mapListingTypeToLabel('164'), 'External Stock', '164 must map to External Stock');
assert.strictEqual(matchingModule.mapListingTypeToLabel('SALE_ALL'), 'Sale', 'SALE_ALL must map to Sale');
console.log('  ✓ PASS: Live enum labels correctly resolved (158=Rent, 160=Overseas, 162=Off-Plan)');

// 2. Enquiry Transaction Resolution
console.log('\n--- Test 2: Enquiry Transaction Resolution ---');
// Rent enquiry types
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: '1248' }), 'RENT');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: 1248 }), 'RENT');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: '1254' }), 'RENT');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: 'Rent' }), 'RENT');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18EnquiryType: 'Tenant' }), 'RENT');

// Sale enquiry types
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: '1246' }), 'SALE');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: 1246 }), 'SALE');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: '1250' }), 'SALE');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: '1252' }), 'SALE');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ListingType: 'Sale' }), 'SALE');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18EnquiryType: 'Buyer' }), 'SALE');

// v2 Canonical Transaction override
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ReTransaction: 'RENT' }), 'RENT');
assert.strictEqual(matchingModule.resolveTransactionFromEnquiry({ ufCrm18ReTransaction: 'SALE' }), 'SALE');
console.log('  ✓ PASS: Enquiry transaction resolved accurately from v1 and v2 fields');

// 3. Listing Transaction Resolution
console.log('\n--- Test 3: Listing Transaction Resolution ---');
// Rent listing
assert.strictEqual(matchingModule.resolveTransactionFromListing({ ufCrm16_1790154808: '158' }), 'RENT');
assert.strictEqual(matchingModule.resolveTransactionFromListing({ ufCrm16_1790154808: 158 }), 'RENT');

// Sale listings
assert.strictEqual(matchingModule.resolveTransactionFromListing({ ufCrm16_1790154808: '160' }), 'SALE');
assert.strictEqual(matchingModule.resolveTransactionFromListing({ ufCrm16_1790154808: 160 }), 'SALE');
assert.strictEqual(matchingModule.resolveTransactionFromListing({ ufCrm16_1790154808: '162' }), 'SALE');
assert.strictEqual(matchingModule.resolveTransactionFromListing({ ufCrm16_1790154808: 162 }), 'SALE');

// v2 Canonical Transaction override
assert.strictEqual(matchingModule.resolveTransactionFromListing({ ufCrm16ReTransaction: 'RENT' }), 'RENT');
assert.strictEqual(matchingModule.resolveTransactionFromListing({ ufCrm16ReTransaction: 'SALE' }), 'SALE');
console.log('  ✓ PASS: Listing transaction resolved accurately from v1 and v2 fields');

// 4. Strict Non-Cross-Matching Guarantees
console.log('\n--- Test 4: Strict Non-Cross-Matching Protection ---');
// Rule 1: Never match Sale enquiries to Rent listings
assert.strictEqual(
  matchingModule.isMatchingCompatible('SALE', 'RENT', '158', ''),
  false,
  'CRITICAL: Sale Enquiry MUST NEVER match 158 (Rent listing)'
);
assert.strictEqual(
  matchingModule.isMatchingCompatible('SALE', 'RENT', '158', null),
  false,
  'CRITICAL: Sale Enquiry MUST NEVER match Rent listing'
);

// Rule 2: Never match Rent enquiries to Sale listings
assert.strictEqual(
  matchingModule.isMatchingCompatible('RENT', 'SALE', '160', ''),
  false,
  'CRITICAL: Rent Enquiry MUST NEVER match 160 (Overseas Sale)'
);
assert.strictEqual(
  matchingModule.isMatchingCompatible('RENT', 'SALE', '162', ''),
  false,
  'CRITICAL: Rent Enquiry MUST NEVER match 162 (Off-Plan Sale)'
);

// Rule 3: Valid matches must succeed
assert.strictEqual(
  matchingModule.isMatchingCompatible('RENT', 'RENT', '158', ''),
  true,
  'Rent enquiry matches Rent listing'
);
assert.strictEqual(
  matchingModule.isMatchingCompatible('SALE', 'SALE', '160', ''),
  true,
  'Sale enquiry matches Overseas Sale listing'
);
assert.strictEqual(
  matchingModule.isMatchingCompatible('SALE', 'SALE', '162', ''),
  true,
  'Sale enquiry matches Off-Plan Sale listing'
);
console.log('  ✓ PASS: Cross-matching strictly blocked under all combinations');

// 5. Explicit Filter Dropdown Handling
console.log('\n--- Test 5: Explicit Filter Dropdown Enforcement ---');
// Filter = '158' (Rent)
assert.strictEqual(matchingModule.isMatchingCompatible('RENT', 'RENT', '158', '158'), true);
assert.strictEqual(matchingModule.isMatchingCompatible('RENT', 'SALE', '160', '158'), false);
assert.strictEqual(matchingModule.isMatchingCompatible('RENT', 'SALE', '162', '158'), false);

// Filter = 'SALE_ALL' (All Sales)
assert.strictEqual(matchingModule.isMatchingCompatible('SALE', 'RENT', '158', 'SALE_ALL'), false, '158 excluded from SALE_ALL');
assert.strictEqual(matchingModule.isMatchingCompatible('SALE', 'SALE', '160', 'SALE_ALL'), true);
assert.strictEqual(matchingModule.isMatchingCompatible('SALE', 'SALE', '162', 'SALE_ALL'), true);

// Filter = '162' (Off-Plan)
assert.strictEqual(matchingModule.isMatchingCompatible('SALE', 'SALE', '162', '162'), true);
assert.strictEqual(matchingModule.isMatchingCompatible('SALE', 'SALE', '160', '162'), false);
assert.strictEqual(matchingModule.isMatchingCompatible('SALE', 'RENT', '158', '162'), false);
console.log('  ✓ PASS: UI Filter dropdown choices strictly enforce inventory partition');

// 6. Enquiry to Filter Mapping
console.log('\n--- Test 6: Enquiry Auto-Filter Translation ---');
assert.strictEqual(matchingModule.mapEnquiryListingTypeToFilter('1248'), '158');
assert.strictEqual(matchingModule.mapEnquiryListingTypeToFilter('1254'), '158');
assert.strictEqual(matchingModule.mapEnquiryListingTypeToFilter('1246'), 'SALE_ALL');
assert.strictEqual(matchingModule.mapEnquiryListingTypeToFilter('1252'), 'SALE_ALL');
assert.strictEqual(matchingModule.mapEnquiryListingTypeToFilter('1250'), '162');
console.log('  ✓ PASS: Auto-matched Enquiry filters translate directly to correct Listing filters');

console.log('\n===============================================================');
console.log('✓ ALL SECTION C1 INTERIM MATCHING TESTS PASSED!');
console.log('===============================================================\n');
