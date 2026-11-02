/**
 * Dedicated Test Suite: UAE Real Estate CRM – Enquiry Requirement Gathering Form
 * Verifies form design, 6 sections, field schemas, conditional visibility rules,
 * Mac/Safari dropdown compatibility, and budget/size validation constraints.
 */

const fs = require('fs');
const assert = require('assert');

console.log('========================================================================');
console.log('   UAE Real Estate CRM - Enquiry Requirement Gathering Form Tests       ');
console.log('========================================================================');

const fieldsConfig = JSON.parse(fs.readFileSync('config/fields.json', 'utf8'));
const tabJsContent = fs.readFileSync('public/js/tab.js', 'utf8');
const tabCssContent = fs.readFileSync('public/css/tab.css', 'utf8');

let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${desc}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 1. Structure: Exactly 6 Form Sections
// ---------------------------------------------------------------------------
console.log('\n--- 1. Form Structure & 6 Sections Verification ---');

const enquirySections = fieldsConfig.enquiryLayout?.sections || [];
it('Enquiry layout has exactly 6 sections', () => {
  assert.strictEqual(enquirySections.length, 6, `Expected 6 sections, got ${enquirySections.length}`);
});

const sectionTitles = enquirySections.map(s => s.title);
it('Section 1 is "Client & Property Requirements"', () => {
  assert(sectionTitles[0].includes('Property Requirements'), 'Section 1 contains Property Requirements');
  assert(sectionTitles[0].includes('Client'), 'Section 1 contains Client for backward compatibility');
});

it('Section 2 is "Budget & Financial Requirements"', () => {
  assert.strictEqual(sectionTitles[1], 'Budget & Financial Requirements');
});

it('Section 3 is "Property Specifications"', () => {
  assert.strictEqual(sectionTitles[2], 'Property Specifications');
});

it('Section 4 is "Rental-Specific Requirements"', () => {
  assert.strictEqual(sectionTitles[3], 'Rental-Specific Requirements');
});

it('Section 5 is "Purchase-Specific Requirements"', () => {
  assert.strictEqual(sectionTitles[4], 'Purchase-Specific Requirements');
});

it('Section 6 is "Additional Preferences"', () => {
  assert.strictEqual(sectionTitles[5], 'Additional Preferences');
});

// ---------------------------------------------------------------------------
// 2. Field Completeness Across All 6 Sections
// ---------------------------------------------------------------------------
console.log('\n--- 2. Field Completeness & Configuration Across All 6 Sections ---');

const s1 = enquirySections[0].fields;
const s2 = enquirySections[1].fields;
const s3 = enquirySections[2].fields;
const s4 = enquirySections[3].fields;
const s5 = enquirySections[4].fields;
const s6 = enquirySections[5].fields;

// Section 1
it('Section 1 contains Requirement Type (Buy, Rent)', () => {
  const f = s1.find(x => x.code === 'UF_CRM_REQUIREMENT_TYPE');
  assert(f, 'UF_CRM_REQUIREMENT_TYPE exists');
  assert.strictEqual(f.type, 'enumeration');
  assert(f.options.some(o => o.value === 'Buy'));
  assert(f.options.some(o => o.value === 'Rent'));
});

it('Section 1 contains Property Type as multi-select with all 7 options', () => {
  const f = s1.find(x => x.code === 'UF_CRM_1791952050535');
  assert(f, 'Property Type field exists');
  assert.strictEqual(f.multiple, true);
  const values = f.options.map(o => o.value);
  assert(values.includes('Apartment'));
  assert(values.includes('Villa'));
  assert(values.includes('Townhouse'));
  assert(values.includes('Penthouse'));
  assert(values.includes('Duplex'));
  assert(values.includes('Residential Plot'));
  assert(values.includes('Commercial Property'));
});

it('Section 1 contains Property Purpose (Residential, Commercial, Investment)', () => {
  const f = s1.find(x => x.code === 'UF_CRM_PROPERTY_PURPOSE');
  assert(f, 'Property Purpose exists');
  const values = f.options.map(o => o.value);
  assert(values.includes('Residential') && values.includes('Commercial') && values.includes('Investment'));
});

