/**
 * public/js/matching-listings.js
 * Bitrix24 Matching Listings Tab Engine for Enquiry Smart Process Automation (SPA 1062)
 * 
 * Capabilities:
 *  1. Auto-loads Enquiry data on initialization via crm.item.get
 *  2. Pre-fills editable filter panel and executes automatic match
 *  3. Exact matching for Property Type, Purpose, and Status (Active/Available only)
 *  4. Price matching within budget with optional +/- 10% tolerance toggle
 *  5. Bedrooms matching with Min Beds (>=) or Exact Beds (=) toggle
 *  6. Area / Community substring matching
 *  7. Pagination (50 items/page), sorting (price/newest), and selection
 *  8. Direct CRM Timeline integration via crm.timeline.logmessage.add
 *  9. Direct item opening via BX24.openPath
 */

(function () {
  'use strict';

  // ============================================================================
  // 1. CONFIGURATION: ENTITIES, FIELDS & ENUMERATION MAPPINGS
  // ============================================================================
  const CONFIG = {
    ENQUIRY: {
      entityTypeId: 1062,
      placement: 'CRM_DYNAMIC_1062_DETAIL_TAB',
      fields: {
        id: 'id',
        title: 'title',
        propertyType: 'ufCrm18_1790155720',      // Property Type enum (Apartment, Villa, etc.)
        listingType: 'ufCrm18ListingType',        // Listing Type enum (Sale, Rent, etc.)
        enquiryType: 'ufCrm18EnquiryType',        // Buyer / Tenant enum fallback
        area: 'ufCrm18_1791175311',               // Area text
        community: 'ufCrm18CommunityPropertyfinder', // Community text
        subCommunity: 'ufCrm18SubCommunityPropertyfinder',
        priceMin: 'ufCrm18PriceMin',              // Budget Min
        priceMax: 'ufCrm18PriceMax',              // Budget Max
        monthlyRentMin: 'ufCrm18MonthlyRentMin',
        monthlyRentMax: 'ufCrm18MonthlyRentMax',
        opportunity: 'opportunity',               // Native Bitrix opportunity
        bedroomsMin: 'ufCrm18BedroomsMin',        // Min Bedrooms
        bedroomsMax: 'ufCrm18BedroomsMax',        // Max Bedrooms
        furnished: 'ufCrm18Furnished',            // Furnished flag
        status: 'ufCrm18_1791175765',             // Enquiry status
        recommendedListings: 'ufCrm18_1792649609' // Recommended Listing CRM binding field (UF_CRM_18_1792649609)
      }
    },
    LISTING: {
      entityTypeId: 1058,
      fields: {
        id: 'id',
        title: 'title',
        propertyType: 'ufCrm16PropertyType',      // Property Type enum
        listingType: 'ufCrm16_1790154808',        // Listing Type enum (Sale, Rent, etc.)
        area: 'ufCrm16_1791172692',               // Area string
        community: 'ufCrm16CommunityPropertyfinder',
        subCommunity: 'ufCrm16SubCommunityPropertyfinder',
        price: 'ufCrm16_1790154936',             // Listing Price (native Bitrix field)
        listingPrice: 'ufCrm16_1790154936',
        opportunity: 'opportunity',               // Native Opportunity
        currencyId: 'currencyId',
        bedrooms: 'ufCrm16_1791172802',           // Bedrooms count (double)
        furnished: 'ufCrm16Furnished',            // Furnished enum
        status: 'ufCrm16Status',                  // Listing status enum
        stageId: 'stageId'
      }
    },
    ENUMS: {
      PROPERTY_TYPES: [
        { label: 'Apartment', enquiryId: 2530, listingId: 886 },
        { label: 'Villa', enquiryId: 2528, listingId: 888 },
        { label: 'Townhouse', enquiryId: 2526, listingId: 890 },
        { label: 'Penthouse', enquiryId: 2524, listingId: 892 },
        { label: 'Duplex', enquiryId: 2522, listingId: 894 },
        { label: 'Land', enquiryId: 2520, listingId: 896 },
        { label: 'Commercial', enquiryId: 200, listingId: 898 },
        { label: 'Office', enquiryId: 198, listingId: 900 },
        { label: 'Retail', enquiryId: 196, listingId: 902 }
      ],
      LISTING_TYPES: [
        { label: 'Sale', enquiryId: 1246, listingId: 158 },
        { label: 'Rent', enquiryId: 1248, listingId: 160 },
        { label: 'Off-Plan', enquiryId: 1250, listingId: 162 },
        { label: 'Commercial Sale', enquiryId: 1252, listingId: 164 },
        { label: 'Commercial Rent', enquiryId: 1254, listingId: 166 }
      ],
      FURNISHED: [
        { label: 'Furnished', listingId: 736 },
        { label: 'Semi-Furnished', listingId: 738 },
        { label: 'Unfurnished', listingId: 740 }
      ],
      AVAILABLE_STATUS_ID: 924 // Active status in Listing SPA
    }
  };

  // State Management
  let currentEnquiryId = null;
  let currentEnquiry = null;
  let autoFilledFilters = {};
  let currentResults = [];
  let selectedListingIds = new Set();
  let currentPageStart = 0;
  let totalListingsCount = 0;
  let hasNextPage = false;
  let isManualSearch = false;

  // DOM Elements
  const enquiryTitleEl = document.getElementById('enquiry-title-display');
  const searchModeBadge = document.getElementById('search-mode-badge');
  const totalCountBadge = document.getElementById('total-count-badge');
  const filterForm = document.getElementById('filter-form');
  const btnSearch = document.getElementById('btn-search');
  const btnReset = document.getElementById('btn-reset');
  const btnSaveRecommendation = document.getElementById('btn-save-recommendation');
  const btnSendTimeline = document.getElementById('btn-send-timeline');
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  const selectedCountText = document.getElementById('selected-count-text');
  const sortSelect = document.getElementById('sort-select');
  const listingsContainer = document.getElementById('listings-container');
  const paginationBar = document.getElementById('pagination-bar');
  const pageIndicator = document.getElementById('page-indicator');
  const btnPrevPage = document.getElementById('btn-prev-page');
  const btnNextPage = document.getElementById('btn-next-page');

  // Filter Input Elements
  const inputPropType = document.getElementById('filter-property-type');
  const inputListingType = document.getElementById('filter-listing-type');
  const inputArea = document.getElementById('filter-area');
  const inputBedrooms = document.getElementById('filter-bedrooms');
  const inputPriceMin = document.getElementById('filter-price-min');
  const inputPriceMax = document.getElementById('filter-price-max');
  const inputFurnished = document.getElementById('filter-furnished');
  const toggleTolerance = document.getElementById('toggle-tolerance');
  const toggleExactBeds = document.getElementById('toggle-exact-beds');

  // ============================================================================
  // 2. UTILITY & BITRIX24 WRAPPER HELPERS
  // ============================================================================

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(amount, currency = 'AED') {
    const num = parseFloat(amount);
    if (isNaN(num)) return `0 ${currency}`;
    return `${num.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = escapeHtml(message);
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function fitWindow() {
    if (window.BX24 && typeof window.BX24.fitWindow === 'function') {
      window.BX24.fitWindow();
    }
  }

  function isEmbeddedInCrm() {
    try {
      return window.self !== window.top;
    } catch (_) {
      return true;
    }
  }

  function renderCrmLockoutScreen() {
    document.documentElement.classList.add('crm-lockout-active');
    const shield = document.getElementById('crm-lockout-shield');
    if (shield) shield.style.display = 'flex';
    const container = document.querySelector('.matching-container');
    if (container) container.style.display = 'none';
  }

  function getCrmAuthHeaders() {
    const headers = {
      'X-Requested-With': 'Bitrix24-CRM-App'
    };
    if (window.BX24 && typeof window.BX24.getAuth === 'function') {
      const auth = window.BX24.getAuth();
      if (auth && auth.access_token) {
        headers['X-Bitrix-Auth'] = auth.access_token;
        headers['X-Bitrix-Domain'] = auth.domain || 'csl.bitrix24.com';
      }
    }
    return headers;
  }

  /**
   * Promise-wrapped BX24.callMethod helper
   */
  function callMethod(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!isEmbeddedInCrm()) {
        renderCrmLockoutScreen();
        return reject(new Error('Application is only accessible within Bitrix24 CRM'));
      }

      if (window.BX24 && typeof window.BX24.callMethod === 'function') {
        window.BX24.callMethod(method, params, function (result) {
          if (result.error()) {
            reject(new Error(result.error().toString()));
          } else {
            resolve({
              data: result.data(),
              next: typeof result.next === 'function' ? result.next() : null,
              total: typeof result.total === 'function' ? result.total() : 0,
              rawResult: result
            });
          }
        });
      } else {
        // Fallback to local server proxy in non-iframe/dev mode
        fetch('/api/b24/' + method, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getCrmAuthHeaders()
          },
          body: JSON.stringify(params)
        })
          .then(res => res.json())
          .then(json => {
            if (json.error) reject(new Error(json.error_description || json.error));
            else resolve({ data: json.result, next: json.next || null, total: json.total || 0, rawResult: json });
          })
          .catch(reject);
      }
    });
  }

  /**
   * Promise-wrapped BX24.callBatch helper
   */
  function callBatch(calls) {
    return new Promise((resolve, reject) => {
      if (window.BX24 && typeof window.BX24.callBatch === 'function') {
        window.BX24.callBatch(calls, function (results) {
          resolve(results);
        });
      } else {
        reject(new Error('BX24.callBatch is only available inside Bitrix24 application context'));
      }
    });
  }

  /**
   * Open CRM item in Bitrix24 slider
   */
  function openListingInBitrix(listingId) {
    const path = `/crm/type/${CONFIG.LISTING.entityTypeId}/details/${listingId}/`;
    if (window.BX24 && typeof window.BX24.openPath === 'function') {
      window.BX24.openPath(path);
    } else {
      window.open(path, '_blank');
    }
  }

  /**
   * Resolve current Enquiry ID from placement options or URL params
   */
  function resolveEnquiryId() {
    if (window.BX24 && typeof window.BX24.placement === 'object') {
      try {
        const placementInfo = window.BX24.placement.info();
        const options = placementInfo?.options;
        if (options) {
          if (typeof options === 'string') {
            try {
              const parsed = JSON.parse(options);
              const id = parsed.ID || parsed.id || parsed.ENTITY_ID;
              if (id) return id;
            } catch (e) {}
          } else if (typeof options === 'object') {
            const id = options.ID || options.id || options.ENTITY_ID;
            if (id) return id;
          }
        }
      } catch (e) {}
    }

    const urlParams = new URLSearchParams(window.location.search);
    const fromParams = urlParams.get('ID') || urlParams.get('id') || urlParams.get('enquiryId') || urlParams.get('ENTITY_ID');
    if (fromParams) return fromParams;

    if (document.referrer) {
      const match = document.referrer.match(/\/details\/(\d+)\//);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  // ============================================================================
  // 3. ENUMERATION TRANSLATION HELPERS
  // ============================================================================

  function mapEnquiryPropTypeToListing(enquiryVal) {
    if (!enquiryVal) return '';
    const num = parseInt(enquiryVal, 10);
    const matched = CONFIG.ENUMS.PROPERTY_TYPES.find(p => p.enquiryId === num || String(p.label).toLowerCase() === String(enquiryVal).toLowerCase());
    return matched ? String(matched.listingId) : '';
  }

  function mapListingPropTypeToLabel(listingVal) {
    if (!listingVal) return 'Unknown';
    const num = parseInt(listingVal, 10);
    const matched = CONFIG.ENUMS.PROPERTY_TYPES.find(p => p.listingId === num || String(p.label).toLowerCase() === String(listingVal).toLowerCase());
    return matched ? matched.label : String(listingVal);
  }

  function mapEnquiryListingTypeToListing(enquiryVal) {
    if (!enquiryVal) return '';
    const num = parseInt(enquiryVal, 10);
    const matched = CONFIG.ENUMS.LISTING_TYPES.find(l => l.enquiryId === num || String(l.label).toLowerCase() === String(enquiryVal).toLowerCase());
    return matched ? String(matched.listingId) : '';
  }

  function mapListingTypeToLabel(listingVal) {
    if (!listingVal) return 'Standard';
    const num = parseInt(listingVal, 10);
    const matched = CONFIG.ENUMS.LISTING_TYPES.find(l => l.listingId === num || String(l.label).toLowerCase() === String(listingVal).toLowerCase());
    return matched ? matched.label : String(listingVal);
  }

  function mapListingFurnishedToLabel(furnishedVal) {
    if (!furnishedVal) return 'Not Specified';
    const num = parseInt(furnishedVal, 10);
    const matched = CONFIG.ENUMS.FURNISHED.find(f => f.listingId === num);
    return matched ? matched.label : 'Specified';
  }

  function parseMoneyValue(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parts = val.split('|');
      const num = parseFloat(parts[0]);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  // ============================================================================
  // 4. POPULATE FILTER FORM CONTROLS
  // ============================================================================

  function populateDropdownOptions() {
    // 1. Property Type Dropdown
    inputPropType.innerHTML = '<option value="">-- All Property Types --</option>';
    CONFIG.ENUMS.PROPERTY_TYPES.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.listingId;
      opt.textContent = item.label;
      inputPropType.appendChild(opt);
    });

    // 2. Listing Type / Purpose Dropdown
    inputListingType.innerHTML = '<option value="">-- All Purposes (Sale/Rent) --</option>';
    CONFIG.ENUMS.LISTING_TYPES.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.listingId;
      opt.textContent = item.label;
      inputListingType.appendChild(opt);
    });

    // 3. Furnished Dropdown
    inputFurnished.innerHTML = '<option value="">-- Any Furnished Status --</option>';
    CONFIG.ENUMS.FURNISHED.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.listingId;
      opt.textContent = item.label;
      inputFurnished.appendChild(opt);
    });
  }

  // ============================================================================
  // 5. ENQUIRY LOADING & INITIAL AUTO-MATCH
  // ============================================================================

  async function loadEnquiryAndInit() {
    if (!isEmbeddedInCrm()) {
      console.warn('[SECURITY] Standalone URL access blocked. App is only accessible inside Bitrix24 CRM.');
      renderCrmLockoutScreen();
      return;
    }

    populateDropdownOptions();

    currentEnquiryId = resolveEnquiryId();

    if (!currentEnquiryId) {
      try {
        const latestRes = await callMethod('crm.item.list', {
          entityTypeId: CONFIG.ENQUIRY.entityTypeId,
          order: { id: 'DESC' },
          start: 0
        });
        const latestItems = latestRes.data?.items || (Array.isArray(latestRes.data) ? latestRes.data : []);
        if (latestItems.length > 0) {
          currentEnquiryId = latestItems[0].id;
        }
      } catch (e) {
        console.warn('Fallback latest enquiry lookup notice:', e);
      }
    }

    if (!currentEnquiryId) {
      renderErrorState('Missing Enquiry ID', 'Could not detect an Enquiry item ID. Open this tab inside an Enquiry detail card, or provide ?ID=254 in URL for testing.');
      return;
    }

    renderLoadingState('Loading enquiry criteria from Bitrix24...');

    try {
      const res = await callMethod('crm.item.get', {
        entityTypeId: CONFIG.ENQUIRY.entityTypeId,
        id: currentEnquiryId
      });

      const item = res.data?.item || res.data;
      if (!item) {
        throw new Error(`Enquiry #${currentEnquiryId} not found in Bitrix24`);
      }

      currentEnquiry = item;
      enquiryTitleEl.textContent = `Enquiry #${item.id}: ${item.title || 'Untitled'}`;

      // Extract criteria from Enquiry fields
      const eFields = CONFIG.ENQUIRY.fields;
      const rawPropType = item[eFields.propertyType];
      const rawListingType = item[eFields.listingType];
      const rawArea = item[eFields.area] || item[eFields.community] || '';
      const rawPriceMin = parseMoneyValue(item[eFields.priceMin]) || parseMoneyValue(item[eFields.monthlyRentMin]);
      const rawPriceMax = parseMoneyValue(item[eFields.priceMax]) || parseMoneyValue(item[eFields.monthlyRentMax]) || parseMoneyValue(item[eFields.opportunity]);
      const rawBeds = item[eFields.bedroomsMin] || item[eFields.bedroomsMax];

      autoFilledFilters = {
        propertyType: mapEnquiryPropTypeToListing(rawPropType),
        listingType: mapEnquiryListingTypeToListing(rawListingType),
        area: rawArea ? String(rawArea).split(';')[0].split(',')[0].trim() : '',
        bedrooms: rawBeds ? parseInt(rawBeds, 10) : '',
        priceMin: rawPriceMin !== null ? rawPriceMin : '',
        priceMax: rawPriceMax !== null ? rawPriceMax : '',
        furnished: '',
        tolerance: true,
        exactBeds: false
      };

      applyFiltersToForm(autoFilledFilters);
      isManualSearch = false;
      updateSearchModeBadge();

      // Automatically search matching listings
      await searchListings(0);
    } catch (err) {
      console.error('[MATCHING] Failed to load enquiry:', err);
      renderErrorState('Failed to load Enquiry', err.message);
    }
  }

  function applyFiltersToForm(filters) {
    inputPropType.value = filters.propertyType || '';
    inputListingType.value = filters.listingType || '';
    inputArea.value = filters.area || '';
    inputBedrooms.value = filters.bedrooms !== undefined && filters.bedrooms !== null ? filters.bedrooms : '';
    inputPriceMin.value = filters.priceMin !== undefined && filters.priceMin !== null ? filters.priceMin : '';
    inputPriceMax.value = filters.priceMax !== undefined && filters.priceMax !== null ? filters.priceMax : '';
    inputFurnished.value = filters.furnished || '';
    toggleTolerance.checked = !!filters.tolerance;
    toggleExactBeds.checked = !!filters.exactBeds;
  }

  function getFiltersFromForm() {
    return {
      propertyType: inputPropType.value,
      listingType: inputListingType.value,
      area: inputArea.value.trim(),
      bedrooms: inputBedrooms.value !== '' ? parseInt(inputBedrooms.value, 10) : null,
      priceMin: inputPriceMin.value !== '' ? parseFloat(inputPriceMin.value) : null,
      priceMax: inputPriceMax.value !== '' ? parseFloat(inputPriceMax.value) : null,
      furnished: inputFurnished.value,
      tolerance: toggleTolerance.checked,
      exactBeds: toggleExactBeds.checked
    };
  }

  function updateSearchModeBadge() {
    if (isManualSearch) {
      searchModeBadge.className = 'badge badge-manual';
      searchModeBadge.textContent = 'Manual search';
    } else {
      searchModeBadge.className = 'badge badge-auto';
      searchModeBadge.textContent = 'Auto-matched from enquiry';
    }
  }

  // ============================================================================
  // 6. LISTINGS SEARCH & MATCHING ALGORITHM
  // ============================================================================

  async function searchListings(pageStart = 0) {
    currentPageStart = pageStart;
    renderLoadingState('Searching listings in Bitrix24...');

    const filters = getFiltersFromForm();
    const lFields = CONFIG.LISTING.fields;

    // 1. Status: Filter available/active listings
    // Keep AVAILABLE_STATUS_ID in CONFIG and query active or unassigned listings
    const restFilter = {};

    // 2. Exact match for Property Type if provided
    if (filters.propertyType) {
      restFilter['=' + lFields.propertyType] = parseInt(filters.propertyType, 10);
    }

    // 3. Exact match for Purpose / Listing Type (Sale / Rent) if provided
    if (filters.listingType) {
      restFilter['=' + lFields.listingType] = parseInt(filters.listingType, 10);
    }

    // 4. Furnished match if provided
    if (filters.furnished) {
      restFilter['=' + lFields.furnished] = parseInt(filters.furnished, 10);
    }

    // 5. Query parameters with pagination
    const queryParams = {
      entityTypeId: CONFIG.LISTING.entityTypeId,
      filter: restFilter,
      select: [
        lFields.id,
        lFields.title,
        lFields.propertyType,
        lFields.listingType,
        lFields.price,
        lFields.listingPrice,
        lFields.opportunity,
        lFields.currencyId,
        lFields.bedrooms,
        lFields.area,
        lFields.community,
        lFields.furnished,
        lFields.status,
        lFields.stageId
      ],
      start: pageStart
    };

    // Apply sorting
    const sortVal = sortSelect.value;
    if (sortVal === 'price_asc') {
      queryParams.order = { [lFields.price]: 'ASC', [lFields.opportunity]: 'ASC' };
    } else if (sortVal === 'price_desc') {
      queryParams.order = { [lFields.price]: 'DESC', [lFields.opportunity]: 'DESC' };
    } else {
      queryParams.order = { [lFields.id]: 'DESC' }; // Newest first
    }

    try {
      const res = await callMethod('crm.item.list', queryParams);
      const rawItems = res.data?.items || (Array.isArray(res.data) ? res.data : []);
      totalListingsCount = res.total || rawItems.length;
      hasNextPage = Boolean(res.next);

      // Perform Client-side Refinements:
      // (Budget Tolerance, Min/Exact Bedrooms, Status check, and Substring Area matching)
      const matchedItems = rawItems.filter(item => {
        // Status check: allow Active (AVAILABLE_STATUS_ID: 924) or unassigned/null status
        const itemStatus = item[lFields.status];
        if (itemStatus && parseInt(itemStatus, 10) !== CONFIG.ENUMS.AVAILABLE_STATUS_ID && String(itemStatus) !== '924') {
          return false;
        }

        // Price / Budget check
        const itemPrice = parseMoneyValue(item[lFields.price]) || parseMoneyValue(item[lFields.listingPrice]) || parseMoneyValue(item[lFields.opportunity]) || 0;
        let pMin = filters.priceMin;
        let pMax = filters.priceMax;

        if (filters.tolerance) {
          if (pMin !== null) pMin = Math.max(0, pMin * 0.9); // -10% tolerance
          if (pMax !== null) pMax = pMax * 1.1;             // +10% tolerance
        }

        if (pMin !== null && itemPrice > 0 && itemPrice < pMin) return false;
        if (pMax !== null && itemPrice > 0 && itemPrice > pMax) return false;

        // Bedrooms check
        if (filters.bedrooms !== null) {
          const itemBeds = parseFloat(item[lFields.bedrooms]) || 0;
          if (filters.exactBeds) {
            if (itemBeds !== filters.bedrooms) return false;
          } else {
            if (itemBeds < filters.bedrooms) return false;
          }
        }

        // Area / Community substring match (checking area field, community field, and listing title)
        if (filters.area) {
          const itemArea = (item[lFields.area] || '').toLowerCase();
          const itemCommunity = (item[lFields.community] || '').toLowerCase();
          const itemTitle = (item.title || '').toLowerCase();
          const qArea = filters.area.toLowerCase().trim();
          const areaTokens = qArea.split(/[\s,;]+/).filter(Boolean);
          const matchesToken = areaTokens.some(token => 
            itemArea.includes(token) || itemCommunity.includes(token) || itemTitle.includes(token)
          );
          if (!matchesToken && itemArea && !itemArea.includes(qArea) && !itemCommunity.includes(qArea) && !itemTitle.includes(qArea)) {
            return false;
          }
        }

        return true;
      });

      currentResults = matchedItems;
      renderResults(matchedItems);
      renderPagination(pageStart, matchedItems.length);
      updateTotalBadge(matchedItems.length);
      updateSelectedCount();
    } catch (err) {
      console.error('[MATCHING] Search error:', err);
      renderErrorState('Search Query Failed', err.message);
    }
  }

  // ============================================================================
  // 7. RENDERING LISTINGS & STATES
  // ============================================================================

  function renderLoadingState(text = 'Loading listings...') {
    listingsContainer.innerHTML = `
      <div class="state-box">
        <div class="spinner"></div>
        <div class="state-title">${escapeHtml(text)}</div>
        <div class="state-desc">Fetching real estate listings from Bitrix24 CRM...</div>
      </div>
    `;
    paginationBar.style.display = 'none';
    fitWindow();
  }

  function renderErrorState(title, message) {
    listingsContainer.innerHTML = `
      <div class="state-box" style="border-color: var(--b24-danger-light);">
        <div class="state-icon">⚠️</div>
        <div class="state-title" style="color: var(--b24-danger);">${escapeHtml(title)}</div>
        <div class="state-desc">${escapeHtml(message)}</div>
        <button type="button" class="btn btn-secondary" onclick="window.__MATCHING_APP__.retrySearch()">
          🔄 Try Again
        </button>
      </div>
    `;
    paginationBar.style.display = 'none';
    fitWindow();
  }

  function renderEmptyState() {
    listingsContainer.innerHTML = `
      <div class="state-box">
        <div class="state-icon">🔍</div>
        <div class="state-title">No Exact Matching Listings Found</div>
        <div class="state-desc">
          No listings currently meet all strict criteria (Property Type, Purpose, Budget range, and Area simultaneously).<br>
          Use the quick buttons below to expand the search or view all available properties:
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 16px;">
          <button type="button" class="btn btn-secondary" onclick="window.__MATCHING_APP__.clearPriceFilter()">
            💰 Any Price / Budget
          </button>
          <button type="button" class="btn btn-secondary" onclick="window.__MATCHING_APP__.clearAreaFilter()">
            📍 Any Area / Location
          </button>
          <button type="button" class="btn btn-primary" onclick="window.__MATCHING_APP__.showAllListings()">
            🏢 Show All Available Listings
          </button>
          <button type="button" class="btn btn-secondary" onclick="window.__MATCHING_APP__.resetToEnquiry()">
            ↺ Reset to Enquiry Data
          </button>
        </div>
      </div>
    `;
    paginationBar.style.display = 'none';
    fitWindow();
  }

  function renderResults(items) {
    if (!items || items.length === 0) {
      renderEmptyState();
      return;
    }

    const lFields = CONFIG.LISTING.fields;
    const grid = document.createElement('div');
    grid.className = 'listings-grid';

    items.forEach(item => {
      const isSelected = selectedListingIds.has(item.id);
      const card = document.createElement('div');
      card.className = `listing-card ${isSelected ? 'selected' : ''}`;
      card.dataset.id = item.id;

      const priceVal = parseMoneyValue(item[lFields.price]) || parseMoneyValue(item[lFields.listingPrice]) || parseMoneyValue(item[lFields.opportunity]) || 0;
      const currency = item[lFields.currencyId] || 'AED';
      const propTypeLabel = mapListingPropTypeToLabel(item[lFields.propertyType]);
      const listingTypeLabel = mapListingTypeToLabel(item[lFields.listingType]);
      const beds = parseFloat(item[lFields.bedrooms]) || 0;
      const area = item[lFields.area] || item[lFields.community] || 'Downtown Dubai';
      const furnishedLabel = mapListingFurnishedToLabel(item[lFields.furnished]);
      const recList = currentEnquiry?.[CONFIG.ENQUIRY.fields.recommendedListings] || currentEnquiry?.ufCrm18_1792649609 || [];
      const isAlreadyRecommended = Array.isArray(recList) && recList.map(String).includes(String(item.id));

      card.innerHTML = `
        <div class="card-top-bar">
          <input type="checkbox" class="card-select-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''} aria-label="Select listing">
          <div class="card-title-group">
            <div class="card-title">
              ${escapeHtml(item.title || `Listing #${item.id}`)}
              ${isAlreadyRecommended ? '<span class="badge badge-recommended" title="Already in Recommended Listing field">⭐ Recommended</span>' : ''}
            </div>
            <span class="card-id-tag">ID: #${item.id} • ${escapeHtml(propTypeLabel)} (${escapeHtml(listingTypeLabel)})</span>
          </div>
        </div>

        <div class="card-price-row">
          <div>
            <span class="price-main">${formatMoney(priceVal, currency)}</span>
          </div>
          <span class="card-pill-status status-active">Active</span>
        </div>

        <div class="card-specs-grid">
          <div class="spec-item">
            <span class="spec-icon">🛏️</span>
            <span class="spec-label">Beds:</span>
            <span class="spec-val">${beds > 0 ? beds : 'Studio / Any'}</span>
          </div>
          <div class="spec-item">
            <span class="spec-icon">📍</span>
            <span class="spec-label">Area:</span>
            <span class="spec-val">${escapeHtml(area)}</span>
          </div>
          <div class="spec-item">
            <span class="spec-icon">🛋️</span>
            <span class="spec-label">Furnished:</span>
            <span class="spec-val">${escapeHtml(furnishedLabel)}</span>
          </div>
          <div class="spec-item">
            <span class="spec-icon">🏷️</span>
            <span class="spec-label">Type:</span>
            <span class="spec-val">${escapeHtml(propTypeLabel)}</span>
          </div>
        </div>

        <div class="card-footer">
          <button type="button" class="btn btn-secondary btn-compact btn-view-listing" data-id="${item.id}">
            🔗 Open in Bitrix24
          </button>
          <span style="font-size: 11px; color: var(--b24-text-muted);">
            ${listingTypeLabel === 'Rent' ? 'Rental Property' : 'For Sale'}
          </span>
        </div>
      `;

      // Event listener for checkbox
      const checkbox = card.querySelector('.card-select-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleListingSelection(item.id, checkbox.checked);
        card.classList.toggle('selected', checkbox.checked);
      });

      // Event listener for opening item
      const viewBtn = card.querySelector('.btn-view-listing');
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openListingInBitrix(item.id);
      });

      grid.appendChild(card);
    });

    listingsContainer.innerHTML = '';
    listingsContainer.appendChild(grid);
    fitWindow();
  }

  function renderPagination(start, currentCount) {
    if (totalListingsCount <= 50 && start === 0) {
      paginationBar.style.display = 'none';
      return;
    }

    paginationBar.style.display = 'flex';
    const pageNum = Math.floor(start / 50) + 1;
    pageIndicator.textContent = `Page ${pageNum} (Showing ${currentCount} listings)`;

    btnPrevPage.disabled = start === 0;
    btnNextPage.disabled = !hasNextPage;
  }

  function updateTotalBadge(count) {
    totalCountBadge.textContent = `${count} matching listing${count === 1 ? '' : 's'}`;
  }

  function updateSelectedCount() {
    const count = selectedListingIds.size;
    selectedCountText.textContent = `${count} selected`;
    
    if (btnSaveRecommendation) {
      btnSaveRecommendation.disabled = count === 0;
      btnSaveRecommendation.textContent = count > 0 ? `⭐ Save as recommendation (${count})` : '⭐ Save as recommendation';
    }

    if (btnSendTimeline) {
      btnSendTimeline.disabled = count === 0;
      btnSendTimeline.textContent = count > 0 ? `📨 Send (${count}) to Timeline` : '📨 Send to Timeline';
    }

    // Update select-all checkbox state
    if (currentResults.length > 0 && currentResults.every(r => selectedListingIds.has(r.id))) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else if (count > 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
  }

  function toggleListingSelection(id, isSelected) {
    if (isSelected) {
      selectedListingIds.add(id);
    } else {
      selectedListingIds.delete(id);
    }
    updateSelectedCount();
  }

  // ============================================================================
  // 8. ENQUIRY RECOMMENDATIONS FIELD INTEGRATION
  //    (Directly updates UF_CRM_18_1792649609 on Enquiry item - no activities)
  // ============================================================================

  const ENQUIRY_TYPE = CONFIG.ENQUIRY.entityTypeId; // 1062
  const LISTING_TYPE = CONFIG.LISTING.entityTypeId; // 1058
  const RECOMMENDATION_FIELD = CONFIG.ENQUIRY.fields.recommendedListings; // 'ufCrm18_1792649609'
  const call = callMethod;

  /**
   * Adds recommended listings directly to Enquiry field UF_CRM_18_1792649609
   * (Updates only this field via crm.item.update - no activities or timeline logmessages)
   */
  async function addRecommendation(enquiryId, listings) {
    const ids = (listings || []).map(l => (typeof l === 'object' && l !== null ? String(l.id) : String(l)));

    let existing = [];
    try {
      const res = await callMethod('crm.item.get', {
        entityTypeId: ENQUIRY_TYPE,
        id: enquiryId
      });
      const item = res.data?.item || res.data;
      const cur = item?.[RECOMMENDATION_FIELD] || item?.ufCrm18_1792649609;
      if (Array.isArray(cur)) {
        existing = cur.map(String);
      } else if (cur) {
        existing = [String(cur)];
      }
    } catch (e) {
      const cur = currentEnquiry?.[RECOMMENDATION_FIELD] || currentEnquiry?.ufCrm18_1792649609;
      if (Array.isArray(cur)) {
        existing = cur.map(String);
      } else if (cur) {
        existing = [String(cur)];
      }
    }

    const merged = Array.from(new Set([...existing, ...ids]));

    const updateRes = await callMethod('crm.item.update', {
      entityTypeId: ENQUIRY_TYPE,
      id: enquiryId,
      fields: {
        [RECOMMENDATION_FIELD]: merged
      }
    });

    if (currentEnquiry && currentEnquiry.id == enquiryId) {
      currentEnquiry[RECOMMENDATION_FIELD] = merged;
      currentEnquiry.ufCrm18_1792649609 = merged;
    }

    return updateRes;
  }

  async function saveSelectedRecommendations() {
    if (selectedListingIds.size === 0) {
      showToast('Select at least one listing to save as recommendation', 'warning');
      return;
    }

    if (!currentEnquiryId) {
      showToast('Error: No active enquiry identified', 'error');
      return;
    }

    const selectedIds = Array.from(selectedListingIds).map(String);

    if (btnSaveRecommendation) {
      btnSaveRecommendation.disabled = true;
      btnSaveRecommendation.textContent = 'Saving to Enquiry...';
    }

    try {
      // Updates UF_CRM_18_1792649609 directly via crm.item.update (no activity)
      await addRecommendation(currentEnquiryId, selectedIds);

      showToast(`⭐ Added ${selectedIds.length} recommended listing(s) to Enquiry field!`, 'success');

      selectedListingIds.clear();
      updateSelectedCount();

      // Refresh card styles and re-render to update recommended badges
      document.querySelectorAll('.listing-card').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.card-select-checkbox').forEach(cb => cb.checked = false);

      if (currentResults && currentResults.length > 0) {
        renderResults(currentResults);
      }
    } catch (err) {
      console.error('[RECOMMENDATION] Failed to update recommended listings field:', err);
      showToast(`Failed to save recommendations: ${err.message}`, 'error');
    } finally {
      if (btnSaveRecommendation) {
        btnSaveRecommendation.disabled = selectedListingIds.size === 0;
        btnSaveRecommendation.textContent = selectedListingIds.size > 0 
          ? `⭐ Save as recommendation (${selectedListingIds.size})` 
          : '⭐ Save as recommendation';
      }
      fitWindow();
    }
  }

  // Alias for backward compatibility
  const sendSelectedToTimeline = saveSelectedRecommendations;

  // ============================================================================
  // 9. EVENT LISTENERS
  // ============================================================================

  // Search button
  btnSearch.addEventListener('click', (e) => {
    e.preventDefault();
    isManualSearch = true;
    updateSearchModeBadge();
    searchListings(0);
  });

  // Reset to Enquiry Data
  btnReset.addEventListener('click', () => {
    applyFiltersToForm(autoFilledFilters);
    isManualSearch = false;
    updateSearchModeBadge();
    searchListings(0);
    showToast('Filters restored to Enquiry criteria', 'info');
  });

  // Select all checkbox
  selectAllCheckbox.addEventListener('change', () => {
    const shouldSelect = selectAllCheckbox.checked;
    currentResults.forEach(item => {
      toggleListingSelection(item.id, shouldSelect);
    });
    document.querySelectorAll('.card-select-checkbox').forEach(cb => cb.checked = shouldSelect);
    document.querySelectorAll('.listing-card').forEach(card => card.classList.toggle('selected', shouldSelect));
    updateSelectedCount();
  });

  // Save as recommendation button (Configurable Activity)
  if (btnSaveRecommendation) {
    btnSaveRecommendation.addEventListener('click', saveSelectedRecommendations);
  }

  // Timeline button (legacy / fallback)
  if (btnSendTimeline) {
    btnSendTimeline.addEventListener('click', sendSelectedToTimeline);
  }

  // Sorting
  sortSelect.addEventListener('change', () => {
    searchListings(0);
  });

  // Pagination Prev / Next
  btnPrevPage.addEventListener('click', () => {
    if (currentPageStart >= 50) {
      searchListings(currentPageStart - 50);
    }
  });

  btnNextPage.addEventListener('click', () => {
    if (hasNextPage) {
      searchListings(currentPageStart + 50);
    }
  });

  // Filter input listeners for real-time manual search indicator
  [inputPropType, inputListingType, inputArea, inputBedrooms, inputPriceMin, inputPriceMax, inputFurnished, toggleTolerance, toggleExactBeds].forEach(el => {
    el.addEventListener('change', () => {
      isManualSearch = true;
      updateSearchModeBadge();
    });
  });

  // ============================================================================
  // 10. PUBLIC API FOR INLINE ACTIONS
  // ============================================================================
  window.__MATCHING_APP__ = {
    addRecommendation,
    saveSelectedRecommendations,
    sendSelectedToTimeline,
    retrySearch: () => searchListings(currentPageStart),
    resetToEnquiry: () => btnReset.click(),
    clearPriceFilter: () => {
      inputPriceMin.value = '';
      inputPriceMax.value = '';
      isManualSearch = true;
      updateSearchModeBadge();
      searchListings(0);
    },
    clearAreaFilter: () => {
      inputArea.value = '';
      isManualSearch = true;
      updateSearchModeBadge();
      searchListings(0);
    },
    relaxFilters: () => {
      toggleTolerance.checked = true;
      toggleExactBeds.checked = false;
      inputArea.value = '';
      inputPriceMin.value = '';
      inputPriceMax.value = '';
      isManualSearch = true;
      updateSearchModeBadge();
      searchListings(0);
    },
    showAllListings: () => {
      inputPropType.value = '';
      inputListingType.value = '';
      inputArea.value = '';
      inputBedrooms.value = '';
      inputPriceMin.value = '';
      inputPriceMax.value = '';
      inputFurnished.value = '';
      isManualSearch = true;
      updateSearchModeBadge();
      searchListings(0);
    }
  };

  // ============================================================================
  // 11. BOOTSTRAP INITIALIZATION
  // ============================================================================
  if (!isEmbeddedInCrm()) {
    renderCrmLockoutScreen();
  } else if (window.BX24 && typeof window.BX24.init === 'function') {
    window.BX24.init(function () {
      loadEnquiryAndInit();
    });
  } else {
    document.addEventListener('DOMContentLoaded', loadEnquiryAndInit);
  }

})();
