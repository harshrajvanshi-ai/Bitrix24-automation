/**
 * src/formulas/config.js
 * Centralized Configuration for Bitrix24 Real Estate SPA Formula Automations
 * (Migrated from Salesforce formula fields)
 */

const CONFIG = {
  ENTITIES: {
    MASTER_PROJECT: {
      entityTypeId: 1040,
      name: 'Master Project',
      fields: {
        id: 'id',
        title: 'title',
        dateUpdated: 'ufCrm8CommunityDataDateUpdated',           // Community Data - Date Updated (date)
        daysSinceLastUpdate: 'ufCrm8CommunityDataDaysSinceLastUpdat', // Community Data - Days Since Last Update (integer)
        unitsTotal: 'ufCrm8CommunityDataUnitsTotal',             // Community Data - Units Total (integer)
        unitsApartments: 'ufCrm8CommunityDataUnitsApartments',
        unitsTownhouse: 'ufCrm8CommunityDataUnitsTownhouse',
        unitsVilla: 'ufCrm8CommunityDataUnitsVilla',
        unitsOther: 'ufCrm8CommunityDataUnitsOther'
      }
    },
    PROJECT: {
      entityTypeId: 1044,
      name: 'Project',
      fields: {
        id: 'id',
        title: 'title',
        parentId1040: 'parentId1040',                            // Native link to Master Project (crm_entity)
        masterProjectCrm: 'ufCrm10_1790158705',                  // User field link to Master Project (crm)
        unitsApartments: 'ufCrm10_1790842036',                   // Number of Apartments (double)
        unitsTownhouses: 'ufCrm10_1790842047',                   // Number of Townhouses (double)
        unitsVillas: 'ufCrm10_1790842059'                        // Number of Villas (double)
      }
    },
    ENQUIRY: {
      entityTypeId: 1062,
      name: 'Enquiry',
      fields: {
        id: 'id',
        title: 'title',
        assignedById: 'assignedById',
        createdTime: 'createdTime',                              // Created on (datetime)
        firstContactedDate: 'ufCrm18FirstContactedDate',         // First Contacted Date (date)
        contactedConversionDays: 'ufCrm18ContactedConversionDays', // Contacted conversion days (string/int)
        lastActivityTime: 'lastActivityTime',                    // Last updated on (datetime)
        daysSinceLastActivity: 'ufCrm18DaysSinceLastActivity',   // Days since last activity (integer)
        lastContactedDate: 'ufCrm18LastContactedDate',           // Last Contacted Date (date)
        lastCommunicationTime: 'lastCommunicationTime',          // Fallback last contact
        daysSinceLastContacted: 'ufCrm18DaysSinceLastContacted', // Days since last contacted (integer)
        recommendedListings: 'ufCrm18_1792649609'                // Recommended Listing CRM binding
      }
    },
    OFFER: {
      entityTypeId: 1070,
      name: 'Offer',
      fields: {
        id: 'id',
        title: 'title',
        assignedById: 'assignedById',
        offerManager: 'ufCrm22_1791173596',                      // Offer Owner Manager (string/user)
        amIOfferManager: 'ufCrm22_1791173306'                    // Am I the offer Manager (UI only)
      }
    },
    LISTING: {
      entityTypeId: 1058,
      name: 'Listing',
      fields: {
        id: 'id',
        title: 'title',                                          // Name (string)
        assignedById: 'assignedById',                            // Responsible (user)
        titleCharacterCounter: 'ufCrm16TitleCharacterCounter',   // Title Character Counter (integer)
        combinedTitle: 'ufCrm16Combinedtitle',                   // CombinedTitle (string)
        bedrooms: 'ufCrm16_1791172802',                          // Bedrooms (double)
        propertyType: 'ufCrm16PropertyType',                    // Property Type enum
        community: 'ufCrm16CommunityPropertyfinder',             // Community - Propertyfinder (string)
        subCommunity: 'ufCrm16SubCommunityPropertyfinder',       // Sub Community
        area: 'ufCrm16_1791172692',                              // Area string fallback
        price: 'ufCrm16Price',                                  // Price (money)
        listingPrice: 'ufCrm16_1790154936',                      // Listing Price (money)
        originalListPrice: 'ufCrm16OriginalListPrice',           // Original List Price (money)
        soldPrice: 'ufCrm16SoldPrice',                          // Sold Price (money)
        size: 'ufCrm16Size',                                    // Size (double)
        pricePerSqFt: 'ufCrm16_1792611299625',                  // Price Per Square Foot (double)
        pricePerSqFtAlt: 'ufCrm16_1792668311',                  // Price Per squar foot (double)
        listPricePerSqFt: 'ufCrm16ListPricePerSqFt',             // List Price Per Sq./Ft. (money)
        listPriceOriginalListPrice: 'ufCrm16ListPriceOriginalListPrice', // List Price/Original List Price (double)
        listPriceSoldPrice: 'ufCrm16ListPriceSoldPrice',         // List Price/Sold Price (double)
        soldPricePerSqFt: 'ufCrm16SoldPricePerSqFt',             // Sold Price per Sq./Ft. (money)
        monthlyRent: 'ufCrm16MonthlyRent',                      // Monthly Rent (money)
        monthlyRentPerSqFt: 'ufCrm16MonthlyRentPerSqFt',         // Monthly Rent per Sq./Ft. (money)
        yearlyRental: 'ufCrm16YearlyRental',                    // Yearly Rental (money)
        serviceCharge: 'ufCrm16ServiceCharge',                  // Service Charge (money)
        annualCommunityFee: 'ufCrm16AnnualCommunityFee',        // Annual Community Fee (money)
        netRentalYield: 'ufCrm16NetRentalYield'                 // Net Rental Yield (double)
      }
    }
  },

  // Property Type ID to Display Label mapping for CombinedTitle
  PROPERTY_TYPE_MAP: {
    886: 'Apartment',
    888: 'Villa',
    890: 'Townhouse',
    892: 'Penthouse',
    894: 'Duplex',
    896: 'Land',
    898: 'Commercial',
    900: 'Office',
    902: 'Retail'
  }
};

// --- Math & Type Normalization Helpers ---

/**
 * Safely parse money or double values from Bitrix24 formats (e.g., '4500000|AED', 4500000, '4500000')
 */
function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const raw = val.split('|')[0].trim().replace(/,/g, '');
    const num = parseFloat(raw);
    return isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Round a numeric value to specified decimal places (default 2)
 */
function roundTo(val, decimals = 2) {
  if (val === null || val === undefined || !isFinite(val)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Calculate whole days between two dates: toDate - fromDate
 * Returns an integer number of days, or null if either date is invalid.
 */
function daysBetween(fromDate, toDate = new Date()) {
  if (!fromDate) return null;
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const to = toDate instanceof Date ? toDate : new Date(toDate);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;

  // Zero-out hours to measure whole calendar days
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((utcTo - utcFrom) / (1000 * 60 * 60 * 24));
}

module.exports = {
  CONFIG,
  parseNumber,
  roundTo,
  daysBetween
};