it('Section 1 contains Preferred Emirate as multi-select with all 7 Emirates', () => {
  const f = s1.find(x => x.code === 'UF_CRM_STATE');
  assert(f, 'Preferred Emirate exists');
  assert.strictEqual(f.multiple, true);
  assert.strictEqual(f.options.length, 7);
  const values = f.options.map(o => o.value);
  ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'].forEach(e => {
    assert(values.includes(e), `Emirate ${e} present`);
  });
});

it('Section 1 contains Preferred Community as searchable multi-select', () => {
  const f = s1.find(x => x.code === 'UF_CRM_COMMUNITY');
  assert(f, 'Preferred Community exists');
  assert.strictEqual(f.multiple, true);
  assert(f.options.length >= 10, 'Has comprehensive list of UAE communities');
});

it('Section 1 contains Preferred Bedrooms as multi-select Studio through 6+', () => {
  const f = s1.find(x => x.code === 'UF_CRM_BEDROOMS');
  assert(f, 'Bedrooms field exists');
  assert.strictEqual(f.multiple, true);
  const values = f.options.map(o => o.value);
  assert(values.includes('Studio') && values.includes('1 Bedroom') && values.includes('6+ Bedrooms'));
});

it('Section 1 contains Preferred Bathrooms (1, 2, 3, 4, 5+)', () => {
  const f = s1.find(x => x.code === 'UF_CRM_BATHROOMS');
  assert(f, 'Bathrooms field exists');
  assert(f.options.some(o => o.value === '1') && f.options.some(o => o.value === '5+'));
});

it('Section 1 contains Furnishing Preference (Furnished, Semi-Furnished, Unfurnished, No Preference)', () => {
  const f = s1.find(x => x.code === 'UF_CRM_1791969936048');
  assert(f, 'Furnishing preference exists');
  const values = f.options.map(o => o.value);
  assert(values.includes('Furnished') && values.includes('Unfurnished') && values.includes('No Preference'));
});

it('Section 1 contains Property Condition (Ready, Off-Plan, Under Construction, No Preference)', () => {
  const f = s1.find(x => x.code === 'UF_CRM_CONSTRUCTION');
  assert(f, 'Property Condition exists');
  const values = f.options.map(o => o.value);
  assert(values.includes('Ready') && values.includes('Off-Plan') && values.includes('Under Construction'));
});

// Section 2
it('Section 2 contains Min Budget and Max Budget with AED currency', () => {
  const minB = s2.find(x => x.code === 'UF_CRM_LISTINGPRICE_MIN');
  const maxB = s2.find(x => x.code === 'UF_CRM_LISTINGPRICE_MAX');
  assert(minB && minB.type === 'money' && minB.currency === 'AED', 'Min budget configured with AED');
  assert(maxB && maxB.type === 'money' && maxB.currency === 'AED', 'Max budget configured with AED');
});

it('Section 2 contains Payment Method and Payment Plan Preference', () => {
  const pm = s2.find(x => x.code === 'UF_CRM_FINANCE');
  const pp = s2.find(x => x.code === 'UF_CRM_PAYMENT_PLAN_PREF');
  assert(pm && pm.options.some(o => o.value === 'Developer Payment Plan'));
  assert(pp && pp.options.some(o => o.value === 'Flexible'));
});

it('Section 2 contains Mortgage Pre-Approval, Down Payment, and Annual Rental Budget', () => {
  const mort = s2.find(x => x.code === 'UF_CRM_MORTGAGE_PRE_APPROVAL');
  const dp = s2.find(x => x.code === 'UF_CRM_DOWN_PAYMENT');
  const rent = s2.find(x => x.code === 'UF_CRM_DEAL_VALUE_1');
  assert(mort && mort.options.some(o => o.value === 'In Progress'));
  assert(dp && dp.type === 'money' && dp.currency === 'AED');
  assert(rent && rent.type === 'money' && rent.currency === 'AED');
});

// Section 3
it('Section 3 contains Min & Max Property Size in sq ft', () => {
  const minS = s3.find(x => x.code === 'UF_CRM_TOTALAREA_MIN');
  const maxS = s3.find(x => x.code === 'UF_CRM_TOTALAREA_MAX');
  assert(minS && minS.type === 'double');
  assert(maxS && maxS.type === 'double');
});

