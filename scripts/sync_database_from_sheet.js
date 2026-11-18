/**
 * scripts/sync_database_from_sheet.js
 * Synchronizes the Bitrix24 database to match the user's provided sheet:
 * - Deletes old obsolete records from CRM (e.g. bad test listings #204, test enquiries #252, #256)
 * - Updates existing matching records in-place with clean titles, correct portal enums, prices, and stages
 * - Creates new records for any sheet entries not yet in CRM
 * - Keeps Deals completely untouched ("except deal")
 */

const fs = require('fs');
const path = require('path');
const BitrixClient = require('../src/bitrixClient');

// CSV Parser Helper handling quoted commas
function parseCSVLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

async function runSync() {
  console.log('=== STARTING BITRIX24 DATABASE RESET & SHEET SYNC ===\n');

  const csvPath = path.resolve(__dirname, '../audit/user_provided_sheet.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');

  // Extract Section ranges
  let secListings = [];
  let secEnquiries = [];
  let currentSec = null;

  for (const line of lines) {
    if (line.startsWith('ID,Listing Title')) {
      currentSec = 'listings';
      continue;
    } else if (line.startsWith('ID,Enquiry Title')) {
      currentSec = 'enquiries';
      continue;
    } else if (line.startsWith('ID,Property Title') || line.startsWith('ID,Project Name') || line.startsWith('Field,Code,Meaning')) {
      currentSec = null;
      continue;
    }

    if (currentSec === 'listings') {
      secListings.push(parseCSVLine(line));
    } else if (currentSec === 'enquiries') {
      secEnquiries.push(parseCSVLine(line));
    }
  }

  console.log(`Parsed ${secListings.length} Listings and ${secEnquiries.length} Enquiries from user sheet.\n`);

  // =========================================================================
  // 1. SYNC LISTINGS (SPA 1058)
  // =========================================================================
  console.log('--- 1. Synchronizing Listings (SPA 1058) ---');
  const liveListingsRes = await BitrixClient.call('crm.item.list', {
    entityTypeId: 1058,
    select: ['id', 'title']
  });
  const liveListings = liveListingsRes.items || liveListingsRes || [];
  const liveListingIds = liveListings.map(l => l.id);
  const sheetListingIds = secListings.map(r => parseInt(r[0], 10));

  // A. Delete Listings in CRM that are NOT in user sheet
  const listingsToDelete = liveListingIds.filter(id => !sheetListingIds.includes(id));
  console.log(`Listings to delete (${listingsToDelete.length}):`, listingsToDelete);
  for (const id of listingsToDelete) {
    try {
      await BitrixClient.call('crm.item.delete', { entityTypeId: 1058, id });
      console.log(`  ✓ Deleted obsolete Listing #${id}`);
    } catch (e) {
      console.error(`  ✗ Error deleting Listing #${id}:`, e.message);
    }
  }

  // B. Update / Create Listings according to Sheet
  console.log(`\nUpdating / creating ${secListings.length} Listings from sheet...`);
  for (const row of secListings) {
    const id = parseInt(row[0], 10);
    const rawTitle = row[1];
    const userLtEnum = row[2]; // 158 = Sale (assumed), 160 = Rent (assumed)
    const userRecordType = row[3];
    const propType = parseInt(row[4], 10);
    const beds = parseFloat(row[5]) || 0;
    const listingPrice = row[6];
    const priceField = row[7] || listingPrice;
    const monthlyRent = row[8] || '';
    const yearlyRental = row[9] || '';
    const area = row[10];
    const pfCommunity = row[11];
    const furnished = parseInt(row[12], 10);
    const stageId = row[13];

    // Map verified portal enums:
    // Portal: 158 = RENT, 160 = Overseas Sale / Sale, 162 = Off-plan
    const isRent = (userLtEnum === '160') || (yearlyRental && yearlyRental !== '') || (monthlyRent && monthlyRent !== '');
    const portalLtEnum = isRent ? 158 : 160;
    const portalRecordType = isRent ? 1078 : 1076;

    const fields = {
      title: rawTitle,
      ufCrm16_1790154808: portalLtEnum,
      ufCrm16RecordType: portalRecordType,
      ufCrm16PropertyType: propType,
      ufCrm16_1791172802: beds,
      ufCrm16_1790154936: listingPrice,
      ufCrm16Price: priceField,
      ufCrm16MonthlyRent: monthlyRent,
      ufCrm16YearlyRental: yearlyRental,
      ufCrm16_1791172692: area,
      ufCrm16CommunityPropertyfinder: pfCommunity,
      ufCrm16Furnished: furnished,
      stageId: stageId
    };

    if (liveListingIds.includes(id)) {
      // Update existing
      try {
        await BitrixClient.call('crm.item.update', { entityTypeId: 1058, id, fields });
        console.log(`  ✓ Updated Listing #${id}: "${rawTitle}"`);
      } catch (e) {
        console.error(`  ✗ Error updating Listing #${id}:`, e.message);
      }
    } else {
      // Create new
      try {
        const addRes = await BitrixClient.call('crm.item.add', { entityTypeId: 1058, fields });
        const newId = addRes?.item?.id || addRes;
        console.log(`  ✓ Created new Listing (assigned ID #${newId}): "${rawTitle}"`);
      } catch (e) {
        console.error(`  ✗ Error creating Listing for "${rawTitle}":`, e.message);
      }
    }
  }

  // =========================================================================
  // 2. SYNC ENQUIRIES (SPA 1062)
  // =========================================================================
  console.log('\n--- 2. Synchronizing Enquiries (SPA 1062) ---');
  const liveEnquiriesRes = await BitrixClient.call('crm.item.list', {
    entityTypeId: 1062,
    select: ['id', 'title']
  });
  const liveEnquiries = liveEnquiriesRes.items || liveEnquiriesRes || [];
  const liveEnquiryIds = liveEnquiries.map(e => e.id);
  const sheetEnquiryIds = secEnquiries.map(r => parseInt(r[0], 10));

  // A. Delete Enquiries in CRM that are NOT in user sheet (like test #252, #256)
  const enquiriesToDelete = liveEnquiryIds.filter(id => !sheetEnquiryIds.includes(id));
  console.log(`Enquiries to delete (${enquiriesToDelete.length}):`, enquiriesToDelete);
  for (const id of enquiriesToDelete) {
    try {
      await BitrixClient.call('crm.item.delete', { entityTypeId: 1062, id });
      console.log(`  ✓ Deleted obsolete Enquiry #${id}`);
    } catch (e) {
      console.error(`  ✗ Error deleting Enquiry #${id}:`, e.message);
    }
  }

  // B. Update / Create Enquiries according to Sheet
  console.log(`\nUpdating / creating ${secEnquiries.length} Enquiries from sheet...`);
  for (const row of secEnquiries) {
    const id = parseInt(row[0], 10);
    const title = row[1];
    const listingType = row[2] ? parseInt(row[2], 10) : null;
    const userPropType = row[3];
    const bedsMin = row[4] ? parseInt(row[4], 10) : null;
    const bedsMax = row[5] ? parseInt(row[5], 10) : null;
    const saleMin = row[6] || '';
    const saleMax = row[7] || '';
    const rentMin = row[8] || '';
    const rentMax = row[9] || '';
    const area = row[10] || '';
    const furnishedFlag = row[11] || 'N';
    const stageId = row[12];

    // Map verified portal Property Type enums for Enquiry:
    // User assumed: 196=Apartment, 198=Villa, 200=Townhouse, 202=Penthouse
    // Portal live: 2530=Apartment, 2528=Villa, 2526=Townhouse, 2524=Penthouse
    let portalPropType = 2530; // default Apartment
    if (userPropType === '196') portalPropType = 2530;
    else if (userPropType === '198') portalPropType = 2528;
    else if (userPropType === '200') portalPropType = 2526;
    else if (userPropType === '202') portalPropType = 2524;
    else if (userPropType) portalPropType = parseInt(userPropType, 10);

    const fields = {
      title: title,
      ufCrm18ListingType: listingType,
      ufCrm18_1790155720: portalPropType,
      ufCrm18BedroomsMin: bedsMin,
      ufCrm18BedroomsMax: bedsMax,
      ufCrm18PriceMin: saleMin,
      ufCrm18PriceMax: saleMax,
      ufCrm18MonthlyRentMin: rentMin,
      ufCrm18MonthlyRentMax: rentMax,
      ufCrm18_1791175311: area,
      ufCrm18Furnished: furnishedFlag,
      stageId: stageId
    };

    if (liveEnquiryIds.includes(id)) {
      // Update existing
      try {
        await BitrixClient.call('crm.item.update', { entityTypeId: 1062, id, fields });
        console.log(`  ✓ Updated Enquiry #${id}: "${title}"`);
      } catch (e) {
        console.error(`  ✗ Error updating Enquiry #${id}:`, e.message);
      }
    } else {
      // Create new
      try {
        const addRes = await BitrixClient.call('crm.item.add', { entityTypeId: 1062, fields });
        const newId = addRes?.item?.id || addRes;
        console.log(`  ✓ Created new Enquiry (assigned ID #${newId}): "${title}"`);
      } catch (e) {
        console.error(`  ✗ Error creating Enquiry for "${title}":`, e.message);
      }
    }
  }

  console.log('\n===============================================================');
  console.log('✓ DATABASE RESET & SHEET SYNC COMPLETED SUCCESSFULLY!');
  console.log('===============================================================\n');
}

runSync().catch(err => {
  console.error('\n✗ FATAL ERROR:', err);
  process.exit(1);
});
