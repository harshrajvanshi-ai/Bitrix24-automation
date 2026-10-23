/**
 * public/js/listing-details.js
 * Bitrix24 Listing Details Tab Engine for Listing Smart Process Automation (SPA 1058)
 * Minimalist, Compact & In-Window File Previews
 * 
 * Capabilities:
 *  1. Automatic entity loading via Bitrix24 SDK or REST fallback
 *  2. 4 Dynamic Tailored Layouts driven strictly by UF_CRM_16_1790154808:
 *     - External Stock
 *     - Off-plan
 *     - Overseas Sale
 *     - Rent
 *  3. Precise field visibility matrix (show / opt / hide) and contextual labels
 *  4. In-Window Interactive Media & File Previews (rendered right in the page):
 *     - Inline image viewer viewport right in the card (no external tabs or windows)
 *     - Instant FileReader client previews for newly uploaded files before saving
 *     - Compact thumbnail strip with instant image swapping in the same window
 *     - Inline PDF & document viewer
 *  5. Dirty state tracking and Bitrix24 save normalization ({ fileData: [name, base64] })
 */

(function () {
  'use strict';

  // ============================================================================
  // 1. CONFIGURATION & LAYOUT SPECIFICATIONS
  // ============================================================================
  const CONFIG = {
    entityTypeId: 1058,
    placement: 'CRM_DYNAMIC_1058_DETAIL_TAB',
    layoutField: 'ufCrm16_1790154808',
    layoutFieldCrm: 'UF_CRM_16_1790154808',

    // Mapping enum IDs & string labels to layout keys
    layoutEnumMap: {
      '164': 'external_stock',
      'external stock': 'external_stock',
      '162': 'off_plan',
      'off-plan': 'off_plan',
      'off-plan listing': 'off_plan',
      '160': 'overseas_sale',
      'overseas sale': 'overseas_sale',
      '158': 'rent',
      'rent': 'rent'
    },

    layoutMeta: {
      external_stock: {
        id: 'external_stock',
        enumId: '164',
        title: 'External Stock',
        icon: '🏢',
        pillClass: 'layout-pill-external_stock'
      },
      off_plan: {
        id: 'off_plan',
        enumId: '162',
        title: 'Off-plan',
        icon: '🏗️',
        pillClass: 'layout-pill-off_plan'
      },
      overseas_sale: {
        id: 'overseas_sale',
        enumId: '160',
        title: 'Overseas Sale',
        icon: '🌍',
        pillClass: 'layout-pill-overseas_sale'
      },
      rent: {
        id: 'rent',
        enumId: '158',
        title: 'Rent',
        icon: '🔑',
        pillClass: 'layout-pill-rent'
      }
    },

    // 8 Structured Sections according to User Specification
    sections: [
      {
        id: 'general',
        title: 'General Overview',
        icon: '📋',
        desc: 'Title, stage, responsible person, and listing authority',
        fields: [
          {
            key: 'title',
            label: 'Listing Title',
            type: 'string',
            placeholder: 'e.g. Luxury 4BR Penthouse in Downtown Dubai...',
            fullWidth: true,
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'stageId',
            label: 'Stage',
            type: 'stage',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'assignedById',
            label: 'Responsible Person',
            type: 'user',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1790154808',
            label: 'Listing Type (Layout Driver)',
            type: 'enumeration',
            options: [
              { id: '164', value: 'External Stock' },
              { id: '162', value: 'Off-plan Listing' },
              { id: '160', value: 'Overseas Sale' },
              { id: '158', value: 'RENT' }
            ],
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16Exclusive',
            label: 'Listing Agreement (Exclusive / Non-Exclusive)',
            type: 'boolean',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'xmlId',
            label: 'External ID (xmlId)',
            type: 'string',
            placeholder: 'e.g. EXT-984210',
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
          }
        ]
      },
      {
        id: 'seller',
        title: 'Seller & Source',
        icon: '🤝',
        desc: 'Agency, developer, owner contacts, and master property relation',
        fields: [
          {
            key: 'companyId',
            label: 'Company (Agency or Developer)',
            type: 'crm_company',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'contactId',
            label: 'Contact',
            type: 'crm_contact',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'contactIds',
            label: 'Contacts',
            type: 'crm_contact_multi',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'parentId1052',
            label: 'Master Property (parentId1052)',
            type: 'crm_entity',
            placeholder: 'Property SPA reference...',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
          }
        ]
      },
      {
        id: 'specs',
        title: 'Property Specifications',
        icon: '📐',
        desc: 'Dimensions, rooms, spaces, floor, and furnishing',
        fields: [
          {
            key: 'ufCrm16PropertyType',
            label: 'Property Type',
            type: 'enumeration',
            options: [
              { id: '886', value: 'Apartment' },
              { id: '888', value: 'Villa' },
              { id: '890', value: 'Townhouse' },
              { id: '892', value: 'Penthouse' },
              { id: '894', value: 'Duplex' },
              { id: '896', value: 'Land' },
              { id: '898', value: 'Commercial' },
              { id: '900', value: 'Office' },
              { id: '902', value: 'Retail' }
            ],
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16PropertySubType',
            label: 'Property Sub-type',
            type: 'enumeration',
            options: [
              { id: '1', value: 'Standard' },
              { id: '2', value: 'Duplex' },
              { id: '3', value: 'Triplex' },
              { id: '4', value: 'Loft' },
              { id: '5', value: 'Whole Building' },
              { id: '6', value: 'Full Floor' }
            ],
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172802',
            label: 'Bedrooms',
            type: 'number',
            placeholder: 'e.g. 3',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172787',
            label: 'Bathrooms',
            type: 'number',
            placeholder: 'e.g. 4',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16SqFt',
            label: 'Built-up Area (Sq Ft)',
            type: 'number',
            addon: 'Sq Ft',
            placeholder: 'e.g. 2450',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16PlotSize',
            label: 'Plot Area (Sq Ft)',
            type: 'number',
            addon: 'Sq Ft',
            placeholder: 'e.g. 4200',
            rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
          },
          {
            key: 'ufCrm16UnitNumber',
            label: 'Unit Number',
            type: 'string',
            placeholder: 'e.g. 1402',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16Floor',
            label: 'Floor Number',
            type: 'integer',
            placeholder: 'e.g. 14',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16Furnished',
            label: 'Furnished Status',
            type: 'enumeration',
            options: [
              { id: '736', value: 'Furnished' },
              { id: '738', value: 'Semi-Furnished' },
              { id: '740', value: 'Unfurnished' }
            ],
            rules: { external_stock: 'opt', off_plan: 'hide', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16ParkingSpaces',
            label: 'Parking Spaces',
            type: 'integer',
            placeholder: 'e.g. 2',
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' }
          }
        ]
      },
      {
        id: 'pricing',
        title: 'Pricing & Terms',
        icon: '💰',
        desc: 'Asking price, rent frequency, commission, and payment plans',
        fields: [
          {
            key: 'ufCrm16_1790154936',
            label: 'Listing Price (AED)',
            type: 'money',
            addon: 'AED',
            placeholder: 'e.g. 2,500,000',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' },
            labelOverrides: {
              rent: 'Listing Price (as annual rent)'
            }
          },
          {
            key: 'ufCrm16ListPricePerSqFt',
            label: 'Price Per Sq Ft',
            type: 'money',
            addon: 'AED/SqFt',
            placeholder: 'e.g. 1,450',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'opt' }
          },
          {
            key: 'ufCrm16BuyersAgentCommission',
            label: 'Agency Commission (%)',
            type: 'number',
            addon: '%',
            placeholder: 'e.g. 2.0',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16HoaFrequency',
            label: 'Rental Frequency',
            type: 'enumeration',
            options: [
              { id: '1', value: 'Yearly' },
              { id: '2', value: 'Bi-Yearly' },
              { id: '3', value: 'Quarterly' },
              { id: '4', value: 'Monthly' }
            ],
            rules: { external_stock: 'hide', off_plan: 'hide', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16PetDeposit',
            label: 'Security Deposit (AED)',
            type: 'money',
            addon: 'AED',
            placeholder: 'e.g. 10,000',
            rules: { external_stock: 'hide', off_plan: 'hide', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16_1792127520',
            label: 'Number of Cheques',
            type: 'enumeration',
            options: [
              { id: '2440', value: '1 Cheque' },
              { id: '2442', value: '2 Cheques' },
              { id: '2444', value: '3 Cheques' },
              { id: '2446', value: '4 Cheques' },
              { id: '2448', value: '6 Cheques' }
            ],
            rules: { external_stock: 'hide', off_plan: 'opt', overseas_sale: 'hide', rent: 'show' },
            labelOverrides: {
              off_plan: 'Number of Cheques (payment plan)'
            }
          }
        ]
      },
      {
        id: 'dates',
        title: 'Dates & Timeline',
        icon: '📅',
        desc: 'Mandate duration, availability, and tenancy start/finish dates',
        fields: [
          {
            key: 'begindate',
            label: 'Started on',
            type: 'date',
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' },
            labelOverrides: {
              external_stock: 'Started on (mandate period)',
              rent: 'Started on (tenancy / availability)'
            }
          },
          {
            key: 'closedate',
            label: 'Finished on',
            type: 'date',
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' },
            labelOverrides: {
              external_stock: 'Finished on (mandate period)',
              rent: 'Finished on (tenancy / availability)'
            }
          }
        ]
      },
      {
        id: 'location',
        title: 'Location & Geography',
        icon: '📍',
        desc: 'Country, city, community, tower, and coordinates',
        fields: [
          {
            key: 'ufCrm16_1791172854',
            label: 'Country',
            type: 'string',
            placeholder: 'e.g. United Arab Emirates, UK, France...',
            rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'show', rent: 'opt' }
          },
          {
            key: 'ufCrm16_1791172815',
            label: 'City',
            type: 'string',
            placeholder: 'e.g. Dubai, London, Abu Dhabi...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791173032',
            label: 'Neighborhood / Community',
            type: 'string',
            placeholder: 'e.g. Downtown Dubai, Palm Jumeirah...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16SubCommunityPropertyfinder',
            label: 'Sub-Community',
            type: 'string',
            placeholder: 'e.g. Burj Crown, Marina Gate 2...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16BuildingBayut',
            label: 'Building / Tower Name',
            type: 'string',
            placeholder: 'e.g. Tower A, East Wing...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172676',
            label: 'Address',
            type: 'string',
            placeholder: 'Street, building, unit number...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16Latitude',
            label: 'Latitude',
            type: 'number',
            placeholder: 'e.g. 25.1972',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16Longitude',
            label: 'Longitude',
            type: 'number',
            placeholder: 'e.g. 55.2744',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          }
        ]
      },
      {
        id: 'marketing',
        title: 'Portals & Marketing',
        icon: '🚀',
        desc: 'Bayut, Propertyfinder, Dubizzle IDs, feed toggles, RERA permit, and descriptions',
        fields: [
          {
            key: 'ufCrm16_1790155092',
            label: 'Bayut Listing ID',
            type: 'string',
            placeholder: 'e.g. BYT-481902',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16PropertyFinderListingId',
            label: 'Propertyfinder Listing ID',
            type: 'string',
            placeholder: 'e.g. PF-981273',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16DubizzleRegion',
            label: 'Dubizzle Listing ID / Region',
            type: 'string',
            placeholder: 'e.g. DBZ-558291',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16SystemAllowedForPortals',
            label: 'Bayut / Dubizzle Feed Toggle',
            type: 'boolean',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16SummaryDescription',
            label: 'Portal Title',
            type: 'string',
            placeholder: 'SEO Headline for Portals...',
            fullWidth: true,
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16Description',
            label: 'Portal Description',
            type: 'textarea',
            placeholder: 'Marketing description, key amenities...',
            fullWidth: true,
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16ReraPermitNumber',
            label: 'RERA Permit Number',
            type: 'string',
            placeholder: 'e.g. 7114829100',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          }
        ]
      },
      {
        id: 'media',
        title: 'Media & Documents',
        icon: '📸',
        desc: 'Primary images, title deeds, brochures, floor plans, and 360 virtual tours',
        fields: [
          {
            key: 'ufCrm16_1791173118',
            label: 'Primary Listing Image',
            type: 'file',
            isImage: true,
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172957',
            label: 'Docs & Title Deed',
            type: 'file',
            isDoc: true,
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791544736052',
            label: 'Floor Plan',
            type: 'file',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
          },
          {
            key: 'ufCrm16WebsiteUrl',
            label: 'Brochure URL / File',
            type: 'url',
            placeholder: 'https://cdn.example.com/brochures/listing.pdf',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'show', rent: 'hide' }
          },
          {
            key: 'ufCrm16ListingWebsite',
            label: '360 Virtual Tour Link',
            type: 'tour_url',
            placeholder: 'https://my.matterport.com/show/?m=... or Kuula / YouTube 360',
            rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
          }
        ]
      }
    ]
  };

  // State Management
  let currentListingId = null;
  let currentListing = {};
  let currentLayout = 'rent'; // Driven strictly by ufCrm16_1790154808
  let initialFormValues = {};
  let pendingFileUploads = {}; // fieldKey -> Array of { file, dataUrl, name, size }
  let isDirty = false;
  let allSectionsCollapsed = false;

  // DOM Elements
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  const formEl = document.getElementById('listing-details-form');
  const sectionsContainer = document.getElementById('sections-container');
  const layoutModeBadge = document.getElementById('layout-mode-badge');
  const fieldsCountBadge = document.getElementById('fields-count-badge');
  const searchInput = document.getElementById('field-search-input');
  const clearSearchBtn = document.getElementById('btn-clear-search');
  const toggleAllBtn = document.getElementById('btn-toggle-all');
  const refreshBtn = document.getElementById('btn-refresh');
  const sectionNavPills = document.getElementById('section-nav-pills');
  const saveBtn = document.getElementById('btn-save');
  const cancelBtn = document.getElementById('btn-cancel');
  const dirtyIndicator = document.getElementById('dirty-indicator');
  const dirtyText = document.getElementById('dirty-text');

  // Lightbox Modal Elements (In same window)
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxBody = document.getElementById('lightbox-body');
  const lightboxDownloadLink = document.getElementById('lightbox-download-link');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');

  // ============================================================================
  // 2. HELPER & UTILITY FUNCTIONS
  // ============================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  function resizeWindow() {
    if (window.BX24 && typeof window.BX24.fitWindow === 'function') {
      window.BX24.fitWindow();
    }
  }

  function setDirty(state) {
    isDirty = state;
    if (dirtyIndicator) {
      dirtyIndicator.style.display = state ? 'inline-flex' : 'none';
      const pendingCount = Object.values(pendingFileUploads).reduce((acc, arr) => acc + arr.length, 0);
      dirtyText.textContent = pendingCount > 0 ? `Unsaved (${pendingCount} new files)` : 'Unsaved changes';
    }
    if (cancelBtn) {
      cancelBtn.style.display = state ? 'inline-flex' : 'none';
    }
  }

  function resolveListingId() {
    if (window.BX24 && typeof window.BX24.placement === 'object') {
      const placementInfo = window.BX24.placement.info();
      const options = placementInfo?.options;
      if (options) {
        if (typeof options === 'string') {
          try {
            const parsed = JSON.parse(options);
            return parsed.ID || parsed.id || parsed.ENTITY_ID;
          } catch (e) {}
        } else if (typeof options === 'object') {
          return options.ID || options.id || options.ENTITY_ID;
        }
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('ID') || urlParams.get('id') || urlParams.get('listingId') || '108';
  }

  // Detects the layout strictly from the listing entity field
  function detectLayoutFromListing(listing) {
    const rawVal = listing?.[CONFIG.layoutField] || listing?.[CONFIG.layoutFieldCrm];
    if (!rawVal) return 'rent'; // default

    const strVal = String(rawVal).toLowerCase().trim();
    if (CONFIG.layoutEnumMap[strVal]) {
      return CONFIG.layoutEnumMap[strVal];
    }
    return 'rent';
  }

  // ============================================================================
  // 3. API DATA FETCHING & SAVING
  // ============================================================================
  function fetchListing(listingId) {
    return new Promise((resolve, reject) => {
      if (!window.BX24) {
        fetch(`/api/listing/${listingId}`)
          .then(r => r.json())
          .then(data => {
            if (data.success && data.item) resolve(data.item);
            else reject(new Error(data.error || 'Failed to fetch listing'));
          })
          .catch(reject);
        return;
      }

      window.BX24.callMethod('crm.item.get', {
        entityTypeId: CONFIG.entityTypeId,
        id: listingId
      }, res => {
        if (res.error()) {
          reject(new Error(res.error().toString()));
        } else {
          const item = res.data()?.item || res.data();
          resolve(item);
        }
      });
    });
  }

  function updateListing(listingId, fieldsPayload) {
    return new Promise((resolve, reject) => {
      if (!window.BX24) {
        fetch(`/api/listing/${listingId}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fieldsPayload })
        })
          .then(r => r.json())
          .then(data => {
            if (data.success) resolve(data.item);
            else reject(new Error(data.error || 'Update failed'));
          })
          .catch(reject);
        return;
      }

      window.BX24.callMethod('crm.item.update', {
        entityTypeId: CONFIG.entityTypeId,
        id: listingId,
        fields: fieldsPayload
      }, res => {
        if (res.error()) {
          reject(new Error(res.error().toString()));
        } else {
          resolve(res.data()?.item || res.data());
        }
      });
    });
  }

  // ============================================================================
  // 4. LIGHTBOX & DOCUMENT MODAL VIEWER (STRICTLY IN SAME IFRAME WINDOW)
  // ============================================================================
  function openLightbox(title, url, isPdf = false) {
    lightboxTitle.textContent = title || 'File Preview';
    lightboxDownloadLink.href = url;
    lightboxDownloadLink.setAttribute('download', title || 'download');

    lightboxBody.innerHTML = '';
    if (isPdf) {
      const iframe = document.createElement('iframe');
      iframe.className = 'lightbox-iframe';
      iframe.src = url;
      lightboxBody.appendChild(iframe);
    } else {
      const img = document.createElement('img');
      img.className = 'lightbox-img';
      img.src = url;
      img.alt = title;
      lightboxBody.appendChild(img);
    }

    lightboxModal.style.display = 'flex';
  }

  function closeLightbox() {
    lightboxModal.style.display = 'none';
    lightboxBody.innerHTML = '';
  }

  lightboxCloseBtn.addEventListener('click', closeLightbox);
  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxModal.style.display === 'flex') {
      closeLightbox();
    }
  });

  // ============================================================================
  // 5. IN-WINDOW MEDIA & FILE PREVIEW COMPONENT
  // ============================================================================
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function renderMediaField(field, rawValue, container) {
    const card = document.createElement('div');
    card.className = 'file-upload-card';

    // 1. Dropzone Bar (Minimal, single-line)
    const dropzone = document.createElement('div');
    dropzone.className = 'dropzone-box';
    dropzone.innerHTML = `
      <span class="dropzone-icon">📁</span>
      <span class="dropzone-title">Upload ${field.label}</span>
      <span class="dropzone-sub">(Click or drop file)</span>
      <input type="file" id="file_input_${field.key}" style="display:none" ${field.key.includes('DOCS') || field.key.includes('1791544736052') ? 'multiple' : ''}>
    `;

    const fileInput = dropzone.querySelector('input');
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.length) {
        handleLocalFiles(field.key, e.dataTransfer.files, viewportBox, stripWrap);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) {
        handleLocalFiles(field.key, fileInput.files, viewportBox, stripWrap);
      }
    });

    card.appendChild(dropzone);

    // 2. In-Window Inline Preview Viewport (Shows image in the same window!)
    const viewportBox = document.createElement('div');
    viewportBox.className = 'inline-preview-viewport';
    viewportBox.id = `viewport_${field.key}`;
    viewportBox.style.display = 'none'; // hidden initially until an image is loaded or selected

    const stripWrap = document.createElement('div');
    stripWrap.className = 'thumbnail-strip';
    stripWrap.id = `strip_${field.key}`;

    // Collect all existing files
    const existingList = Array.isArray(rawValue) ? rawValue : (rawValue ? [rawValue] : []);
    let firstImageFound = null;

    existingList.forEach((fileItem, idx) => {
      if (!fileItem) return;

      let fileUrl = '';
      let fileName = '';

      if (typeof fileItem === 'object') {
        fileUrl = fileItem.showUrl || fileItem.downloadUrl || fileItem.url || '';
        fileName = fileItem.name || `${field.label} #${idx + 1}`;
      } else if (typeof fileItem === 'string' && fileItem.startsWith('http')) {
        fileUrl = fileItem;
        fileName = fileItem.split('/').pop().split('?')[0] || 'Attached File';
      }

      if (!fileUrl && !fileName) return;

      const domain = window.__BITRIX_DOMAIN__ || (window.location ? window.location.hostname : 'csl.bitrix24.com');
      const fullUrl = fileUrl.startsWith('http') ? fileUrl : `https://${domain}${fileUrl}`;
      const isImage = field.isImage || /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(fileName || fullUrl);
      const isPdf = /\.pdf($|\?)/i.test(fileName || fullUrl);

      if (isImage) {
        if (!firstImageFound) {
          firstImageFound = { url: fullUrl, name: fileName };
        }

        const thumb = document.createElement('div');
        thumb.className = 'thumb-item preview-thumb-wrap';
        thumb.title = fileName;
        thumb.innerHTML = `
          <img class="thumb-item-img" src="${fullUrl}" alt="${fileName}">
          <div class="thumb-zoom-overlay">🔍</div>
        `;
        
        // Clicking thumbnail swaps image in the same window viewport!
        thumb.addEventListener('click', () => {
          showInWindowImage(viewportBox, fullUrl, fileName);
          stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
        });

        stripWrap.appendChild(thumb);
      } else {
        // Document chip
        const docChip = document.createElement('div');
        docChip.className = 'doc-chip-item preview-doc-wrap';
        docChip.innerHTML = `
          <span class="doc-chip-badge">${isPdf ? 'PDF' : 'DOC'}</span>
          <span title="${fileName}" style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${fileName}</span>
          ${isPdf ? `<button type="button" class="doc-chip-view-btn">View</button>` : ''}
          <a href="${fullUrl}" download class="doc-chip-view-btn">⬇</a>
        `;
        if (isPdf) {
          docChip.querySelector('button').addEventListener('click', () => {
            showInWindowPdf(viewportBox, fullUrl, fileName);
          });
        }
        card.appendChild(docChip);
      }
    });

    // Automatically display first image in the same window viewport on load!
    if (firstImageFound) {
      showInWindowImage(viewportBox, firstImageFound.url, firstImageFound.name);
      if (stripWrap.firstChild) {
        stripWrap.firstChild.classList.add('active');
      }
    }

    card.appendChild(viewportBox);
    card.appendChild(stripWrap);
    container.appendChild(card);
  }

  // Shows an image directly inside the inline viewport in the same window
  function showInWindowImage(viewportBox, url, name) {
    viewportBox.style.display = 'flex';
    viewportBox.innerHTML = `
      <div class="inline-preview-topbar">
        <span class="inline-preview-name">👁 Preview: ${name}</span>
        <div style="display:flex; gap:6px; align-items:center;">
          <button type="button" class="btn btn-secondary btn-compact zoom-btn" style="height:20px; font-size:10px; padding:0 6px;">🔍 Zoom</button>
          <button type="button" class="inline-preview-close" title="Hide Preview">✕</button>
        </div>
      </div>
      <img class="inline-preview-img" src="${url}" alt="${name}">
    `;

    viewportBox.querySelector('.zoom-btn').addEventListener('click', () => openLightbox(name, url, false));
    viewportBox.querySelector('.inline-preview-close').addEventListener('click', () => {
      viewportBox.style.display = 'none';
      viewportBox.innerHTML = '';
      resizeWindow();
    });
    resizeWindow();
  }

  // Shows a PDF directly inside the inline viewport in the same window
  function showInWindowPdf(viewportBox, url, name) {
    viewportBox.style.display = 'flex';
    viewportBox.innerHTML = `
      <div class="inline-preview-topbar">
        <span class="inline-preview-name">📄 PDF Viewer: ${name}</span>
        <button type="button" class="inline-preview-close" title="Hide PDF">✕</button>
      </div>
      <iframe class="inline-preview-iframe" src="${url}"></iframe>
    `;

    viewportBox.querySelector('.inline-preview-close').addEventListener('click', () => {
      viewportBox.style.display = 'none';
      viewportBox.innerHTML = '';
      resizeWindow();
    });
    resizeWindow();
  }

  // Handle local newly selected files with instant in-window FileReader preview
  function handleLocalFiles(fieldKey, files, viewportBox, stripWrap) {
    if (!pendingFileUploads[fieldKey]) {
      pendingFileUploads[fieldKey] = [];
    }

    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const reader = new FileReader();

      reader.onload = function (e) {
        const dataUrl = e.target.result;
        const pendingItem = {
          file,
          dataUrl,
          name: file.name,
          size: file.size,
          isImage,
          isPdf
        };
        pendingFileUploads[fieldKey].push(pendingItem);
        setDirty(true);

        if (isImage) {
          // Immediately show newly selected image in the same window viewport!
          showInWindowImage(viewportBox, dataUrl, `${file.name} (New)`);

          // Append thumbnail to strip
          const thumb = document.createElement('div');
          thumb.className = 'thumb-item preview-thumb-wrap active';
          thumb.title = `${file.name} (Ready to upload)`;
          thumb.innerHTML = `
            <img class="thumb-item-img" src="${dataUrl}" alt="${file.name}">
            <div class="thumb-zoom-overlay">🔍</div>
            <button type="button" class="thumb-remove-btn" title="Remove">✕</button>
          `;

          thumb.addEventListener('click', (ev) => {
            if (ev.target.classList.contains('thumb-remove-btn')) return;
            showInWindowImage(viewportBox, dataUrl, file.name);
            stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
          });

          thumb.querySelector('.thumb-remove-btn').addEventListener('click', (ev) => {
            ev.stopPropagation();
            const idx = pendingFileUploads[fieldKey].indexOf(pendingItem);
            if (idx > -1) pendingFileUploads[fieldKey].splice(idx, 1);
            thumb.remove();
            viewportBox.style.display = 'none';
            viewportBox.innerHTML = '';
            setDirty(true);
            resizeWindow();
          });

          stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
          stripWrap.appendChild(thumb);
        } else if (isPdf) {
          showInWindowPdf(viewportBox, dataUrl, `${file.name} (New)`);
        }
      };

      reader.readAsDataURL(file);
    });
  }

  // ============================================================================
  // 6. DYNAMIC LAYOUT & FIELD RENDERING
  // ============================================================================
  function renderLayout(layoutKey) {
    currentLayout = layoutKey;
    const meta = CONFIG.layoutMeta[layoutKey] || CONFIG.layoutMeta.rent;

    // 1. Update Layout Mode Pill in Toolbar
    layoutModeBadge.className = `layout-pill ${meta.pillClass}`;
    layoutModeBadge.innerHTML = `${meta.icon} ${meta.title}`;

    // 2. Clear container
    sectionsContainer.innerHTML = '';
    sectionNavPills.innerHTML = '';
    initialFormValues = {};

    let totalActiveFieldsCount = 0;

    CONFIG.sections.forEach((sec, secIdx) => {
      const showFields = [];
      const optFields = [];

      sec.fields.forEach(f => {
        const rule = f.rules?.[layoutKey] || 'show';
        if (rule === 'show') {
          showFields.push(f);
        } else if (rule === 'opt') {
          optFields.push(f);
        }
      });

      const sectionActiveCount = showFields.length + optFields.length;
      totalActiveFieldsCount += sectionActiveCount;

      if (sectionActiveCount === 0) return;

      // Jump-to Navigation Pill
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `nav-pill ${secIdx === 0 ? 'active' : ''}`;
      pill.setAttribute('data-target-sec', sec.id);
      pill.innerHTML = `<span>${sec.icon} ${sec.title}</span><span class="nav-pill-count">${sectionActiveCount}</span>`;
      pill.addEventListener('click', () => {
        document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const targetEl = document.getElementById(`sec_${sec.id}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      sectionNavPills.appendChild(pill);

      // Section Card
      const card = document.createElement('div');
      card.className = 'section-card';
      card.id = `sec_${sec.id}`;

      // Card Header (Minimal)
      const header = document.createElement('div');
      header.className = 'section-header';
      header.innerHTML = `
        <div class="section-title-wrap">
          <span class="section-icon">${sec.icon}</span>
          <span class="section-title">${sec.title}</span>
          <span class="section-desc">${sec.desc}</span>
        </div>
        <div class="section-header-right">
          <span class="section-count-badge">${sectionActiveCount}</span>
          <span class="section-chevron">▼</span>
        </div>
      `;
      header.addEventListener('click', () => {
        card.classList.toggle('collapsed');
      });
      card.appendChild(header);

      // Card Body
      const body = document.createElement('div');
      body.className = 'section-body';

      // Primary Grid
      const primaryGrid = document.createElement('div');
      primaryGrid.className = 'fields-grid';

      showFields.forEach(f => {
        primaryGrid.appendChild(createFieldElement(f, layoutKey));
      });
      body.appendChild(primaryGrid);

      // Optional Sub-Section
      if (optFields.length > 0) {
        const optWrapper = document.createElement('div');
        optWrapper.className = 'optional-fields-wrapper';

        const hasExistingValue = optFields.some(f => {
          const val = currentListing[f.key];
          return val !== null && val !== undefined && val !== '';
        });

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'optional-toggle-btn';
        toggleBtn.innerHTML = `
          <span>${hasExistingValue ? '▾' : '▸'} Optional Fields</span>
          <span class="optional-badge">${optFields.length}</span>
        `;

        const optContent = document.createElement('div');
        optContent.className = `optional-fields-content ${hasExistingValue ? '' : 'collapsed'}`;

        const optGrid = document.createElement('div');
        optGrid.className = 'fields-grid';
        optFields.forEach(f => {
          optGrid.appendChild(createFieldElement(f, layoutKey, true));
        });
        optContent.appendChild(optGrid);

        toggleBtn.addEventListener('click', () => {
          const isCollapsed = optContent.classList.toggle('collapsed');
          toggleBtn.innerHTML = `
            <span>${isCollapsed ? '▸' : '▾'} Optional Fields</span>
            <span class="optional-badge">${optFields.length}</span>
          `;
          resizeWindow();
        });

        optWrapper.appendChild(toggleBtn);
        optWrapper.appendChild(optContent);
        body.appendChild(optWrapper);
      }

      card.appendChild(body);
      sectionsContainer.appendChild(card);
    });

    fieldsCountBadge.textContent = `${totalActiveFieldsCount} fields`;
    resizeWindow();
  }

  // Field element factory
  function createFieldElement(f, layoutKey, isOptional = false) {
    const group = document.createElement('div');
    group.className = `field-group ${f.fullWidth ? 'full-width' : ''}`;
    group.setAttribute('data-field-key', f.key);

    const displayLabel = f.labelOverrides?.[layoutKey] || f.label;
    const labelEl = document.createElement('label');
    labelEl.className = 'field-label';
    labelEl.setAttribute('for', `field_${f.key}`);
    labelEl.innerHTML = `
      <span>${displayLabel}</span>
      ${f.labelOverrides?.[layoutKey] ? `<span class="field-context-hint">${layoutKey.replace('_', ' ')}</span>` : ''}
      ${isOptional ? `<span style="font-size:9px; color:var(--text-faint); font-weight:400;">(optional)</span>` : ''}
    `;
    group.appendChild(labelEl);

    const rawVal = currentListing[f.key];

    if (f.type === 'file') {
      renderMediaField(f, rawVal, group);
    } else if (f.type === 'tour_url') {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.gap = '4px';

      const input = document.createElement('input');
      input.type = 'url';
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.className = 'form-control';
      input.placeholder = f.placeholder || '360 Tour URL...';
      input.value = rawVal || '';
      input.addEventListener('input', () => setDirty(true));

      const launchBtn = document.createElement('button');
      launchBtn.type = 'button';
      launchBtn.className = 'btn btn-secondary btn-compact';
      launchBtn.textContent = '🌐 Launch 360';
      launchBtn.addEventListener('click', () => {
        if (!input.value) {
          showToast('Please enter a 360 Virtual Tour URL first', 'warning');
          return;
        }
        openLightbox('360 Virtual Tour Preview', input.value, true);
      });

      wrap.appendChild(input);
      wrap.appendChild(launchBtn);
      group.appendChild(wrap);
      initialFormValues[f.key] = input.value;
    } else if (f.type === 'url') {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.gap = '4px';

      const input = document.createElement('input');
      input.type = 'url';
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.className = 'form-control';
      input.placeholder = f.placeholder || 'https://...';
      input.value = rawVal || '';
      input.addEventListener('input', () => setDirty(true));

      const testBtn = document.createElement('a');
      testBtn.href = rawVal || '#';
      testBtn.target = '_self';
      testBtn.className = 'btn btn-secondary btn-compact';
      testBtn.textContent = '↗ Open';
      testBtn.addEventListener('click', (e) => {
        if (!input.value) e.preventDefault();
        else openLightbox('Brochure Preview', input.value, true);
      });

      wrap.appendChild(input);
      wrap.appendChild(testBtn);
      group.appendChild(wrap);
      initialFormValues[f.key] = input.value;
    } else if (f.type === 'textarea') {
      const textarea = document.createElement('textarea');
      textarea.id = `field_${f.key}`;
      textarea.name = f.key;
      textarea.className = 'form-control';
      textarea.placeholder = f.placeholder || '';
      textarea.value = rawVal || '';
      textarea.rows = 2;
      textarea.addEventListener('input', () => setDirty(true));
      group.appendChild(textarea);
      initialFormValues[f.key] = textarea.value;
    } else if (f.type === 'enumeration') {
      const select = document.createElement('select');
      select.id = `field_${f.key}`;
      select.name = f.key;
      select.className = 'form-control';

      const defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = `-- Select ${displayLabel} --`;
      select.appendChild(defOpt);

      const options = f.options || [];
      options.forEach(opt => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.id;
        optionEl.textContent = opt.value;
        if (String(rawVal) === String(opt.id) || String(rawVal) === String(opt.value)) {
          optionEl.selected = true;
        }
        select.appendChild(optionEl);
      });

      // Special: When Listing Type is changed in General section, adapt layout dynamically!
      if (f.key === CONFIG.layoutField) {
        select.addEventListener('change', () => {
          const selectedEnumId = select.value;
          const mappedLayout = CONFIG.layoutEnumMap[selectedEnumId] || 'rent';
          showToast(`Layout updated to ${CONFIG.layoutMeta[mappedLayout].title}`, 'info');
          currentListing[f.key] = selectedEnumId;
          renderLayout(mappedLayout);
          setDirty(true);
        });
      } else {
        select.addEventListener('change', () => setDirty(true));
      }

      group.appendChild(select);
      initialFormValues[f.key] = select.value;
    } else if (f.type === 'boolean') {
      const select = document.createElement('select');
      select.id = `field_${f.key}`;
      select.name = f.key;
      select.className = 'form-control';
      select.innerHTML = `
        <option value="">-- Select --</option>
        <option value="Y" ${rawVal === 'Y' || rawVal === true || rawVal === 1 ? 'selected' : ''}>Yes</option>
        <option value="N" ${rawVal === 'N' || rawVal === false || rawVal === 0 ? 'selected' : ''}>No</option>
      `;
      select.addEventListener('change', () => setDirty(true));
      group.appendChild(select);
      initialFormValues[f.key] = select.value;
    } else {
      const isAddon = !!f.addon;
      const input = document.createElement('input');
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.className = 'form-control';
      input.placeholder = f.placeholder || '';
      input.value = rawVal || '';

      if (f.type === 'number' || f.type === 'money' || f.type === 'integer') {
        input.type = 'number';
        input.step = f.type === 'integer' ? '1' : 'any';
      } else if (f.type === 'date') {
        input.type = 'date';
        if (rawVal && typeof rawVal === 'string' && rawVal.length >= 10) {
          input.value = rawVal.slice(0, 10);
        }
      } else {
        input.type = 'text';
      }

      input.addEventListener('input', () => setDirty(true));

      if (isAddon) {
        const addonWrap = document.createElement('div');
        addonWrap.className = 'input-addon-group';
        addonWrap.appendChild(input);
        const addonSpan = document.createElement('span');
        addonSpan.className = 'input-addon';
        addonSpan.textContent = f.addon;
        addonWrap.appendChild(addonSpan);
        group.appendChild(addonWrap);
      } else {
        group.appendChild(input);
      }

      initialFormValues[f.key] = input.value;
    }

    return group;
  }

  // ============================================================================
  // 7. EVENT LISTENERS
  // ============================================================================
  // Search Filter
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    clearSearchBtn.style.display = q ? 'block' : 'none';

    document.querySelectorAll('.field-group').forEach(group => {
      const text = group.textContent.toLowerCase();
      group.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    document.querySelectorAll('.field-group').forEach(group => {
      group.style.display = '';
    });
  });

  // Toggle all sections
  toggleAllBtn.addEventListener('click', () => {
    allSectionsCollapsed = !allSectionsCollapsed;
    document.querySelectorAll('.section-card').forEach(card => {
      card.classList.toggle('collapsed', allSectionsCollapsed);
    });
    toggleAllBtn.textContent = allSectionsCollapsed ? 'Expand All' : 'Collapse All';
  });

  // Refresh
  refreshBtn.addEventListener('click', () => {
    loadListingDetails();
  });

  // Cancel
  cancelBtn.addEventListener('click', () => {
    if (confirm('Discard all unsaved changes and reload original listing data?')) {
      loadListingDetails();
    }
  });

  // Save changes
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentListingId) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ &nbsp;SAVING...';

    try {
      const payload = {};

      const formData = new FormData(formEl);
      for (const [key, val] of formData.entries()) {
        payload[key] = val;
      }

      document.querySelectorAll('#sections-container input, #sections-container select, #sections-container textarea').forEach(el => {
        if (el.name && el.type !== 'file') {
          payload[el.name] = el.value;
        }
      });

      // Package pending file uploads with { fileData: [name, base64] }
      for (const [fieldKey, fileList] of Object.entries(pendingFileUploads)) {
        if (fileList.length === 1) {
          const item = fileList[0];
          const base64 = item.dataUrl.split(',')[1] || '';
          payload[fieldKey] = { fileData: [item.name, base64] };
        } else if (fileList.length > 1) {
          payload[fieldKey] = fileList.map(item => ({
            fileData: [item.name, item.dataUrl.split(',')[1] || '']
          }));
        }
      }

      console.log('[LISTING] Saving payload:', payload);
      await updateListing(currentListingId, payload);

      showToast('✓ Listing updated successfully in Bitrix24!', 'success');
      pendingFileUploads = {};
      setDirty(false);

      await loadListingDetails(false);
    } catch (err) {
      console.error('Failed to save listing:', err);
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '✓ &nbsp;SAVE CHANGES';
    }
  });

  // ============================================================================
  // 8. INITIALIZATION
  // ============================================================================
  async function loadListingDetails(showLoader = true) {
    if (showLoader) {
      loadingEl.style.display = 'flex';
      contentEl.style.display = 'none';
    }

    try {
      currentListingId = resolveListingId();
      if (!currentListingId) {
        throw new Error('No Listing ID detected. Open from Listing CRM detail card or pass ?ID=108');
      }

      console.log(`[LISTING] Loading listing #${currentListingId}...`);
      currentListing = await fetchListing(currentListingId);
      console.log('[LISTING] Loaded item data:', currentListing);

      // Render strictly driven by the field value
      const layoutKey = detectLayoutFromListing(currentListing);
      renderLayout(layoutKey);

      setDirty(false);
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
    } catch (err) {
      console.error('[LISTING] Init error:', err);
      loadingEl.innerHTML = `
        <div style="text-align: center; color: var(--danger); max-width: 450px;">
          <div style="font-size: 28px; margin-bottom: 6px;">⚠️</div>
          <strong style="font-size: 13px; display: block; margin-bottom: 4px;">Unable to Load Listing</strong>
          <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">${err.message}</p>
          <button type="button" class="btn btn-secondary" onclick="window.location.reload()">Retry</button>
        </div>
      `;
    }
  }

  // Export app instance for validation and testing
  window.__LISTING_DETAILS_APP__ = {
    CONFIG,
    detectLayoutFromListing,
    getCurrentListing: () => currentListing,
    getCurrentLayout: () => currentLayout,
    setLayout: (key) => renderLayout(key),
    getPendingUploads: () => pendingFileUploads,
    openLightbox,
    closeLightbox,
    showInWindowImage,
    showInWindowPdf
  };

  if (window.BX24) {
    window.BX24.init(() => loadListingDetails(true));
  } else {
    window.addEventListener('DOMContentLoaded', () => loadListingDetails(true));
  }
})();
