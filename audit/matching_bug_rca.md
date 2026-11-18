# Root Cause Analysis: Matching Listings Engine & Data Inconsistencies

**Author:** System Diagnostics Agent  
**Date:** 2026-11-18  
**Portal:** csl.bitrix24.com  
**Target Entities:** 
- Listing SPA (`entityTypeId: 1058`)
- Enquiry SPA (`entityTypeId: 1062`)

---

## Executive Summary

An in-depth investigation was conducted into the Matching Listings feature (`views/matching-listings.html`, `public/js/matching-listings.js`) following reports of mismatched listing types (Rent vs. Sale), invalid bedroom counts (`100` and `150`), unmapped furnished values (`"Specified"`), price inconsistencies (e.g. `0 AED` or `73,333 AED` next to `4,250,000 AED`), and extreme enquiry criteria hiding search engine defects.

The analysis confirms a combination of **code architectural bugs** in the matching engine and **bad/corrupt data** in the Bitrix24 Listing records.

---

## Field & Enumeration Definitions (Bitrix24 Live Schema)

### Listing SPA (`entityTypeId: 1058`)
- **Purpose / Listing Type (`ufCrm16_1790154808`)**:
  - `158`: `RENT`
  - `160`: `Overseas Sale`
  - `162`: `Off-plan Listing`
  - `164`: `External Stock`
  *(Note: There is no native "Ready Sale" enumeration ID under `ufCrm16_1790154808`. Ready sales were historically forced into `158` (Rent) during import/sync or mapped to `ufCrm16RecordType`)*.
- **Record Type (`ufCrm16RecordType`)**:
  - `1070`: `Residential`
  - `1072`: `Commercial`
  - `1074`: `Off-Plan`
  - `1076`: `Secondary / Resale`
  - `1078`: `Rental`
  - `1080`: `Land / Plot`
- **Bedrooms (`ufCrm16_1791172802`)**: `double`
- **Furnished (`ufCrm16Furnished`)**:
  - `736`: `Furnished`
  - `738`: `Semi-Furnished`
  - `740`: `Unfurnished`
  *(Note: Legacy/imported records also contain unmapped IDs like `676`)*
- **Price Fields**:
  - `ufCrm16_1790154936`: Listing Price (`money`, e.g. `"4250000|AED"`)
  - `ufCrm16Price`: Price (`money`)
  - `ufCrm16MonthlyRent`: Monthly Rent (`money`)
  - `ufCrm16YearlyRental`: Yearly Rental (`money`)
  - `opportunity`: Bitrix native opportunity (`double`)

### Enquiry SPA (`entityTypeId: 1062`)
- **Listing Type (`ufCrm18ListingType`)**:
  - `1246`: `Sale`
  - `1248`: `Rent`
  - `1250`: `Off-Plan`
  - `1252`: `Ready & Off-Plan`
  - `1254`: `Short Term Rent`
- **Property Type (`ufCrm18_1790155720`)**:
  - `2530`: `Apartment` (maps to Listing `886`)
  - `2528`: `Villa` (maps to Listing `888`)
  - `2526`: `Townhouse` (maps to Listing `890`)
- **Budget**:
  - `ufCrm18PriceMin` / `ufCrm18PriceMax`: Sale budget
  - `ufCrm18MonthlyRentMin` / `ufCrm18MonthlyRentMax`: Rent budget

---

## Symptom Diagnoses & Root Causes

### Symptom 1: Purpose filter is "Sale (Ready & Off-Plan)", but results are tagged "(Rent)" and labelled "Rental Property", while titles say "For Sale"
- **Classification:** **(c) Both code bug and bad data**
- **Data Cause:** Listings #136, #140, #142, #144, #146, #148, #150, and #204 have titles clearly indicating sale (e.g. `"3 BR Sale in Downtown Dubai"`, `"Exclusive For Sale..."`), yet their field `ufCrm16_1790154808` is stored as `158` (`RENT`).
- **Code Cause (`public/js/matching-listings.js`):**
  1. *Query Builder (`searchListings()`):* When the user chooses `SALE_ALL`, the query builder explicitly bypassed sending a REST filter for `ufCrm16_1790154808` to Bitrix because Bitrix REST lacks an `IN` operator for enums. Thus, all listings with `158` were fetched from the database.
  2. *Client Filter Discrepancy:* `isMatchingCompatible()` used `resolveTransactionFromListing(item)` which inspected title cues (`/\b(sale|for sale)\b/i`), recognizing the record as `SALE`. Thus it passed the client-side filter.
  3. *Card Renderer Parity Failure (`renderListingCards()` lines 1087, 1104, 1136):* While the filter matched the item based on transaction cues, the card renderer exclusively read the raw database field `item[lFields.listingType]` (`158`), blindly formatting it as `Apartment (Rent)` and `"Rental Property"`. The filter and the card renderer were using conflicting sources of truth.

