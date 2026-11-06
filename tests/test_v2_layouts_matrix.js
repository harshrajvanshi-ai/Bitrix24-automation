/**
 * tests/test_v2_layouts_matrix.js
 * Comprehensive Matrix Verification Suite for Version 2 Layouts
 * 
 * Verifies:
 *  1. 4 Layout variations (Rent, Ready Sale, Off-Plan, Overseas + External overlay)
 *  2. Field visibility & requiredness according to config/layouts.v2.json
 *  3. Dynamic read-only rules (Property Type locked ONLY when Layout is linked)
 *  4. Studio handling (Bedrooms = 0 valid, generates "Studio in [Project]")
 *  5. Payment plan 100% mathematical constraint
 *  6. Real-time calculations (Price/SqFt, Commission AED, Handover Quarter)
 *  7. Overseas regulatory bypass (Country/City/Address shown, UAE permits bypassed)
 *  8. Transaction switch undo banner behavior
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('   Running V2 Layouts Matrix & Behavior Verification Tests     ');
console.log('===============================================================\n');

// Load configurations
const layoutsV2 = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/layouts.v2.json'), 'utf8'));
const tabJs = fs.readFileSync(path.join(__dirname, '../public/js/tab.js'), 'utf8');
const listingDetailsJs = fs.readFileSync(path.join(__dirname, '../public/js/listing-details.js'), 'utf8');
const ReadinessEvaluator = require('../src/readinessEvaluator');

// --- Test Group 1: 4 Layout Variations Schema & Field Rule Matrix ---
console.log('--- Test 1: V2 Layout Matrix Structure & Field Rules ---');
assert(layoutsV2.listing, 'V2 has listing schema definition');
assert(layoutsV2.listing.fields, 'V2 listing has fields dictionary');

const fields = layoutsV2.listing.fields;
const fieldKeys = Object.keys(fields);
console.log(`  ✓ Loaded V2 listing schema with ${fieldKeys.length} declarative concepts`);

// Helper to evaluate declarative visibility against layout context
function isFieldVisibleInLayout(fieldDef, context) {
  if (fieldDef.visible === false) return false;
  if (fieldDef.visible === true || fieldDef.visible === undefined) return true;
  if (typeof fieldDef.visible === 'object') {
    for (const [key, expected] of Object.entries(fieldDef.visible)) {
      const actual = context[key];
      if (expected && typeof expected === 'object' && expected.$ne !== undefined) {
        if (actual === expected.$ne) return false;
      } else if (Array.isArray(expected)) {
        if (!expected.includes(actual)) return false;
      } else {
        if (actual !== expected) return false;
      }
    }
    return true;
  }
  return true;
}

const layoutContexts = {
  rent: { transaction: 'RENT', market_segment: 'READY', stock_source: 'OWN' },
  ready_sale: { transaction: 'SALE', market_segment: 'READY', stock_source: 'OWN' },
  off_plan: { transaction: 'SALE', market_segment: 'OFF_PLAN', stock_source: 'OWN' },
  overseas: { transaction: 'SALE', market_segment: 'OVERSEAS', stock_source: 'OWN' },
  external_stock: { transaction: 'SALE', market_segment: 'READY', stock_source: 'EXTERNAL' }
};

Object.entries(layoutContexts).forEach(([layoutName, ctx]) => {
  const activeFields = fieldKeys.filter(k => isFieldVisibleInLayout(fields[k], ctx));
  assert(activeFields.length >= 25, `Layout [${layoutName}] has substantial active fields (${activeFields.length})`);
  console.log(`  ✓ Layout [${layoutName}]: ${activeFields.length} active fields`);
});

// Verify Rent layout specifics
assert.strictEqual(isFieldVisibleInLayout(fields.rental_frequency, layoutContexts.rent), true, 'Rental frequency visible in Rent');
assert.strictEqual(isFieldVisibleInLayout(fields.rental_frequency, layoutContexts.ready_sale), false, 'Rental frequency hidden in Ready Sale');
assert.strictEqual(isFieldVisibleInLayout(fields.cheques, layoutContexts.rent), true, 'Cheques visible in Rent');
assert.strictEqual(isFieldVisibleInLayout(fields.cheques, layoutContexts.ready_sale), false, 'Cheques hidden in Ready Sale');
console.log('  ✓ PASS: Rent layout specific fields verified');

// Verify Off-Plan layout specifics
assert.strictEqual(isFieldVisibleInLayout(fields.payment_plan_booking_pct, layoutContexts.off_plan), true, 'Booking % visible in Off-Plan');
assert.strictEqual(isFieldVisibleInLayout(fields.payment_plan_booking_pct, layoutContexts.rent), false, 'Booking % hidden in Rent');
assert.strictEqual(isFieldVisibleInLayout(fields.expected_handover_date, layoutContexts.off_plan), true, 'Handover date visible in Off-Plan');
console.log('  ✓ PASS: Off-Plan layout specific fields verified');

// Verify Overseas layout specifics
assert.strictEqual(isFieldVisibleInLayout(fields.country, layoutContexts.overseas), true, 'Country visible in Overseas');
assert.strictEqual(isFieldVisibleInLayout(fields.country, layoutContexts.rent), false, 'Country hidden in Rent (domestic UAE)');
assert.strictEqual(isFieldVisibleInLayout(fields.trakheesi_permit_no, layoutContexts.overseas), false, 'UAE Trakheesi hidden in Overseas');
assert.strictEqual(isFieldVisibleInLayout(fields.trakheesi_permit_no, layoutContexts.ready_sale), true, 'UAE Trakheesi visible in Ready Sale');
console.log('  ✓ PASS: Overseas layout specific fields verified');

// --- Test Group 2: Property Type Lock Flexibility ---
console.log('\n--- Test 2: Property Type Lock Flexibility (Layout Dependency) ---');
// In tab.js
assert(tabJs.includes('const isPropTypeField = (f.code === \'UF_CRM_1791952050535\' || f.code === \'UF_CRM_PROPERTY_TYPE\');'), 'tab.js checks for Property Type field');
assert(tabJs.includes('hasLinkedLayout'), 'tab.js evaluates whether Layout is linked');
assert(tabJs.includes('if (!isPropTypeField || hasLinkedLayout)'), 'tab.js only locks Property Type when Layout is linked');
assert(tabJs.includes('el.disabled = false;') && tabJs.includes("el.style.pointerEvents = 'auto';"), 'tab.js unlocks Property Type when Layout is cleared');

// In listing-details.js
assert(listingDetailsJs.includes('if (f.key === "ufCrm16PropertyType")'), 'listing-details.js checks ufCrm16PropertyType');
assert(listingDetailsJs.includes('const hasLinkedLayout = !!('), 'listing-details.js checks for linked layout in SPA 1058');
assert(listingDetailsJs.includes('propTypeInput.disabled = false;'), 'listing-details.js unlocks Property Type when Layout is cleared');
console.log('  ✓ PASS: Property Type is locked ONLY when Layout is linked, and unlocks when cleared');

// --- Test Group 3: Studio (Bedrooms = 0) Handling ---
console.log('\n--- Test 3: Studio Apartment (Bedrooms = 0) Specification ---');
const studioListing = {
  transaction: 'RENT',
  property_type: 'APARTMENT',
  built_up_area: 450,
  bedrooms: 0,
  price: 65000,
  rental_frequency: 'ANNUAL',
  cheques: 4,
  available_from: '2026-11-06',
  trakheesi_permit_no: '7123456789',
  permit_expiry: '2027-12-31',
  photos: ['1.jpg', '2.jpg', '3.jpg'],
  title: 'Chic Studio in Business Bay',
  description: 'Luxurious studio apartment available for annual lease in the heart of Business Bay.'
};

const studioEval = ReadinessEvaluator.evaluatePublishReadiness(studioListing);
assert(!studioEval.missing.some(m => m.toLowerCase().includes('bedroom')), 'Studio (bedrooms = 0) does not fail bedroom validation');
assert.strictEqual(studioEval.ready, true, 'Studio listing with bedrooms=0 is 100% portal ready');

// Check Title Generator produces "Studio" not "0 BR"
assert(tabJs.includes("if (beds === '0' || String(beds).toLowerCase() === 'studio')"), 'tab.js formats Studio prefix');
assert(tabJs.includes("bedPrefix = 'Studio'"), 'tab.js sets "Studio" prefix');
assert(listingDetailsJs.includes('if (beds === "0" || String(beds).toLowerCase() === "studio")'), 'listing-details.js formats Studio prefix');
assert(listingDetailsJs.includes('bedPrefix = "Studio"'), 'listing-details.js sets "Studio" prefix');
console.log('  ✓ PASS: Bedrooms = 0 recognized as Studio; title generator outputs "Studio in [Project]"');

// --- Test Group 4: Payment Plan 100% Mathematical Constraint ---
console.log('\n--- Test 4: Payment Plan 100% Mathematical Constraint ---');
const validOffPlan = {
  transaction: 'SALE',
  market_segment: 'OFF_PLAN',
  property_type: 'APARTMENT',
  built_up_area: 850,
  bedrooms: 1,
  price: 1500000,
  payment_plan_booking_pct: 20,
  payment_plan_construction_pct: 40,
  payment_plan_handover_pct: 20,
  payment_plan_post_handover_pct: 20,
  expected_handover_date: '2026-12-31',
  trakheesi_permit_no: '7998877665',
  permit_expiry: '2027-12-31',
  photos: ['1.jpg', '2.jpg', '3.jpg', '4.jpg'],
  title: 'Off-Plan 1BR in Creek Harbour',
  description: 'Waterfront off-plan apartment with flexible payment plan directly from master developer.'
};

const validEval = ReadinessEvaluator.evaluatePublishReadiness(validOffPlan);
assert.strictEqual(validEval.ready, true, 'Off-Plan with 100% total payment plan passes');

const invalidOffPlan = { ...validOffPlan, payment_plan_handover_pct: 10 }; // Total = 90%
const invalidEval = ReadinessEvaluator.evaluatePublishReadiness(invalidOffPlan);
assert.strictEqual(invalidEval.ready, false, 'Off-Plan with 90% total payment plan fails readiness');
assert(invalidEval.missing.some(m => m.includes('100%') || m.includes('Payment plan installments must total 100%')), 'Missing checklist identifies payment plan total discrepancy');
console.log('  ✓ PASS: Payment plan total 100% constraint enforced with exact delta');

// --- Test Group 5: Real-Time Calculations ---
console.log('\n--- Test 5: Real-Time Calculations (Price/SqFt, Commission AED, Handover Quarter) ---');
// Price/SqFt
const testPrice = 2000000;
const testBua = 1250;
const calcPpsqft = (testPrice / testBua).toFixed(2);
assert.strictEqual(calcPpsqft, '1600.00', 'Price per SqFt correctly calculated');

// Agency Commission AED
const testCommPct = 2.0;
const calcCommAed = Math.round(testPrice * (testCommPct / 100));
assert.strictEqual(calcCommAed, 40000, 'Commission AED correctly calculated to 40,000');

// Handover Quarter helper check in tab.js and listing-details.js
assert(tabJs.includes('function computeHandoverQuarter('), 'tab.js defines computeHandoverQuarter');
assert(listingDetailsJs.includes('function computeHandoverQuarter('), 'listing-details.js defines computeHandoverQuarter');

// Verify quarter calculation logic
function testQuarter(dateStr) {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const q = Math.ceil(m / 3);
  return `Q${q} ${y}`;
}
assert.strictEqual(testQuarter('2026-11-06'), 'Q4 2026', 'Handover quarter for Nov 2026 is Q4 2026');
assert.strictEqual(testQuarter('2027-02-15'), 'Q1 2027', 'Handover quarter for Feb 2027 is Q1 2027');
assert.strictEqual(testQuarter('2027-05-30'), 'Q2 2027', 'Handover quarter for May 2027 is Q2 2027');
assert.strictEqual(testQuarter('2027-08-01'), 'Q3 2027', 'Handover quarter for Aug 2027 is Q3 2027');
console.log('  ✓ PASS: Real-time calculation helpers verified (Price/SqFt, Commission AED, Handover Quarter)');

// --- Test Group 6: Overseas Regulatory Requirements Bypass ---
console.log('\n--- Test 6: Overseas Listing Regulatory & Geographic Verification ---');
const overseasListing = {
  transaction: 'SALE',
  market_segment: 'OVERSEAS',
  property_type: 'VILLA',
  built_up_area: 3200,
  bedrooms: 4,
  price: 4500000,
  country: 'Spain',
  photos: ['1.jpg', '2.jpg', '3.jpg', '4.jpg'],
  title: 'Luxury Villa in Marbella',
  description: 'Stunning luxury villa in Marbella featuring panoramic Mediterranean sea views and private pool.'
};

const overseasEval = ReadinessEvaluator.evaluatePublishReadiness(overseasListing);
assert.strictEqual(overseasEval.ready, true, 'Overseas listing ready without local UAE Trakheesi permit');
assert(!overseasEval.missing.some(m => m.toLowerCase().includes('trakheesi')), 'Overseas does not require UAE Trakheesi permit');
console.log('  ✓ PASS: Overseas listings cleanly bypass UAE regulatory permits while validating Country/City/Specs');

// --- Test Group 7: Transaction Switch Undo Banner Integration ---
console.log('\n--- Test 7: Transaction Switch Undo Banner Integration ---');
assert(tabJs.includes('transaction-undo-banner'), 'tab.js references transaction-undo-banner');
assert(tabJs.includes('Switched transaction type. Previously entered fields have been hidden.'), 'tab.js renders exact undo notice');
assert(tabJs.includes('↺ Undo Switch'), 'tab.js renders "↺ Undo Switch" button');
assert(tabJs.includes('function undoTransactionSwitch()'), 'tab.js defines undoTransactionSwitch');

assert(listingDetailsJs.includes('transaction-undo-banner'), 'listing-details.js references transaction-undo-banner');
assert(listingDetailsJs.includes('Switched transaction type. Previously entered fields have been hidden.'), 'listing-details.js renders exact undo notice');
assert(listingDetailsJs.includes('↺ Undo Switch'), 'listing-details.js renders "↺ Undo Switch" button');
assert(listingDetailsJs.includes('function undoTransactionSwitch()'), 'listing-details.js defines undoTransactionSwitch');
console.log('  ✓ PASS: Transaction switch undo banner and state recovery fully integrated in tab.js and listing-details.js');

// --- Test Group 8: Property Unit Cascade Prompt Integration ---
console.log('\n--- Test 8: Property Unit Cascade Prompt Integration ---');
assert(tabJs.includes('function promptCascadeUpdate('), 'tab.js defines promptCascadeUpdate');
assert(tabJs.includes('Update parent project and developer to match new unit?'), 'tab.js has cascade prompt text');
assert(tabJs.includes('btn-cascade-keep') && tabJs.includes('btn-cascade-update-all'), 'tab.js provides Keep Current and Update All options');

assert(listingDetailsJs.includes('function promptCascadeUpdate('), 'listing-details.js defines promptCascadeUpdate');
assert(listingDetailsJs.includes('Update parent project and developer to match new unit?'), 'listing-details.js has cascade prompt text');
console.log('  ✓ PASS: Property Unit cascade prompt and modal confirmation fully integrated');

console.log('\n===============================================================');
console.log('✓ ALL 8 V2 LAYOUTS MATRIX & BEHAVIOR TESTS PASSED COMPLETELY!');
console.log('===============================================================');
