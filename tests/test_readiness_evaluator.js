/**
 * tests/test_readiness_evaluator.js
 * Unit test suite for pure-function Publish Readiness Evaluator (Section C3 & C6)
 */

const assert = require('assert');
const { evaluatePublishReadiness } = require('../src/readinessEvaluator');

console.log('===============================================================');
console.log('   Running Publish Readiness Evaluator Unit Tests');
console.log('===============================================================\n');

// 1. Empty / Incomplete Item Check
console.log('--- Test 1: Empty and Incomplete Listings ---');
const emptyRes = evaluatePublishReadiness(null);
assert.strictEqual(emptyRes.ready, false);
assert(emptyRes.missing.length > 0);

const partialRes = evaluatePublishReadiness({
  title: 'Short',
  price: 500000
});
assert.strictEqual(partialRes.ready, false);
assert(partialRes.missing.some(m => m.includes('minimum 10 characters')));
assert(partialRes.missing.some(m => m.includes('Property Type')));
assert(partialRes.missing.some(m => m.includes('Built-up Area')));
console.log('  ✓ PASS: Empty and partial listings flagged as unready');

// 2. Studio Apartment Handling (Bedrooms = 0)
console.log('\n--- Test 2: Studio Apartment Handling (Bedrooms = 0) ---');
const studioListing = {
  transaction: 'RENT',
  property_type: 'APARTMENT',
  bedrooms: 0, // Studio!
  bathrooms: 1,
  built_up_area: 450,
  price: 65000,
  cheques: '4', // Rental frequency removed; cheques covers it
  available_from: '2026-12-01',
  trakheesi_permit_no: '7129845300',
  permit_expiry: '2027-11-01',
  form_a_expiry: '2027-12-31',
  signed_form_a: ['signed_form_a.pdf'],
  title: 'Charming Studio Apartment in Business Bay Canal View',
  description: 'Spacious studio apartment located in the heart of Business Bay with modern finishes and panoramic canal vistas. Close to metro and retail.',
  photos: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg']
};
const studioRes = evaluatePublishReadiness(studioListing);
assert(!studioRes.missing.some(m => m.toLowerCase().includes('bedroom')), 'Studio (bedrooms = 0) MUST NOT be flagged as missing bedrooms');
assert.strictEqual(studioRes.ready, true, `Studio should be 100% publish-ready. Missing: ${studioRes.missing.join(', ')}`);
assert.strictEqual(studioRes.score, 100, 'Ready studio listing must score exactly 100%');
console.log('  ✓ PASS: Studio (bedrooms = 0) passes specification validation cleanly');

// 3. Off-Plan Payment Plan Validation (Must sum to 100%)
console.log('\n--- Test 3: Off-Plan Payment Plan Total 100% Rule ---');
const offPlanIncomplete = {
  transaction: 'SALE',
  market_segment: 'OFF_PLAN',
  property_type: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 2,
  built_up_area: 1200,
  price: 2500000,
  expected_handover_date: '2028-06-30',
  payment_plan_booking_pct: 20,
  payment_plan_construction_pct: 40,
  payment_plan_handover_pct: 20, // Total = 80% (fails!)
  trakheesi_permit_no: '7129845300',
  permit_expiry: '2027-11-01',
  title: 'Luxury 2BR Waterfront Residence at Dubai Harbour',
  description: 'Prestigious waterfront apartment with private beach access and exceptional amenities. Direct developer payment plan.',
  photos: ['1.jpg', '2.jpg', '3.jpg']
};
const offPlanIncompleteRes = evaluatePublishReadiness(offPlanIncomplete);
assert.strictEqual(offPlanIncompleteRes.ready, false);
assert(offPlanIncompleteRes.missing.some(m => m.includes('total exactly 100% (currently 80%)')), 'Flags non-100% payment plan');

// Fix payment plan to total 100%
const offPlanComplete = {
  ...offPlanIncomplete,
  payment_plan_handover_pct: 40 // 20 + 40 + 40 = 100%
};
const offPlanCompleteRes = evaluatePublishReadiness(offPlanComplete);
assert(!offPlanCompleteRes.missing.some(m => m.includes('payment plan')), 'Valid 100% payment plan passes cleanly');
assert.strictEqual(offPlanCompleteRes.ready, true, `Complete off-plan listing is publish-ready: ${offPlanCompleteRes.missing.join(', ')}`);
assert.strictEqual(offPlanCompleteRes.score, 100, 'Complete off-plan listing has 100% score');
console.log('  ✓ PASS: Payment plan 100% mathematical constraint verified');

