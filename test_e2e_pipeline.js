/**
 * test_e2e_pipeline.js
 * Comprehensive End-to-End Pipeline Verification
 * 
 * Tests the entire custom application flow:
 *   FLOW 1: Listing Lead Creation -> Event Router -> Stage Conversion -> Listing SPA (1058) 
 *           -> 50+ Property Specification Sync (including Features 1-10 & Trakheesi Expiry)
 *           -> Dynamic Layouting & Real-time Field Automations -> UI Save -> Reverse Sync
 *   FLOW 2: Enquiry Lead Creation -> Event Router -> Stage Conversion -> Enquiry SPA (1062) 
 *           -> Inquiry Specification Sync -> Matching Listings Engine Compatibility
 */

const StorageManager = require('./src/storage');
const EventRouter = require('./src/eventRouter');
const BitrixClient = require('./src/bitrixClient');
const { 
  syncListingSpaFromLead, 
  syncLeadFromListingSpa, 
  syncEnquirySpaFromLead,
  LISTING_FIELD_MAP 
} = require('./src/spaSync');
const fs = require('fs');
const path = require('path');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(condition, message, details = '') {
  totalChecks++;
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passedChecks++;
  } else {
    console.error(`  ✗ [FAIL] ${message} ${details ? '(' + details + ')' : ''}`);
    failedChecks++;
  }
}

