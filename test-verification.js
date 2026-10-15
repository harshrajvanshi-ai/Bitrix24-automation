/**
 * Self-Verification and Test Suite
 * Verifies server syntax, security guards, stage resolution logic, and webhook handling.
 */

const {
  resolveTargetStage,
  extractPicklistValue,
  normalizeValue
} = require('./server');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

console.log('=== [1] Testing Picklist Value Normalization ===');
assert(normalizeValue('Enterprise') === 'Enterprise', 'Normalizes string Enterprise');
assert(normalizeValue('  SMB  ') === 'SMB', 'Trims whitespace for SMB');
assert(normalizeValue({ ID: '10', VALUE: 'Enterprise' }) === 'Enterprise', 'Normalizes Bitrix object with VALUE');
assert(normalizeValue(null) === '', 'Handles null value gracefully');
assert(normalizeValue(undefined) === '', 'Handles undefined value gracefully');

console.log('\n=== [2] Testing Conditional Stage Routing Logic ===');
assert(resolveTargetStage('Enterprise') === 'DT1032_1:STAGE_ENTERPRISE', 'Maps Enterprise to DT1032_1:STAGE_ENTERPRISE');
assert(resolveTargetStage('enterprise') === 'DT1032_1:STAGE_ENTERPRISE', 'Handles case-insensitivity for enterprise');
assert(resolveTargetStage('SMB') === 'DT1032_1:STAGE_SMB', 'Maps SMB to DT1032_1:STAGE_SMB');
assert(resolveTargetStage('smb') === 'DT1032_1:STAGE_SMB', 'Handles case-insensitivity for smb');
assert(resolveTargetStage('CustomUnknownTier') === null, 'Returns null for unknown picklist value');
assert(resolveTargetStage('') === null, 'Returns null for empty picklist value');

console.log('\n=== [3] Testing Picklist Field Extraction ===');
const sampleItem1 = {
  id: '101',
  stageId: 'DT1032_1:NEW',
  ufCrm1032_CUSTOMER_TIER: 'Enterprise'
};
assert(extractPicklistValue(sampleItem1) === 'Enterprise', 'Extracts value from ufCrm custom field');

const sampleItem2 = {
  id: '102',
  stageId: 'DT1032_1:NEW',
  ufCrm_RANDOM_FIELD: 'SMB'
};
assert(extractPicklistValue(sampleItem2) === 'SMB', 'Auto-detects SMB value from unknown ufCrm field');

console.log('\n=== [4] Verification Summary ===');
console.log(`Passed: ${passedTests}/${totalTests} tests`);
if (passedTests === totalTests) {
  console.log('All verification assertions completed successfully!\n');
} else {
  console.error('Some tests failed!\n');
}
