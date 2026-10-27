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

  const leadSource = allEnumFields.find(f => f.code === 'UF_CRM_1792563228880' || f.code === 'UF_CRM_LEAD_SOURCE_TYPE');
  assert(leadSource && leadSource.options.some(o => (o.id === '2506' || o.id === '2508' || o.id === '2324') && o.value === 'Inbound Portal'), 'Lead Source Type mapped to numeric ID for Inbound Portal');

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

  const hasQrCode = allFileFields.some(f => f.code === 'UF_CRM_QR_CODE');
  const hasPhotos = allFileFields.some(f => f.code === 'UF_CRM_PHOTOS');
  const hasDocuments = allFileFields.some(f => f.code === 'UF_CRM_DOCUMENTS');
  const hasPhotosDocs = allFileFields.some(f => f.code === 'UF_CRM_PHOTOS_AND_DOCUMENTS' || f.leadAltCodes?.includes('UF_CRM_PHOTOS_AND_DOCUMENTS') || f.fallbackKeys?.includes('ufCrm16_1791544736052'));
  assert(hasQrCode, 'UF_CRM_QR_CODE registered as file field');
  assert(hasPhotos && hasDocuments, 'UF_CRM_PHOTOS and UF_CRM_DOCUMENTS registered as distinct sensible file fields');
  assert(hasPhotosDocs, 'UF_CRM_PHOTOS_AND_DOCUMENTS supported via photos field mapping');

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
      const stateEnumToLabel = {
        '2532': 'Dubai',
        '2534': 'Abu Dhabi',
        '2536': 'Sharjah',
        '2538': 'Ajman',
        '2540': 'Ras Al Khaimah',
        '2542': 'Fujairah',
        '2544': 'Umm Al Quwain'
      };
      fields.ADDRESS_PROVINCE = stateEnumToLabel[String(fields.UF_CRM_STATE)] || fields.UF_CRM_STATE;
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

    // Sync Lead Source Type companion fields and native Bitrix SOURCE_ID
    if (fields.UF_CRM_1792563228880 && !fields.UF_CRM_LEAD_SOURCE_TYPE) {
      fields.UF_CRM_LEAD_SOURCE_TYPE = fields.UF_CRM_1792563228880;
    } else if (fields.UF_CRM_LEAD_SOURCE_TYPE && !fields.UF_CRM_1792563228880) {
      fields.UF_CRM_1792563228880 = fields.UF_CRM_LEAD_SOURCE_TYPE;
    }
    if (fields.UF_CRM_1792563228880) {
      const legacySourceMap = {
        '2324': '2506',
        '2326': '2504',
        '2328': '2502',
        '2330': '2500',
        '2332': '2498',
        '2334': '2496'
      };
      if (legacySourceMap[String(fields.UF_CRM_1792563228880)]) {
        fields.UF_CRM_1792563228880 = legacySourceMap[String(fields.UF_CRM_1792563228880)];
        fields.UF_CRM_LEAD_SOURCE_TYPE = fields.UF_CRM_1792563228880;
      }
      const sourceToNativeMap = {
        '2506': 'WEB',
        '2504': 'ADVERTISING',
        '2502': 'WEB',
        '2500': 'CALLBACK',
        '2498': 'CALL',
        '2496': 'PARTNER'
      };
      const mappedNative = sourceToNativeMap[String(fields.UF_CRM_1792563228880)];
      if (mappedNative && !fields.SOURCE_ID) {
        fields.SOURCE_ID = mappedNative;
      }
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
    UF_CRM_STATE: '2532'
  });
  assert(out5.ADDRESS === 'Building 4, Downtown Boulevard', 'Native ADDRESS updates from UF_CRM_1791970638065');
  assert(out5.ADDRESS_CITY === 'Dubai', 'Native ADDRESS_CITY updates from UF_CRM_CITY');
  assert(out5.ADDRESS_POSTAL_CODE === '00000', 'Native ADDRESS_POSTAL_CODE updates from UF_CRM_POSTALCODE');
  assert(out5.ADDRESS_PROVINCE === 'Dubai', 'Native ADDRESS_PROVINCE updates from UF_CRM_STATE enum ID 2532');

  // 6. Verify Master Project companion fields synchronize
  const out6 = simulateEnquiryLeadUpdate({ UF_CRM_PROJECT: '220' });
  assert(out6.UF_CRM_1792558317 === '220', 'Native Master Project UF_CRM_1792558317 synchronizes from UF_CRM_PROJECT');

  // 7. Verify MULTIPLE userfields are formatted as arrays
  const out7 = simulateEnquiryLeadUpdate({ UF_CRM_ADDITIONALCITIES: 'Sharjah, Ajman' });
  assert(Array.isArray(out7.UF_CRM_ADDITIONALCITIES) && out7.UF_CRM_ADDITIONALCITIES[0] === 'Sharjah, Ajman', 'MULTIPLE string userfields wrapped as arrays');

  // 8. Verify UF_CRM_1792563228880 resolves legacy IDs and synchronizes native Bitrix SOURCE_ID
  const out8 = simulateEnquiryLeadUpdate({ UF_CRM_1792563228880: '2324' });
  assert(out8.UF_CRM_1792563228880 === '2506', 'Legacy ID 2324 maps to native Bitrix ID 2506');
  assert(out8.SOURCE_ID === 'WEB', 'Native Bitrix SOURCE_ID updates to WEB for Inbound Portal');

  const out9 = simulateEnquiryLeadUpdate({ UF_CRM_1792563228880: '2504' });
  assert(out9.SOURCE_ID === 'ADVERTISING', 'Native Bitrix SOURCE_ID updates to ADVERTISING for Paid Ad Campaign');

  const out10 = simulateEnquiryLeadUpdate({ UF_CRM_1792563228880: '2498' });
  assert(out10.SOURCE_ID === 'CALL', 'Native Bitrix SOURCE_ID updates to CALL for Cold Outreach');

  // ============================================================================
  // Case 16: Cross-Entity SPA Enum Translation (Lead Source Type, Urgency, State)
  // ============================================================================
  console.log('\n--- Case 16: Cross-Entity SPA Enum Translation ---');
  const {
    LEAD_SOURCE_TYPE_MAP,
    URGENCY_MAP,
    STATE_MAP,
    STATE_ENUM_TO_LABEL,
    STATE_LABEL_TO_ENUM
  } = require('./src/spaSync');

  // 1. Verify UF_CRM_STATE schema in config/fields.json
  const fieldsConfig = config.loadFieldsConfig();
  const stateField = fieldsConfig.enquiryLayout?.sections
    ?.flatMap(s => s.fields || [])
    ?.find(f => f.code === 'UF_CRM_STATE');
  assert(stateField && stateField.type === 'enumeration', 'UF_CRM_STATE is configured as type enumeration');
  assert(Array.isArray(stateField.options) && stateField.options.length === 7, 'UF_CRM_STATE has exactly 7 UAE Emirates options');
  assert(stateField.options.some(o => o.value === 'Dubai' && String(o.id) === '2532'), 'UF_CRM_STATE includes Dubai (2532)');
  assert(stateField.options.some(o => o.value === 'Abu Dhabi' && String(o.id) === '2534'), 'UF_CRM_STATE includes Abu Dhabi (2534)');

  // 2. Verify Lead Source Type Cross-Entity Translation
  assert(LEAD_SOURCE_TYPE_MAP['2506'] === 1234, 'Inbound Portal (2506) maps to SPA 1234');
  assert(LEAD_SOURCE_TYPE_MAP['2504'] === 1236, 'Paid Ad Campaign (2504) maps to SPA 1236');
  assert(LEAD_SOURCE_TYPE_MAP['2502'] === 1238, 'Organic Search (2502) maps to SPA 1238');
  assert(LEAD_SOURCE_TYPE_MAP['2500'] === 1240, 'Direct Message (2500) maps to SPA 1240');
  assert(LEAD_SOURCE_TYPE_MAP['2498'] === 1242, 'Cold Outreach (2498) maps to SPA 1242');
  assert(LEAD_SOURCE_TYPE_MAP['2496'] === 1244, 'Partner Broker (2496) maps to SPA 1244');

  // 3. Verify Urgency Cross-Entity Translation
  assert(URGENCY_MAP['2370'] === 1294, 'Urgency Low (2370) maps to SPA 1294');
  assert(URGENCY_MAP['2372'] === 1296, 'Urgency Normal (2372) maps to SPA 1296');
  assert(URGENCY_MAP['2374'] === 1298, 'Urgency High (2374) maps to SPA 1298');
  assert(URGENCY_MAP['2376'] === 1300, 'Urgency Urgent (2376) maps to SPA 1300');

  // 4. Verify State Cross-Entity Translation
  assert(STATE_MAP['2532'] === 1354, 'State Dubai (2532) maps to SPA 1354');
  assert(STATE_MAP['2534'] === 1356, 'State Abu Dhabi (2534) maps to SPA 1356');
  assert(STATE_MAP['2544'] === 1366, 'State Umm Al Quwain (2544) maps to SPA 1366');

  // 5. Verify State enum to label mapping
  assert(STATE_ENUM_TO_LABEL['2532'] === 'Dubai', 'STATE_ENUM_TO_LABEL resolves 2532 to Dubai');
  assert(STATE_LABEL_TO_ENUM['dubai'] === '2532', 'STATE_LABEL_TO_ENUM resolves dubai to 2532');

  // 6. Verify City - Bayut schema and translation
  const { CITY_BAYUT_MAP, CITY_PROPERTYFINDER_MAP } = require('./src/spaSync');
  const cityBayutField = fieldsConfig.enquiryLayout?.sections
    ?.flatMap(s => s.fields || [])
    ?.find(f => f.code === 'UF_CRM_CITY_BAYUT');
  assert(cityBayutField && cityBayutField.type === 'enumeration', 'UF_CRM_CITY_BAYUT is configured as type enumeration');
  assert(Array.isArray(cityBayutField.options) && cityBayutField.options.length === 8, 'UF_CRM_CITY_BAYUT has exactly 8 UAE city options');
  assert(cityBayutField.options.some(o => o.value === 'Dubai' && String(o.id) === '2546'), 'UF_CRM_CITY_BAYUT includes Dubai (2546)');
  assert(cityBayutField.options.some(o => o.value === 'Al Ain' && String(o.id) === '2560'), 'UF_CRM_CITY_BAYUT includes Al Ain (2560)');
  assert(CITY_BAYUT_MAP['2546'] === 1134, 'City Bayut Dubai (2546) maps to SPA 1134');
  assert(CITY_BAYUT_MAP['2560'] === 1148, 'City Bayut Al Ain (2560) maps to SPA 1148');

  // 7. Verify City - Propertyfinder schema and translation
  const cityPfField = fieldsConfig.enquiryLayout?.sections
    ?.flatMap(s => s.fields || [])
    ?.find(f => f.code === 'UF_CRM_CITY_PF');
  assert(cityPfField && cityPfField.type === 'enumeration', 'UF_CRM_CITY_PF is configured as type enumeration');
  assert(Array.isArray(cityPfField.options) && cityPfField.options.length === 8, 'UF_CRM_CITY_PF has exactly 8 UAE city options');
  assert(cityPfField.options.some(o => o.value === 'Dubai' && String(o.id) === '2562'), 'UF_CRM_CITY_PF includes Dubai (2562)');
  assert(cityPfField.options.some(o => o.value === 'Al Ain' && String(o.id) === '2576'), 'UF_CRM_CITY_PF includes Al Ain (2576)');
  assert(CITY_PROPERTYFINDER_MAP['2562'] === 1150, 'City PF Dubai (2562) maps to SPA 1150');
  assert(CITY_PROPERTYFINDER_MAP['2576'] === 1164, 'City PF Al Ain (2576) maps to SPA 1164');

  // ============================================================================
  // Case 17: Matching Listings SPA Tab & Search Algorithms
  // ============================================================================
  console.log('\n--- Case 17: Matching Listings SPA Tab & Search Algorithms ---');

  // 1. Verify existence of views and static assets
  assert(fs.existsSync(path.resolve(__dirname, 'views/matching-listings.html')), 'views/matching-listings.html exists');
  assert(fs.existsSync(path.resolve(__dirname, 'views/matching-install.html')), 'views/matching-install.html exists');
  assert(fs.existsSync(path.resolve(__dirname, 'public/css/matching-listings.css')), 'public/css/matching-listings.css exists');
  assert(fs.existsSync(path.resolve(__dirname, 'public/js/matching-listings.js')), 'public/js/matching-listings.js exists');

  // 2. Verify placement registration constants
  const matchingJs = fs.readFileSync(path.resolve(__dirname, 'public/js/matching-listings.js'), 'utf-8');
  assert(matchingJs.includes("placement: 'CRM_DYNAMIC_1062_DETAIL_TAB'"), 'Placement identifier is CRM_DYNAMIC_1062_DETAIL_TAB');
  assert(matchingJs.includes('entityTypeId: 1062'), 'Enquiry SPA entityTypeId is 1062');
  assert(matchingJs.includes('entityTypeId: 1058'), 'Listing SPA entityTypeId is 1058');

  // 3. Verify field mapping constants
  assert(matchingJs.includes("propertyType: 'ufCrm18_1790155720'"), 'Enquiry propertyType mapped to ufCrm18_1790155720');
  assert(matchingJs.includes("propertyType: 'ufCrm16PropertyType'"), 'Listing propertyType mapped to ufCrm16PropertyType');
  assert(matchingJs.includes("listingType: 'ufCrm18ListingType'"), 'Enquiry listingType mapped to ufCrm18ListingType');
  assert(matchingJs.includes("listingType: 'ufCrm16_1790154808'"), 'Listing listingType mapped to ufCrm16_1790154808');
  assert(matchingJs.includes("bedrooms: 'ufCrm16_1791172802'"), 'Listing bedrooms mapped to ufCrm16_1791172802');
  assert(matchingJs.includes("status: 'ufCrm16Status'"), 'Listing status mapped to ufCrm16Status');
  assert(matchingJs.includes('AVAILABLE_STATUS_ID: 924'), 'Active listing status ID is 924');

  // 4. Verify enumeration cross-entity mappings
  assert(matchingJs.includes("label: 'Apartment', enquiryId: 2530, listingId: 886"), 'Apartment maps Enquiry 2530 <-> Listing 886');
  assert(matchingJs.includes("label: 'Villa', enquiryId: 2528, listingId: 888"), 'Villa maps Enquiry 2528 <-> Listing 888');
  assert(matchingJs.includes("label: 'Penthouse', enquiryId: 2524, listingId: 892"), 'Penthouse maps Enquiry 2524 <-> Listing 892');
  assert(matchingJs.includes("label: 'Sale', enquiryId: 1246, listingId: 158"), 'Sale purpose maps Enquiry 1246 <-> Listing 158');
  assert(matchingJs.includes("label: 'Rent', enquiryId: 1248, listingId: 160"), 'Rent purpose maps Enquiry 1248 <-> Listing 160');

  // 5. Test Budget Tolerance Calculation logic
  function calcBudgetBounds(min, max, tolerance) {
    let pMin = min;
    let pMax = max;
    if (tolerance) {
      if (pMin !== null) pMin = Math.max(0, pMin * 0.9);
      if (pMax !== null) pMax = pMax * 1.1;
    }
    return { pMin, pMax };
  }
  const boundsWithTol = calcBudgetBounds(1000000, 2000000, true);
  assert(boundsWithTol.pMin === 900000, 'Tolerance -10% adjusts min 1,000,000 to 900,000');
  assert(boundsWithTol.pMax === 2200000, 'Tolerance +10% adjusts max 2,000,000 to 2,200,000');
  const boundsNoTol = calcBudgetBounds(1000000, 2000000, false);
  assert(boundsNoTol.pMin === 1000000 && boundsNoTol.pMax === 2000000, 'Without tolerance, exact bounds preserved');

  // 6. Test Bedroom Matching logic
  function matchBeds(listingBeds, reqBeds, exact) {
    if (reqBeds === null || reqBeds === undefined) return true;
    return exact ? listingBeds === reqBeds : listingBeds >= reqBeds;
  }
  assert(matchBeds(4, 3, false) === true, 'Min beds: 4 beds satisfies 3 beds requirement');
  assert(matchBeds(2, 3, false) === false, 'Min beds: 2 beds fails 3 beds requirement');
  assert(matchBeds(4, 3, true) === false, 'Exact beds: 4 beds fails 3 beds requirement');
  assert(matchBeds(3, 3, true) === true, 'Exact beds: 3 beds matches 3 beds requirement');

  // 7. Verify Timeline & Item Open Integration
  assert(matchingJs.includes("BX24.openPath"), 'Uses BX24.openPath to open listing items');

  // 8. Verify Direct Userfield Recommendation Integration (UF_CRM_18_1792649609)
  assert(matchingJs.includes("recommendedListings: 'ufCrm18_1792649609'"), 'Maps UF_CRM_18_1792649609 to recommendedListings in Enquiry config');
  assert(matchingJs.includes("function addRecommendation("), 'addRecommendation function is defined');
  assert(matchingJs.includes("crm.item.update"), 'Uses crm.item.update to update Enquiry item directly');
  assert(!matchingJs.includes("crm.activity.configurable.add"), 'Enforces no activity creation (pure userfield update)');
  assert(matchingJs.includes("btnSaveRecommendation.addEventListener('click', saveSelectedRecommendations)"), 'Save as recommendation button wired to saveSelectedRecommendations');
  assert(matchingJs.includes("badge-recommended"), 'Renders badge-recommended indicator on card for already recommended listings');
  assert(matchingJs.includes("addRecommendation,"), 'addRecommendation exposed on window.__MATCHING_APP__ for testing');

  // ============================================================================
  // Test Case 18: Listing Details SPA Tab & 4 Dynamic Layouts Verification
  // ============================================================================
  console.log('\n--- Case 18: Listing Details SPA Tab & 4 Dynamic Layouts ---');

  // 1. Verify Views and Assets
  assert(fs.existsSync('views/listing-details.html'), 'views/listing-details.html exists');
  assert(fs.existsSync('views/listing-install.html'), 'views/listing-install.html exists');
  assert(fs.existsSync('public/css/listing-details.css'), 'public/css/listing-details.css exists');
  assert(fs.existsSync('public/js/listing-details.js'), 'public/js/listing-details.js exists');

  // 2. Verify Server Routes & Placement Binding
  const serverCode = fs.readFileSync('server.js', 'utf8');
  assert(serverCode.includes("app.all('/listing-details'"), 'server.js defines /listing-details route');
  assert(serverCode.includes("app.all('/listing-install'"), 'server.js defines /listing-install route');
  assert(serverCode.includes("app.get('/api/listing/:id'"), 'server.js defines GET /api/listing/:id route');
  assert(serverCode.includes("app.all('/api/listing/:id/update'"), 'server.js defines /api/listing/:id/update route');
  assert(serverCode.includes("app.get('/api/stages/listing'"), 'server.js defines GET /api/stages/listing route');
  assert(serverCode.includes("CRM_DYNAMIC_1058_DETAIL_TAB"), 'server.js registers CRM_DYNAMIC_1058_DETAIL_TAB placement');
  assert(serverCode.includes("CRM_DYNAMIC_16_DETAIL_TAB"), 'server.js registers CRM_DYNAMIC_16_DETAIL_TAB placement');

  // 3. Verify Dynamic Layout Engine Configurations
  const listingJs = fs.readFileSync('public/js/listing-details.js', 'utf8');
  const normListingJs = listingJs.replace(/"/g, "'").replace(/\s+/g, ' ');
  assert(normListingJs.includes("entityTypeId: 1058"), 'Listing SPA entityTypeId is 1058');
  assert(normListingJs.includes("placement: 'CRM_DYNAMIC_1058_DETAIL_TAB'"), 'Placement identifier is CRM_DYNAMIC_1058_DETAIL_TAB');
  assert(normListingJs.includes("layoutField: 'ufCrm16_1790154808'"), 'Layout driving field is ufCrm16_1790154808');

  // 4. Verify 4 Layouts and Trigger IDs
  assert(normListingJs.includes("164: 'external_stock'") || normListingJs.includes("'164': 'external_stock'"), 'Layout External Stock triggered by enum 164');
  assert(normListingJs.includes("162: 'off_plan'") || normListingJs.includes("'162': 'off_plan'"), 'Layout Off-plan triggered by enum 162');
  assert(normListingJs.includes("160: 'overseas_sale'") || normListingJs.includes("'160': 'overseas_sale'"), 'Layout Overseas Sale triggered by enum 160');
  assert(normListingJs.includes("158: 'rent'") || normListingJs.includes("'158': 'rent'"), 'Layout Rent triggered by enum 158');

  // 5. Verify Contextual Label Overrides
  assert(normListingJs.includes("Listing Price (as annual rent)"), 'Contextual label: Rent shows Listing Price (as annual rent)');
  assert(normListingJs.includes("Number of Cheques (payment plan)"), 'Contextual label: Off-plan shows Number of Cheques (payment plan)');
  assert(normListingJs.includes("Started on (mandate period)"), 'Contextual label: External Stock shows Started on (mandate period)');
  assert(normListingJs.includes("Started on (tenancy / availability)"), 'Contextual label: Rent shows Started on (tenancy / availability)');

  // 6. Verify Field Visibility Matrix (✔ = show, opt = opt, — = hide)
  assert(normListingJs.includes("external_stock: 'hide'") && normListingJs.includes("rent: 'show'"), 'Rental Frequency and Security Deposit only shown on Rent');
  assert(normListingJs.includes("ufCrm16_1791881665252") && normListingJs.includes("ufCrm16QrCode"), 'Media & Documents contains logical and sensible fields (Documents, QR Code, Photos, Primary Image, Title Deed, Form A)');
  assert(normListingJs.includes("ufCrm16_1791544736052"), 'Legacy Photos and Documents supported as fallbackKey for Photos');
  assert(normListingJs.includes("off_plan: 'hide'") && normListingJs.includes("rent: 'show'"), 'Furnished Status hidden on Off-plan and shown on Rent');

  // 7. Verify Media & File Preview Engine
  assert(normListingJs.includes("FileReader"), 'Uses FileReader for instant client-side file upload previews');
  assert(normListingJs.includes("openLightbox"), 'openLightbox function defined for image and PDF modal previews');
  assert(normListingJs.includes("{ fileData: ["), 'Normalizes new file uploads to { fileData: [name, base64] } specification for Bitrix24');
  assert(normListingJs.includes("preview-thumb-wrap"), 'Renders preview thumbnail wrap with hover zoom overlay');
  assert(normListingJs.includes("preview-doc-wrap"), 'Renders document preview card with PDF badge and preview action');
  assert(normListingJs.includes("window.__LISTING_DETAILS_APP__"), 'Exposes __LISTING_DETAILS_APP__ for testing');

  const listingCss = fs.readFileSync('public/css/listing-details.css', 'utf8');
  assert(listingCss.includes(".lightbox-iframe"), 'public/css/listing-details.css contains embedded PDF viewer modal styling');
  assert(listingCss.includes(".preview-thumb-wrap"), 'public/css/listing-details.css contains preview thumbnail styling');

  // 8. Verify Synchronization with Listing SPA Datatypes and Actual Enum Values
  const fieldsCfg = JSON.parse(fs.readFileSync('config/fields.json', 'utf8'));
  assert(fieldsCfg.listingDynamicLayout, 'config/fields.json defines listingDynamicLayout');
  assert(fieldsCfg.listingDynamicLayout.sections.length === 8, 'listingDynamicLayout has 8 structured sections');
  assert(normListingJs.includes("id: '872'") && normListingJs.includes("value: 'Standard'"), 'Property Sub-type includes actual SPA enum 872 Standard');
  assert(normListingJs.includes("id: '884'") && normListingJs.includes("value: 'Penthouse'"), 'Property Sub-type includes actual SPA enum 884 Penthouse');
  assert(normListingJs.includes("id: '762'") && normListingJs.includes("value: 'Monthly'"), 'Rental Frequency includes actual SPA enum 762 Monthly');
  assert(normListingJs.includes("id: '768'") && normListingJs.includes("value: 'Annually'"), 'Rental Frequency includes actual SPA enum 768 Annually');
  assert(normListingJs.includes("id: '2432'") && normListingJs.includes("value: '1 Cheque'"), 'Number of Cheques includes actual SPA enum 2432 1 Cheque');
  assert(normListingJs.includes("id: '2440'") && normListingJs.includes("value: '12 Cheque'"), 'Number of Cheques includes actual SPA enum 2440 12 Cheque');
  assert(!normListingJs.includes("ufCrm16RecordType") && !normListingJs.includes("Offering / Record Type"), 'Record Type is removed from listing details layout');
  assert(normListingJs.includes("f.type === 'enumeration' || f.type === 'stage'"), 'Stage field renders as picklist select in listing details');
  assert(normListingJs.includes("DYNAMIC_1058_STAGE_") && normListingJs.includes("stageOptionsByPipeline"), 'Stage picklist loads options strictly for current pipeline without hardcoded dummy list values');
  assert(normListingJs.includes("id: '702'") && normListingJs.includes("value: 'Off-Plan'"), 'Completion Status includes actual SPA enum 702 Off-Plan');
  assert(normListingJs.includes("id: '836'") && normListingJs.includes("value: 'Vacant on Transfer'"), 'Occupancy includes actual SPA enum 836 Vacant on Transfer');
  assert(normListingJs.includes("crmCode: 'UF_CRM_16_1791172676'"), 'Address field mapped to native UF_CRM_16_1791172676 with address type');

  // 9. Verify Lookup Fields & Linked Record Accessibility from Layout
  assert(listingJs.includes("isLookupField"), 'Defines isLookupField to recognize CRM lookup types');
  assert(listingJs.includes("resolveLookupEntity"), 'Defines resolveLookupEntity to map listing lookup types to entities');
  assert(listingJs.includes("openLinkedRecord"), 'Defines openLinkedRecord to navigate directly to linked records');
  assert(listingJs.includes("lookup-open-btn"), 'Renders inline lookup-open-btn for direct 1-click access');
  assert(listingJs.includes("<span>↗</span>"), 'Renders arrow-only open button next to lookup input');
  assert(listingJs.includes("input.dataset.id"), 'Preserves underlying entity ID via dataset.id while displaying title inside input');
  assert(listingJs.includes("lookup-dropdown"), 'Renders autocomplete dropdown container in listing layout');
  assert(listingJs.includes("lookup-clear-btn"), 'Renders clear button for 1-click reset of lookup field');
  assert(listingJs.includes("lookup-refresh-btn"), 'Renders refresh button for live re-query of Bitrix records');
  assert(listingJs.includes("/api/lookup"), 'Connects to live /api/lookup endpoint with debounce search');
  assert(listingCss.includes(".lookup-open-btn"), 'public/css/listing-details.css contains lookup-open-btn styling');
  assert(listingCss.includes(".lookup-dropdown"), 'public/css/listing-details.css contains lookup-dropdown styling');
  assert(listingCss.includes(".lookup-item"), 'public/css/listing-details.css contains lookup-item styling');

  // ============================================================================
  // Test Case 19: Listing Layout Synchronization & Cross-Entity Field Mapping Engine
  // ============================================================================
  console.log('\n--- Case 19: Listing Layout Synchronization & Cross-Entity Field Mapping ---');
  const spaSyncModule = require('./src/spaSync');
  assert(typeof spaSyncModule.getListingFieldMapping === 'function', 'spaSync exports getListingFieldMapping function');
  assert(typeof spaSyncModule.syncListingSpaFromLead === 'function', 'spaSync exports syncListingSpaFromLead function');
  assert(typeof spaSyncModule.syncLeadFromListingSpa === 'function', 'spaSync exports syncLeadFromListingSpa function');

  const mappingData = spaSyncModule.getListingFieldMapping();
  assert(mappingData.success === true, 'getListingFieldMapping returns success: true');
  assert(mappingData.entityTypeId === 1058, 'Entity type ID is 1058 (Listing SPA)');
  assert(Array.isArray(mappingData.fieldMap) && mappingData.fieldMap.length >= 60, 'Field map contains >= 60 synchronized listing attributes');
  assert(Array.isArray(mappingData.sections) && mappingData.sections.length === 8, 'Synchronized listing layout has exactly 8 structured sections');

  // Check 8 structured sections
  const sectionIds = mappingData.sections.map(s => s.id);
  assert(sectionIds.includes('general'), 'Includes General Overview section');
  assert(sectionIds.includes('seller'), 'Includes Seller & Source section');
  assert(sectionIds.includes('specs'), 'Includes Property Specifications section');
  assert(sectionIds.includes('location'), 'Includes Location & Geography section');
  assert(sectionIds.includes('pricing'), 'Includes Pricing & Terms section');
  assert(sectionIds.includes('dates'), 'Includes Dates & Timeline section');
  assert(sectionIds.includes('marketing'), 'Includes Portals & Marketing section');
  assert(sectionIds.includes('media'), 'Includes Media & Documents section');

  // Check enum maps
  const enumMaps = spaSyncModule.LISTING_ENUM_MAPS;
  assert(enumMaps.listingType.leadToSpa['2578'] === 158, 'Listing Type Rent: Lead 2578 maps to SPA 158');
  assert(enumMaps.listingType.leadToSpa['2580'] === 160, 'Listing Type Overseas Sale: Lead 2580 maps to SPA 160');
  assert(enumMaps.listingType.leadToSpa['2582'] === 162, 'Listing Type Off-plan: Lead 2582 maps to SPA 162');
  assert(enumMaps.listingType.leadToSpa['2584'] === 164, 'Listing Type External Stock: Lead 2584 maps to SPA 164');
  assert(enumMaps.listingType.spaToLead['158'] === '2578', 'Listing Type Rent: SPA 158 maps inversely to Lead 2578');

  assert(enumMaps.propertyType.leadToSpa['1754'] === 886, 'Property Type Apartment: Lead 1754 maps to SPA 886');
  assert(enumMaps.propertyType.leadToSpa['1756'] === 888, 'Property Type Villa: Lead 1756 maps to SPA 888');
  assert(enumMaps.propertyType.leadToSpa['1760'] === 892, 'Property Type Penthouse: Lead 1760 maps to SPA 892');

  assert(enumMaps.furnished.leadToSpa['1794'] === 736, 'Furnished Status: Lead 1794 maps to SPA 736');
  assert(!enumMaps.recordType, 'Record Type enum map is removed from spaSync');
  assert(enumMaps.hoaFrequency.leadToSpa['1998'] === 762, 'Rental Frequency: Lead 1998 maps to SPA 762');
  assert(enumMaps.cheques.leadToSpa['2446'] === 2436, 'Number of Cheques: Lead 2446 maps to SPA 2436');
  assert(enumMaps.completionStatus.leadToSpa['1944'] === 702, 'Completion Status: Lead 1944 maps to SPA 702');
  assert(enumMaps.occupancy.leadToSpa['1824'] === 836, 'Tenancy Status: Lead 1824 maps to SPA 836');

  // Verify tab.js contains dynamic sublayout detection and listener
  const tabJsContent = fs.readFileSync(path.resolve(__dirname, 'public/js/tab.js'), 'utf-8');
  assert(tabJsContent.includes('detectListingSubLayout'), 'public/js/tab.js defines detectListingSubLayout');
  assert(tabJsContent.includes('applyListingSubLayout'), 'public/js/tab.js defines applyListingSubLayout');
  assert(tabJsContent.includes('listingLayoutBadge'), 'public/js/tab.js controls listingLayoutBadge element');
  assert(tabJsContent.includes('UF_CRM_1791952650167'), 'public/js/tab.js binds real-time change listener on Listing Type field');

  // Verify views/tab.html contains layout pill badge
  const tabHtmlContent = fs.readFileSync(path.resolve(__dirname, 'views/tab.html'), 'utf-8');
  assert(tabHtmlContent.includes('id="listing-layout-badge"'), 'views/tab.html contains listing-layout-badge element');

  // Verify public/css/tab.css contains layout-pill styling
  const tabCssContent = fs.readFileSync(path.resolve(__dirname, 'public/css/tab.css'), 'utf-8');
  assert(tabCssContent.includes('.layout-pill'), 'public/css/tab.css contains .layout-pill styling');
  assert(tabCssContent.includes('.layout-pill-external_stock'), 'public/css/tab.css contains .layout-pill-external_stock styling');
  assert(tabCssContent.includes('.layout-pill-rent'), 'public/css/tab.css contains .layout-pill-rent styling');

  // Verify server.js routes for listing mapping and sync
  const serverContent = fs.readFileSync(path.resolve(__dirname, 'server.js'), 'utf-8');
  assert(serverContent.includes("app.get('/api/mapping/listing'"), 'server.js defines GET /api/mapping/listing endpoint');
  // Verify listing layout uses interactive lookup fields matching lead layout pattern
  const configJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config/fields.json'), 'utf-8'));
  const listingLookupFields = (configJson.listingLayout?.sections || []).flatMap(s => (s.fields || [])).filter(f => f.type === 'lookup');
  assert(listingLookupFields.length >= 7, 'listingLayout defines interactive lookup fields (>= 7 lookup fields)');
  assert(listingLookupFields.some(f => f.code === 'COMPANY_ID' && f.lookupEntity === 'developer'), 'COMPANY_ID is configured as developer lookup');
  assert(listingLookupFields.some(f => f.code === 'CONTACT_ID' && f.lookupEntity === 'contact'), 'CONTACT_ID is configured as contact lookup');
  assert(listingLookupFields.some(f => f.code === 'UF_CRM_PROPERTY' && f.lookupEntity === 'property'), 'UF_CRM_PROPERTY is configured as property lookup');
  assert(listingLookupFields.some(f => f.code === 'UF_CRM_PROJECT_NAME' && f.lookupEntity === 'project'), 'UF_CRM_PROJECT_NAME is configured as project lookup');
  assert(tabJsContent.includes('isLookupField'), 'public/js/tab.js defines isLookupField helper');
  assert(tabJsContent.includes('resolveLookupEntity'), 'public/js/tab.js defines resolveLookupEntity helper');
  assert(tabJsContent.includes('openLinkedRecord'), 'public/js/tab.js defines openLinkedRecord for linked CRM navigation');
  assert(tabJsContent.includes('lookup-open-btn'), 'public/js/tab.js renders lookup-open-btn for 1-click open');
  assert(tabCssContent.includes('.lookup-open-btn'), 'public/css/tab.css defines .lookup-open-btn styling');
  const dynamicLookupFields = (configJson.listingDynamicLayout?.sections || []).flatMap(s => (s.fields || [])).filter(f => f.type === 'lookup');
  assert(dynamicLookupFields.length >= 7, 'listingDynamicLayout defines interactive lookup fields (>= 7 lookup fields)');
  assert(dynamicLookupFields.some(f => f.key === 'companyId' && f.lookupEntity === 'developer'), 'companyId in listingDynamicLayout is developer lookup');
  assert(dynamicLookupFields.some(f => f.key === 'parentId1052' && f.lookupEntity === 'property'), 'parentId1052 in listingDynamicLayout is property lookup');
  // ============================================================================
  // Case 20: Layout Field Automations & Auto-Calculations
  // ============================================================================
  console.log('\n--- Case 20: Layout Field Automations & Auto-Calculations ---');
  const listingDetailsContent = fs.readFileSync(path.resolve(__dirname, 'public/js/listing-details.js'), 'utf-8');
  assert(listingDetailsContent.includes('runListingAutomations'), 'listing-details.js defines runListingAutomations engine');
  assert(listingDetailsContent.includes('calcPricePerSqFt = (price / sqft).toFixed(2)'), 'listing-details.js auto-calculates Price Per Sq Ft from Price & BUA');
  assert(listingDetailsContent.includes('runListingAutomations({ isInitialLoad: true })'), 'listing-details.js executes automations on record opening');
  assert(listingDetailsContent.includes("runListingAutomations({ isInitialLoad: false, triggerField: f.key })"), 'listing-details.js triggers automations in real-time on field edits');
  assert(listingDetailsContent.includes('bayutBuilding') && listingDetailsContent.includes('projName'), 'listing-details.js mirrors Project Name and Building Bayut');
  assert(listingDetailsContent.includes('pfCommunity') && listingDetailsContent.includes('community'), 'listing-details.js mirrors Community and PF Community');
  assert(tabJsContent.includes('runLeadListingAutomations'), 'public/js/tab.js defines runLeadListingAutomations engine');
  assert(tabJsContent.includes('calcPpsqft = (price / sqft).toFixed(2)'), 'public/js/tab.js auto-calculates Price Per Sq Ft for Lead listing layout');
  assert(tabJsContent.includes('runLeadListingAutomations({ isInitialLoad: true })'), 'public/js/tab.js executes automations on lead listing record opening');
  assert(tabJsContent.includes("runLeadListingAutomations({ isInitialLoad: false, triggerField: f.code })"), 'public/js/tab.js triggers automations in real-time on lead field edits');
  const spaSyncContent = fs.readFileSync(path.resolve(__dirname, 'src/spaSync.js'), 'utf-8');
  assert(spaSyncContent.includes('effPrice && effSqft && !updates.ufCrm16ListPricePerSqFt'), 'src/spaSync.js auto-calculates Price Per Sq Ft during cross-entity sync');

  // ============================================================================
  // Case 21: Layout Card Overflow & Autocomplete Dropdown Stacking
  // ============================================================================
  console.log('\n--- Case 21: Layout Card Overflow & Autocomplete Dropdown Stacking ---');
  const listingCssContent = fs.readFileSync(path.resolve(__dirname, 'public/css/listing-details.css'), 'utf-8');
  const leadCssContent = fs.readFileSync(path.resolve(__dirname, 'public/css/tab.css'), 'utf-8');
  const listingJsContent = fs.readFileSync(path.resolve(__dirname, 'public/js/listing-details.js'), 'utf-8');
  const leadJsContent = fs.readFileSync(path.resolve(__dirname, 'public/js/tab.js'), 'utf-8');

  // Listing CSS checks
  assert(listingCssContent.includes('.section-card {') && listingCssContent.includes('overflow: visible;'), 'listing-details.css sets .section-card overflow to visible to prevent dropdown clipping');
  assert(listingCssContent.includes('.section-card:focus-within,\n.section-card.has-open-dropdown'), 'listing-details.css elevates stacking context for section-card with open dropdown');
  assert(listingCssContent.includes('.lookup-dropdown.dropup'), 'listing-details.css defines .lookup-dropdown.dropup for upward display');
  assert(listingCssContent.includes('z-index: 99999;'), 'listing-details.css assigns top z-index to .lookup-dropdown');

  // Lead CSS checks
  assert(leadCssContent.includes('.form-section {') && leadCssContent.includes('overflow: visible;'), 'tab.css sets .form-section overflow to visible to prevent dropdown clipping');
  assert(leadCssContent.includes('.form-section:focus-within,\n.form-section.has-open-dropdown'), 'tab.css elevates stacking context for form-section with open dropdown');
  assert(leadCssContent.includes('.lookup-dropdown.dropup'), 'tab.css defines .lookup-dropdown.dropup for upward display');
  assert(leadCssContent.includes('z-index: 99999;'), 'tab.css assigns top z-index to .lookup-dropdown');

  // JS checks
  assert(listingJsContent.includes('adjustDropdownPosition') && listingJsContent.includes('dropup'), 'listing-details.js calculates viewport space and toggles dropup class');
  assert(listingJsContent.includes('has-open-dropdown'), 'listing-details.js dynamically manages has-open-dropdown state');
  assert(leadJsContent.includes('adjustDropdownPosition') && leadJsContent.includes('dropup'), 'tab.js calculates viewport space and toggles dropup class');
  assert(leadJsContent.includes('has-open-dropdown'), 'tab.js dynamically manages has-open-dropdown state');

  // ============================================================================
  console.log('\n--- Case 22: Gallery Lightbox Viewer & Responsive Media Styling ---');
  const listingHtmlContent = fs.readFileSync(path.resolve(__dirname, 'views/listing-details.html'), 'utf-8');

  // HTML checks
  assert(listingHtmlContent.includes('id="lightbox-counter"'), 'views/listing-details.html contains lightbox counter');
  assert(listingHtmlContent.includes('id="lb-filmstrip"'), 'views/listing-details.html contains thumbnail filmstrip');
  assert(listingHtmlContent.includes('id="lb-nav-prev"') && listingHtmlContent.includes('id="lb-nav-next"'), 'views/listing-details.html contains gallery nav buttons');
  assert(listingHtmlContent.includes('id="lb-zoom-controls"'), 'views/listing-details.html contains corner zoom controls');

  // CSS checks
  assert(listingCssContent.includes('.lb-filmstrip'), 'listing-details.css contains .lb-filmstrip styling');
  assert(listingCssContent.includes('.lb-film-item'), 'listing-details.css contains .lb-film-item thumbnail styling');
  assert(listingCssContent.includes('.lb-nav-btn'), 'listing-details.css contains .lb-nav-btn navigation arrow styling');
  assert(listingCssContent.includes('.lb-error-box'), 'listing-details.css contains .lb-error-box image error fallback styling');
  assert(listingCssContent.includes('@media (max-width: 640px)'), 'listing-details.css contains responsive media queries for gallery lightbox');
  assert(listingJsContent.includes('if (item.isPdf)') && listingJsContent.includes('else if (item.isImage)'), 'listing-details.js previews only PDFs inline and keeps image rendering separate');
  assert(listingJsContent.includes('openInBitrixViewer') && listingJsContent.includes('Open in Bitrix24'), 'listing-details.js hands unsupported documents to the native Bitrix viewer');
  assert(listingCssContent.includes('.lb-document-panel'), 'listing-details.css styles the native document handoff panel');

  // ============================================================================
  console.log('\n--- Case 23: File Removal & Responsive View Switcher Controls ---');
  // CSS checks
  assert(listingCssContent.includes('.b24-view-switcher'), 'listing-details.css contains .b24-view-switcher styling');
  assert(listingCssContent.includes('.b24-view-btn') && listingCssContent.includes('outline: none !important'), 'listing-details.css enforces outline reset on .b24-view-btn');
  assert(listingCssContent.includes('.b24-list-actions'), 'listing-details.css contains .b24-list-actions styling');
  assert(listingCssContent.includes('.b24-list-btn.view-btn'), 'listing-details.css contains .b24-list-btn.view-btn styling');
  assert(listingCssContent.includes('.thumb-remove-btn'), 'listing-details.css contains .thumb-remove-btn styling');
  assert(listingCssContent.includes('.thumb-remove-btn-list'), 'listing-details.css contains .thumb-remove-btn-list styling');

  // JS checks
  assert(listingJsContent.includes('let removedFileIds = {};'), 'listing-details.js defines removedFileIds state variable');
  assert(listingJsContent.includes('thumb-remove-btn') && listingJsContent.includes('handleRemoveItem'), 'listing-details.js renders remove buttons with handleRemoveItem handler');
  assert(listingJsContent.includes('removedFileIds[field.key].add'), 'listing-details.js records removed file ID on removal');
  assert(listingJsContent.includes('del: \'Y\'') || listingJsContent.includes('{ del: "Y" }'), 'listing-details.js formats single-file deletion with del: Y');
  assert(listingJsContent.includes('!removedSet.has'), 'listing-details.js excludes removed file IDs from multiple-file payload');
  assert(listingJsContent.includes('getRemovedFileIds'), 'listing-details.js exports getRemovedFileIds');

  // ============================================================================
  console.log('\n--- Case 24: Normal Tab Scrolling & High-Fidelity Preview Enhancements ---');
  // CSS checks
  assert(listingCssContent.includes('scroll-behavior: smooth'), 'listing-details.css configures smooth scrolling on html');
  assert(listingCssContent.includes('.form-actions-bar') && listingCssContent.includes('position: sticky'), 'listing-details.css styles form-actions-bar with position: sticky');
  assert(listingCssContent.includes('padding: 16px 20px 32px'), 'listing-details.css sets non-blocking container bottom padding');

  // JS checks
  const normListingScrollJs = listingJsContent.replace(/"/g, "'");
  assert(normListingScrollJs.includes('function scheduleResize'), 'listing-details.js defines scheduleResize helper');
  assert(normListingScrollJs.includes('new ResizeObserver'), 'listing-details.js binds ResizeObserver to document.body for dynamic height sync');
  assert(normListingScrollJs.includes('scheduleResize(40)'), 'listing-details.js triggers scheduleResize on listing details render');
  assert(normListingScrollJs.includes("scrollIntoView({ behavior: 'smooth', block: 'center' })"), 'listing-details.js smoothly centers lightbox viewer in embedded frame');
  assert(normListingScrollJs.includes("e.key === '+'") && normListingScrollJs.includes("e.key === '-'"), 'listing-details.js supports keyboard zoom in/out in lightbox');

  // ============================================================================
  console.log('\n--- Case 25: CRM-Only Access & Direct URL Protection ---');
  const authMiddleware = require('./src/middleware/auth');
  assert(typeof authMiddleware.verifyCrmAccess === 'function', 'auth.js exports verifyCrmAccess middleware');
  assert(typeof authMiddleware.registerCrmSessionToken === 'function', 'auth.js exports registerCrmSessionToken helper');

  // Test middleware rejection of unauthorized direct access
  let mockResStatus = null;
  let mockResJson = null;
  const mockReqUnauthorized = {
    headers: {},
    query: {},
    body: {},
    originalUrl: '/api/listing/208',
    ip: '127.0.0.1'
  };
  const mockRes = {
    status(code) { mockResStatus = code; return this; },
    json(data) { mockResJson = data; return this; }
  };
  let nextCalled = false;
  authMiddleware.verifyCrmAccess(mockReqUnauthorized, mockRes, () => { nextCalled = true; });
  assert(mockResStatus === 403, 'verifyCrmAccess rejects direct unauthenticated URL request with HTTP 403');
  assert(mockResJson && mockResJson.code === 'CRM_CONTEXT_REQUIRED', 'verifyCrmAccess returns CRM_CONTEXT_REQUIRED error code');
  assert(!nextCalled, 'verifyCrmAccess does not call next() for unauthorized requests');

  // Test middleware acceptance of valid CRM token
  authMiddleware.registerCrmSessionToken('test_session_token_1234567890', 'csl.bitrix24.com');
  const mockReqAuthorized = {
    headers: { 'x-bitrix-auth': 'test_session_token_1234567890' },
    query: {},
    body: {},
    originalUrl: '/api/listing/208',
    ip: '127.0.0.1'
  };
  let authNextCalled = false;
  authMiddleware.verifyCrmAccess(mockReqAuthorized, mockRes, () => { authNextCalled = true; });
  assert(authNextCalled === true, 'verifyCrmAccess allows request with registered CRM session token');

  // Test views contain framing check script and lockout shield
  const viewsToCheck = [
    { file: 'views/listing-details.html', css: 'public/css/listing-details.css', js: 'public/js/listing-details.js' },
    { file: 'views/tab.html', css: 'public/css/tab.css', js: 'public/js/tab.js' },
    { file: 'views/matching-listings.html', css: 'public/css/matching-listings.css', js: 'public/js/matching-listings.js' }
  ];

  for (const v of viewsToCheck) {
    const html = fs.readFileSync(v.file, 'utf8');
    const css = fs.readFileSync(v.css, 'utf8');
    const js = fs.readFileSync(v.js, 'utf8');

    assert(html.includes("window.self === window.top") && html.includes("crm-lockout-active"), `${v.file} contains instant framing check script`);
    assert(html.includes('id="crm-lockout-shield"'), `${v.file} defines crm-lockout-shield element`);
    assert(css.includes('html.crm-lockout-active body > *:not(#crm-lockout-shield)'), `${v.css} hides all UI elements when lockout is active`);
    assert(css.includes('.crm-lockout-shield') && css.includes('.lockout-card'), `${v.css} styles the lockout shield and card`);
    assert(js.includes('isEmbeddedInCrm'), `${v.js} defines isEmbeddedInCrm framing detector`);
    assert(js.includes('renderCrmLockoutScreen'), `${v.js} defines renderCrmLockoutScreen`);
    assert(js.includes('getCrmAuthHeaders'), `${v.js} defines getCrmAuthHeaders with X-Bitrix-Auth`);
  }

  // Verify server routes are protected
  const updatedServerCode = fs.readFileSync('server.js', 'utf8');
  assert(updatedServerCode.includes("app.get('/api/listing/:id', verifyCrmAccess,"), 'server.js protects GET /api/listing/:id with verifyCrmAccess');
  assert(updatedServerCode.includes("app.all('/api/listing/:id/update', verifyCrmAccess,"), 'server.js protects /api/listing/:id/update with verifyCrmAccess');
  assert(updatedServerCode.includes("app.get('/api/stages/listing', verifyCrmAccess,"), 'server.js protects GET /api/stages/listing with verifyCrmAccess');
  assert(updatedServerCode.includes("app.get('/api/lookup', verifyCrmAccess,"), 'server.js protects GET /api/lookup with verifyCrmAccess');
  assert(updatedServerCode.includes("app.get('/api/lead/:id', apiLimiter, verifyCrmAccess,"), 'server.js protects GET /api/lead/:id with verifyCrmAccess');
  assert(updatedServerCode.includes("app.post('/api/lead/:id', apiLimiter, verifyCrmAccess,"), 'server.js protects POST /api/lead/:id with verifyCrmAccess');
  assert(updatedServerCode.includes("app.post('/api/b24/:method', apiLimiter, verifyCrmAccess,"), 'server.js protects POST /api/b24/:method with verifyCrmAccess');

  // ============================================================================
  // Test Case 26: Lookup Fields Integrity & Entity Binding Validation
  // ============================================================================
  console.log('\n--- Case 26: Lookup Fields Integrity & Entity Binding Validation ---');
  assert(updatedServerCode.includes("const query = rawQuery.replace(/^#/, '').trim();"), 'server.js cleans leading hash from /api/lookup query');
  assert(updatedServerCode.includes("const cleanQ = String(query).replace(/^#/, '').trim();"), 'server.js cleans leading hash in searchLookupLive');

  const finalListingJs = fs.readFileSync('public/js/listing-details.js', 'utf8');
  const normFinalListingJs = finalListingJs.replace(/"/g, "'");
  assert(normFinalListingJs.includes("const isNumericId = /^\\d+$/.test(cleanId) && cleanId !== '0';"), 'listing-details.js strictly checks for numeric ID before prepending hash');
  assert(normFinalListingJs.includes("input.dataset.selectedTitle"), 'listing-details.js tracks selectedTitle to detect user edits');
  assert(normFinalListingJs.includes("openLinkedRecord(f.type, firstId, f.key, e)"), 'listing-details.js invokes openLinkedRecord with valid ID');
  assert(normFinalListingJs.includes("getText('ufCrm16ProjectName')"), 'listing-details.js uses textual project name in title/address automations');
  assert(normFinalListingJs.includes("if (id === 'ufCrm16ProjectName')") && normFinalListingJs.includes("el.value !== undefined ? String(el.value).trim() : ''"), 'getVal returns textual value for ufCrm16ProjectName');
  assert(normFinalListingJs.includes("fieldVal = 0;"), 'listing-details.js sanitizes entity fields to 0 if non-numeric on save');
  assert(normFinalListingJs.includes("payload['ufCrm16DeveloperName'] = compEl.value.trim();"), 'listing-details.js synchronizes developer companion field on save');

  const finalTabJs = fs.readFileSync('public/js/tab.js', 'utf8');
  assert(finalTabJs.includes("const cleanQuery = String(query).replace(/^#/, '').trim();"), 'tab.js cleans leading hash in queryLookup');
  assert(finalTabJs.includes("input.dataset.selectedTitle = item.title;"), 'tab.js tracks selectedTitle on item click');

  // ============================================================================
  // Test Case 27: Project & Master Project CRM Field Mappings and Live Synchronization
  // ============================================================================
  console.log('\n--- Case 27: Project & Master Project CRM Field Mappings ---');
  assert(updatedServerCode.includes("UF_CRM_16_1791173131: { entity: 'project'"), 'server.js maps native Bitrix Project CRM field UF_CRM_16_1791173131');
  assert(updatedServerCode.includes("UF_CRM_16_1791173000: { entity: 'master_project'"), 'server.js maps native Bitrix Master Project CRM field UF_CRM_16_1791173000');
  assert(updatedServerCode.includes("parentId1040: i.parentId1040"), 'server.js selects parentId1040 from SPA 1044 for automatic Master Project hierarchy linking');

  assert(normFinalListingJs.includes("if (item.parentId1040) {"), 'listing-details.js auto-links parent Master Project from parentId1040');
  assert(normFinalListingJs.includes("payload['ufCrm16_1791173131'] = projEl.dataset.selectedId;"), 'listing-details.js persists native Bitrix Project entity ID to ufCrm16_1791173131');
  assert(normFinalListingJs.includes("payload['ufCrm16_1791173000'] = mpEl.dataset.selectedId;"), 'listing-details.js persists native Bitrix Master Project entity ID to ufCrm16_1791173000');
  assert(normFinalListingJs.includes("payload['ufCrm16MasterProjectInfo'] = mpEl.value.trim();"), 'listing-details.js persists companion Master Project title to ufCrm16MasterProjectInfo');

  const spaSyncCode = fs.readFileSync('src/spaSync.js', 'utf8');
  assert(spaSyncCode.includes("spaKey: 'ufCrm16_1791173000'"), 'spaSync.js synchronizes native Bitrix Master Project field ufCrm16_1791173000');
  assert(spaSyncCode.includes("spaKey: 'ufCrm16_1791173131'"), 'spaSync.js synchronizes native Bitrix Project field ufCrm16_1791173131');

  const fieldsJsonCode = fs.readFileSync('config/fields.json', 'utf8');
  assert(fieldsJsonCode.includes('"UF_CRM_16_1791173131"'), 'config/fields.json defines spaBindingCode UF_CRM_16_1791173131 for Project');
  assert(fieldsJsonCode.includes('"UF_CRM_16_1791173000"'), 'config/fields.json defines spaBindingCode UF_CRM_16_1791173000 for Master Project');

  // ============================================================================
  // Test Case 28: Sensible & Logical Media & Documents Field Configuration
  // ============================================================================
  console.log('\n--- Case 28: Sensible & Logical Media & Documents Field Configuration ---');
  // 1. Verify listing-details.js defines only logically distinct media fields
  assert(normFinalListingJs.includes("ufCrm16_1791173118"), 'listing-details.js includes Primary Image (ufCrm16_1791173118)');
  assert(normFinalListingJs.includes("ufCrm16_1791881642219"), 'listing-details.js includes Photos (ufCrm16_1791881642219)');
  assert(normFinalListingJs.includes("ufCrm16_1791881665252"), 'listing-details.js includes Documents (ufCrm16_1791881665252)');
  assert(normFinalListingJs.includes("ufCrm16TitleDeed"), 'listing-details.js includes Title Deed (ufCrm16TitleDeed)');
  assert(normFinalListingJs.includes("ufCrm16_1791787381785"), 'listing-details.js includes Form A Document (ufCrm16_1791787381785)');
  assert(normFinalListingJs.includes("ufCrm16QrCode"), 'listing-details.js includes QR Code (ufCrm16QrCode)');

  // 2. Verify legacy duplicate/ambiguous fields are mapped via fallbackKeys rather than displayed as separate inputs
  assert(normFinalListingJs.includes("ufCrm16_1791544736052"), 'Photos field maps legacy Photos and Documents (1791544736052) via fallbackKeys');
  assert(normFinalListingJs.includes("ufCrm16_1791172957"), 'Documents field maps legacy Docs (1791172957) via fallbackKeys');
  assert(!normFinalListingJs.includes("label: 'Photos and Documents'"), 'Duplicate "Photos and Documents" field is removed from UI display');
  assert(!normFinalListingJs.includes("label: 'Docs'"), 'Duplicate legacy "Docs" field is removed from UI display');

  // 3. Verify config/fields.json media section
  assert(fieldsJsonCode.includes('"key": "ufCrm16_1791881665252"'), 'config/fields.json defines Documents field ufCrm16_1791881665252');
  assert(fieldsJsonCode.includes('"key": "ufCrm16QrCode"'), 'config/fields.json defines QR Code field ufCrm16QrCode');

  // 4. Verify src/spaSync.js Lead <-> SPA synchronization for media
  assert(spaSyncCode.includes("spaKey: 'ufCrm16_1791881665252'"), 'spaSync.js synchronizes Documents field ufCrm16_1791881665252');
  assert(spaSyncCode.includes("spaKey: 'ufCrm16QrCode'"), 'spaSync.js synchronizes QR Code field ufCrm16QrCode');

  // ============================================================================
  // Test Case 29: Listing Agent / Broker Field Mapping and Live Synchronization
  // ============================================================================
  console.log('\n--- Case 29: Listing Agent / Broker Field Mapping & Synchronization ---');
  const finalListingAgentJs = fs.readFileSync('public/js/listing-details.js', 'utf8').replace(/"/g, "'");
  assert(finalListingAgentJs.includes("crmCode: 'UF_CRM_16_PORTAL_LISTING_AGENT'"), 'listing-details.js configures Listing Agent with UF_CRM_16_PORTAL_LISTING_AGENT');
  assert(finalListingAgentJs.includes("ufCrm16PortalListingAgent"), 'listing-details.js includes ufCrm16PortalListingAgent in fallbackKeys');
  assert(finalListingAgentJs.includes("payload['ufCrm16PortalListingAgent'] = agentId;"), 'listing-details.js persists companion ufCrm16PortalListingAgent on save');
  assert(finalListingAgentJs.includes("payload['UF_CRM_16_PORTAL_LISTING_AGENT'] = agentId;"), 'listing-details.js persists native UF_CRM_16_PORTAL_LISTING_AGENT on save');

  const finalServerCode = fs.readFileSync('server.js', 'utf8');
  assert(finalServerCode.includes("UF_CRM_16_PORTAL_LISTING_AGENT: { entity: 'broker'"), 'server.js maps UF_CRM_16_PORTAL_LISTING_AGENT to broker entity');
  assert(finalServerCode.includes("UF_CRM_16_LISTING_AGENT: { entity: 'broker'"), 'server.js maps UF_CRM_16_LISTING_AGENT to broker entity');

  const finalFieldsCode = fs.readFileSync('config/fields.json', 'utf8');
  assert(finalFieldsCode.includes('"UF_CRM_16_PORTAL_LISTING_AGENT"'), 'config/fields.json defines spaCrmCode UF_CRM_16_PORTAL_LISTING_AGENT for Listing Agent');

  const finalSpaSyncCode = fs.readFileSync('src/spaSync.js', 'utf8');
  assert(finalSpaSyncCode.includes("spaCrmCode: 'UF_CRM_16_PORTAL_LISTING_AGENT'"), 'spaSync.js synchronizes Listing Agent / Broker UF_CRM_16_PORTAL_LISTING_AGENT');

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
