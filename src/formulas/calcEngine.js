/**
 * src/formulas/calcEngine.js
 * Calculation Engine for Bitrix24 Real Estate Formula Automations
 *
 * Capabilities:
 *  - Calculates 17 Salesforce-migrated formula fields for Master Project, Enquiry, Listing, Offer
 *  - Full protection against divide-by-zero, NaN, Infinity, and missing dates
 *  - Strict diffing against stored values to prevent update loops
 *  - Master Project units roll-up aggregation across linked Projects
 */

const { CONFIG, parseNumber, roundTo, daysBetween } = require('./config');
const BitrixClient = require('../bitrixClient');

class CalcEngine {
  /**
   * Determine if a calculated value differs from the stored value
   */
  static hasChanged(calculated, stored) {
    // If calculated is null/empty and stored is also null/empty/undefined
    const isCalcEmpty = calculated === null || calculated === undefined || calculated === '';
    const isStoredEmpty = stored === null || stored === undefined || stored === '';
    if (isCalcEmpty && isStoredEmpty) return false;
    if (isCalcEmpty !== isStoredEmpty) return true;

    // Both are numbers
    if (typeof calculated === 'number') {
      const storedNum = parseNumber(stored);
      if (storedNum === null) return true;
      return Math.abs(calculated - storedNum) > 0.001;
    }

    // String comparison (trimmed, normalized whitespace)
    return String(calculated).trim() !== String(stored).trim();
  }

  // ============================================================================
  // 1. MASTER PROJECT CALCULATIONS (entityTypeId = 1040)
  // ============================================================================
  static calcMasterProject(item) {
    const fields = CONFIG.ENTITIES.MASTER_PROJECT.fields;
    const computed = {};

    // 1. Community Data - Days Since Last Update: whole days between today and the community data last-updated date
    const dateUpdatedVal = item[fields.dateUpdated];
    if (dateUpdatedVal) {
      const days = daysBetween(dateUpdatedVal, new Date());
      computed[fields.daysSinceLastUpdate] = days !== null ? days : null;
    } else {
      computed[fields.daysSinceLastUpdate] = null;
    }

    // Diff against stored values
    const diff = {};
    for (const [key, val] of Object.entries(computed)) {
      if (this.hasChanged(val, item[key])) {
        diff[key] = val;
      }
    }
    return diff;
  }

  // ============================================================================
  // 2. ENQUIRY CALCULATIONS (entityTypeId = 1062)
  // ============================================================================
  static calcEnquiry(item) {
    const fields = CONFIG.ENTITIES.ENQUIRY.fields;
    const computed = {};

    // 3. Contacted conversion days: whole days from item created date to first contacted date.
    // RULE: Set once, when first contacted is set, and don't overwrite it later.
    const existingConversion = item[fields.contactedConversionDays];
    if (existingConversion === null || existingConversion === undefined || existingConversion === '') {
      const firstContact = item[fields.firstContactedDate];
      const created = item[fields.createdTime] || item.dateCreate;
      if (firstContact && created) {
        const days = daysBetween(created, firstContact);
        if (days !== null) {
          computed[fields.contactedConversionDays] = String(Math.max(0, days));
        }
      }
    }

    // 4. Days since last activity: today minus last activity date
    const lastActivity = item[fields.lastActivityTime] || item[fields.lastCommunicationTime] || item.updatedTime;
    if (lastActivity) {
      const days = daysBetween(lastActivity, new Date());
      computed[fields.daysSinceLastActivity] = days !== null ? Math.max(0, days) : null;
    } else {
      computed[fields.daysSinceLastActivity] = null;
    }

    // 5. Days since last contacted: today minus last contacted date
    const lastContacted = item[fields.lastContactedDate] || item[fields.lastCommunicationTime];
    if (lastContacted) {
      const days = daysBetween(lastContacted, new Date());
      computed[fields.daysSinceLastContacted] = days !== null ? Math.max(0, days) : null;
    } else {
      computed[fields.daysSinceLastContacted] = null;
    }

    // Diff against stored values
    const diff = {};
    for (const [key, val] of Object.entries(computed)) {
      if (this.hasChanged(val, item[key])) {
        diff[key] = val;
      }
    }
    return diff;
  }