### Symptom 2: Beds shows 100 or 150 on most cards, while titles say 3BR/4BR/5BR/6BR
- **Classification:** **(c) Both code bug and bad data**
- **Data Cause:** Seed / mock script data generated in Bitrix for listings #140–#150 has `ufCrm16_1791172802` literally stored as `100`, and listings #82–#96 have it stored as `150`.
- **Code Cause (`public/js/matching-listings.js` lines 960–968):**
  The bedroom filter evaluated `itemBeds >= filterBeds`. Since `100 >= 3` and `150 >= 3` are mathematically true, these bogus records matched every bedroom query. There was no sanity validation to flag or exclude impossible values (e.g. `beds > 20`).

### Symptom 3: Furnished shows "Specified" on cards (e.g. Listing #122, #136)
- **Classification:** **(a) Code bug**
- **Code Cause (`public/js/matching-listings.js` lines 87–91, 514–519):**
  `CONFIG.ENUMS.FURNISHED` only registered enum IDs `736`, `738`, and `740`. Listing #122 and #136 have `ufCrm16Furnished = 676` (an legacy/alternate Bitrix enum). 
  In `mapListingFurnishedToLabel()`:
  ```javascript
  const matched = CONFIG.ENUMS.FURNISHED.find(f => f.listingId === num);
  return matched ? matched.label : 'Specified';
  ```
  The fallback string was hardcoded to return `'Specified'` instead of `'Not specified'`.

### Symptom 4: Prices inconsistent (e.g. 0 AED, or 73,333 AED next to 4,250,000 AED)
- **Classification:** **(c) Both code bug and bad data**
- **Data Cause:**
  - Listing #204 had sale price `4,250,000 AED` in `ufCrm16_1790154936`, but empty rental fields (`ufCrm16MonthlyRent = ""`, `ufCrm16YearlyRental = ""`).
  - Listing #136 had `monthlyRent = "73333|AED"` alongside sale price `14,200,000 AED`.
- **Code Cause (`public/js/matching-listings.js`):**
  When listing #204 was misclassified as `Rent` by `resolveListingPrice()` (due to `ufCrm16_1790154808 = 158`), the price extractor prioritized rental fields. Because the rental fields were empty, it either fell back to 0 or displayed monthly rental numbers in a sale enquiry context.

### Symptom 5: Extreme test criteria (Max Budget 255555555555, Min 1200) hiding filter problems
- **Classification:** **(b) Bad enquiry data / Missing input validation**
- **Cause:** Enquiry #252 was created with test inputs spanning `1,200 AED` to `255,555,555,555 AED`. 
- **Code Fix Required:**
  - Enforce input boundary validation: `minPrice <= maxPrice`.
  - Cap budget inputs at realistic limits (e.g. 500,000,000 AED) and show an in-UI warning if astronomical values are supplied.
  - Distinguish Rent budget (`monthlyRentMin`/`monthlyRentMax`) from Sale budget (`priceMin`/`priceMax`).

---

## Action Plan

1. **Step 3 (Code Fix):**
   - Align Query Builder, Client Filter, Card Tags, and Footer Labels to a single canonical Purpose resolver.
   - Enforce REST filter so Rent inquiries query `!= 160, 162` or `= 158`, and Sale queries never return pure Rent.
   - Implement Bedroom Sanity Guard: exclude/flag `beds > 20`.
   - Update Furnished mapping to handle `676` and fallback to `"Not specified"`.
   - Implement Budget Validation and strict Sale vs Sale / Rent vs Rent comparison.
2. **Step 4 (Bad Data):**
   - Export corrupted records to `/audit/listing_backup.json`.
   - Provide a safe dry-run cleanup script.
3. **Step 5 (Tests):**
   - Write automated regression tests in `/audit/tests/` and verify before/after counts for Enquiry #252 and #256.