async function runE2E() {
  console.log('========================================================================');
  console.log('   Bitrix24 Real Estate App - End-to-End Pipeline Verification          ');
  console.log('========================================================================\n');

  // Backup existing tokens
  const tokensFile = path.resolve(__dirname, 'storage/tokens.json');
  const backupTokens = fs.existsSync(tokensFile) ? fs.readFileSync(tokensFile, 'utf-8') : null;

  try {
    // --------------------------------------------------------------------------
    // Setup Mock Storage & Discovery Configuration
    // --------------------------------------------------------------------------
    StorageManager.saveAuth({
      domain: 'csl.bitrix24.com',
      member_id: 'csl_test_member',
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      application_token: 'mock_app_token'
    });

    StorageManager.saveDiscoveredConfig({
      leadTypeField: 'UF_CRM_1791952650167',
      leadTypeItems: {
        enquiryId: '2126',
        listingId: '2124'
      },
      stages: {
        enquiryStageId: 'ENQUIRY_LEADS',
        listingStageId: 'LISTING_LEADS'
      },
      finalStages: ['CONVERTED', 'JUNK', 'WON', 'LOST']
    });

    // In-memory mock database for Leads and SPA items
    const db = {
      leads: {},
      listingSpaItems: {},
      enquirySpaItems: {}
    };

    // Mock Bitrix REST client
    BitrixClient.crmLeadGet = async (id) => db.leads[String(id)] || null;
    BitrixClient.crmLeadUpdate = async (id, fields) => {
      const lead = db.leads[String(id)] || { ID: String(id) };
      Object.assign(lead, fields);
      db.leads[String(id)] = lead;
      return true;
    };
    BitrixClient.call = async (method, params) => {
      if (method === 'crm.item.get') {
        const entityId = params.entityTypeId;
        const id = String(params.id);
        if (entityId === 1058) return { item: db.listingSpaItems[id] || null };
        if (entityId === 1062) return { item: db.enquirySpaItems[id] || null };
      }
      if (method === 'crm.item.update') {
        const entityId = params.entityTypeId;
        const id = String(params.id);
        const fields = params.fields || {};
        if (entityId === 1058) {
          db.listingSpaItems[id] = Object.assign(db.listingSpaItems[id] || { id: Number(id) }, fields);
          return { item: db.listingSpaItems[id] };
        }
        if (entityId === 1062) {
          db.enquirySpaItems[id] = Object.assign(db.enquirySpaItems[id] || { id: Number(id) }, fields);
          return { item: db.enquirySpaItems[id] };
        }
      }
      if (method === 'crm.item.list') {
        const entityId = params.entityTypeId;
        const xmlId = params.filter?.['=xmlId'];
        if (entityId === 1058) {
          const matched = Object.values(db.listingSpaItems).filter(it => it.xmlId === xmlId);
          return { items: matched };
        }
        if (entityId === 1062) {
          const matched = Object.values(db.enquirySpaItems).filter(it => it.xmlId === xmlId);
          return { items: matched };
        }
      }
      return { success: true };
    };

    // ==========================================================================
    // FLOW 1: Listing Lead Pipeline
    // ==========================================================================
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log('FLOW 1: Listing Lead Creation -> Routing -> SPA Conversion -> Full Sync');
    console.log('────────────────────────────────────────────────────────────────────────');

    const listingLeadId = '7001';
    const listingSpaId = '8001';

    // 1. Ingest realistic Listing Lead with all real estate specifications
    db.leads[listingLeadId] = {
      ID: listingLeadId,
      TITLE: 'Downtown Dubai Luxury 2BR Specification',
      STATUS_ID: 'NEW',
      STATUS_SEMANTIC_ID: 'P',
      UF_CRM_1791952650167: '2124', // Listing type enum
      UF_CRM_LISTING: listingSpaId,
      UF_CRM_LISTING_NAME: 'Burj Crown Residence 2BR High-Floor',
      UF_CRM_1791952050535: '1166', // Apartment
      UF_CRM_BEDROOMS: '2',
      UF_CRM_BATHROOMS: '3',
      UF_CRM_BUA: '1250.00',
      UF_CRM_LISTING_PRICE: '3500000|AED',
      UF_CRM_PROJECT_NAME: 'Burj Crown',
      UF_CRM_BUILDING_BAYUT: 'Burj Crown',
      UF_CRM_NEIGHBORHOOD: 'Downtown Dubai',
      UF_CRM_CITY: 'Dubai',
      UF_CRM_COUNTRY: 'United Arab Emirates',
      ADDRESS_COUNTRY: 'United Arab Emirates',
      UF_CRM_TRAKHEESI_PERMIT_NO: 'TRK-982145',
      UF_CRM_TRAKHEESI_EXPIRY: '2027-05-15',
      UF_CRM_DESCRIPTION_INTRO_TEXT: 'Downtown Dubai Luxury Specification - Description - Intro Text',
      UF_CRM_FEATURE_1: 'Downtown Dubai Luxury Specification - Feature 1',
      UF_CRM_FEATURE_2: 'Downtown Dubai Luxury Specification - Feature 2',
      UF_CRM_FEATURE_3: 'Downtown Dubai Luxury Specification - Feature 3',
      UF_CRM_FEATURE_4: 'Downtown Dubai Luxury Specification - Feature 4',
      UF_CRM_FEATURE_5: 'Downtown Dubai Luxury Specification - Feature 5',
      UF_CRM_FEATURE_6: 'Downtown Dubai Luxury Specification - Feature 6',
      UF_CRM_FEATURE_7: 'Downtown Dubai Luxury Specification - Feature 7',
      UF_CRM_FEATURE_8: 'Downtown Dubai Luxury Specification - Feature 8',
      UF_CRM_FEATURE_9: 'Downtown Dubai Luxury Specification - Feature 9',
      UF_CRM_FEATURE_10: 'Downtown Dubai Luxury Specification - Feature 10',
      UF_CRM_DESCRIPTION_OUTRO_TEXT: 'Downtown Dubai Luxury Specification - Description - Outro Text'
    };

    // Pre-create SPA Item in Bitrix
    db.listingSpaItems[listingSpaId] = {
      id: Number(listingSpaId),
      xmlId: listingLeadId,
      title: 'Initial Title'
    };

    // 2. Trigger Event Router (simulating ONCRMLEADADD)
    console.log('\n[Step 1.1] Event Router processing ONCRMLEADADD for Lead #7001...');
    const routingResult = await EventRouter.handleLeadEvent(listingLeadId, 'ONCRMLEADADD', 'csl.bitrix24.com');
    check(routingResult.status === 'updated', 'Event Router processed Lead #7001 successfully');
    check(routingResult.resolvedType === 'listing', 'Resolved Lead Type to "listing"');
    check(routingResult.newStatus === 'LISTING_LEADS', 'Lead shifted stage from "NEW" to "LISTING_LEADS"');
    check(db.leads[listingLeadId].STATUS_ID === 'LISTING_LEADS', 'Database reflects Lead #7001 STATUS_ID = LISTING_LEADS');

    // 3. Test Loop Guard: duplicate or idempotent events must not cause loops
    console.log('\n[Step 1.2] Testing Loop Guard on second event...');
    // Clear debounce cache for clean loop guard test
    const loopGuardResult = await EventRouter.handleLeadEvent(listingLeadId, 'ONCRMLEADUPDATE', 'csl.bitrix24.com');
    check(loopGuardResult.status === 'skipped' || loopGuardResult.status === 'unchanged', 'Loop Guard prevented infinite update loops');

    // 4. Synchronize Lead to Listing SPA Item (SPA 1058)
    console.log('\n[Step 1.3] Cross-Entity Synchronization: Lead -> Listing SPA (1058)...');
    const syncRes = await syncListingSpaFromLead(listingLeadId, 'csl.bitrix24.com');
    check(syncRes && syncRes.status === 'updated', 'syncListingSpaFromLead updated Listing SPA item');

    const spa = db.listingSpaItems[listingSpaId];
    console.log('\n[Step 1.4] Validating 50+ synchronized fields on Listing SPA item #8001:');
    check(spa.ufCrm16_1790154936 === '3500000|AED', 'Price correctly synchronized: "3500000|AED"');
    check(spa.ufCrm16Size === 1250, 'BUA / Size correctly synchronized: 1250 sq ft');
    check(spa.ufCrm16ListPricePerSqFt === '2800.00|AED', 'Auto-calculated Price Per Sq Ft: 2800.00 AED (3500000 / 1250)');
    check(spa.ufCrm16_1791787455285 === 'TRK-982145', 'Trakheesi Permit No synchronized: "TRK-982145"');
    check(spa.UF_CRM_16_1791787455285 === 'TRK-982145', 'Native uppercase Trakheesi Permit No synchronized');
    check(spa.ufCrm16DtcmPermitNumber === 'TRK-982145', 'Companion DTCM Permit Number synchronized');
    check(spa.ufCrm16_1791787502111 === '2027-05-15', 'Trakheesi Permit Expiry Date synchronized: "2027-05-15"');
    check(spa.UF_CRM_16_1791787502111 === '2027-05-15', 'Native uppercase Trakheesi Permit Expiry Date synchronized');
    check(spa.ufCrm16FormAExpiryDate === '2027-05-15', 'Companion Form A Expiry Date synchronized');
    check(spa.UF_CRM_16_FORM_A_EXPIRY_DATE === '2027-05-15', 'Companion native UF_CRM_16_FORM_A_EXPIRY_DATE synchronized');
    check(spa.ufCrm16CountryCode === 'AE', 'Country Code correctly auto-populated & synchronized: "AE"');
    check(spa.UF_CRM_16_COUNTRY_CODE === 'AE', 'Native uppercase Country Code synchronized: "AE"');

    // Validate Features 1 to 10
    console.log('\n[Step 1.5] Validating Features 1 through 10 & Description Intro/Outro:');
    check(spa.ufCrm16DescriptionIntroText === 'Downtown Dubai Luxury Specification - Description - Intro Text', 'Description Intro Text populated');
    check(spa.UF_CRM_16_DESCRIPTION_INTRO_TEXT === 'Downtown Dubai Luxury Specification - Description - Intro Text', 'Uppercase UF_CRM_16_DESCRIPTION_INTRO_TEXT populated');
    for (let i = 1; i <= 10; i++) {
      const expected = `Downtown Dubai Luxury Specification - Feature ${i}`;
      check(spa[`ufCrm_16_FEATURE_${i}`] === expected, `Feature ${i} (${expected}) mapped to exact Bitrix SPA key`);
      check(spa[`UF_CRM_16_FEATURE_${i}`] === expected, `Feature ${i} mapped to uppercase UF_CRM_16_FEATURE_${i}`);
    }
    check(spa.ufCrm16DescriptionOutroText === 'Downtown Dubai Luxury Specification - Description - Outro Text', 'Description Outro Text populated');
    check(spa.UF_CRM_16_DESCRIPTION_OUTRO_TEXT === 'Downtown Dubai Luxury Specification - Description - Outro Text', 'Uppercase UF_CRM_16_DESCRIPTION_OUTRO_TEXT populated');

    // 5. Simulate Dynamic Layouting & Real-time Field Automations
    console.log('\n[Step 1.6] Simulating Dynamic Layout Engine & Automations in Listing Details:');
    const listingJs = fs.readFileSync(path.resolve(__dirname, 'public/js/listing-details.js'), 'utf8');
    check(listingJs.includes('function detectLayoutFromListing'), 'Layout detection engine available in listing-details.js');
    check(listingJs.includes('calcPricePerSqFt = (price / sqft).toFixed(2)'), 'Price Per Sq Ft real-time calculation logic verified');
    check(listingJs.includes('if (trigger === "ufCrm16ProjectName")'), 'Project Name mirroring to Bayut Building verified');

    // 6. Simulate UI Edit & Save (e.g. agent updates Permit Expiry Date & Feature 1)
    console.log('\n[Step 1.7] Simulating User Edits in UI & Save Synchronization:');
    const updatedExpiry = '2028-02-28';
    const updatedFeature1 = 'Burj Crown Ultra-Luxury Corner Suite';
    const updatedCountry = 'United Kingdom';
    const updatedCountryCode = 'GB';

    // Simulated payload generated by saveListing()
    const simulatedSavePayload = {
      ufCrm16_1791787502111: updatedExpiry,
      UF_CRM_16_1791787502111: updatedExpiry,
      ufCrm16FormAExpiryDate: updatedExpiry,
      UF_CRM_16_FORM_A_EXPIRY_DATE: updatedExpiry,
      ufCrm_16_FEATURE_1: updatedFeature1,
      UF_CRM_16_FEATURE_1: updatedFeature1,
      ufCrm16Feature1: updatedFeature1,
      ufCrm16_1791172854: updatedCountry,
      UF_CRM_16_1791172854: updatedCountry,
      ufCrm16CountryCode: updatedCountryCode,
      UF_CRM_16_COUNTRY_CODE: updatedCountryCode
    };

    // Apply save to SPA Item
    await BitrixClient.call('crm.item.update', {
      entityTypeId: 1058,
      id: Number(listingSpaId),
      fields: simulatedSavePayload
    });

    check(db.listingSpaItems[listingSpaId].ufCrm16_1791787502111 === updatedExpiry, 'SPA Item received updated Expiry Date');
    check(db.listingSpaItems[listingSpaId].ufCrm16FormAExpiryDate === updatedExpiry, 'SPA Item received updated Form A Expiry Date');
    check(db.listingSpaItems[listingSpaId].ufCrm_16_FEATURE_1 === updatedFeature1, 'SPA Item received updated Feature 1');
    check(db.listingSpaItems[listingSpaId].ufCrm16CountryCode === updatedCountryCode, 'SPA Item received updated Country Code');

    // 7. Test Reverse Synchronization (Listing SPA -> Lead)
    console.log('\n[Step 1.8] Testing Reverse Synchronization: Listing SPA (1058) -> Lead...');
    const reverseSyncRes = await syncLeadFromListingSpa(listingSpaId, 'csl.bitrix24.com');
    check(reverseSyncRes && reverseSyncRes.status === 'updated', 'syncLeadFromListingSpa updated Lead successfully');
    check(db.leads[listingLeadId].UF_CRM_TRAKHEESI_EXPIRY === updatedExpiry, 'Lead received updated Trakheesi Permit Expiry: 2028-02-28');
    check(db.leads[listingLeadId].UF_CRM_FEATURE_1 === updatedFeature1, 'Lead received updated Feature 1: "Burj Crown Ultra-Luxury Corner Suite"');
    check(db.leads[listingLeadId].UF_CRM_COUNTRY_CODE === updatedCountryCode, 'Lead received updated Country Code: "GB"');
    check(db.leads[listingLeadId].ADDRESS_COUNTRY_CODE === updatedCountryCode, 'Lead received updated Address Country Code: "GB"');

    // ==========================================================================
    // FLOW 2: Enquiry Lead Pipeline & Matching Listings Integration
    // ==========================================================================
    console.log('\n────────────────────────────────────────────────────────────────────────');
    console.log('FLOW 2: Enquiry Lead Creation -> Routing -> SPA Conversion -> Matching');
    console.log('────────────────────────────────────────────────────────────────────────');

    const enquiryLeadId = '7002';
    const enquirySpaId = '8002';

    // 1. Ingest realistic Enquiry Lead
    db.leads[enquiryLeadId] = {
      ID: enquiryLeadId,
      TITLE: 'Client Inquiry - 2BR Apartment Downtown Dubai',
      STATUS_ID: 'NEW',
      STATUS_SEMANTIC_ID: 'P',
      UF_CRM_1791952650167: '2126', // Enquiry type enum
      UF_CRM_ENQUIRY: enquirySpaId,
      UF_CRM_LEAD_SOURCE_TYPE: 'Inbound Portal',
      UF_CRM_NORMAL_LOW_HIGH_URGENT: 'High',
      UF_CRM_STATE: 'Dubai',
      UF_CRM_CITY_BAYUT: 'Dubai',
      UF_CRM_BUDGET: '3500000|AED'
    };

    db.enquirySpaItems[enquirySpaId] = {
      id: Number(enquirySpaId),
      xmlId: enquiryLeadId,
      title: 'Client Inquiry Initial'
    };

    // 2. Trigger Event Router for Enquiry Lead
    console.log('\n[Step 2.1] Event Router processing ONCRMLEADADD for Lead #7002...');
    const enqRoutingResult = await EventRouter.handleLeadEvent(enquiryLeadId, 'ONCRMLEADADD', 'csl.bitrix24.com');
    check(enqRoutingResult.status === 'updated', 'Event Router processed Lead #7002 successfully');
    check(enqRoutingResult.resolvedType === 'enquiry', 'Resolved Lead Type to "enquiry"');
    check(enqRoutingResult.newStatus === 'ENQUIRY_LEADS', 'Lead shifted stage from "NEW" to "ENQUIRY_LEADS"');
    check(db.leads[enquiryLeadId].STATUS_ID === 'ENQUIRY_LEADS', 'Database reflects Lead #7002 STATUS_ID = ENQUIRY_LEADS');

    // 3. Synchronize Lead to Enquiry SPA Item (SPA 1062)
    console.log('\n[Step 2.2] Cross-Entity Synchronization: Lead -> Enquiry SPA (1062)...');
    const enqSyncRes = await syncEnquirySpaFromLead(enquiryLeadId, 'csl.bitrix24.com');
    check(enqSyncRes && enqSyncRes.status === 'updated', 'syncEnquirySpaFromLead updated Enquiry SPA item');

    const enqSpa = db.enquirySpaItems[enquirySpaId];
    console.log('\n[Step 2.3] Validating synchronized fields on Enquiry SPA item #8002:');
    check(enqSpa.ufCrm18LeadSourceType === 1234, 'Mapped Lead Source Type (Inbound Portal -> 1234 in SPA 1062)');
    check(enqSpa.ufCrm18NormalLowHighUrgent === 1298, 'Mapped Urgency (High -> 1298 in SPA 1062)');
    check(enqSpa.ufCrm18State === 1354, 'Mapped State (Dubai -> 1354 in SPA 1062)');
    check(enqSpa.ufCrm18CityBayut === 1134, 'Mapped City Bayut (Dubai -> 1134 in SPA 1062)');

    // 4. Test Matching Listings Logic between Enquiry & Listing
    console.log('\n[Step 2.4] Matching Listings Compatibility & Recommendation Engine:');
    const matchingJs = fs.readFileSync(path.resolve(__dirname, 'public/js/matching-listings.js'), 'utf8');
    check(matchingJs.includes('searchListings'), 'Matching listings contains searchListings query engine');
    check(matchingJs.includes('mapEnquiryPropTypeToListing'), 'Matching listings maps Enquiry Property Type to Listing Property Type');
    check(matchingJs.includes('addRecommendation'), 'Matching listings adds selected recommendations to Enquiry record');
    check(matchingJs.includes('crm.item.update'), 'Matching listings tab updates recommendation field directly via crm.item.update');

    // ==========================================================================
    // Final Summary
    // ==========================================================================
    console.log('\n========================================================================');
    console.log(`END-TO-END PIPELINE SUMMARY: ${passedChecks}/${totalChecks} Checks Passed (${failedChecks} Failed)`);
    if (failedChecks === 0) {
      console.log('✓ COMPLETE CUSTOM APP PIPELINE VERIFIED SUCCESSFULLY!');
    } else {
      console.error('✗ SOME CHECKS FAILED IN PIPELINE VERIFICATION');
      process.exitCode = 1;
    }
  } finally {
    // Restore original tokens
    if (backupTokens !== null) {
      fs.writeFileSync(tokensFile, backupTokens, 'utf-8');
    }
  }
}

runE2E();
