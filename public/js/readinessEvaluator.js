/**
 * src/readinessEvaluator.js
 * Pure-function Publish-Readiness Evaluator for Listings (V2 Layout)
 * 
 * Evaluates whether a real estate listing satisfies all DLD / RERA regulatory compliance,
 * marketing specifications, financial completeness, and media minimums prior to portal syndication.
 * 
 * Works in both Node.js and Browser environments.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ReadinessEvaluator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Helper to resolve field value with support for canonical concepts,
   * camelCase keys, uppercase CRM codes, and fallbacks.
   */
  function getValue(item, key, altKeys = []) {
    if (!item) return undefined;
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
      return item[key];
    }
    for (const alt of altKeys) {
      if (item[alt] !== undefined && item[alt] !== null && item[alt] !== '') {
        return item[alt];
      }
    }
    return undefined;
  }

  /**
   * Evaluates the publish readiness of a listing record.
   * 
   * @param {Object} item - Listing data record (raw Bitrix SPA/Lead item or UI form state)
   * @param {Object} [layoutConfig] - Optional layout schema definition from layouts.v2.json
   * @returns {{ ready: boolean, missing: string[], warnings: string[], score: number }}
   */
  function evaluatePublishReadiness(item, layoutConfig) {
    const missing = [];
    const warnings = [];

    if (!item) {
      return {
        ready: false,
        missing: ['Listing record is empty or missing'],
        warnings: [],
        score: 0
      };
    }

    // --------------------------------------------------------------------------
    // 1. Transaction & Market Segment
    // --------------------------------------------------------------------------
    const txRaw = getValue(item, 'transaction', ['ufCrm16ReTransaction', 'UF_CRM_16_RE_TRANSACTION', 'UF_CRM_RE_TRANSACTION', 'ufCrm16_1790154808', 'UF_CRM_1791952650167']);
    let transaction = 'SALE';
    if (txRaw) {
      const s = String(txRaw).toUpperCase();
      if (s === '158' || s.includes('RENT') || s === '2578') transaction = 'RENT';
      else transaction = 'SALE';
    }

    const segRaw = getValue(item, 'market_segment', ['ufCrm16ReMarketSegment', 'UF_CRM_16_RE_MARKET_SEGMENT', 'UF_CRM_RE_MARKET_SEGMENT', 'ufCrm16_1790154808', 'UF_CRM_1791952650167']);
    let marketSegment = 'READY';
    if (transaction === 'RENT') {
      marketSegment = 'READY'; // Rent is always Ready in Dubai real estate
    } else if (segRaw) {
      const s = String(segRaw).toUpperCase();
      if (s === '162' || s.includes('OFF_PLAN') || s.includes('OFFPLAN') || s === '2582') marketSegment = 'OFF_PLAN';
      else if (s === '160' || s.includes('OVERSEAS') || s === '2580') marketSegment = 'OVERSEAS';
      else marketSegment = 'READY';
    }

    const srcRaw = getValue(item, 'stock_source', ['ufCrm16ReStockSource', 'UF_CRM_16_RE_STOCK_SOURCE', 'UF_CRM_RE_STOCK_SOURCE']);
    let stockSource = 'OWN';
    if (srcRaw) {
      const s = String(srcRaw).toUpperCase();
      if (s === '164' || s.includes('EXTERNAL') || s === '2584') stockSource = 'EXTERNAL';
    }

    // --------------------------------------------------------------------------
    // 2. Core Hierarchy & Specifications
    // --------------------------------------------------------------------------
    const propType = getValue(item, 'property_type', ['ufCrm16PropertyType', 'UF_CRM_PROPERTY_TYPE', 'UF_CRM_1791952050535']);
    if (!propType) {
      missing.push('Property Type is required');
    } else if (String(propType).toUpperCase() === 'COMMERCIAL' || String(propType) === '898' || String(propType) === '1766') {
      const subType = getValue(item, 'property_sub_type', ['ufCrm16PropertySubType', 'UF_CRM_PROPERTY_SUB_TYPE']);
      if (!subType) {
        missing.push('Commercial Sub-Type is required for commercial properties (Office, Retail, Warehouse, Showroom)');
      }
    }

    const bua = parseFloat(getValue(item, 'built_up_area', ['ufCrm16Size', 'UF_CRM_16_SIZE', 'UF_CRM_BUA', 'UF_CRM_1791970770635', 'UF_CRM_TOTALAREA']) || 0);
    if (!bua || isNaN(bua) || bua <= 0) {
      missing.push('Built-up Area (Sq Ft) must be greater than 0');
    }

    // Studio handling: bedrooms can be exactly 0 (Studio)
    const bedsRaw = getValue(item, 'bedrooms', ['ufCrm16_1791172802', 'UF_CRM_16_1791172802', 'UF_CRM_BEDROOMS', 'UF_CRM_1791966366775']);
    const isLand = String(propType).toUpperCase() === 'LAND' || String(propType) === '896' || String(propType) === '1764';
    if (!isLand) {
      if (bedsRaw === undefined || bedsRaw === null || bedsRaw === '' || isNaN(parseFloat(bedsRaw))) {
        missing.push('Bedrooms is required (use 0 for Studio)');
      }
    }

    // --------------------------------------------------------------------------
    // 3. Pricing & Financials
    // --------------------------------------------------------------------------
    const priceVal = parseFloat(getValue(item, 'price', ['ufCrm16_1790154936', 'UF_CRM_16_1790154936', 'UF_CRM_LISTINGPRICE', 'opportunity']) || 0);
    if (!priceVal || isNaN(priceVal) || priceVal <= 0) {
      missing.push(transaction === 'RENT' ? 'Annual Rent (AED) must be greater than 0' : 'Sale Price (AED) must be greater than 0');
    }

    if (transaction === 'RENT') {
      const rentFreq = getValue(item, 'rental_frequency', ['ufCrm16_1791881516', 'UF_CRM_16_1791881516', 'UF_CRM_RENTAL_FREQUENCY']);
      if (!rentFreq) {
        missing.push('Rental Frequency is required for rental listings (Yearly, Bi-Annual, Quarterly)');
      }

      const cheques = getValue(item, 'cheques', ['ufCrm16_1791881538', 'UF_CRM_16_1791881538', 'UF_CRM_CHEQUES']);
      if (!cheques) {
        missing.push('Number of Cheques is required for rental listings');
      }

      const availFrom = getValue(item, 'available_from', ['ufCrm16_1790155057', 'UF_CRM_16_1790155057', 'UF_CRM_DATE_AVAILABLE']);
      if (!availFrom) {
        missing.push('Available From date is required for rental listings');
      }
    } else if (marketSegment === 'OFF_PLAN') {
      const handoverDate = getValue(item, 'expected_handover_date', ['ufCrm16CompletionDate', 'UF_CRM_16_COMPLETION_DATE', 'UF_CRM_COMPLETIONDATE']);
      if (!handoverDate) {
        missing.push('Expected Handover Date is required for Off-Plan listings');
      }

      // Payment Plan Validation: must total 100%
      const bPct = parseFloat(getValue(item, 'payment_plan_booking_pct', ['ufCrm16RePpBookingPct', 'UF_CRM_16_RE_PP_BOOKING_PCT']) || 0);
      const cPct = parseFloat(getValue(item, 'payment_plan_construction_pct', ['ufCrm16RePpConstructionPct', 'UF_CRM_16_RE_PP_CONSTRUCTION_PCT']) || 0);
      const hPct = parseFloat(getValue(item, 'payment_plan_handover_pct', ['ufCrm16RePpHandoverPct', 'UF_CRM_16_RE_PP_HANDOVER_PCT']) || 0);
      const pPct = parseFloat(getValue(item, 'payment_plan_post_handover_pct', ['ufCrm16RePpPostHandoverPct', 'UF_CRM_16_RE_PP_POST_HANDOVER_PCT']) || 0);

      const totalPp = Math.round((bPct + cPct + hPct + pPct) * 100) / 100;
      if (totalPp === 0) {
        missing.push('Payment plan breakdown is required for Off-Plan listings (Booking %, During Construction %, Handover %)');
      } else if (Math.abs(totalPp - 100) > 0.01) {
        missing.push(`Payment plan percentages must total exactly 100% (currently ${totalPp}%)`);
      }
    }

    // --------------------------------------------------------------------------
    // 4. Regulatory & DLD / RERA Compliance
    // --------------------------------------------------------------------------
    if (marketSegment !== 'OVERSEAS') {
      // UAE listings must have a valid DLD Trakheesi permit
      const trakheesiNo = getValue(item, 'trakheesi_permit_no', ['ufCrm16_1791787455285', 'UF_CRM_16_1791787455285', 'UF_CRM_TRAKHEESI_PERMIT_NO']);
      if (!trakheesiNo) {
        missing.push('10-digit DLD Trakheesi Permit Number is mandatory for UAE portal publishing');
      } else {
        const cleanNo = String(trakheesiNo).trim();
        if (!/^[0-9]{10,12}$/.test(cleanNo) && !cleanNo.startsWith('TRK-') && !cleanNo.startsWith('REP-')) {
          warnings.push(`Trakheesi permit "${cleanNo}" may not match standard 10-digit DLD numeric format`);
        }
      }

      // Permit Expiry Check
      const permitExpiry = getValue(item, 'permit_expiry', ['ufCrm16_1791787502111', 'UF_CRM_16_1791787502111', 'UF_CRM_TRAKHEESI_EXPIRY', 'UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE']);
      if (!permitExpiry) {
        missing.push('Trakheesi Permit Expiry Date is mandatory');
      } else {
        const expiryDate = new Date(permitExpiry);
        const now = new Date();
        if (!isNaN(expiryDate.getTime())) {
          if (expiryDate < now) {
            missing.push('DLD Trakheesi Permit has expired — listing cannot be published');
          } else {
            const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) {
              warnings.push(`DLD Trakheesi Permit expires in ${diffDays} day${diffDays === 1 ? '' : 's'}`);
            }
          }
        }
      }

      // Form A for Own listings
      if (stockSource === 'OWN') {
        const signedFormA = getValue(item, 'signed_form_a', ['ufCrm16_1791787381785', 'UF_CRM_16_1791787381785', 'UF_CRM_FORM_A_DOC']);
        if (!signedFormA || (Array.isArray(signedFormA) && signedFormA.length === 0)) {
          warnings.push('Signed Form A / Mandate document should be attached for regulatory verification');
        }

        const formAExpiry = getValue(item, 'form_a_expiry', ['ufCrm16FormAExpiryDate', 'UF_CRM_16_FORM_A_EXPIRY_DATE', 'UF_CRM_FORM_A_EXPIRY_DATE']);
        if (formAExpiry) {
          const expDate = new Date(formAExpiry);
          if (!isNaN(expDate.getTime()) && expDate < new Date()) {
            warnings.push('Form A / Mandate agreement has expired');
          }
        }
      }

      // Title deed for Ready Sale
      if (transaction === 'SALE' && marketSegment === 'READY') {
        const titleDeed = getValue(item, 'title_deed', ['ufCrm16TitleDeed', 'UF_CRM_16_TITLE_DEED', 'UF_CRM_TITLE_DEED']);
        if (!titleDeed || (Array.isArray(titleDeed) && titleDeed.length === 0)) {
          warnings.push('Title Deed / Oqood copy recommended for Ready Sale verification');
        }
      }
    } else {
      // Overseas listing requirements
      const country = getValue(item, 'country', ['ufCrm16_1791172854', 'UF_CRM_16_1791172854', 'ufCrm16CountryCode', 'UF_CRM_COUNTRY']);
      if (!country || String(country).trim() === '') {
        missing.push('Country is required for Overseas listings');
      }
    }

    // Co-Broke requirements for External Stock
    if (stockSource === 'EXTERNAL') {
      const partner = getValue(item, 'partner_agency', ['ufCrm16RePartnerAgency', 'UF_CRM_16_RE_PARTNER_AGENCY', 'COMPANY_ID']);
      if (!partner) {
        missing.push('Partner Agency is required for External Co-Broke listings');
      }
    }

    // --------------------------------------------------------------------------
    // 5. Media & Marketing Copy
    // --------------------------------------------------------------------------
    const title = getValue(item, 'title', ['title', 'UF_CRM_1791952409183']);
    if (!title || String(title).trim().length < 10) {
      missing.push('Listing Title (minimum 10 characters) is required for portal publishing');
    }

    const description = getValue(item, 'description', ['ufCrm16Description', 'UF_CRM_16_DESCRIPTION', 'COMMENTS']);
    if (!description || String(description).trim().length < 50) {
      missing.push('Listing Description (minimum 50 characters) is required for portal publishing');
    }

    const photos = getValue(item, 'photos', ['ufCrm16_1791881642219', 'UF_CRM_16_1791881642219', 'UF_CRM_PHOTOS']);
    let photoCount = 0;
    if (Array.isArray(photos)) {
      photoCount = photos.length;
    } else if (photos && typeof photos === 'object') {
      photoCount = Object.keys(photos).length;
    } else if (typeof photos === 'string' && photos.trim()) {
      photoCount = 1;
    }

    if (photoCount < 3) {
      missing.push(`Minimum 3 property photos required for portal syndication (currently ${photoCount})`);
    }

    // --------------------------------------------------------------------------
    // 6. Final Score & Verdict
    // --------------------------------------------------------------------------
    const totalChecks = 10;
    const passedChecks = Math.max(0, totalChecks - missing.length);
    const score = Math.round((passedChecks / totalChecks) * 100);

    return {
      ready: missing.length === 0,
      missing,
      warnings,
      score: Math.min(100, Math.max(0, score)),
      summary: {
        transaction,
        marketSegment,
        stockSource,
        photoCount
      }
    };
  }

  return {
    evaluatePublishReadiness,
    getValue
  };
}));
