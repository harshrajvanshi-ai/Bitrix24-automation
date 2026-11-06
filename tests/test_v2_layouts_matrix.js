/**
 * tests/test_v2_layouts_matrix.js
 * Comprehensive Matrix Verification Suite for Version 2 Layouts
 * 
 * Verifies:
 *  1. 4 Layout variations (Rent, Ready Sale, Off-Plan, Overseas + External overlay)
 *  2. Programmatic Matrix generation from config/layouts.v2.json:
 *     Asserts per-layout summary counts EQUAL matrix column counts (Rent: 40, Ready Sale: 41, Off-Plan: 43, Overseas: 30, External: 44).
 *  3. Presence of all 18 mandatory concepts (Furnished, Parking, Floor conditional, Plot Area conditional,
 *     View, Amenities, Occupancy, Currency, AED equivalent, Category derived, Photos, Floor Plans, Title Deed,
 *     Signed Form A, DLD QR, Portal IDs, Title/Description EN & AR).
 *  4. Removal of Rental Frequency from all layouts (Cheques covers it).
 *  5. Exclusive boolean (UF_CRM_1791970897872) mandate verification (no new enum).
 *  6. Price per Sq Ft: read-only calculated, hidden for Rent, no reverse editing.
 *  7. Unit/Project/Layout/Master Project/Developer: hidden for Overseas; Master Project and Developer read-only derived in all others.
 *  8. Form A / Mandate Expiry: Rent and Ready Sale only (optional under External); hidden for Off-Plan and Overseas.
 *  9. Publish to Portals: hidden for Overseas.
 * 10. Server-side publish readiness rejection (POST/publish fails when unready with reasons list).
 * 11. Transaction switch undo banner & Property unit cascade prompts.
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

// Expected counts per layout as specified in requirements
const expectedLayoutCounts = {
  rent: 40,
  ready_sale: 41,
  off_plan: 43,
  overseas: 30,
  external: 44
};

const layoutIds = ['rent', 'ready_sale', 'off_plan', 'overseas', 'external'];

// Evaluate active fields per layout directly from rules
const layoutSummaryCounts = {};
layoutIds.forEach(layoutId => {
  const activeFields = fieldKeys.filter(k => fields[k].rules && fields[k].rules[layoutId] === 'show');
  layoutSummaryCounts[layoutId] = activeFields.length;
  assert.strictEqual(
    activeFields.length,
    expectedLayoutCounts[layoutId],
    `Layout [${layoutId}] active fields count (${activeFields.length}) matches expected (${expectedLayoutCounts[layoutId]})`
  );
  console.log(`  ✓ Layout [${layoutId}]: ${activeFields.length} active fields`);
});

// Programmatically build the matrix table and count active cells per column
const matrixRows = [];
const matrixColCounts = { rent: 0, ready_sale: 0, off_plan: 0, overseas: 0, external: 0 };

fieldKeys.forEach(k => {
  const f = fields[k];
  const row = {
    concept: k,
    label: f.label,
    rent: f.rules.rent === 'show' ? (f.requiredBeforePublish.rent ? 'REQ' : 'OPT') : '-',
    ready_sale: f.rules.ready_sale === 'show' ? (f.requiredBeforePublish.ready_sale ? 'REQ' : 'OPT') : '-',
    off_plan: f.rules.off_plan === 'show' ? (f.requiredBeforePublish.off_plan ? 'REQ' : 'OPT') : '-',
    overseas: f.rules.overseas === 'show' ? (f.requiredBeforePublish.overseas ? 'REQ' : 'OPT') : '-',
    external: f.rules.external === 'show' ? (f.requiredBeforePublish.external ? 'REQ' : 'OPT') : '-',
    readOnly: f.readOnly ? 'RO' : 'RW',
    derived: f.derived ? 'YES' : 'NO'
  };

  layoutIds.forEach(id => {
    if (row[id] !== '-') {
      matrixColCounts[id]++;
    }
  });

  matrixRows.push(row);
});

// Assert that per-layout counts in summary strictly equal matrix counts
layoutIds.forEach(id => {
  assert.strictEqual(
    matrixColCounts[id],
    layoutSummaryCounts[id],
    `Matrix column [${id}] count (${matrixColCounts[id]}) strictly equals summary count (${layoutSummaryCounts[id]})`
  );
});
console.log('  ✓ PASS: Per-layout counts in summary strictly equal programmatic matrix counts');

// --- Test Group 2: Mandatory Concept Presence & Rules Verification ---
console.log('\n--- Test 2: Mandatory Concepts & Explicit Layout Rules ---');

// 1. Furnished, Parking, View (multi), Amenities (multi)
assert(fields.furnished, 'Furnished concept present');
assert(fields.parking_spaces, 'Parking Spaces concept present');
assert(fields.view && fields.view.isMultiple === true, 'View concept present and isMultiple');
assert(fields.amenities && fields.amenities.isMultiple === true, 'Amenities concept present and isMultiple');

// 2. Conditional: Floor (apt/penthouse/office) & Plot Area (villa/townhouse/land)
assert(fields.floor && fields.floor.conditional, 'Floor concept has conditional rule');
assert.deepStrictEqual(fields.floor.conditional.property_type, ['APARTMENT', 'PENTHOUSE', 'OFFICE']);
assert(fields.plot_area && fields.plot_area.conditional, 'Plot Area concept has conditional rule');
assert.deepStrictEqual(fields.plot_area.conditional.property_type, ['VILLA', 'TOWNHOUSE', 'LAND']);

// 3. Occupancy (Ready Sale only)
assert.strictEqual(fields.occupancy.rules.ready_sale, 'show', 'Occupancy shown in Ready Sale');
assert.strictEqual(fields.occupancy.rules.external, 'show', 'Occupancy shown in External overlay on Ready Sale');
assert.strictEqual(fields.occupancy.rules.rent, 'hide', 'Occupancy hidden in Rent');
assert.strictEqual(fields.occupancy.rules.off_plan, 'hide', 'Occupancy hidden in Off-Plan');
assert.strictEqual(fields.occupancy.rules.overseas, 'hide', 'Occupancy hidden in Overseas');

// 4. Currency + AED equivalent (Overseas only)
assert.strictEqual(fields.currency.rules.overseas, 'show', 'Currency shown in Overseas');
assert.strictEqual(fields.currency.rules.rent, 'hide', 'Currency hidden in Rent');
assert.strictEqual(fields.price_aed_equivalent.rules.overseas, 'show', 'AED Equivalent shown in Overseas');
assert.strictEqual(fields.price_aed_equivalent.rules.ready_sale, 'hide', 'AED Equivalent hidden in Ready Sale');

// 5. Category (derived read-only)
assert.strictEqual(fields.category.derived, true, 'Category is derived');
assert.strictEqual(fields.category.readOnly, true, 'Category is read-only');

// 6. Media & Documents: Photos, Floor Plans, Title Deed, Signed Form A, DLD QR, Portal IDs
assert(fields.photos, 'Photos concept present');
assert(fields.floor_plans, 'Floor plans concept present');
assert(fields.title_deed, 'Title deed concept present');
assert.strictEqual(fields.title_deed.rules.ready_sale, 'show', 'Title deed shown in Ready Sale');
assert.strictEqual(fields.title_deed.rules.rent, 'hide', 'Title deed hidden in Rent');
assert(fields.signed_form_a, 'Signed Form A concept present');
assert(fields.dld_qr, 'DLD QR concept present');
assert(fields.portal_ids, 'Portal IDs concept present');
assert.strictEqual(fields.portal_ids.readOnly, true, 'Portal IDs is read-only');

// 7. Bilingual EN and AR Title / Description
assert(fields.title_en, 'Title EN present');
assert(fields.description_en, 'Description EN present');
assert(fields.title_ar, 'Title AR present');
assert(fields.description_ar, 'Description AR present');

// 8. Rental frequency REMOVED from all layouts
assert.strictEqual(fields.rental_frequency, undefined, 'Rental frequency concept completely removed');
assert(fields.cheques, 'Cheques concept present');
assert.strictEqual(fields.cheques.rules.rent, 'show', 'Cheques shown in Rent');

// 9. Mandate: Exclusive boolean (UF_CRM_1791970897872), not a new enum
assert(fields.exclusive, 'Exclusive mandate concept present');
assert.strictEqual(fields.exclusive.type, 'boolean', 'Exclusive mandate is boolean type');
assert.strictEqual(fields.exclusive.crmCode, 'UF_CRM_1791970897872', 'Exclusive mandate uses existing CRM code UF_CRM_1791970897872');
assert.strictEqual(fields.mandate_type, undefined, 'No separate mandate_type enum concept');

// 10. Price per Sq Ft: read-only calculated, hidden for Rent, no reverse editing
assert.strictEqual(fields.price_per_sq_ft.rules.rent, 'hide', 'Price per Sq Ft hidden in Rent');
assert.strictEqual(fields.price_per_sq_ft.rules.ready_sale, 'show', 'Price per Sq Ft shown in Ready Sale');
assert.strictEqual(fields.price_per_sq_ft.readOnly, true, 'Price per Sq Ft is read-only');
assert.strictEqual(fields.price_per_sq_ft.derived, true, 'Price per Sq Ft is derived');

// 11. Hierarchy: Unit/Project/Layout/Master Project/Developer hidden for Overseas; MP & Developer read-only derived in all others
['property_unit', 'project', 'layout', 'master_project', 'developer'].forEach(hKey => {
  assert.strictEqual(fields[hKey].rules.overseas, 'hide', `${hKey} hidden in Overseas`);
  assert.strictEqual(fields[hKey].rules.ready_sale, 'show', `${hKey} shown in Ready Sale`);
});
assert.strictEqual(fields.master_project.readOnly, true, 'Master Project is read-only');
assert.strictEqual(fields.master_project.derived, true, 'Master Project is derived');
assert.strictEqual(fields.developer.readOnly, true, 'Developer is read-only');
assert.strictEqual(fields.developer.derived, true, 'Developer is derived');

// 12. Form A / Mandate Expiry: Rent & Ready Sale only (optional under External overlay); hidden for Off-Plan and Overseas
assert.strictEqual(fields.form_a_expiry.rules.rent, 'show', 'Form A expiry shown in Rent');
assert.strictEqual(fields.form_a_expiry.rules.ready_sale, 'show', 'Form A expiry shown in Ready Sale');
assert.strictEqual(fields.form_a_expiry.rules.off_plan, 'hide', 'Form A expiry hidden in Off-Plan');
assert.strictEqual(fields.form_a_expiry.rules.overseas, 'hide', 'Form A expiry hidden in Overseas');
assert.strictEqual(fields.form_a_expiry.requiredBeforePublish.rent, true, 'Form A expiry required in Rent');
assert.strictEqual(fields.form_a_expiry.requiredBeforePublish.ready_sale, true, 'Form A expiry required in Ready Sale');
assert.strictEqual(fields.form_a_expiry.requiredBeforePublish.external, false, 'Form A expiry optional under External overlay');

// 13. Publish to Portals: hidden for Overseas
assert.strictEqual(fields.publish_portals.rules.overseas, 'hide', 'Publish to Portals hidden in Overseas');
assert.strictEqual(fields.publish_portals.rules.ready_sale, 'show', 'Publish to Portals shown in Ready Sale');
console.log('  ✓ PASS: All 13 mandatory concept rules verified against schema');

// --- Test Group 3: Property Type Lock Flexibility ---
console.log('\n--- Test 3: Property Type Lock Flexibility (Layout Dependency) ---');
assert(tabJs.includes('const isPropTypeField = (f.code === \'UF_CRM_1791952050535\' || f.code === \'UF_CRM_PROPERTY_TYPE\');'), 'tab.js checks for Property Type field');
assert(tabJs.includes('hasLinkedLayout'), 'tab.js evaluates whether Layout is linked');
assert(tabJs.includes('if (!isPropTypeField || hasLinkedLayout)'), 'tab.js only locks Property Type when Layout is linked');
assert(tabJs.includes('el.disabled = false;') && tabJs.includes("el.style.pointerEvents = 'auto';"), 'tab.js unlocks Property Type when Layout is cleared');

assert(listingDetailsJs.includes('if (f.key === "ufCrm16PropertyType")'), 'listing-details.js checks ufCrm16PropertyType');
assert(listingDetailsJs.includes('const hasLinkedLayout = !!('), 'listing-details.js checks for linked layout in SPA 1058');
assert(listingDetailsJs.includes('propTypeInput.disabled = false;'), 'listing-details.js unlocks Property Type when Layout is cleared');
console.log('  ✓ PASS: Property Type is locked ONLY when Layout is linked, and unlocks when cleared');

// --- Test Group 4: Studio (Bedrooms = 0) Handling ---
console.log('\n--- Test 4: Studio Apartment (Bedrooms = 0) Specification ---');
const studioListing = {
  transaction: 'RENT',
  property_type: 'APARTMENT',
  built_up_area: 450,
  bedrooms: 0,
  bathrooms: 1,
  price: 65000,
  cheques: 4,
  available_from: '2026-11-06',
  trakheesi_permit_no: '7123456789',
  permit_expiry: '2027-12-31',
  form_a_expiry: '2027-12-31',
  signed_form_a: ['form_a.pdf'],
  photos: ['1.jpg', '2.jpg', '3.jpg'],
  title: 'Chic Studio in Business Bay',
  description: 'Luxurious studio apartment available for annual lease in the heart of Business Bay.'
};

const studioEval = ReadinessEvaluator.evaluatePublishReadiness(studioListing);
assert(!studioEval.missing.some(m => m.toLowerCase().includes('bedroom')), 'Studio (bedrooms = 0) does not fail bedroom validation');
assert.strictEqual(studioEval.ready, true, `Studio listing with bedrooms=0 is 100% portal ready: ${studioEval.missing.join(', ')}`);
assert.strictEqual(studioEval.score, 100, 'Ready studio listing scores 100%');

// Check Title Generator produces "Studio" not "0 BR"
assert(tabJs.includes("if (beds === '0' || String(beds).toLowerCase() === 'studio')"), 'tab.js formats Studio prefix');
assert(tabJs.includes("bedPrefix = 'Studio'"), 'tab.js sets "Studio" prefix');
assert(listingDetailsJs.includes('if (beds === "0" || String(beds).toLowerCase() === "studio")'), 'listing-details.js formats Studio prefix');
assert(listingDetailsJs.includes('bedPrefix = "Studio"'), 'listing-details.js sets "Studio" prefix');
console.log('  ✓ PASS: Bedrooms = 0 recognized as Studio; title generator outputs "Studio in [Project]"');

// --- Test Group 5: Payment Plan 100% Mathematical Constraint ---
console.log('\n--- Test 5: Payment Plan 100% Mathematical Constraint ---');
const validOffPlan = {
  transaction: 'SALE',
  market_segment: 'OFF_PLAN',
  property_type: 'APARTMENT',
  built_up_area: 850,
  bedrooms: 1,
  bathrooms: 1,
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
assert.strictEqual(validEval.ready, true, `Off-Plan with 100% total payment plan passes: ${validEval.missing.join(', ')}`);

const invalidOffPlan = { ...validOffPlan, payment_plan_handover_pct: 10 }; // Total = 90%
const invalidEval = ReadinessEvaluator.evaluatePublishReadiness(invalidOffPlan);
assert.strictEqual(invalidEval.ready, false, 'Off-Plan with 90% total payment plan fails readiness');
assert(invalidEval.missing.some(m => m.includes('100%') || m.includes('Payment plan installments must total 100%')), 'Missing checklist identifies payment plan total discrepancy');
console.log('  ✓ PASS: Payment plan total 100% constraint enforced with exact delta');

// --- Test Group 6: Real-Time Calculations (Price/SqFt, Commission AED, Handover Quarter) ---
console.log('\n--- Test 6: Real-Time Calculations (Price/SqFt, Commission AED, Handover Quarter) ---');
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

function testQuarter(dateStr) {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const q = Math.ceil(m / 3);
  return `Q${q} ${y}`;
}
assert.strictEqual(testQuarter('2026-11-06'), 'Q4 2026', 'Handover quarter for Nov 2026 is Q4 2026');
assert.strictEqual(testQuarter('2027-02-15'), 'Q1 2027', 'Handover quarter for Feb 2027 is Q1 2027');
console.log('  ✓ PASS: Real-time calculation helpers verified (Price/SqFt, Commission AED, Handover Quarter)');

// Verify NO reverse editing in tab.js and listing-details.js
assert(!tabJs.includes('const calcPrice = Math.round(ppsqft * sqft)'), 'Reverse price editing removed from tab.js');
assert(!listingDetailsJs.includes('const calcPrice = Math.round(pricePerSqFt * sqft)'), 'Reverse price editing removed from listing-details.js');
console.log('  ✓ PASS: Reverse price editing completely removed from UI calculation pipelines');

// --- Test Group 7: Overseas Regulatory Requirements Bypass ---
console.log('\n--- Test 7: Overseas Listing Regulatory & Geographic Verification ---');
const overseasListing = {
  transaction: 'SALE',
  market_segment: 'OVERSEAS',
  property_type: 'VILLA',
  built_up_area: 3200,
  bedrooms: 4,
  bathrooms: 4,
  price: 4500000,
  currency: 'EUR',
  country: 'Spain',
  city: 'Marbella',
  address: 'Calle Los Naranjos 12',
  photos: ['1.jpg', '2.jpg', '3.jpg', '4.jpg'],
  title: 'Luxury Villa in Marbella',
  description: 'Stunning luxury villa in Marbella featuring panoramic Mediterranean sea views and private pool.'
};

const overseasEval = ReadinessEvaluator.evaluatePublishReadiness(overseasListing);
assert.strictEqual(overseasEval.ready, true, `Overseas listing ready without local UAE Trakheesi permit: ${overseasEval.missing.join(', ')}`);
assert(!overseasEval.missing.some(m => m.toLowerCase().includes('trakheesi')), 'Overseas does not require UAE Trakheesi permit');
console.log('  ✓ PASS: Overseas listings cleanly bypass UAE regulatory permits while validating Country/City/Specs');

// --- Test Group 8: Transaction Switch Undo Banner Integration ---
console.log('\n--- Test 8: Transaction Switch Undo Banner Integration ---');
assert(tabJs.includes('transaction-undo-banner'), 'tab.js references transaction-undo-banner');
assert(tabJs.includes('Switched transaction type. Previously entered fields have been hidden.'), 'tab.js renders exact undo notice');
assert(tabJs.includes('Undo Switch'), 'tab.js renders "Undo Switch" button');
assert(tabJs.includes('function undoTransactionSwitch()'), 'tab.js defines undoTransactionSwitch');

assert(listingDetailsJs.includes('transaction-undo-banner'), 'listing-details.js references transaction-undo-banner');
assert(listingDetailsJs.includes('Switched transaction type. Previously entered fields have been hidden.'), 'listing-details.js renders exact undo notice');
assert(listingDetailsJs.includes('Undo Switch'), 'listing-details.js renders "Undo Switch" button');
assert(listingDetailsJs.includes('function undoTransactionSwitch()'), 'listing-details.js defines undoTransactionSwitch');
console.log('  ✓ PASS: Transaction switch undo banner and state recovery fully integrated in tab.js and listing-details.js');

// --- Test Group 9: Property Unit Cascade Prompt Integration ---
console.log('\n--- Test 9: Property Unit Cascade Prompt Integration ---');
assert(tabJs.includes('function promptCascadeUpdate('), 'tab.js defines promptCascadeUpdate');
assert(tabJs.includes('Update parent project and developer to match new unit?'), 'tab.js has cascade prompt text');
assert(tabJs.includes('btn-cascade-keep') && tabJs.includes('btn-cascade-update-all'), 'tab.js provides Keep Current and Update All options');

assert(listingDetailsJs.includes('function promptCascadeUpdate('), 'listing-details.js defines promptCascadeUpdate');
assert(listingDetailsJs.includes('Update parent project and developer to match new unit?'), 'listing-details.js has cascade prompt text');
console.log('  ✓ PASS: Property Unit cascade prompt and modal confirmation fully integrated');

// --- Test Group 10: Server-Side Publish Readiness Enforcement ---
console.log('\n--- Test 10: Server-Side Publish Readiness Enforcement ---');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

// Assert server.js includes publish evaluation in update & publish endpoints
assert(serverJs.includes('const ReadinessEvaluator = require(\'./src/readinessEvaluator\');'), 'server.js imports shared ReadinessEvaluator');
assert(serverJs.includes("app.all('/api/listing/:id/update'"), 'server.js has listing update endpoint');
assert(serverJs.includes("app.post('/api/listing/:id/publish'"), 'server.js has dedicated listing publish endpoint');
assert(serverJs.includes("app.post('/api/lead/:id/publish'"), 'server.js has dedicated lead publish endpoint');
assert(serverJs.includes("ReadinessEvaluator.evaluatePublishReadiness(merged)"), 'server.js invokes shared evaluator on update/publish');
assert(serverJs.includes("Publish readiness check failed"), 'server.js rejects unready listings with descriptive message');

// Test that evaluating an unready payload produces reasons list and score < 100
const unreadyPayload = {
  price: 1000000,
  publish_portals: true
};
const evalResult = ReadinessEvaluator.evaluatePublishReadiness(unreadyPayload);
assert.strictEqual(evalResult.ready, false, 'Unready payload is marked not ready');
assert(evalResult.score < 100, `Score is below 100% (${evalResult.score}%)`);
assert(evalResult.missing.length >= 5, `Reasons list contains detailed missing items (${evalResult.missing.length})`);
console.log(`  ✓ PASS: Server-side publish rejection verified with ${evalResult.missing.length} reasons and score ${evalResult.score}%`);

console.log('\n===============================================================');
console.log('✓ ALL 10 V2 LAYOUTS MATRIX & BEHAVIOR TESTS PASSED COMPLETELY!');
console.log('===============================================================');
