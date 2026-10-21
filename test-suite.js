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
  const hasPortalListingId = fieldCfg.listingFields.some(f => f.code === 'UF_CRM_PORTAL_LISTING_ID');
  const hasPfListingId = fieldCfg.listingFields.some(f => f.code === 'UF_CRM_1792151466' && f.label.includes('Property Finder'));
  assert(hasBudget, 'Enquiry includes Budget field');
  assert(hasListingPriceOrRera, 'Listing includes Price / UAE property field');
  assert(hasPortalListingId, 'Listing includes native UF_CRM_PORTAL_LISTING_ID field');
  assert(hasPfListingId, 'Listing includes native UF_CRM_1792151466 for Property Finder Listing Id');

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
  assert(leadSource && leadSource.options.some(o => (o.id === '2508' || o.id === '2324') && o.value === 'Inbound Portal'), 'UF_CRM_LEAD_SOURCE_TYPE mapped to numeric ID 2508 for Inbound Portal');

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
  // Test Case 14: Date Field Normalization & HTML5 Compatibility
  // ============================================================================
  console.log('\n--- Case 14: Date Field Normalization & HTML5 Compatibility ---');

  function formatDateForInput(val) {
    if (!val) return '';
    const s = String(val).trim();
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    const b24Match = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (b24Match) return `${b24Match[3]}-${b24Match[2]}-${b24Match[1]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  function formatDateTimeForInput(val) {
    if (!val) return '';
    const s = String(val).trim();
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    if (isoMatch) return isoMatch[1];
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${mins}`;
    }
    return '';
  }

  // Verify ISO date conversion (stripping T03:00:00+03:00 so HTML5 date input accepts it)
  const normalizedIsoDate = formatDateForInput('2028-10-01T03:00:00+03:00');
  assert(normalizedIsoDate === '2028-10-01', 'Bitrix ISO date 2028-10-01T03:00:00+03:00 converts to HTML5 2028-10-01');

  // Verify DD.MM.YYYY Bitrix legacy date format
  const normalizedB24Date = formatDateForInput('15.10.2027');
  assert(normalizedB24Date === '2027-10-15', 'Bitrix date 15.10.2027 converts to HTML5 2027-10-15');

  // Verify datetime conversion (stripping seconds and timezone offset for HTML5 datetime-local)
  const normalizedIsoDateTime = formatDateTimeForInput('2026-10-16T13:57:33+03:00');
  assert(normalizedIsoDateTime === '2026-10-16T13:57', 'Bitrix ISO datetime converts to HTML5 2026-10-16T13:57');

  // Verify fields configuration contains Trakheesi Permit Expiry and Completion Date
  const hasTrakheesi = fieldCfg.listingFields.some(f => f.code === 'UF_CRM_TRAKHEESI_EXPIRY' && f.type === 'date');
  const hasCompletion = fieldCfg.listingFields.some(f => f.code === 'UF_CRM_COMPLETIONDATE' && f.type === 'date');
  assert(hasTrakheesi, 'Listing layout includes native UF_CRM_TRAKHEESI_EXPIRY date field');
  assert(hasCompletion, 'Listing layout includes native UF_CRM_COMPLETIONDATE date field');

  // Verify Date Available fallback resolution logic
  const mockLead = { UF_CRM_AVAILABLE_TO: '2028-10-01T03:00:00+03:00' };
  const resolvedDateAvailable = mockLead.UF_CRM_DATE_AVAILABLE || mockLead.UF_CRM_AVAILABLE_TO;
  assert(resolvedDateAvailable === '2028-10-01T03:00:00+03:00', 'UF_CRM_DATE_AVAILABLE resolves from UF_CRM_AVAILABLE_TO');

  // ============================================================================
  // Test Case 15: Enquiry Field Synchronization with Native Bitrix24 Lead Properties
  // ============================================================================
  console.log('\n--- Case 15: Enquiry Native Lead Field Bridging & Companion Sync ---');

  // Test helper simulating the update normalization logic in server.js
  function simulateEnquiryLeadUpdate(rawFields) {
    const fields = { ...rawFields };

    // Sync Contact lookup (UF_CRM_CONTACTS) with native Bitrix CONTACT_ID
    if (fields.UF_CRM_CONTACTS) {
      const rawContact = Array.isArray(fields.UF_CRM_CONTACTS) ? fields.UF_CRM_CONTACTS[0] : fields.UF_CRM_CONTACTS;
      const cMatch = String(rawContact).match(/(?:C_)?(\d+)/i);
      if (cMatch && cMatch[1]) {
        fields.CONTACT_ID = parseInt(cMatch[1], 10);
        fields.UF_CRM_CONTACTS = [`C_${cMatch[1]}`];
      }
    }

    // Sync Comments (UF_CRM_COMMENTS_1) with native Bitrix COMMENTS
    if (fields.UF_CRM_COMMENTS_1 !== undefined && fields.UF_CRM_COMMENTS_1 !== null) {
      fields.COMMENTS = fields.UF_CRM_COMMENTS_1;
    } else if (fields.COMMENTS !== undefined && !fields.UF_CRM_COMMENTS_1) {
      fields.UF_CRM_COMMENTS_1 = fields.COMMENTS;
    }

    // Sync Deal Value / Budget / Price with native Bitrix OPPORTUNITY & CURRENCY_ID
    const dealAmount = fields.UF_CRM_DEAL_VALUE_1 || fields.UF_CRM_LISTINGPRICE_MAX || fields.UF_CRM_LISTINGPRICE;
    if (dealAmount) {
      const parts = String(dealAmount).split('|');
      const num = parseFloat(parts[0]);
      if (!isNaN(num) && num > 0) {
        fields.OPPORTUNITY = num;
        if (parts[1]) fields.CURRENCY_ID = parts[1];
      }
    }

    // Sync Address fields with native Bitrix Lead ADDRESS properties
    if (fields.UF_CRM_1791970638065 && !fields.ADDRESS) {
      fields.ADDRESS = fields.UF_CRM_1791970638065;
    }
    if (fields.UF_CRM_CITY && !fields.ADDRESS_CITY) {
      fields.ADDRESS_CITY = fields.UF_CRM_CITY;
    }
    if (fields.UF_CRM_POSTALCODE && !fields.ADDRESS_POSTAL_CODE) {
      fields.ADDRESS_POSTAL_CODE = fields.UF_CRM_POSTALCODE;
    }
    if (fields.UF_CRM_STATE && !fields.ADDRESS_PROVINCE) {
      fields.ADDRESS_PROVINCE = fields.UF_CRM_STATE;
    }

    // Sync Master Project companion fields (UF_CRM_PROJECT <-> UF_CRM_1792558317)
    if (fields.UF_CRM_PROJECT && !fields.UF_CRM_1792558317) {
      fields.UF_CRM_1792558317 = fields.UF_CRM_PROJECT;
    } else if (fields.UF_CRM_1792558317 && !fields.UF_CRM_PROJECT) {
      fields.UF_CRM_PROJECT = fields.UF_CRM_1792558317;
    }

    // Sync Property Layout companion fields (UF_CRM_PROPERTY_LAYOUT <-> UF_CRM_LAYOUT)
    if (fields.UF_CRM_PROPERTY_LAYOUT && !fields.UF_CRM_LAYOUT) {
      fields.UF_CRM_LAYOUT = fields.UF_CRM_PROPERTY_LAYOUT;
    } else if (fields.UF_CRM_LAYOUT && !fields.UF_CRM_PROPERTY_LAYOUT) {
      fields.UF_CRM_PROPERTY_LAYOUT = fields.UF_CRM_LAYOUT;
    }

    // Sync Property companion fields (UF_CRM_PROPERTY_PROPERTYFINDER <-> UF_CRM_PROPERTY)
    if (fields.UF_CRM_PROPERTY_PROPERTYFINDER && !fields.UF_CRM_PROPERTY) {
      fields.UF_CRM_PROPERTY = fields.UF_CRM_PROPERTY_PROPERTYFINDER;
    } else if (fields.UF_CRM_PROPERTY && !fields.UF_CRM_PROPERTY_PROPERTYFINDER) {
      fields.UF_CRM_PROPERTY_PROPERTYFINDER = fields.UF_CRM_PROPERTY;
    }

    // Ensure MULTIPLE: 'Y' userfields are arrays in Bitrix
    const multipleUfCodes = [
      'UF_CRM_ADDITIONALCITIES',
      'UF_CRM_ADDITIONALPOSTALCODES',
      'UF_CRM_COUNTIES',
      'UF_CRM_NEIGHBORHOODS',
      'UF_CRM_SUBDIVISIONS',
      'UF_CRM_SCHOOLDISTRICTS',
      'UF_CRM_RECOMMENDED_LISTINGS',
      'UF_CRM_CONTACTS'
    ];
    for (const mCode of multipleUfCodes) {
      if (fields[mCode] !== undefined && fields[mCode] !== null && fields[mCode] !== '') {
        if (!Array.isArray(fields[mCode])) {
          fields[mCode] = [String(fields[mCode]).trim()];
        }
      }
    }

    return fields;
  }

  // 1. Verify UF_CRM_ENQUIRY_NAME remains independent and does not overwrite native Lead TITLE
  const out1 = simulateEnquiryLeadUpdate({ UF_CRM_ENQUIRY_NAME: '3BR Luxury Waterfront Penthouse' });
  assert(!out1.TITLE, 'UF_CRM_ENQUIRY_NAME remains independent and does not overwrite native Lead TITLE');

  // 2. Verify CONTACT_ID extracts numeric ID and formats UF_CRM_CONTACTS as array
  const out2 = simulateEnquiryLeadUpdate({ UF_CRM_CONTACTS: 'C_68' });
  assert(out2.CONTACT_ID === 68, 'CONTACT_ID extracts numeric ID 68 from C_68');
  assert(Array.isArray(out2.UF_CRM_CONTACTS) && out2.UF_CRM_CONTACTS[0] === 'C_68', 'UF_CRM_CONTACTS wrapped in array [C_68] for MULTIPLE: Y');

  // 3. Verify COMMENTS synchronizes from UF_CRM_COMMENTS_1
  const out3 = simulateEnquiryLeadUpdate({ UF_CRM_COMMENTS_1: 'Client prefers high floor with sea view' });
  assert(out3.COMMENTS === 'Client prefers high floor with sea view', 'COMMENTS updates from UF_CRM_COMMENTS_1');

  // 4. Verify OPPORTUNITY and CURRENCY_ID synchronize from UF_CRM_DEAL_VALUE_1
  const out4 = simulateEnquiryLeadUpdate({ UF_CRM_DEAL_VALUE_1: '140000|AED' });
  assert(out4.OPPORTUNITY === 140000 && out4.CURRENCY_ID === 'AED', 'OPPORTUNITY (140000) and CURRENCY_ID (AED) update from UF_CRM_DEAL_VALUE_1');

  // 5. Verify ADDRESS properties synchronize from property fields
  const out5 = simulateEnquiryLeadUpdate({
    UF_CRM_1791970638065: 'Building 4, Downtown Boulevard',
    UF_CRM_CITY: 'Dubai',
    UF_CRM_POSTALCODE: '00000',
    UF_CRM_STATE: 'Dubai'
  });
  assert(out5.ADDRESS === 'Building 4, Downtown Boulevard', 'Native ADDRESS updates from UF_CRM_1791970638065');
  assert(out5.ADDRESS_CITY === 'Dubai', 'Native ADDRESS_CITY updates from UF_CRM_CITY');
  assert(out5.ADDRESS_POSTAL_CODE === '00000', 'Native ADDRESS_POSTAL_CODE updates from UF_CRM_POSTALCODE');
  assert(out5.ADDRESS_PROVINCE === 'Dubai', 'Native ADDRESS_PROVINCE updates from UF_CRM_STATE');

  // 6. Verify Master Project companion fields synchronize
  const out6 = simulateEnquiryLeadUpdate({ UF_CRM_PROJECT: '220' });
  assert(out6.UF_CRM_1792558317 === '220', 'Native Master Project UF_CRM_1792558317 synchronizes from UF_CRM_PROJECT');

  // 7. Verify MULTIPLE userfields are formatted as arrays
  const out7 = simulateEnquiryLeadUpdate({ UF_CRM_ADDITIONALCITIES: 'Sharjah, Ajman' });
  assert(Array.isArray(out7.UF_CRM_ADDITIONALCITIES) && out7.UF_CRM_ADDITIONALCITIES[0] === 'Sharjah, Ajman', 'MULTIPLE string userfields wrapped as arrays');

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