it('Section 3 contains Balcony Required (Yes/No) and Parking Spaces (Number)', () => {
  const balc = s3.find(x => x.code === 'UF_CRM_BALCONY');
  const park = s3.find(x => x.code === 'UF_CRM_NUMBEROFPARKINGSPACES');
  assert(balc && balc.type === 'boolean');
  assert(park && park.type === 'integer');
});

it('Section 3 contains View Preference and Required Amenities as multi-select', () => {
  const view = s3.find(x => x.code === 'UF_CRM_1791970130059');
  const amen = s3.find(x => x.code === 'UF_CRM_REQUIRED_AMENITIES');
  assert(view && view.multiple === true);
  assert(amen && amen.multiple === true);
  assert(amen.options.some(o => o.value === 'Swimming Pool') && amen.options.some(o => o.value === 'Beach Access'));
});

it('Section 3 contains Floor Preference and Pet Friendly', () => {
  const floor = s3.find(x => x.code === 'UF_CRM_FLOOR_PREFERENCE');
  const pet = s3.find(x => x.code === 'UF_CRM_1791970241624');
  assert(floor && floor.options.some(o => o.value === 'High Floor'));
  assert(pet && pet.options.some(o => o.value === 'Yes'));
});

// Section 4
it('Section 4 contains Rental-Specific fields (Lease Duration, Cheques, Move-in Date, Tenant Type, Occupants)', () => {
  assert(s4.find(x => x.code === 'UF_CRM_LEASE_DURATION'));
  assert(s4.find(x => x.code === 'UF_CRM_1792139023'));
  assert(s4.find(x => x.code === 'UF_CRM_MOVE_DATE' && x.type === 'date'));
  assert(s4.find(x => x.code === 'UF_CRM_IMMEDIATE_AVAILABILITY' && x.type === 'boolean'));
  assert(s4.find(x => x.code === 'UF_CRM_TENANT_TYPE'));
  assert(s4.find(x => x.code === 'UF_CRM_NUMBER_OF_OCCUPANTS' && x.type === 'integer'));
});

// Section 5
it('Section 5 contains Purchase-Specific fields (Buying Purpose, Timeline, Property Status, Expected ROI, Handover)', () => {
  assert(s5.find(x => x.code === 'UF_CRM_BUYING_PURPOSE'));
  assert(s5.find(x => x.code === 'UF_CRM_PURCHASE_TIMELINE'));
  assert(s5.find(x => x.code === 'UF_CRM_PROPERTY_STATUS_PREFERENCE'));
  assert(s5.find(x => x.code === 'UF_CRM_EXPECTED_ROI' && x.type === 'double'));
  assert(s5.find(x => x.code === 'UF_CRM_PREFERRED_HANDOVER'));
});

// Section 6
it('Section 6 contains Additional Preferences (Viewing Date/Time, Must-Have Features, Deal Breakers, Special Reqs, Comments)', () => {
  assert(s6.find(x => x.code === 'UF_CRM_FIRST_VIEWING_DATE' && x.type === 'date'));
  assert(s6.find(x => x.code === 'UF_CRM_VIEWING_TIME'));
  assert(s6.find(x => x.code === 'UF_CRM_MUST_HAVE_FEATURES' && x.type === 'textarea'));
  assert(s6.find(x => x.code === 'UF_CRM_DEAL_BREAKERS' && x.type === 'textarea'));
  assert(s6.find(x => x.code === 'UF_CRM_SPECIAL_REQUIREMENTS' && x.type === 'textarea'));
  assert(s6.find(x => x.code === 'UF_CRM_COMMENTS_1' && x.type === 'textarea'));
});

// ---------------------------------------------------------------------------
// 3. Conditional Visibility Engine & Validation Rules
// ---------------------------------------------------------------------------
console.log('\n--- 3. Conditional Visibility & Validation Rules ---');

it('tab.js contains runEnquiryConditionals function', () => {
  assert(tabJsContent.includes('function runEnquiryConditionals()'), 'runEnquiryConditionals declared in tab.js');
});