  // ============================================================================
  // 3. LISTING CALCULATIONS (entityTypeId = 1058)
  // ============================================================================
  static calcListing(item) {
    const fields = CONFIG.ENTITIES.LISTING.fields;
    const computed = {};

    // 8. Title Character Counter: length of title field
    const titleStr = typeof item.title === 'string' ? item.title : '';
    computed[fields.titleCharacterCounter] = titleStr.length;

    // 9. CombinedTitle: [bedrooms] BR [property type] in [community] (skip empty parts, no double spaces)
    const rawBeds = parseNumber(item[fields.bedrooms]);
    const rawPropTypeId = item[fields.propertyType];
    const propTypeLabel = CONFIG.PROPERTY_TYPE_MAP[rawPropTypeId] || (typeof rawPropTypeId === 'string' ? rawPropTypeId : '');
    const community = (item[fields.community] || item[fields.subCommunity] || item[fields.area] || '').toString().trim();

    const titleParts = [];
    if (rawBeds !== null && rawBeds > 0) {
      titleParts.push(`${rawBeds} BR`);
    }
    if (propTypeLabel) {
      titleParts.push(propTypeLabel);
    }
    let combined = titleParts.join(' ').trim();
    if (community) {
      combined = combined ? `${combined} in ${community}` : community;
    }
    // Clean up double spaces
    combined = combined.replace(/\s+/g, ' ').trim();
    computed[fields.combinedTitle] = combined || null;

    // Numerical source fields
    const price = parseNumber(item[fields.price]);
    const listPrice = parseNumber(item[fields.listingPrice]) || price;
    const origListPrice = parseNumber(item[fields.originalListPrice]);
    const soldPrice = parseNumber(item[fields.soldPrice]);
    const size = parseNumber(item[fields.size]);
    const monthlyRent = parseNumber(item[fields.monthlyRent]);
    const yearlyRental = parseNumber(item[fields.yearlyRental]);
    const serviceCharge = parseNumber(item[fields.serviceCharge]) || 0;
    const otherCosts = parseNumber(item[fields.annualCommunityFee]) || 0;

    // 11. Price Per Square Foot: Price / Size
    if (price !== null && size !== null && size > 0) {
      const val = roundTo(price / size, 2);
      computed[fields.pricePerSqFt] = val;
      if (fields.pricePerSqFtAlt) computed[fields.pricePerSqFtAlt] = val;
    } else {
      computed[fields.pricePerSqFt] = null;
      if (fields.pricePerSqFtAlt) computed[fields.pricePerSqFtAlt] = null;
    }

    // 12. List Price Per Sq./Ft.: List Price / Size
    if (listPrice !== null && size !== null && size > 0) {
      computed[fields.listPricePerSqFt] = roundTo(listPrice / size, 2);
    } else {
      computed[fields.listPricePerSqFt] = null;
    }

    // 13. List Price / Original List Price: (List Price / Original List Price) * 100
    if (listPrice !== null && origListPrice !== null && origListPrice > 0) {
      computed[fields.listPriceOriginalListPrice] = roundTo((listPrice / origListPrice) * 100, 2);
    } else {
      computed[fields.listPriceOriginalListPrice] = null;
    }

    // 14. List Price / Sold Price: (List Price / Sold Price) * 100, only when Sold Price is filled
    if (listPrice !== null && soldPrice !== null && soldPrice > 0) {
      computed[fields.listPriceSoldPrice] = roundTo((listPrice / soldPrice) * 100, 2);
    } else {
      computed[fields.listPriceSoldPrice] = null;
    }

    // 15. Sold Price per Sq./Ft.: Sold Price / Size (only when Sold Price is filled)
    if (soldPrice !== null && soldPrice > 0 && size !== null && size > 0) {
      computed[fields.soldPricePerSqFt] = roundTo(soldPrice / size, 2);
    } else {
      computed[fields.soldPricePerSqFt] = null;
    }

    // 16. Monthly Rent per Sq./Ft.: Monthly Rent / Size
    if (monthlyRent !== null && size !== null && size > 0) {
      computed[fields.monthlyRentPerSqFt] = roundTo(monthlyRent / size, 2);
    } else {
      computed[fields.monthlyRentPerSqFt] = null;
    }

    // 17. Net Rental Yield: (Yearly Rental - [Service Charge] - [other yearly costs]) / Price * 100
    if (yearlyRental !== null && price !== null && price > 0) {
      const netRental = yearlyRental - serviceCharge - otherCosts;
      computed[fields.netRentalYield] = roundTo((netRental / price) * 100, 2);
    } else {
      computed[fields.netRentalYield] = null;
    }

    // Diff against stored values
    const diff = {};
    for (const [key, val] of Object.entries(computed)) {
      if (this.hasChanged(val, item[key])) {
        diff[key] = val;
      }
    }
    return diff;
  }

  // ============================================================================
  // 4. MAIN DISPATCHER: calc(entityTypeId, item)
  // ============================================================================
  static calc(entityTypeId, item) {
    if (!item) return {};
    const typeId = parseInt(entityTypeId, 10);

    switch (typeId) {
      case CONFIG.ENTITIES.MASTER_PROJECT.entityTypeId:
        return this.calcMasterProject(item);
      case CONFIG.ENTITIES.ENQUIRY.entityTypeId:
        return this.calcEnquiry(item);
      case CONFIG.ENTITIES.LISTING.entityTypeId:
        return this.calcListing(item);
      case CONFIG.ENTITIES.PROJECT.entityTypeId:
      case CONFIG.ENTITIES.OFFER.entityTypeId:
        // Offer & Project don't have record-level self-formulas (#6, #7, #10 are UI-only)
        return {};
      default:
        return {};
    }
  }

