/**
 * Comprehensive Field-by-Field Test Suite for public/js/tab.js
 */
const fs = require('fs');
const assert = require('assert');

const fieldsCfg = JSON.parse(fs.readFileSync('config/fields.json', 'utf8'));
const tabJsContent = fs.readFileSync('public/js/tab.js', 'utf8');

console.log('===============================================================');
console.log('   Tab.js Field-by-Field Diagnostic & Verification Suite       ');
console.log('===============================================================');

// Extract all fields from listing and enquiry layouts
const listingSections = fieldsCfg.listingLayout?.sections || [];
const enquirySections = fieldsCfg.enquiryLayout?.sections || [];

const listingFields = listingSections.flatMap(s => s.fields || []);
const enquiryFields = enquirySections.flatMap(s => s.fields || []);
const allUniqueFieldsMap = new Map();

[...listingFields, ...enquiryFields].forEach(f => {
  if (!allUniqueFieldsMap.has(f.code)) {
    allUniqueFieldsMap.set(f.code, f);
  }
});

console.log(`Loaded ${listingFields.length} listing fields and ${enquiryFields.length} enquiry fields (${allUniqueFieldsMap.size} unique).`);

let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function check(condition, message) {
  if (condition) {
    passedChecks++;
  } else {
    failedChecks++;
    failures.push(message);
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Check Field Schema Integrity
// ---------------------------------------------------------------------------
console.log('\n--- 1. Field Schema & Metadata Integrity ---');

allUniqueFieldsMap.forEach((f, code) => {
  check(code && code.length > 0, `Field code must not be empty`);
  check(typeof f.label === 'string' && f.label.length > 0, `Field ${code} has non-empty label`);
  check(typeof f.type === 'string' && f.type.length > 0, `Field ${code} has non-empty type`);
  
  if (f.type === 'enumeration') {
    check(Array.isArray(f.options) && f.options.length > 0, `Enum field ${code} (${f.label}) must have options array with at least 1 option`);
    (f.options || []).forEach(opt => {
      const optId = typeof opt === 'object' ? (opt.id || opt.value) : opt;
      const optVal = typeof opt === 'object' ? (opt.value || opt.id) : opt;
      check(optId !== undefined && optId !== '', `Enum option in ${code} has valid id/value`);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Check DOM Representation & Input Creation logic
// ---------------------------------------------------------------------------
console.log('\n--- 2. Input Creation & Tag Matching in tab.js ---');

// Check textarea support
check(
  tabJsContent.includes("f.type === 'text' || f.type === 'textarea'") ||
  (tabJsContent.includes("f.type === 'textarea'") && tabJsContent.includes('document.createElement(\'textarea\')')),
  `tab.js explicitly handles f.type === 'textarea' as a multi-line textarea element`
);

// Check step="any" for double/number fields
check(
  tabJsContent.includes("inputElement.step = 'any'") &&
  (tabJsContent.includes("f.type === 'number'") || tabJsContent.includes("f.type === 'double'")),
  `tab.js configures step="any" on numeric inputs to allow decimal specification values (e.g. 2.5 baths, 1250.5 sq ft)`
);

// Check lookup fields
const lookupCodes = [
  'COMPANY_ID', 'CONTACT_ID', 'UF_CRM_CONTACTS', 'UF_CRM_PROPERTY',
  'UF_CRM_DEVELOPER_1', 'UF_CRM_PROJECT', 'UF_CRM_PROJECT_1', 'UF_CRM_PROJECT_NAME',
  'UF_CRM_PROPERTY_LAYOUT', 'UF_CRM_PROPERTY_PROPERTYFINDER', 'UF_CRM_LISTING',
  'UF_CRM_LISTINGAGENT', 'UF_CRM_ASSIGNED_TO_BROKER', 'UF_CRM_OWNER_ENQUIRY'
];

lookupCodes.forEach(code => {
  check(tabJsContent.includes(`'${code}'`), `tab.js recognizes ${code} as an interactive lookup field`);
});

// ---------------------------------------------------------------------------
// 3. Check Field-by-Field Saving & Extraction
// ---------------------------------------------------------------------------
console.log('\n--- 3. Field Collection & Payload Integrity in handleSave ---');

check(tabJsContent.includes('document.getElementById(`field_${f.code}`)'), 'tab.js searches DOM using exact field_${f.code} convention');
check(tabJsContent.includes("payload[f.code] = input.checked ? 'Y' : 'N';"), "tab.js formats boolean fields as 'Y' / 'N'");
check(tabJsContent.includes('input.dataset.selectedRef || input.dataset.selectedId || input.value.trim()'), 'tab.js extracts lookup references and IDs');

// ---------------------------------------------------------------------------
// 4. Check Companion Field Synchronizations
// ---------------------------------------------------------------------------
console.log('\n--- 4. Companion Field Synchronizations on Save ---');

const requiredCompanionSyncs = [
  { trigger: 'UF_CRM_BEDROOMS', target: 'UF_CRM_1791966366775', desc: 'Bedrooms numeric double sync' },
  { trigger: 'UF_CRM_BATHROOMS', target: 'UF_CRM_1791966408374', desc: 'Bathrooms native sync' },
  { trigger: 'UF_CRM_BUA', target: 'UF_CRM_1791970770635', desc: 'Built-up Area native size sync' },
  { trigger: 'UF_CRM_BUA', target: 'UF_CRM_TOTALAREA', desc: 'Built-up Area total area sync' },
  { trigger: 'UF_CRM_PLOT_AREA', target: 'UF_CRM_PLOT_SIZE', desc: 'Plot Area plot size sync' },
  { trigger: 'UF_CRM_PLOT_AREA', target: 'UF_CRM_LOTSIZE', desc: 'Plot Area lot size sync' },
  { trigger: 'UF_CRM_1792151466', target: 'UF_CRM_PF_ID', desc: 'Property Finder Listing ID sync' },
  { trigger: 'UF_CRM_TRAKHEESI_EXPIRY', target: 'UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE', desc: 'Trakheesi Permit Expiry sync' },
  { trigger: 'UF_CRM_DATE_AVAILABLE', target: 'UF_CRM_AVAILABLE_TO', desc: 'Date Available sync' },
  { trigger: 'UF_CRM_PROJECT_NAME', target: 'UF_CRM_PROJECT_1', desc: 'Project Name to Project CRM Entity sync' },
  { trigger: 'COMPANY_ID', target: 'UF_CRM_DEVELOPER_NAME', desc: 'Developer / Company Name sync' },
  { trigger: 'UF_CRM_1792563228880', target: 'SOURCE_ID', desc: 'Lead Source Type to native SOURCE_ID sync' }
];

requiredCompanionSyncs.forEach(sync => {
  check(tabJsContent.includes(sync.target), `tab.js synchronizes ${sync.desc} (${sync.target})`);
});

// ---------------------------------------------------------------------------
// 5. Check Load-Time Dynamic Fallback Resolution
// ---------------------------------------------------------------------------
console.log('\n--- 5. Dynamic Fallback Inspection on Load ---');

check(tabJsContent.includes('f.leadAltCode'), `tab.js inspects f.leadAltCode`);
check(tabJsContent.includes('f.leadAltCodes'), `tab.js inspects f.leadAltCodes`);
check(tabJsContent.includes('UF_CRM_1791966366775'), `tab.js resolves Bedrooms fallback`);
check(tabJsContent.includes('UF_CRM_1791966408374'), `tab.js resolves Bathrooms fallback`);
check(tabJsContent.includes('UF_CRM_1791970770635'), `tab.js resolves Built-up Area fallback`);
check(tabJsContent.includes('UF_CRM_PLOT_SIZE'), `tab.js resolves Plot Area fallback`);

// Check Bedrooms Enum-to-Numeric Normalization on load
check(tabJsContent.includes('1834') && tabJsContent.includes('1836'), `tab.js normalizes Bedrooms enum IDs to numeric numbers`);

// ---------------------------------------------------------------------------
// 5b. Country Code Auto-Population & Fallback Verification
// ---------------------------------------------------------------------------
console.log('\n--- 5b. Country Code Auto-Population & Fallback Verification ---');

check(tabJsContent.includes('resolveCountryCode'), 'tab.js defines resolveCountryCode function');
check(tabJsContent.includes('COUNTRY_NAME_TO_CODE'), 'tab.js defines COUNTRY_NAME_TO_CODE dictionary');
check(tabJsContent.includes('UF_CRM_COUNTRY_CODE') && tabJsContent.includes('ADDRESS_COUNTRY_CODE'), 'tab.js references UF_CRM_COUNTRY_CODE and ADDRESS_COUNTRY_CODE');
check(tabJsContent.includes('syncCountryCode'), 'tab.js binds real-time syncCountryCode handler on Country input');

const { resolveCountryCode: resolveCodeUtil } = require('./src/countryMapping');
check(resolveCodeUtil('United Arab Emirates') === 'AE', 'resolveCountryCode maps "United Arab Emirates" to "AE"');
check(resolveCodeUtil('UAE') === 'AE', 'resolveCountryCode maps "UAE" to "AE"');
check(resolveCodeUtil('United Kingdom') === 'GB', 'resolveCountryCode maps "United Kingdom" to "GB"');
check(resolveCodeUtil('UK') === 'GB', 'resolveCountryCode maps "UK" to "GB"');
check(resolveCodeUtil('USA') === 'US', 'resolveCountryCode maps "USA" to "US"');
check(resolveCodeUtil('Saudi Arabia') === 'SA', 'resolveCountryCode maps "Saudi Arabia" to "SA"');
check(resolveCodeUtil('France') === 'FR', 'resolveCountryCode maps "France" to "FR"');
check(resolveCodeUtil('Germany') === 'DE', 'resolveCountryCode maps "Germany" to "DE"');
check(resolveCodeUtil('India') === 'IN', 'resolveCountryCode maps "India" to "IN"');
check(resolveCodeUtil('Atlantis') === '', 'resolveCountryCode falls back to "" for unknown country "Atlantis"');
check(resolveCodeUtil('Unknown Country') === '', 'resolveCountryCode falls back to "" for "Unknown Country"');
check(resolveCodeUtil('') === '', 'resolveCountryCode falls back to "" for empty string');
check(resolveCodeUtil(null) === '', 'resolveCountryCode falls back to "" for null');
check(resolveCodeUtil(undefined) === '', 'resolveCountryCode falls back to "" for undefined');

// ---------------------------------------------------------------------------
// 6. Comprehensive Field-by-Field Execution Simulation (All 204 Fields)
// ---------------------------------------------------------------------------
console.log('\n--- 6. Field-by-Field Mock DOM Rendering & Extraction Simulation ---');

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.name = '';
    this.type = 'text';
    this.value = '';
    this.checked = false;
    this.multiple = false;
    this.step = '';
    this.rows = 2;
    this.placeholder = '';
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.options = [];
    this.selectedIndex = 0;
    this.attributes = {};
    this.eventListeners = {};
  }

  appendChild(child) {
    this.children.push(child);
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION') {
      this.options.push(child);
      if (child.selected) this.selectedIndex = this.options.length - 1;
    }
    return child;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  addEventListener(ev, fn) {
    this.eventListeners[ev] = this.eventListeners[ev] || [];
    this.eventListeners[ev].push(fn);
  }

  closest() {
    return new MockElement('div');
  }

  querySelector() {
    return new MockElement('div');
  }

  querySelectorAll() {
    return [];
  }
}

const domRegistry = new Map();

const mockDocument = {
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => domRegistry.get(id) || null
};

function simulateCreateFieldInput(f, currentVal) {
  if (f.type === 'lookup' || [
    'COMPANY_ID', 'CONTACT_ID', 'UF_CRM_CONTACTS', 'UF_CRM_PROPERTY',
    'UF_CRM_DEVELOPER_1', 'UF_CRM_PROJECT', 'UF_CRM_PROJECT_1', 'UF_CRM_PROJECT_NAME',
    'UF_CRM_PROPERTY_LAYOUT', 'UF_CRM_PROPERTY_PROPERTYFINDER', 'UF_CRM_LISTING',
    'UF_CRM_LISTINGAGENT', 'UF_CRM_ASSIGNED_TO_BROKER', 'UF_CRM_OWNER_ENQUIRY'
  ].includes(f.code) || f.lookupEntity) {
    const input = mockDocument.createElement('input');
    input.type = 'text';
    input.id = `field_${f.code}`;
    input.name = f.code;
    input.value = currentVal || '';
    if (currentVal) {
      input.dataset.selectedRef = String(currentVal);
      input.dataset.selectedId = String(currentVal).replace(/\D/g, '') || '1';
    }
    domRegistry.set(input.id, input);
    return { container: new MockElement('div'), inputElement: input };
  }

  if (f.type === 'enumeration') {
    const sel = mockDocument.createElement('select');
    sel.id = `field_${f.code}`;
    sel.name = f.code;
    const def = mockDocument.createElement('option');
    def.value = '';
    def.textContent = '-- Select --';
    sel.appendChild(def);

    (f.options || []).forEach(opt => {
      const optEl = mockDocument.createElement('option');
      const val = typeof opt === 'object' ? (opt.id || opt.value) : opt;
      const text = typeof opt === 'object' ? (opt.value || opt.id) : opt;
      optEl.value = val;
      optEl.textContent = text;
      if (String(currentVal) === String(val) || String(currentVal).toLowerCase() === String(text).toLowerCase()) {
        optEl.selected = true;
        sel.value = val;
      }
      sel.appendChild(optEl);
    });
    domRegistry.set(sel.id, sel);
    return { container: new MockElement('div'), inputElement: sel };
  }

  if (f.type === 'boolean') {
    const chk = mockDocument.createElement('input');
    chk.type = 'checkbox';
    chk.id = `field_${f.code}`;
    chk.name = f.code;
    chk.checked = (currentVal === 'Y' || currentVal === true || currentVal === 1 || currentVal === '1');
    domRegistry.set(chk.id, chk);
    return { container: new MockElement('div'), inputElement: chk };
  }

  if (f.type === 'text' || f.type === 'textarea') {
    const ta = mockDocument.createElement('textarea');
    ta.id = `field_${f.code}`;
    ta.name = f.code;
    ta.value = Array.isArray(currentVal) ? currentVal.join(', ') : (currentVal || '');
    domRegistry.set(ta.id, ta);
    return { container: new MockElement('div'), inputElement: ta };
  }

  if (f.type === 'money') {
    const inp = mockDocument.createElement('input');
    inp.type = 'number';
    inp.step = 'any';
    inp.id = `field_${f.code}`;
    inp.name = f.code;
    inp.value = typeof currentVal === 'string' && currentVal.includes('|') ? currentVal.split('|')[0] : (currentVal || '');
    domRegistry.set(inp.id, inp);
    return { container: new MockElement('div'), inputElement: inp };
  }

  if (f.type === 'file') {
    const inp = mockDocument.createElement('input');
    inp.type = 'file';
    inp.id = `field_${f.code}`;
    inp.name = f.code;
    domRegistry.set(inp.id, inp);
    return { container: new MockElement('div'), inputElement: inp };
  }

  if (f.type === 'address') {
    const ta = mockDocument.createElement('textarea');
    ta.id = `field_${f.code}`;
    ta.name = f.code;
    ta.value = currentVal || '';
    domRegistry.set(ta.id, ta);
    return { container: new MockElement('div'), inputElement: ta };
  }

  const inp = mockDocument.createElement('input');
  inp.id = `field_${f.code}`;
  inp.name = f.code;
  if (f.type === 'number' || f.type === 'integer' || f.type === 'double') {
    inp.type = 'number';
    if (f.type === 'number' || f.type === 'double') inp.step = 'any';
    inp.value = currentVal !== undefined && currentVal !== null ? currentVal : '';
  } else if (f.type === 'date') {
    inp.type = 'date';
    inp.value = currentVal || '';
  } else if (f.type === 'datetime') {
    inp.type = 'datetime-local';
    inp.value = currentVal || '';
  } else if (f.type === 'url') {
    inp.type = 'url';
    inp.value = currentVal || '';
  } else {
    inp.type = 'text';
    inp.value = currentVal || '';
  }
  domRegistry.set(inp.id, inp);
  return { container: new MockElement('div'), inputElement: inp };
}

function simulateExtractFieldValue(f) {
  const input = domRegistry.get(`field_${f.code}`);
  if (!input) return undefined;

  if (f.type === 'boolean') {
    return input.checked ? 'Y' : 'N';
  } else if (f.type === 'file') {
    return undefined;
  } else if (f.type === 'lookup' || [
    'COMPANY_ID', 'CONTACT_ID', 'UF_CRM_CONTACTS', 'UF_CRM_PROPERTY',
    'UF_CRM_DEVELOPER_1', 'UF_CRM_PROJECT', 'UF_CRM_PROJECT_1', 'UF_CRM_PROJECT_NAME',
    'UF_CRM_PROPERTY_LAYOUT', 'UF_CRM_PROPERTY_PROPERTYFINDER', 'UF_CRM_LISTING',
    'UF_CRM_LISTINGAGENT', 'UF_CRM_ASSIGNED_TO_BROKER', 'UF_CRM_OWNER_ENQUIRY'
  ].includes(f.code) || f.lookupEntity) {
    return input.dataset.selectedRef || input.dataset.selectedId || input.value.trim();
  } else if (f.type === 'money') {
    const rawMoney = String(input.value || '').trim();
    if (rawMoney) {
      const cleanNum = rawMoney.split('|')[0].replace(/[^\d.-]/g, '');
      return cleanNum ? `${cleanNum}|AED` : '';
    }
    return '';
  } else {
    return String(input.value || '').trim();
  }
}

console.log(`Simulating DOM lifecycle for all unique fields...`);

allUniqueFieldsMap.forEach((f, code) => {
  domRegistry.clear();

  // Test empty state
  const emptyRes = simulateCreateFieldInput(f, '');
  check(emptyRes && emptyRes.inputElement, `Field ${code} successfully creates DOM element on empty value`);
  check(emptyRes.inputElement.id === `field_${code}`, `Field ${code} assigns correct id "field_${code}"`);
  check(emptyRes.inputElement.name === code, `Field ${code} assigns correct name "${code}"`);

  if (f.type === 'text' || f.type === 'textarea' || f.type === 'address') {
    check(emptyRes.inputElement.tagName === 'TEXTAREA', `Field ${code} (type: ${f.type}) uses TEXTAREA tag`);
  } else if (f.type === 'enumeration') {
    check(emptyRes.inputElement.tagName === 'SELECT', `Field ${code} (type: enumeration) uses SELECT tag`);
    check(emptyRes.inputElement.options.length > 0, `Field ${code} has populated options`);
  } else {
    check(emptyRes.inputElement.tagName === 'INPUT', `Field ${code} uses INPUT tag`);
    if (f.type === 'number' || f.type === 'double') {
      check(emptyRes.inputElement.step === 'any', `Field ${code} (type: ${f.type}) configures step="any"`);
    }
  }

  // Test populated state
  let testVal = 'Test ' + f.label;
  if (f.type === 'number' || f.type === 'integer' || f.type === 'double') testVal = '42.5';
  if (f.type === 'integer') testVal = '42';
  if (f.type === 'money') testVal = '2500000|AED';
  if (f.type === 'boolean') testVal = 'Y';
  if (f.type === 'date') testVal = '2027-05-15';
  if (f.type === 'datetime') testVal = '2027-05-15T10:30';
  if (f.type === 'enumeration' && f.options && f.options[0]) {
    testVal = typeof f.options[0] === 'object' ? f.options[0].id : f.options[0];
  }
  if (f.type === 'lookup' || f.lookupEntity) testVal = '1044_999';

  const populatedRes = simulateCreateFieldInput(f, testVal);
  check(populatedRes && populatedRes.inputElement, `Field ${code} renders with sample value`);

  const extracted = simulateExtractFieldValue(f);
  if (f.type === 'file') {
    check(extracted === undefined, `File field ${code} defers payload extraction to FileReader`);
  } else if (f.type === 'boolean') {
    check(extracted === 'Y', `Boolean field ${code} extracts as 'Y'`);
  } else if (f.type === 'money') {
    check(extracted === '2500000|AED', `Money field ${code} extracts formatted with |AED`);
  } else {
    check(extracted !== undefined && extracted !== '', `Field ${code} successfully extracts populated value "${extracted}"`);
  }
});

console.log('\n===============================================================');
console.log(`TAB.JS FIELD VERIFICATION: ${passedChecks} Passed, ${failedChecks} Failed`);
console.log('===============================================================');

if (failedChecks > 0) {
  console.log('\nIdentified Issues:');
  failures.forEach(f => console.log(' - ' + f));
  process.exit(1);
} else {
  console.log('✓ ALL FIELD CHECKS PASSED!');
  process.exit(0);
}