it('runEnquiryConditionals manages Buy vs Rent section visibility', () => {
  assert(tabJsContent.includes("section_rental_specific"), 'References section_rental_specific');
  assert(tabJsContent.includes("section_purchase_specific"), 'References section_purchase_specific');
  assert(tabJsContent.includes("isRent ? 'block' : 'none'"), 'Toggles rental section on isRent');
  assert(tabJsContent.includes("isBuy ? 'block' : 'none'"), 'Toggles purchase section on isBuy');
});

it('runEnquiryConditionals toggles Annual Rental Budget vs Purchase Financials', () => {
  assert(tabJsContent.includes("group_UF_CRM_DEAL_VALUE_1"), 'Targets Annual Rental Budget group');
  assert(tabJsContent.includes("group_UF_CRM_LISTINGPRICE_MIN"), 'Targets Min Budget group');
  assert(tabJsContent.includes("group_UF_CRM_LISTINGPRICE_MAX"), 'Targets Max Budget group');
  assert(tabJsContent.includes("group_UF_CRM_MORTGAGE_PRE_APPROVAL"), 'Targets Mortgage Pre-Approval group');
  assert(tabJsContent.includes("group_UF_CRM_DOWN_PAYMENT"), 'Targets Down Payment group');
});

it('runEnquiryConditionals hides Expected ROI unless Buying Purpose is Investment', () => {
  assert(tabJsContent.includes("group_UF_CRM_EXPECTED_ROI"), 'Targets Expected ROI group');
  assert(tabJsContent.includes("isBuy && isInvestment"), 'Guards Expected ROI visibility with isBuy && isInvestment');
});

it('tab.js validates Minimum Budget cannot exceed Maximum Budget', () => {
  assert(tabJsContent.includes('Minimum budget') && tabJsContent.includes('cannot exceed maximum budget'), 'Enforces min budget <= max budget');
});

it('tab.js validates Minimum Property Size cannot exceed Maximum Property Size', () => {
  assert(tabJsContent.includes('Minimum property size') && tabJsContent.includes('cannot exceed maximum size'), 'Enforces min size <= max size');
});

// ---------------------------------------------------------------------------
// 4. Mac / Safari Compatibility for Multi-Select & Single-Select Dropdowns
// ---------------------------------------------------------------------------
console.log('\n--- 4. Mac / Safari Compatibility Verification ---');

it('tab.js provides createMultiSelectInput with tag pills and search filter', () => {
  assert(tabJsContent.includes('function createMultiSelectInput'), 'createMultiSelectInput is defined');
  assert(tabJsContent.includes('multiselect-tags'), 'Renders tag pills container');
  assert(tabJsContent.includes('multiselect-tag-remove'), 'Provides dismiss button for each tag');
  assert(tabJsContent.includes('multiselect-search-input'), 'Provides search filter input');
  assert(tabJsContent.includes('Select All'), 'Provides Select All shortcut');
  assert(tabJsContent.includes('Clear All'), 'Provides Clear All shortcut');
});

it('createMultiSelectInput toggles selection on click without requiring Cmd key', () => {
  assert(tabJsContent.includes('optTarget.selected = !optTarget.selected'), 'Toggles option selection without key modifiers');
  assert(tabJsContent.includes('e.stopPropagation()'), 'Prevents event bubbling on click');
});

it('tab.css contains WebKit / Mac-friendly appearance resets and font smoothing', () => {
  assert(tabCssContent.includes('-webkit-appearance: none;'), 'Reset native Aqua/Cocoa styles');
  assert(tabCssContent.includes('-webkit-font-smoothing: antialiased;'), 'Enables subpixel font smoothing for macOS');
  assert(tabCssContent.includes('touch-action: manipulation;'), 'Eliminates 300ms tap delay on Mac touch / iOS');
  assert(tabCssContent.includes('.multiselect-container'), 'Defines .multiselect-container styling');
  assert(tabCssContent.includes('.multiselect-tag'), 'Defines .multiselect-tag styling');
  assert(tabCssContent.includes('.multiselect-dropdown'), 'Defines .multiselect-dropdown styling');
});

console.log('========================================================================');
console.log(`ENQUIRY FORM VERIFICATION: ${passedTests}/${totalTests} Checks Passed (0 Failed)`);
console.log('✓ ALL ENQUIRY REQUIREMENT GATHERING CRITERIA VERIFIED SUCCESSFULLY!');
console.log('========================================================================\n');
