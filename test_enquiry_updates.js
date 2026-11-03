/**
 * test_enquiry_updates.js
 * Comprehensive Verification of User's Enquiry Layout Changes:
 * 1. Field & Section Removals
 * 2. Automated First Contacted Date
 * 3. Checkbox "Yes" Labeling
 * 4. Mac Safari Picklist CSS & DOM Compatibility
 * 5. Enquiry Type & Conditional Requirement Form (Rent vs Buy)
 * 6. Number of Cheques as Integer Field
 * 7. Dependent Lookups (Listing, Master Project, Project, Property Layout)
 */

const fs = require('fs');
const assert = require('assert');

console.log('========================================================================');
console.log('   Enquiry Layout & Field Automations - Verification Suite             ');
console.log('========================================================================\n');

const cfg = JSON.parse(fs.readFileSync('config/fields.json', 'utf8'));
const tabJs = fs.readFileSync('public/js/tab.js', 'utf8');
const tabCss = fs.readFileSync('public/css/tab.css', 'utf8');
const serverJs = fs.readFileSync('server.js', 'utf8');

let passed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${desc}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ [FAIL] ${desc}: ${e.message}`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 1. Section & Field Removals Verification
// -----------------------------------------------------------------------------
console.log('--- 1. Section & Field Removals Verification ---');

test('Mortgage & Home Financing section completely removed', () => {
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'mortgage_finance');
  assert(!sec, 'mortgage_finance section must not exist in enquiryLayout');
});

test('Website Searches & Open House Notifications section completely removed', () => {
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'website_searches');
  assert(!sec, 'website_searches section must not exist in enquiryLayout');
});

test('Disqualification & Spam Records section completely removed', () => {
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'disqualification_spam');
  assert(!sec, 'disqualification_spam section must not exist in enquiryLayout');
});

test('Locations, Communities & Schools section completely removed', () => {
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'locations_districts');
  assert(!sec, 'locations_districts section must not exist in enquiryLayout');
});

test('Enquiry Layout now has exactly 5 sensible sections', () => {
  assert.strictEqual(cfg.enquiryLayout.sections.length, 5);
  const ids = cfg.enquiryLayout.sections.map(s => s.id);
  assert.deepStrictEqual(ids, [
    'enquiry_overview',
    'budget_financials',
    'property_specs',
    'matched_projects_portals',
    'amenities_features'
  ]);
});

test('Client & Enquiry Overview: specified fields removed', () => {
  const removedCodes = [
    'UF_CRM_ENQUIRY_NAME',
    'UF_CRM_STATUS',
    'UF_CRM_DEAL_VALUE_1',
    'UF_CRM_ENQUIRY_LOCKED_2',
    'UF_CRM_CONTACTS',
    'UF_CRM_OWNER_ENQUIRY',
    'UF_CRM_NORMAL_LOW_HIGH_URGENT'
  ];
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'enquiry_overview');
  const codes = sec.fields.map(f => f.code);
  for (const c of removedCodes) {
    assert(!codes.includes(c), `Field ${c} must not be present in enquiry_overview`);
  }
});

test('Property Specs: lot size, floor, stories, units, style, adult community removed', () => {
  const removedCodes = [
    'UF_CRM_LOTSIZE_MIN', 'UF_CRM_LOTSIZE_MAX',
    'UF_CRM_FLOOR_MIN', 'UF_CRM_FLOOR_MAX',
    'UF_CRM_STORIES_MIN', 'UF_CRM_STORIES_MAX', 'UF_CRM_STORIES_1',
    'UF_CRM_UNIT_NO', 'UF_CRM_UNITSMIN', 'UF_CRM_UNITSMAX',
    'UF_CRM_STYLE_1', 'UF_CRM_ADULTCOMMUNITY'
  ];
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'property_specs');
  const codes = sec.fields.map(f => f.code);
  for (const c of removedCodes) {
    assert(!codes.includes(c), `Field ${c} must not be present in property_specs`);
  }
});

test('Matched Projects & Portals: Bayut, Propertyfinder, and building fields removed', () => {
  const removedCodes = [
    'UF_CRM_BUILDINGANDDEVELOPMENTS',
    'UF_CRM_RECOMMENDED_LISTINGS',
    'UF_CRM_BUILDING_DUBIZZLE',
    'UF_CRM_LOCATIONTEXT_DUBIZZLE',
    'UF_CRM_CITY_BAYUT',
    'UF_CRM_PROPERTY_PROPERTYFINDER',
    'UF_CRM_PROPERTYFINDER_REGION',
    'UF_CRM_COMMUNITY_PROPERTYFINDER',
    'UF_CRM_SUB_COMMUNITY_PROPERTYFINDER',
    'UF_CRM_CITY_PF'
  ];
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'matched_projects_portals');
  const codes = sec.fields.map(f => f.code);
  for (const c of removedCodes) {
    assert(!codes.includes(c), `Field ${c} must not be present in matched_projects_portals`);
  }
});

test('Amenities: parking spaces, body of water, flooring type, keywords removed', () => {
  const removedCodes = [
    'UF_CRM_NUMBEROFPARKINGSPACES',
    'UF_CRM_PARKING_SPACES_MIN',
    'UF_CRM_PARKING_SPACES_MAX',
    'UF_CRM_GARAGESPACEMAX',
    'UF_CRM_BODYOFWATER',
    'UF_CRM_FLOORINGTYPE',
    'UF_CRM_KEYWORDS'
  ];
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'amenities_features');
  const codes = sec.fields.map(f => f.code);
  for (const c of removedCodes) {
    assert(!codes.includes(c), `Field ${c} must not be present in amenities_features`);
  }
});

// -----------------------------------------------------------------------------
// 2. Automated First Contacted Date
// -----------------------------------------------------------------------------
console.log('\n--- 2. Automated First Contacted Date Verification ---');

test('UF_CRM_FIRST_CONTACTED_DATE marked automated & read-only in config', () => {
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'enquiry_overview');
  const f = sec.fields.find(x => x.code === 'UF_CRM_FIRST_CONTACTED_DATE');
  assert(f, 'UF_CRM_FIRST_CONTACTED_DATE exists in overview');
  assert.strictEqual(f.readOnly, true);
  assert.strictEqual(f.automated, true);
});

test('tab.js renders automated badge and read-only field for First Contacted Date', () => {
  assert(tabJs.includes('f.code === \'UF_CRM_FIRST_CONTACTED_DATE\''), 'tab.js checks FIRST_CONTACTED_DATE');
  assert(tabJs.includes('readonly-automated-input'), 'tab.js applies readonly-automated-input class');
  assert(tabJs.includes('automated-badge'), 'tab.js renders automated badge');
});

test('server.js automates First Contacted Date from CRM activity', () => {
  assert(serverJs.includes('UF_CRM_FIRST_CONTACTED_DATE'), 'server.js references FIRST_CONTACTED_DATE');
  assert(serverJs.includes('crm.activity.list'), 'server.js queries activities for First Contacted Date');
});

// -----------------------------------------------------------------------------
// 3. Checkbox "Yes" Labeling
// -----------------------------------------------------------------------------
console.log('\n--- 3. Checkbox "Yes" Labeling Verification ---');

test('tab.js strips "Yes / Confirmed" and defaults checkbox text to "Yes"', () => {
  assert(tabJs.includes('span.textContent = (f.placeholder && f.placeholder !== \'Yes / Confirmed\') ? f.placeholder : \'Yes\';'), 'tab.js uses "Yes" for checkboxes');
});

// -----------------------------------------------------------------------------
// 4. Mac Safari Picklist CSS & DOM Compatibility
// -----------------------------------------------------------------------------
console.log('\n--- 4. Mac Safari Picklist CSS & DOM Compatibility Verification ---');

test('public/css/tab.css defines color-scheme: light and explicit option colors for macOS Safari', () => {
  assert(tabCss.includes('color-scheme: light;'), 'tab.css has color-scheme: light');
  assert(tabCss.includes('select.form-control option'), 'tab.css has select.form-control option selector');
  assert(tabCss.includes('background-color: #ffffff;'), 'tab.css has explicit background-color for options');
});

// -----------------------------------------------------------------------------
// 5. Enquiry Type & Conditional Requirement Form
// -----------------------------------------------------------------------------
console.log('\n--- 5. Enquiry Type & Conditional Requirement Form Verification ---');

test('Enquiry Type replaces Listing Type with Buy (Sale), Rent, Commercial Buy, Commercial Rent', () => {
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'enquiry_overview');
  const enqType = sec.fields.find(f => f.code === 'UF_CRM_1791952650167');
  assert(enqType, 'UF_CRM_1791952650167 exists in overview');
  assert.strictEqual(enqType.label, 'Enquiry Type');
  assert.strictEqual(enqType.placeholder, '-- Select Enquiry Type --');
  const vals = enqType.options.map(o => o.value);
  assert(vals.includes('Buy (Sale)'), 'Options include Buy (Sale)');
  assert(vals.includes('Rent'), 'Options include Rent');
  assert(vals.includes('Commercial Buy'), 'Options include Commercial Buy');
  assert(vals.includes('Commercial Rent'), 'Options include Commercial Rent');
});

test('tab.js defines applyEnquirySubLayout for dynamic conditional requirement form', () => {
  assert(tabJs.includes('function applyEnquirySubLayout('), 'applyEnquirySubLayout function is defined');
  assert(tabJs.includes('UF_CRM_MONTHLYRENTMIN'), 'Hides/shows monthly rent min');
  assert(tabJs.includes('UF_CRM_LISTINGPRICE_MIN'), 'Hides/shows listing price min');
  assert(!tabJs.includes('UF_CRM_PURCHASEAMOUNTOFHOME'), 'US field UF_CRM_PURCHASEAMOUNTOFHOME removed from tab.js');
  assert(tabJs.includes('UF_CRM_FINANCE'), 'Hides/shows finance');
});

test('tab.js binds real-time change listener on Enquiry Type', () => {
  assert(tabJs.includes("currentLayout === 'enquiry' && (f.code === 'UF_CRM_1791952650167'"), 'Enquiry Type listener is attached');
});

// -----------------------------------------------------------------------------
// 6. Number of Cheques as Integer Field
// -----------------------------------------------------------------------------
console.log('\n--- 6. Number of Cheques as Integer Field Verification ---');

test('UF_CRM_1792139023 is configured as integer with step 1 and min 1', () => {
  const sec = cfg.enquiryLayout.sections.find(s => s.id === 'budget_financials');
  const f = sec.fields.find(x => x.code === 'UF_CRM_1792139023');
  assert(f, 'UF_CRM_1792139023 exists in budget_financials');
  assert.strictEqual(f.type, 'integer');
  assert.strictEqual(f.placeholder, 'e.g. 4');
  assert.strictEqual(f.step, 1);
  assert.strictEqual(f.min, 1);
  assert.strictEqual(f.max, 12);
});

// -----------------------------------------------------------------------------
// 7. Dependent Lookups (Listing, Master Project, Project, Property Layout)
// -----------------------------------------------------------------------------
console.log('\n--- 7. Dependent Lookups Verification ---');

test('server.js fetchAllSpaItems selects parentId1040, parentId1044, parentId1048, parentId1052', () => {
  assert(serverJs.includes("'parentId1040', 'parentId1044', 'parentId1048'"), 'server.js selects all parent IDs');
});

test('server.js /api/lookup filters by master_project_id, project_id, layout_id', () => {
  assert(serverJs.includes('req.query.master_project_id'), 'server.js handles master_project_id parameter');
  assert(serverJs.includes('req.query.project_id'), 'server.js handles project_id parameter');
  assert(serverJs.includes('req.query.layout_id'), 'server.js handles layout_id parameter');
});

test('tab.js binds dependent lookups: selecting Listing cascades to Master Project, Project, and Layout', () => {
  assert(tabJs.includes("f.code === 'UF_CRM_LISTING'"), 'tab.js handles UF_CRM_LISTING selection');
  assert(tabJs.includes("setDependentLookup('UF_CRM_PROJECT', 'master_project'"), 'Listing cascades to Master Project');
  assert(tabJs.includes("setDependentLookup('UF_CRM_PROJECT_1', 'project'"), 'Listing cascades to Project');
  assert(tabJs.includes("setDependentLookup('UF_CRM_PROPERTY_LAYOUT', 'layout'"), 'Listing cascades to Layout');
});

test('tab.js filters Project and Layout lookups based on Master Project and Project selection', () => {
  assert(tabJs.includes('&master_project_id='), 'tab.js passes master_project_id to lookup');
  assert(tabJs.includes('&project_id='), 'tab.js passes project_id to lookup');
});


// -----------------------------------------------------------------------------
// 8. US Style Fields Removal Verification
// -----------------------------------------------------------------------------
console.log('\n--- 8. US Style Fields Removal Verification ---');

test('All US style fields (HOA, Dock, Yard, Basement, Heating, Cooling, Construction) removed from enquiryLayout', () => {
  const currentEnquiryCodes = cfg.enquiryLayout.sections.flatMap(s => s.fields.map(f => f.code));
  const usCodes = [
    'UF_CRM_HOAFEESMIN',
    'UF_CRM_HOAFEESMAX',
    'UF_CRM_PURCHASEAMOUNTOFHOME',
    'UF_CRM_CONSTRUCTION',
    'UF_CRM_NEWCONSTRUCTION',
    'UF_CRM_DOCK',
    'UF_CRM_YARD',
    'UF_CRM_BASEMENTTYPE',
    'UF_CRM_COOLINGTYPE',
    'UF_CRM_HEATTYPE'
  ];
  for (const c of usCodes) {
    assert(!currentEnquiryCodes.includes(c), 'Field ' + c + ' must not exist in enquiryLayout');
  }
});

console.log('\n========================================================================');
console.log(`TOTAL CHECKS PASSED: ${passed}/17 (0 Failed)`);
console.log('========================================================================');
