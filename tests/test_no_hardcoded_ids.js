/**
 * tests/test_no_hardcoded_ids.js
 * Lints refactored production source files to ensure no hardcoded enum or entity ID
 * literals remain unmediated outside concepts.json and test fixtures.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('   Running Hardcoded Identifier Linter');
console.log('===============================================================\n');

// Production files that have been refactored in Phase B
const filesToCheck = [
  'src/eventRouter.js',
  'src/schemaMap.js',
  'scripts/create_v2_fields.js'
];

// Disallowed numeric IDs (must only reside in concepts.json or legacy test mocks)
const FORBIDDEN_NUMERIC_STRINGS = [
  '1594', // Legacy Lead Type Enquiry
  '1596'  // Legacy Lead Type Listing
];

let totalViolations = 0;

for (const relPath of filesToCheck) {
  const fullPath = path.join(__dirname, '..', relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  console.log(`Checking [${relPath}]...`);
  let fileViolations = 0;

  lines.forEach((line, lineNum) => {
    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    for (const forbidden of FORBIDDEN_NUMERIC_STRINGS) {
      // Match standalone quotes or literals
      const regex = new RegExp(`['"]${forbidden}['"]`);
      if (regex.test(line)) {
        console.error(`  ❌ VIOLATION on line ${lineNum + 1}: Found hardcoded ID '${forbidden}' -> ${trimmed}`);
        fileViolations++;
        totalViolations++;
      }
    }
  });

  if (fileViolations === 0) {
    console.log(`  ✓ CLEAN: No hardcoded forbidden IDs found in ${relPath}`);
  }
}

assert.strictEqual(totalViolations, 0, `Found ${totalViolations} hardcoded ID violations!`);

console.log('\n===============================================================');
console.log('✓ HARDCODED IDENTIFIER LINTER PASSED (ZERO VIOLATIONS)!');
console.log('===============================================================\n');

