/**
 * src/readinessEvaluator.js
 * Pure-function Publish-Readiness Evaluator for Listings (V2 Layout)
 * 
 * Evaluates whether a real estate listing satisfies all DLD / RERA regulatory compliance,
 * marketing specifications, financial completeness, and media minimums prior to portal syndication.
 * 
 * Rules:
 *  - Score is strictly calculated over required checklist items only:
 *      score = Math.round((satisfiedRequired / totalRequired) * 100)
 *  - Optional items (amenities, floor plans, parking, Arabic text) never affect the score.
 *  - Rental Frequency is removed (covered by Number of Cheques).
 *  - Mandate: Exclusive boolean (UF_CRM_1791970897872), not a new enum.
 *  - Form A / Mandate Expiry: required for Rent & Ready Sale (Own stock); optional for External; hidden for Off-Plan and Overseas.
 *  - Title Deed: required for Ready Sale (Own and External); hidden for Rent, Off-Plan, Overseas.
 *  - Overseas: requires Country, City, Address, Currency; bypasses local UAE DLD permits.
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
   * @returns {{ ready: boolean, missing: string[], warnings: string[], score: number, summary: Object }}
   */
  function evaluatePublishReadiness(item, layoutConfig) {
    const missing = [];
    const warnings = [];

    if (!item) {
      return {
        ready: false,
        missing: ['Listing record is empty or missing'],
        warnings: [],
        score: 0,
        summary: {}
      };
    }

    // --------------------------------------------------------------------------
    // 1. Transaction & Market Segment Resolution
    // --------------------------------------------------------------------------
    const txRaw = getValue(item, 'transaction', [
      'ufCrm16ReTransaction',
      'UF_CRM_16_RE_TRANSACTION',
      'UF_CRM_RE_TRANSACTION',
      'ufCrm16_1790154808',
      'UF_CRM_1791952650167',
      'UF_CRM_TRANSACTION_TYPE'
    ]);
    let transaction = 'SALE';
    if (txRaw) {
      const s = String(txRaw).toUpperCase();
      if (s === '158' || s === 'RENT' || s.includes('RENT') || s === '2578' || s === '2') {
        transaction = 'RENT';
      } else {
        transaction = 'SALE';
      }
    }

    const segRaw = getValue(item, 'market_segment', [
      'ufCrm16ReMarketSegment',
      'UF_CRM_16_RE_MARKET_SEGMENT',
      'UF_CRM_RE_MARKET_SEGMENT',
      'ufCrm16_1790154808',
      'UF_CRM_1791952650167'
    ]);
    let marketSegment = 'READY';
    if (transaction === 'RENT') {
      marketSegment = 'READY'; // In Dubai, residential/commercial rent is ready stock
    } else if (segRaw) {
      const s = String(segRaw).toUpperCase();
      if (s === '162' || s.includes('OFF_PLAN') || s.includes('OFFPLAN') || s === '2582') {
        marketSegment = 'OFF_PLAN';
      } else if (s === '160' || s.includes('OVERSEAS') || s === '2580') {
        marketSegment = 'OVERSEAS';
      } else {
        marketSegment = 'READY';
      }
    }

    const srcRaw = getValue(item, 'stock_source', [
      'stockSource',
      'ufCrm16ReStockSource',
      'UF_CRM_16_RE_STOCK_SOURCE',
      'UF_CRM_RE_STOCK_SOURCE'
    ]);
    let stockSource = 'OWN';
    if (srcRaw) {
      const s = String(srcRaw).toUpperCase();
      if (s === '164' || s.includes('EXTERNAL') || s === '2584') {
        stockSource = 'EXTERNAL';
      }
    }

    // --------------------------------------------------------------------------
    // 2. Strict Required Checklist Evaluation
    // --------------------------------------------------------------------------
    let totalRequired = 0;
    let satisfiedRequired = 0;

    function checkRequired(fieldLabel, conditionMet, failureMessage) {
      totalRequired++;
      if (conditionMet) {
        satisfiedRequired++;
      } else {
        missing.push(failureMessage || `${fieldLabel} is required`);
      }
    }

    // A. Property Type & Sub-Type
    const propType = getValue(item, 'property_type', [
      'ufCrm16PropertyType',
      'UF_CRM_PROPERTY_TYPE',
      'UF_CRM_1791952050535'
    ]);
    checkRequired('Property Type', !!propType, 'Property Type is required');

    const isCommercial = propType && (
      String(propType).toUpperCase() === 'COMMERCIAL' ||
      String(propType) === '898' ||
      String(propType) === '1766'
    );
    if (isCommercial) {
      const subType = getValue(item, 'property_sub_type', [
        'ufCrm16PropertySubType',
        'UF_CRM_PROPERTY_SUB_TYPE'
      ]);
      checkRequired(
        'Commercial Sub-Type',
        !!subType,
        'Commercial Sub-Type is required for commercial properties (Office, Retail, Warehouse, Showroom)'
      );
    }

    // B. Built-up Area (Sq Ft)
    const bua = parseFloat(getValue(item, 'built_up_area', [
      'ufCrm16Size',
      'UF_CRM_16_SIZE',
      'UF_CRM_BUA',
      'UF_CRM_1791970770635',
      'UF_CRM_TOTALAREA',
      'UF_CRM_1791952136007'
    ]) || 0);
    checkRequired('Built-up Area', bua > 0, 'Built-up Area (Sq Ft) must be greater than 0');

    // C. Bedrooms & Bathrooms (except for Land)
    const isLand = propType && (
      String(propType).toUpperCase() === 'LAND' ||
      String(propType) === '896' ||
      String(propType) === '1764'
    );
    if (!isLand) {
      const bedsRaw = getValue(item, 'bedrooms', [
        'ufCrm16_1791172802',
        'UF_CRM_16_1791172802',
        'UF_CRM_BEDROOMS',
        'UF_CRM_1791966366775',
        'UF_CRM_1791952093551'
      ]);
      const validBedrooms = (
        bedsRaw !== undefined &&
        bedsRaw !== null &&
        bedsRaw !== '' &&
        !isNaN(parseFloat(bedsRaw))
      );
      checkRequired('Bedrooms', validBedrooms, 'Bedrooms is required (use 0 for Studio)');

      const bathsRaw = getValue(item, 'bathrooms', [
        'ufCrm16_1791172818',
        'UF_CRM_16_1791172818',
        'UF_CRM_BATHROOMS',
        'UF_CRM_1791952115167'
      ]);
      const validBaths = (
        bathsRaw !== undefined &&
        bathsRaw !== null &&
        bathsRaw !== '' &&
        !isNaN(parseFloat(bathsRaw)) &&
        parseFloat(bathsRaw) > 0
      );
      checkRequired('Bathrooms', validBaths, 'Bathrooms is required (must be >= 1)');
    }

    // D. Pricing
    const priceVal = parseFloat(getValue(item, 'price', [
      'ufCrm16_1790154936',
      'UF_CRM_16_1790154936',
      'UF_CRM_LISTINGPRICE',
      'UF_CRM_LISTING_PRICE',
      'UF_CRM_1791952467551',
      'opportunity',
      'OPPORTUNITY'
    ]) || 0);
    checkRequired(
      'Price',
      priceVal > 0,
      transaction === 'RENT' ? 'Annual Rent (AED) must be greater than 0' : 'Sale Price (AED) must be greater than 0'
    );

    // E. Layout-Specific Terms
    if (transaction === 'RENT') {
      // Rental listings: Cheques and Available From date (Rental Frequency removed)
      const cheques = getValue(item, 'cheques', [
        'ufCrm16_1791881538',
        'UF_CRM_16_1791881538',
        'UF_CRM_CHEQUES',
        'UF_CRM_1791970849301'
      ]);
      checkRequired('Number of Cheques', !!cheques, 'Number of Cheques is required for rental listings');

      const availFrom = getValue(item, 'available_from', [
        'ufCrm16_1790155057',
        'UF_CRM_16_1790155057',
        'UF_CRM_DATE_AVAILABLE'
      ]);
      checkRequired('Available From Date', !!availFrom, 'Available From date is required for rental listings');
    } else if (marketSegment === 'READY') {
      // Ready Sale listings: Occupancy status
      const occupancy = getValue(item, 'occupancy', [
        'ufCrm16OccupancyStatus',
        'UF_CRM_16_OCCUPANCY_STATUS',
        'UF_CRM_1791970832589'
      ]);
      checkRequired('Occupancy Status', !!occupancy, 'Occupancy Status is required for Ready Sale listings');
    } else if (marketSegment === 'OFF_PLAN') {
      // Off-Plan listings: Expected Handover Date + Payment Plan totaling 100%
      const handoverDate = getValue(item, 'expected_handover_date', [
        'ufCrm16CompletionDate',
        'UF_CRM_16_COMPLETION_DATE',
        'UF_CRM_COMPLETIONDATE'
      ]);
      checkRequired('Expected Handover Date', !!handoverDate, 'Expected Handover Date is required for Off-Plan listings');

      const bPct = parseFloat(getValue(item, 'payment_plan_booking_pct', [
        'ufCrm16RePpBookingPct',
        'UF_CRM_16_RE_PP_BOOKING_PCT',
        'UF_CRM_BOOKING_AMOUNT'
      ]) || 0);
      const cPct = parseFloat(getValue(item, 'payment_plan_construction_pct', [
        'ufCrm16RePpConstructionPct',
        'UF_CRM_16_RE_PP_CONSTRUCTION_PCT',
        'UF_CRM_RE_PP_CONSTRUCTION_PCT'
      ]) || 0);
      const hPct = parseFloat(getValue(item, 'payment_plan_handover_pct', [
        'ufCrm16RePpHandoverPct',
        'UF_CRM_16_RE_PP_HANDOVER_PCT',
        'UF_CRM_HANDOVER_PAYMENT'
      ]) || 0);
      const pPct = parseFloat(getValue(item, 'payment_plan_post_handover_pct', [
        'ufCrm16RePpPostHandoverPct',
        'UF_CRM_16_RE_PP_POST_HANDOVER_PCT'
      ]) || 0);

      const totalPp = Math.round((bPct + cPct + hPct + pPct) * 100) / 100;
      const ppValid = totalPp > 0 && Math.abs(totalPp - 100) <= 0.01;
      checkRequired(
        'Payment Plan 100%',
        ppValid,
        totalPp === 0
          ? 'Payment plan breakdown is required for Off-Plan listings (Booking %, During Construction %, Handover %)'
          : `Payment plan percentages must total exactly 100% (currently ${totalPp}%)`
      );
    }

    // F. Regulatory & Mandate Compliance
    if (marketSegment !== 'OVERSEAS') {
      // UAE listings require valid DLD Trakheesi permit
      const trakheesiNo = getValue(item, 'trakheesi_permit_no', [
        'ufCrm16_1791787455285',
        'UF_CRM_16_1791787455285',
        'UF_CRM_TRAKHEESI_PERMIT_NO',
        'UF_CRM_TRAKHEESI_PERMIT',
        'UF_CRM_1791970864836'
      ]);
      const validTrakheesi = !!trakheesiNo && String(trakheesiNo).trim().length >= 7;
      checkRequired('Trakheesi Permit No', validTrakheesi, '10-digit DLD Trakheesi Permit Number is mandatory for UAE portal publishing');

      if (validTrakheesi) {
        const cleanNo = String(trakheesiNo).trim();
        if (!/^[0-9]{10,12}$/.test(cleanNo) && !cleanNo.startsWith('TRK-') && !cleanNo.startsWith('REP-')) {
          warnings.push(`Trakheesi permit "${cleanNo}" may not match standard 10-digit DLD numeric format`);
        }
      }

      // Permit Expiry Date & Expiration Check
      const permitExpiry = getValue(item, 'permit_expiry', [
        'ufCrm16_1791787502111',
        'UF_CRM_16_1791787502111',
        'UF_CRM_PERMIT_EXPIRY_DATE',
        'UF_CRM_TRAKHEESI_EXPIRY',
        'UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE'
      ]);
      let permitNotExpired = false;
      if (permitExpiry) {
        const expiryDate = new Date(permitExpiry);
        const now = new Date();
        if (!isNaN(expiryDate.getTime())) {
          if (expiryDate >= now) {
            permitNotExpired = true;
            const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) {
              warnings.push(`DLD Trakheesi Permit expires in ${diffDays} day${diffDays === 1 ? '' : 's'}`);
            }
          } else {
            missing.push('DLD Trakheesi Permit has expired — listing cannot be published');
          }
        }
      }
      checkRequired('Permit Expiry Date', permitNotExpired, permitExpiry ? undefined : 'Trakheesi Permit Expiry Date is mandatory');

      // Form A & Expiry: required for Rent & Ready Sale under OWN stock; optional for External; hidden for Off-Plan
      if ((transaction === 'RENT' || marketSegment === 'READY') && stockSource === 'OWN') {
        const formAExpiry = getValue(item, 'form_a_expiry', [
          'ufCrm16FormAExpiryDate',
          'UF_CRM_16_FORM_A_EXPIRY_DATE',
          'UF_CRM_FORM_A_EXPIRY_DATE'
        ]);
        let formANotExpired = false;
        if (formAExpiry) {
          const faDate = new Date(formAExpiry);
          if (!isNaN(faDate.getTime())) {
            if (faDate >= new Date()) {
              formANotExpired = true;
            } else {
              warnings.push('Form A / Mandate agreement has expired');
            }
          }
        }
        checkRequired('Form A Expiry Date', formANotExpired, 'Valid Form A / Mandate Expiry Date is required for direct mandates');

        const signedFormA = getValue(item, 'signed_form_a', [
          'ufCrm16_1791787381785',
          'UF_CRM_16_1791787381785',
          'UF_CRM_FORM_A_DOC'
        ]);
        const hasFormADoc = !!signedFormA && (!Array.isArray(signedFormA) || signedFormA.length > 0);
        checkRequired('Signed Form A Document', hasFormADoc, 'Signed Form A / Mandate document is required for direct mandates');
      }

      // Title deed for Ready Sale (Own and External)
      if (transaction === 'SALE' && marketSegment === 'READY') {
        const titleDeed = getValue(item, 'title_deed', [
          'ufCrm16TitleDeed',
          'UF_CRM_16_TITLE_DEED',
          'UF_CRM_TITLE_DEED'
        ]);
        const hasTitleDeed = !!titleDeed && (!Array.isArray(titleDeed) || titleDeed.length > 0);
        checkRequired('Title Deed Document', hasTitleDeed, 'Title Deed / Oqood copy is required for Ready Sale listings');
      }
    } else {
      // Overseas listing requirements (Country, City, Address, Currency)
      const country = getValue(item, 'country', [
        'ufCrm16_1791172854',
        'UF_CRM_16_1791172854',
        'ufCrm16CountryCode',
        'UF_CRM_COUNTRY',
        'UF_CRM_1791952362575'
      ]);
      checkRequired('Country', !!country && String(country).trim().length > 0, 'Country is required for Overseas listings');

      const city = getValue(item, 'city', [
        'ufCrm16City',
        'UF_CRM_16_CITY',
        'UF_CRM_CITY'
      ]);
      checkRequired('City', !!city && String(city).trim().length > 0, 'City is required for Overseas listings');

      const address = getValue(item, 'address', [
        'ufCrm16Address',
        'UF_CRM_16_ADDRESS',
        'UF_CRM_ADDRESS'
      ]);
      checkRequired('Address', !!address && String(address).trim().length > 0, 'Address / Street is required for Overseas listings');

      const currency = getValue(item, 'currency', [
        'ufCrm16Currency',
        'UF_CRM_16_CURRENCY',
        'UF_CRM_CURRENCY'
      ]);
      checkRequired('Currency', !!currency && String(currency).trim().length > 0, 'Currency is required for Overseas listings');
    }

    // External Stock Partner Agency & Co-Broke
    if (stockSource === 'EXTERNAL') {
      const partner = getValue(item, 'partner_agency', [
        'ufCrm16RePartnerAgency',
        'UF_CRM_16_RE_PARTNER_AGENCY',
        'UF_CRM_PARTNER_AGENCY',
        'COMPANY_ID'
      ]);
      checkRequired('Partner Agency', !!partner, 'Partner Agency is required for External Co-Broke listings');

      const cobrokeSplit = parseFloat(getValue(item, 'cobroke_split_pct', [
        'ufCrm16ReCobrokeSplitPct',
        'UF_CRM_16_RE_COBROKE_SPLIT_PCT',
        'UF_CRM_COBROKE_SPLIT_PCT'
      ]) || 0);
      checkRequired('Co-broke Split %', cobrokeSplit > 0, 'Co-broke Split percentage is required for External listings');
    }

    // G. Media & Marketing Copy Requirements
    const title = getValue(item, 'title', [
      'title',
      'TITLE',
      'UF_CRM_1791952409183',
      'UF_CRM_LISTING_NAME'
    ]);
    checkRequired(
      'Title (EN)',
      !!title && String(title).trim().length >= 10,
      'Listing Title (minimum 10 characters) is required for portal publishing'
    );

    const description = getValue(item, 'description', [
      'ufCrm16Description',
      'UF_CRM_16_DESCRIPTION',
      'COMMENTS',
      'UF_CRM_SUMMARY_DESCRIPTION',
      'UF_CRM_1791952431711'
    ]);
    checkRequired(
      'Description (EN)',
      !!description && String(description).trim().length >= 50,
      'Listing Description (minimum 50 characters) is required for portal publishing'
    );

    const photos = getValue(item, 'photos', [
      'ufCrm16_1791881642219',
      'UF_CRM_16_1791881642219',
      'UF_CRM_PHOTOS',
      'UF_CRM_IMAGES'
    ]);
    let photoCount = 0;
    if (Array.isArray(photos)) {
      photoCount = photos.length;
    } else if (photos && typeof photos === 'object') {
      photoCount = Object.keys(photos).length;
    } else if (typeof photos === 'number') {
      photoCount = photos;
    } else if (typeof photos === 'string' && photos.trim()) {
      photoCount = photos.includes(',') ? photos.split(',').length : 1;
    }
    checkRequired(
      'Photos (Minimum 3)',
      photoCount >= 3,
      `Minimum 3 property photos required for portal syndication (currently ${photoCount})`
    );

    // --------------------------------------------------------------------------
    // 3. Final Readiness Score Calculation (strictly required items only)
    // --------------------------------------------------------------------------
    const score = totalRequired === 0 ? 100 : Math.round((satisfiedRequired / totalRequired) * 100);
    const ready = (missing.length === 0 && score === 100);

    return {
      ready,
      missing,
      warnings,
      score: Math.min(100, Math.max(0, score)),
      summary: {
        transaction,
        marketSegment,
        stockSource,
        totalRequired,
        satisfiedRequired,
        photoCount
      }
    };
  }

  return {
    evaluatePublishReadiness,
    getValue
  };
}));
