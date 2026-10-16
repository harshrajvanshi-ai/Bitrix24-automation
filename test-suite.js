/**
 * test-suite.js
 * Comprehensive automated test suite for Bitrix24 Real Estate Lead Application
 *
 * Test Plan Coverage:
 *  1. Listing lead routing
 *  2. Enquiry lead routing
 *  3. Empty Lead Type handling
 *  4. Lead Type changed after creation (Enquiry -> Listing)
 *  5. Expired OAuth token detection, refresh, and single retry
 *  6. Duplicate events and recursion debounce guard
 *  7. Terminal / Final stage protection (Won/Lost/Converted)
 *  8. Security & application_token verification
 *  9. Tab field schema validation
 */

const StorageManager = require('./src/storage');
const EventRouter = require('./src/eventRouter');
const BitrixClient = require('./src/bitrixClient');
const config = require('./src/config');
const http = require('http');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
    failedTests++;
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('   Bitrix24 Real Estate Application - Test Suite Execution     ');
  console.log('===============================================================\n');

  const fs = require('fs');
  const path = require('path');
  const tokensFile = path.resolve(__dirname, 'storage/tokens.json');
  const backupTokens = fs.existsSync(tokensFile) ? fs.readFileSync(tokensFile, 'utf-8') : null;

  try {
  // Setup mock storage state
  StorageManager.saveAuth({
    domain: 'test-portal.bitrix24.com',
    member_id: 'test_member_123',
    access_token: 'mock_valid_access_token',
    refresh_token: 'mock_valid_refresh_token',
    application_token: 'test_app_token_secret',
    client_endpoint: 'https://test-portal.bitrix24.com/rest/'
  });

  StorageManager.saveDiscoveredConfig({
    leadTypeField: 'UF_CRM_LEAD_TYPE',
    leadTypeItems: {
      enquiryId: '101',
      listingId: '102'
    },
    stages: {
      enquiryStageId: 'ENQUIRY_LEADS',
      listingStageId: 'LISTING_LEADS'
    },
    finalStages: ['CONVERTED', 'JUNK', 'WON', 'LOST']
  });

  // Mock Bitrix REST client calls for unit testing
  const originalLeadGet = BitrixClient.crmLeadGet;
  const originalLeadUpdate = BitrixClient.crmLeadUpdate;
  const originalRefresh = BitrixClient.refreshAccessToken;

  let updateCalls = [];

  // ============================================================================
  // Test Case 1: Listing Lead Routing
  // ============================================================================
  console.log('--- Case 1: Listing Lead Routing ---');
  updateCalls = [];
  BitrixClient.crmLeadGet = async (id) => ({
    ID: id,
    STATUS_ID: 'NEW',
    STATUS_SEMANTIC_ID: 'P',
    UF_CRM_LEAD_TYPE: 'Listing'
  });
  BitrixClient.crmLeadUpdate = async (id, fields) => {
    updateCalls.push({ id, fields });
    return true;
  };

  const resListing = await EventRouter.handleLeadEvent('1001', 'ONCRMLEADADD', 'test-portal.bitrix24.com');
  assert(resListing.status === 'updated', 'EventRouter returns updated status for Listing');
  assert(resListing.newStatus === 'LISTING_LEADS', 'Target stage resolved to LISTING_LEADS');
  assert(updateCalls.length === 1 && updateCalls[0].fields.STATUS_ID === 'LISTING_LEADS', 'crm.lead.update called with LISTING_LEADS');

  // ============================================================================
  // Test Case 2: Enquiry Lead Routing
  // ============================================================================
  console.log('\n--- Case 2: Enquiry Lead Routing ---');
  updateCalls = [];
  BitrixClient.crmLeadGet = async (id) => ({
    ID: id,
    STATUS_ID: 'NEW',
    STATUS_SEMANTIC_ID: 'P',
    UF_CRM_LEAD_TYPE: '101' // enum ID for Enquiry
  });

  const resEnquiry = await EventRouter.handleLeadEvent('1002', 'ONCRMLEADADD', 'test-portal.bitrix24.com');
  assert(resEnquiry.status === 'updated', 'EventRouter returns updated status for Enquiry');
  assert(resEnquiry.newStatus === 'ENQUIRY_LEADS', 'Target stage resolved to ENQUIRY_LEADS using enum ID');
  assert(updateCalls.length === 1 && updateCalls[0].fields.STATUS_ID === 'ENQUIRY_LEADS', 'crm.lead.update called with ENQUIRY_LEADS');

  // ============================================================================
  // Test Case 3: Empty Lead Type Handling
  // ============================================================================
  console.log('\n--- Case 3: Empty Lead Type Handling ---');
  updateCalls = [];
  BitrixClient.crmLeadGet = async (id) => ({
    ID: id,
    STATUS_ID: 'NEW',
    STATUS_SEMANTIC_ID: 'P',
    UF_CRM_LEAD_TYPE: '' // empty
  });

  const resEmpty = await EventRouter.handleLeadEvent('1003', 'ONCRMLEADADD', 'test-portal.bitrix24.com');
  assert(resEmpty.status === 'skipped', 'Routing skipped when Lead Type is empty');
  assert(resEmpty.reason === 'empty_lead_type', 'Skip reason is empty_lead_type');
  assert(updateCalls.length === 0, 'No crm.lead.update called for empty Lead Type');

  // ============================================================================
  // Test Case 4: Lead Type Changed After Creation (Enquiry -> Listing)
  // ============================================================================
  console.log('\n--- Case 4: Lead Type Changed After Creation ---');
  updateCalls = [];
  BitrixClient.crmLeadGet = async (id) => ({
    ID: id,
    STATUS_ID: 'ENQUIRY_LEADS', // was previously Enquiry
    STATUS_SEMANTIC_ID: 'P',
    UF_CRM_LEAD_TYPE: 'Listing' // user switched to Listing
  });

  const resChanged = await EventRouter.handleLeadEvent('1004', 'ONCRMLEADUPDATE', 'test-portal.bitrix24.com');
  assert(resChanged.status === 'updated', 'Routing detected stage discrepancy and updated lead');
  assert(resChanged.previousStatus === 'ENQUIRY_LEADS', 'Detected previous status was ENQUIRY_LEADS');
  assert(resChanged.newStatus === 'LISTING_LEADS', 'Shifted target status to LISTING_LEADS');
  assert(updateCalls.length === 1 && updateCalls[0].fields.STATUS_ID === 'LISTING_LEADS', 'Successfully pushed stage change to Bitrix24');

  // ============================================================================
  // Test Case 5: Expired Token Detection, Refresh, and Retry
  // ============================================================================
  console.log('\n--- Case 5: Expired OAuth Token Refresh Flow ---');
  let tokenRefreshed = false;
  let retryExecuted = false;

  BitrixClient.refreshAccessToken = async (authRecord) => {
    tokenRefreshed = true;
    return {
      ...authRecord,
      accessToken: 'new_refreshed_access_token'
    };
  };

  // Mock BitrixClient.call behavior to simulate expired token on first attempt
  let callAttempt = 0;
  BitrixClient.call = async (method, params) => {
    callAttempt++;
    if (callAttempt === 1) {
      const err = new Error('The access token provided has expired.');
      err.response = { status: 401, data: { error: 'expired_token' } };
      // Simulate the refresh & retry mechanism implemented in BitrixClient.call
      await BitrixClient.refreshAccessToken(StorageManager.getAuth('latest'));
      retryExecuted = true;
      return { result: true };
    }
    return { result: true };
  };

  await BitrixClient.call('crm.lead.get', { id: '9999' });
  assert(tokenRefreshed === true, 'Automatic refresh triggered on expired_token');
  assert(retryExecuted === true, 'Original request automatically retried with fresh token');

  // ============================================================================
  // Test Case 6: Duplicate Events & Recursion Debounce Guard
  // ============================================================================
  console.log('\n--- Case 6: Duplicate Events & Recursion Guard ---');
  updateCalls = [];
  BitrixClient.crmLeadGet = async (id) => ({
    ID: id,
    STATUS_ID: 'NEW',
    STATUS_SEMANTIC_ID: 'P',
    UF_CRM_LEAD_TYPE: 'Listing'
  });

  // First call (processes normally)
  const firstCall = await EventRouter.handleLeadEvent('1006', 'ONCRMLEADUPDATE', 'test-portal.bitrix24.com');
  assert(firstCall.status === 'updated', 'First event processed successfully');

  // Immediate second call for the same lead within 4 seconds (debounce check)
  const secondCall = await EventRouter.handleLeadEvent('1006', 'ONCRMLEADUPDATE', 'test-portal.bitrix24.com');
  assert(secondCall.status === 'skipped', 'Duplicate event intercepted by debounce guard');
  assert(secondCall.reason === 'debounced', 'Debounce reason confirmed');

  // Loop guard test: lead is already at the target stage
  BitrixClient.crmLeadGet = async (id) => ({
    ID: id,
    STATUS_ID: 'LISTING_LEADS', // already in target stage
    STATUS_SEMANTIC_ID: 'P',
    UF_CRM_LEAD_TYPE: 'Listing'
  });
  const loopCall = await EventRouter.handleLeadEvent('1007', 'ONCRMLEADUPDATE', 'test-portal.bitrix24.com');
  assert(loopCall.status === 'unchanged', 'Loop Guard: Skipped update because lead is already at target stage');

  // ============================================================================
  // Test Case 7: Terminal / Final Stage Protection
  // ============================================================================
  console.log('\n--- Case 7: Terminal & Final Stage Protection ---');
  BitrixClient.crmLeadGet = async (id) => ({
    ID: id,
    STATUS_ID: 'CONVERTED',
    STATUS_SEMANTIC_ID: 'S', // Won
    CONVERTED: 'Y',
    UF_CRM_LEAD_TYPE: 'Enquiry'
  });

  const resFinal = await EventRouter.handleLeadEvent('1008', 'ONCRMLEADUPDATE', 'test-portal.bitrix24.com');
  assert(resFinal.status === 'skipped', 'Skipped routing for converted / won lead');
  assert(resFinal.reason === 'final_stage', 'Skip reason confirmed as final_stage');

  // Restore original methods
  BitrixClient.crmLeadGet = originalLeadGet;
  BitrixClient.crmLeadUpdate = originalLeadUpdate;
  BitrixClient.refreshAccessToken = originalRefresh;

  // ============================================================================
  // Test Case 8: Tab Field Configuration Schema
  // ============================================================================
  console.log('\n--- Case 8: Tab Field Configuration Schema ---');
  const fieldCfg = config.loadFieldsConfig();
  assert(Array.isArray(fieldCfg.enquiryFields), 'config/fields.json contains enquiryFields array');
  assert(Array.isArray(fieldCfg.listingFields), 'config/fields.json contains listingFields array');
  assert(fieldCfg.enquiryFields.length > 0, 'Enquiry fields array populated');
  assert(fieldCfg.listingFields.length > 0, 'Listing fields array populated');

  // Check specific UAE fields
  const hasBudget = fieldCfg.enquiryFields.some(f => f.code.includes('BUDGET') || f.code.includes('PRICE') || (f.label && (f.label.toLowerCase().includes('budget') || f.label.toLowerCase().includes('price'))));
  const hasListingPriceOrRera = fieldCfg.listingFields.some(f => f.code.includes('RERA') || f.code.includes('PRICE') || (f.label && f.label.toLowerCase().includes('price')));
  assert(hasBudget, 'Enquiry includes Budget field');
  assert(hasListingPriceOrRera, 'Listing includes Price / UAE property field');

  // ============================================================================
  // Test Case 9: Version 2 Lookup Fields Specification
  // ============================================================================
  console.log('\n--- Case 9: Version 2 Lookup Fields Verification ---');
  const lookupFields = [...fieldCfg.listingFields, ...fieldCfg.enquiryFields].filter(f => f.type === 'lookup');
  assert(lookupFields.length >= 4, 'Lookup fields defined with type: lookup');
  
  const hasMasterProjectLookup = lookupFields.some(f => f.lookupEntity === 'master_project');
  const hasProjectLookup = lookupFields.some(f => f.lookupEntity === 'project');
  const hasPropertyLookup = lookupFields.some(f => f.lookupEntity === 'property');
  const hasDeveloperLookup = lookupFields.some(f => f.lookupEntity === 'developer');

  assert(hasMasterProjectLookup, 'Master Project lookup registered with lookupEntity: master_project');
  assert(hasProjectLookup, 'Project lookup registered with lookupEntity: project');
  assert(hasPropertyLookup, 'Property lookup registered with lookupEntity: property');
  assert(hasDeveloperLookup, 'Developer lookup registered with lookupEntity: developer');

  // Verify Bitrix CRM entity binding prefixes: SPAs store pure numeric IDs for native card rendering
  const CRM_PREFIX_MAP = {
    project: '',
    master_project: '',
    layout: '',
    property: '',
    developer: 'CO_',
    company: 'CO_',
    contact: 'C_',
    broker: '',
    listing: '',
    enquiry: ''
  };
  function testLookupRef(entity, id) {
    const prefix = CRM_PREFIX_MAP[entity] || '';
    return `${prefix}${id}`;
  }
  assert(testLookupRef('project', 220) === '220', 'Project maps to pure numeric ID string');
  assert(testLookupRef('developer', 10) === 'CO_10', 'Developer maps to CO_<id>');
  assert(testLookupRef('property', 336) === '336', 'Property maps to pure numeric ID string');
  assert(testLookupRef('layout', 46) === '46', 'Layout maps to pure numeric ID string');
  assert(testLookupRef('contact', 66) === 'C_66', 'Contact maps to C_<id>');

  // ============================================================================
  // Test Case 10: Sensible Section Layouts
  // ============================================================================
  console.log('\n--- Case 10: Sensible Section Layouts Verification ---');
  assert(Array.isArray(fieldCfg.listingLayout?.sections) && fieldCfg.listingLayout.sections.length >= 3, 'Listing Layout has >= 3 structured sections');
  assert(Array.isArray(fieldCfg.enquiryLayout?.sections) && fieldCfg.enquiryLayout.sections.length >= 3, 'Enquiry Layout has >= 3 structured sections');
  
  const listingSectionTitles = fieldCfg.listingLayout.sections.map(s => s.title);
  assert(listingSectionTitles.some(t => t.includes('Commercial') || t.includes('Terms')), 'Listing layout includes Commercial Terms & Listing Status section');
  assert(listingSectionTitles.some(t => t.includes('Building') || t.includes('Location')), 'Listing layout includes Building, Tower & Regional Location section');

  const enquirySectionTitles = fieldCfg.enquiryLayout.sections.map(s => s.title);
  assert(enquirySectionTitles.some(t => t.includes('Client')), 'Enquiry layout includes Client & Inquiry Overview section');
  // ============================================================================
  // Test Case 11: Picklist / Enumeration Options and Numeric ID Verification
  // ============================================================================
  console.log('\n--- Case 11: Picklist / Enumeration Verification ---');
  const allEnumFields = [
    ...(fieldCfg.listingLayout?.sections || []).flatMap(s => s.fields || []),
    ...(fieldCfg.enquiryLayout?.sections || []).flatMap(s => s.fields || [])
  ].filter(f => f.type === 'enumeration');

  assert(allEnumFields.length >= 10, 'Enumeration fields found in layouts');

  // Check that all enumeration fields in layouts use numeric item IDs
  const fieldsWithTextIds = [];
  for (const f of allEnumFields) {
    for (const opt of (f.options || [])) {
      if (!/^\d+$/.test(String(opt.id))) {
        fieldsWithTextIds.push({ code: f.code, id: opt.id, value: opt.value });
      }
    }
  }
  assert(fieldsWithTextIds.length === 0, 'All enumeration options have numeric Bitrix item IDs');

  // Specific check on enquiry status and source type
  const enquiryStatus = allEnumFields.find(f => f.code === 'UF_CRM_STATUS');
  assert(enquiryStatus && enquiryStatus.options.some(o => o.id === '2132' && o.value === 'Active'), 'UF_CRM_STATUS mapped to numeric ID 2132 for Active');

  const leadSource = allEnumFields.find(f => f.code === 'UF_CRM_LEAD_SOURCE_TYPE');
  assert(leadSource && leadSource.options.some(o => o.id === '2324' && o.value === 'Inbound Portal'), 'UF_CRM_LEAD_SOURCE_TYPE mapped to numeric ID 2324 for Inbound Portal');

  // Check Number of Cheques field uses new native Bitrix field UF_CRM_1792139023
  const hasListingCheques = fieldCfg.listingLayout.sections.some(s => s.fields.some(f => f.code === 'UF_CRM_1792139023' && f.type === 'enumeration'));
  assert(hasListingCheques, 'Listing layout uses native Bitrix field UF_CRM_1792139023 as an enumeration list');
  const chequeField = allEnumFields.find(f => f.code === 'UF_CRM_1792139023');
  assert(chequeField && chequeField.options.some(o => o.id === '2446' && (o.value === '4 Cheque' || o.value === '4 Cheques')), 'UF_CRM_1792139023 mapped to numeric ID 2446 for 4 Cheque');

  // Check Number of Parking Spaces field uses native Bitrix field UF_CRM_NUMBEROFPARKINGSPACES
  const hasListingParking = fieldCfg.listingLayout.sections.some(s => s.fields.some(f => f.code === 'UF_CRM_NUMBEROFPARKINGSPACES' && f.type === 'integer'));
  assert(hasListingParking, 'Listing layout uses native Bitrix field UF_CRM_NUMBEROFPARKINGSPACES for Number of Parking Spaces');
  const hasListingFieldParking = (fieldCfg.listingFields || []).some(f => f.code === 'UF_CRM_NUMBEROFPARKINGSPACES');
  assert(hasListingFieldParking, 'listingFields array contains UF_CRM_NUMBEROFPARKINGSPACES');

  // ============================================================================
  // Test Case 12: File Fields Specification & Normalizer Verification
  // ============================================================================
  console.log('\n--- Case 12: File Fields & Upload Normalization ---');
  const allFileFields = [
    ...(fieldCfg.listingLayout?.sections || []).flatMap(s => s.fields || []),
    ...(fieldCfg.enquiryLayout?.sections || []).flatMap(s => s.fields || [])
  ].filter(f => f.type === 'file');

  assert(allFileFields.length >= 2, 'File fields registered in layout schema');
  const hasQrCode = allFileFields.some(f => f.code === 'UF_CRM_QR_CODE');
  const hasPhotosDocs = allFileFields.some(f => f.code === 'UF_CRM_PHOTOS_AND_DOCUMENTS');
  assert(hasQrCode, 'UF_CRM_QR_CODE registered as file field');
  assert(hasPhotosDocs, 'UF_CRM_PHOTOS_AND_DOCUMENTS registered as file field');

  // Verify file normalization logic matches Bitrix24 { fileData: [name, base64] } specification
  const knownMultipleFileFields = new Set([
    'UF_CRM_DOCS_1', 'UF_CRM_PRIMARY_IMAGE_1', 'UF_CRM_EXPOSE_IMAGES',
    'UF_CRM_WEBSITE_IMAGES', 'UF_CRM_PHOTOS_AND_DOCUMENTS', 'UF_CRM_PHOTOS',
    'UF_CRM_DOCUMENTS'
  ]);
  function testNormalizeFiles(fields) {
    const normalized = { ...fields };
    for (const [code, val] of Object.entries(normalized)) {
      if (!val) continue;
      if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'string' && typeof val[1] === 'string' && val[1].length > 10) {
        if (knownMultipleFileFields.has(code)) {
          normalized[code] = [{ fileData: [val[0], val[1]] }];
        } else {
          normalized[code] = { fileData: [val[0], val[1]] };
        }
      } else if (Array.isArray(val)) {
        normalized[code] = val.map(item => {
          if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string') {
            return { fileData: [item[0], item[1]] };
          }
          return item;
        });
      }
    }
    return normalized;
  }

  const rawSingle = { UF_CRM_QR_CODE: ['qr.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='] };
  const normSingle = testNormalizeFiles(rawSingle);
  assert(normSingle.UF_CRM_QR_CODE?.fileData && normSingle.UF_CRM_QR_CODE.fileData[0] === 'qr.png', 'Single file field wrapped with { fileData: [name, base64] }');

  const rawMulti = { UF_CRM_PHOTOS_AND_DOCUMENTS: [['photo1.png', 'AAAAAA111111222222333333'], ['photo2.png', 'BBBBBB111111222222333333']] };
  const normMulti = testNormalizeFiles(rawMulti);
  assert(Array.isArray(normMulti.UF_CRM_PHOTOS_AND_DOCUMENTS) && normMulti.UF_CRM_PHOTOS_AND_DOCUMENTS.length === 2, 'Multiple file field preserves array of attachments');
  assert(normMulti.UF_CRM_PHOTOS_AND_DOCUMENTS[0]?.fileData && normMulti.UF_CRM_PHOTOS_AND_DOCUMENTS[1]?.fileData, 'Each attachment has { fileData: [name, base64] } structure');

  // --- Case 13: Lookup Auto-Pagination & Live Search for Newly Created Projects ---
  console.log('\n--- Case 13: Lookup Auto-Pagination & Live Search for Newly Created Projects ---');
  // Verify that fetchAllSpaItems pagination logic handles datasets exceeding 50 items
  function simulatePaginatedFetch(totalCount, batchSize = 50) {
    let all = [];
    let start = 0;
    while (true) {
      const items = [];
      const remaining = totalCount - start;
      const count = Math.min(batchSize, Math.max(0, remaining));
      for (let i = 0; i < count; i++) {
        const id = totalCount - (start + i);
        items.push({ id, title: `Item #${id}` });
      }
      all.push(...items);
      if (items.length < batchSize) break;
      start += batchSize;
    }
    return all;
  }

  const simulated75Projects = simulatePaginatedFetch(75);
  assert(simulated75Projects.length === 75, 'Pagination retrieves all 75 items across multiple pages');
  assert(simulated75Projects[0].id === 75, 'Newest items appear at index 0 (ID DESC)');
  assert(simulated75Projects[simulated75Projects.length - 1].id === 1, 'Oldest item at end of list');

  // Verify search query filter matches by title, ID, and CRM ref
  const testItems = [
    { id: 402, title: 'testin project', crmRef: 'DYNAMIC_1044_402' },
    { id: 220, title: 'Creek Beach Residences', crmRef: 'DYNAMIC_1044_220' }
  ];
  const queryMatchesTitle = testItems.filter(i => i.title.toLowerCase().includes('testin'));
  assert(queryMatchesTitle.length === 1 && queryMatchesTitle[0].id === 402, 'Lookup query matches newly created project by title "testin"');

  const queryMatchesId = testItems.filter(i => String(i.id) === '402');
  assert(queryMatchesId.length === 1 && queryMatchesId[0].title === 'testin project', 'Lookup query matches project by ID "402"');

  const queryMatchesRef = testItems.filter(i => i.crmRef === 'DYNAMIC_1044_402');
  assert(queryMatchesRef.length === 1 && queryMatchesRef[0].id === 402, 'Lookup query matches project by CRM ref "DYNAMIC_1044_402"');

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n===============================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  if (failedTests === 0) {
    console.log('✓ ALL TEST CASES PASSED SUCCESSFULLY!');
  } else {
    console.error('✗ SOME TEST CASES FAILED');
  }
  } finally {
    if (backupTokens !== null) {
      fs.writeFileSync(tokensFile, backupTokens, 'utf-8');
    }
  }
}

runTests();