  // ============================================================================
  // 5. MASTER PROJECT UNITS ROLL-UP AGGREGATOR
  //    (Formula #2: Community Data - Units Total across all linked Projects)
  // ============================================================================
  static async recalcMasterProjectUnits(masterProjectId, domain = 'latest') {
    if (!masterProjectId) return null;
    const cleanId = parseInt(masterProjectId, 10);
    if (isNaN(cleanId) || cleanId <= 0) return null;

    console.log(`[ROLLUP] Recalculating Units Total for Master Project #${cleanId}...`);

    const pFields = CONFIG.ENTITIES.PROJECT.fields;
    const mpFields = CONFIG.ENTITIES.MASTER_PROJECT.fields;

    let allProjects = [];
    let start = 0;

    // Paginate through all Projects linked to this Master Project
    while (true) {
      try {
        const res = await BitrixClient.call('crm.item.list', {
          entityTypeId: CONFIG.ENTITIES.PROJECT.entityTypeId,
          filter: {
            [`=${pFields.parentId1040}`]: cleanId
          },
          select: [
            pFields.id,
            pFields.parentId1040,
            pFields.unitsApartments,
            pFields.unitsTownhouses,
            pFields.unitsVillas
          ],
          start
        }, domain);

        const items = res?.items || (Array.isArray(res) ? res : []);
        allProjects.push(...items);

        if (items.length < 50) break;
        start += 50;
        if (allProjects.length >= 2000) break; // Guard against runaways
      } catch (err) {
        console.error(`[ROLLUP] Error querying projects for Master Project #${cleanId} at start=${start}:`, err.message);
        break;
      }
    }

    // Also check fallback link ufCrm10_1790158705 if parentId1040 returned 0
    if (allProjects.length === 0) {
      try {
        const altRes = await BitrixClient.call('crm.item.list', {
          entityTypeId: CONFIG.ENTITIES.PROJECT.entityTypeId,
          filter: {
            [`=${pFields.masterProjectCrm}`]: cleanId
          },
          select: [
            pFields.id,
            pFields.masterProjectCrm,
            pFields.unitsApartments,
            pFields.unitsTownhouses,
            pFields.unitsVillas
          ],
          start: 0
        }, domain);
        const altItems = altRes?.items || (Array.isArray(altRes) ? altRes : []);
        allProjects.push(...altItems);
      } catch (e) {}
    }

    // Sum all unit types across projects
    let totalApartments = 0;
    let totalTownhouses = 0;
    let totalVillas = 0;
    let totalUnits = 0;

    allProjects.forEach(p => {
      const apt = parseNumber(p[pFields.unitsApartments]) || 0;
      const th = parseNumber(p[pFields.unitsTownhouses]) || 0;
      const villa = parseNumber(p[pFields.unitsVillas]) || 0;

      totalApartments += apt;
      totalTownhouses += th;
      totalVillas += villa;
      totalUnits += (apt + th + villa);
    });

    console.log(`[ROLLUP] Master Project #${cleanId}: Found ${allProjects.length} linked projects. Total units: ${totalUnits} (Apt: ${totalApartments}, TH: ${totalTownhouses}, Villa: ${totalVillas})`);

    // Fetch current Master Project to diff
    let mpItem;
    try {
      const getRes = await BitrixClient.call('crm.item.get', {
        entityTypeId: CONFIG.ENTITIES.MASTER_PROJECT.entityTypeId,
        id: cleanId
      }, domain);
      mpItem = getRes?.item || getRes;
    } catch (err) {
      console.error(`[ROLLUP] Failed to get Master Project #${cleanId}:`, err.message);
      return null;
    }

    if (!mpItem) return null;

    const diff = {};
    if (this.hasChanged(totalUnits, mpItem[mpFields.unitsTotal])) {
      diff[mpFields.unitsTotal] = totalUnits;
    }
    if (this.hasChanged(totalApartments, mpItem[mpFields.unitsApartments])) {
      diff[mpFields.unitsApartments] = totalApartments;
    }
    if (this.hasChanged(totalTownhouses, mpItem[mpFields.unitsTownhouse])) {
      diff[mpFields.unitsTownhouse] = totalTownhouses;
    }
    if (this.hasChanged(totalVillas, mpItem[mpFields.unitsVilla])) {
      diff[mpFields.unitsVilla] = totalVillas;
    }

    if (Object.keys(diff).length > 0) {
      console.log(`[ROLLUP] Updating Master Project #${cleanId} with unit rollups:`, diff);
      await BitrixClient.call('crm.item.update', {
        entityTypeId: CONFIG.ENTITIES.MASTER_PROJECT.entityTypeId,
        id: cleanId,
        fields: diff
      }, domain);
      return { id: cleanId, updated: diff, projectsCount: allProjects.length };
    }

    console.log(`[ROLLUP] Master Project #${cleanId} units already up-to-date (${totalUnits}). No update needed.`);
    return { id: cleanId, updated: {}, projectsCount: allProjects.length };
  }
}

module.exports = CalcEngine;
