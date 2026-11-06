/**
 * tests/test_create_v2_fields_dry_run.js
 * Unit test verifying create_v2_fields.js dry-run idempotency and safety
 */

const assert = require('assert');
const { run, V2_FIELD_SPECS } = require('../scripts/create_v2_fields');

console.log('===============================================================');
console.log('   Running create_v2_fields.js Dry-Run Idempotency Test');
console.log('===============================================================\n');

async function testDryRun() {
  // First run
  console.log('--- Run 1: Initial Dry-Run Execution ---');
  const res1 = await run();
  assert.strictEqual(res1.status, 'dry_run_complete');
  assert.strictEqual(res1.count, 38);
  assert.strictEqual(res1.byEntity.CRM_LEAD.length, 18);
  assert.strictEqual(res1.byEntity.CRM_16.length, 17);
  assert.strictEqual(res1.byEntity.CRM_18.length, 3);
  console.log('  ✓ PASS: Run 1 generated 38 planned fields across CRM_LEAD, CRM_16, CRM_18');

  // Second run (test idempotency)
  console.log('\n--- Run 2: Idempotency Verification ---');
  const res2 = await run();
  assert.strictEqual(res2.status, 'dry_run_complete');
  assert.strictEqual(res2.count, res1.count);
  assert.deepStrictEqual(
    res2.byEntity.CRM_LEAD.map(f => f.fieldName),
    res1.byEntity.CRM_LEAD.map(f => f.fieldName)
  );
  assert.deepStrictEqual(
    res2.byEntity.CRM_16.map(f => f.fieldName),
    res1.byEntity.CRM_16.map(f => f.fieldName)
  );
  assert.deepStrictEqual(
    res2.byEntity.CRM_18.map(f => f.fieldName),
    res1.byEntity.CRM_18.map(f => f.fieldName)
  );
  console.log('  ✓ PASS: Run 2 produced identical, idempotent planned output');

  // Verify XML_IDs exist for all enum fields
  const enumSpecs = V2_FIELD_SPECS.filter(s => s.userTypeId === 'enumeration');
  for (const s of enumSpecs) {
    assert(Array.isArray(s.items) && s.items.length > 0, `Enum concept ${s.concept} missing items`);
    for (const item of s.items) {
      assert(item.XML_ID, `Item ${item.VALUE} in concept ${s.concept} missing XML_ID`);
    }
  }
  console.log('  ✓ PASS: All enumeration specifications have explicit XML_IDs');

  console.log('\n===============================================================');
  console.log('✓ CREATE_V2_FIELDS DRY-RUN IDEMPOTENCY TEST PASSED!');
  console.log('===============================================================\n');
}

testDryRun().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