// 4. DLD / RERA Regulatory Compliance
console.log('\n--- Test 4: DLD / RERA Regulatory Validation ---');
const expiredPermitListing = {
  ...studioListing,
  permit_expiry: '2025-01-01' // Expired in the past!
};
const expiredPermitRes = evaluatePublishReadiness(expiredPermitListing);
assert.strictEqual(expiredPermitRes.ready, false);
assert(expiredPermitRes.missing.some(m => m.includes('DLD Trakheesi Permit has expired')));

const nearExpiryListing = {
  ...studioListing,
  permit_expiry: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // Expires in 3 days
};
const nearExpiryRes = evaluatePublishReadiness(nearExpiryListing);
assert(nearExpiryRes.warnings.some(w => w.includes('expires in 3 days') || w.includes('expires in 4 days')));
console.log('  ✓ PASS: DLD Trakheesi permit expiry and warning thresholds verified');

// 5. Photos Requirement (Minimum 3)
console.log('\n--- Test 5: Media Requirements (Minimum 3 Photos) ---');
const twoPhotosListing = {
  ...studioListing,
  photos: ['photo1.jpg', 'photo2.jpg']
};
const twoPhotosRes = evaluatePublishReadiness(twoPhotosListing);
assert.strictEqual(twoPhotosRes.ready, false);
assert(twoPhotosRes.missing.some(m => m.includes('Minimum 3 property photos required')));
console.log('  ✓ PASS: Media photo threshold enforced (min 3)');

// 6. Overseas Listing Non-DLD Rules
console.log('\n--- Test 6: Overseas Listing Requirements ---');
const overseasListing = {
  transaction: 'SALE',
  market_segment: 'OVERSEAS',
  country: 'United Kingdom',
  city: 'London',
  address: '9 Circus Rd W, Nine Elms',
  currency: 'GBP',
  property_type: 'APARTMENT',
  bedrooms: 1,
  bathrooms: 1,
  built_up_area: 650,
  price: 450000,
  title: 'Prime 1-Bedroom Apartment in Central London Battersea',
  description: 'Exceptional residential development with high rental yields in Battersea Power Station. Modern amenities and concierge.',
  photos: ['1.jpg', '2.jpg', '3.jpg']
};
const overseasRes = evaluatePublishReadiness(overseasListing);
// Overseas should NOT require DLD Trakheesi permit
assert(!overseasRes.missing.some(m => m.includes('Trakheesi')), 'Overseas listing does not require UAE Trakheesi permit');
assert.strictEqual(overseasRes.ready, true, `Overseas listing is publish-ready: ${overseasRes.missing.join(', ')}`);
assert.strictEqual(overseasRes.score, 100, 'Complete overseas listing has 100% score');
console.log('  ✓ PASS: Overseas listings adaptively bypass local UAE regulatory permit requirements');

// 7. Score Calculation Strictly Over Required Items (Optional Items Ignored)
console.log('\n--- Test 7: Score Calculation Strictly Over Required Items ---');
const partialStudio = { ...studioListing };
delete partialStudio.price; // 1 required item missing
const partialEval = evaluatePublishReadiness(partialStudio);
assert.strictEqual(partialEval.ready, false);
assert(partialEval.score < 100 && partialEval.score > 85, `Score should reflect ratio of satisfied required items: ${partialEval.score}%`);
assert.strictEqual(partialEval.summary.totalRequired, partialEval.summary.satisfiedRequired + 1, 'Missing count exactly equals unsatisfied required items');
console.log(`  ✓ PASS: Score strictly reflects required fields (${partialEval.summary.satisfiedRequired}/${partialEval.summary.totalRequired} = ${partialEval.score}%)`);

console.log('\n===============================================================');
console.log('✓ ALL PUBLISH READINESS EVALUATOR UNIT TESTS PASSED!');
console.log('===============================================================\n');
