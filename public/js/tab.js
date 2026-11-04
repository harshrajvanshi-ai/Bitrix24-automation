/**
 * public/js/tab.js
 * Bitrix24 CRM Native Lead Details Tab Engine (Version 2)
 *
 * Capabilities:
 *  1. Pure Lead Type routing (UF_CRM_1791354310417):
 *     - 1596 / "Listing" -> Comprehensive Listing Layout (80 attributes across 8 structured cards)
 *     - 1594 / "Enquiry" -> Comprehensive Enquiry Layout (56 attributes across 8 structured cards)
 *     - Unassigned -> 1-click classification banner
 *  2. Bitrix24 Native Look & Feel:
 *     - Section cards with expand/collapse toggle and field counter pills
 *     - Sticky quick section anchor navigation pills bar
 *     - Real-time field search & highlight filter
 *     - Sticky bottom command panel with Bitrix green SAVE button & Cancel button
 *  3. Interactive CRM Autocomplete Lookups:
 *     - Master Projects, Projects/Towers, Properties/Units, Developers, Contacts, Agents
 */

(function () {
  'use strict';

  let currentLeadId = null;
  let currentLead = null;
  let tabConfig = null;
  let currentLayout = null; // 'enquiry' | 'listing' | null
  let currentListingSubLayout = 'rent'; // 'external_stock' | 'off_plan' | 'overseas_sale' | 'rent'
  let initialFormValues = {};
  let isDirty = false;
  let allSectionsCollapsed = false;

  const LISTING_LAYOUT_META = {
    external_stock: { id: 'external_stock', enumId: '2584', title: 'External Stock', icon: '🏢', pillClass: 'layout-pill-external_stock' },
    off_plan: { id: 'off_plan', enumId: '2582', title: 'Off-plan', icon: '🏗️', pillClass: 'layout-pill-off_plan' },
    overseas_sale: { id: 'overseas_sale', enumId: '2580', title: 'Overseas Sale', icon: '🌍', pillClass: 'layout-pill-overseas_sale' },
    rent: { id: 'rent', enumId: '2578', title: 'Rent', icon: '🔑', pillClass: 'layout-pill-rent' }
  };

  function detectListingSubLayout(lead) {
    const raw = lead?.UF_CRM_1791952650167 || lead?.UF_CRM_LISTING_TYPE;
    const str = String(raw || '').toLowerCase().trim();
    if (str === '2584' || str === 'external stock' || str === '164') return 'external_stock';
    if (str === '2582' || str === 'off-plan listing' || str === 'off-plan' || str === '162') return 'off_plan';
    if (str === '2580' || str === 'overseas sale' || str === '160' || str === 'sale') return 'overseas_sale';
    return 'rent'; // default 2578 / 'rent' / '158'
  }

  // DOM Elements
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  const formEl = document.getElementById('lead-tab-form');
  const fieldsContainer = document.getElementById('fields-container');
  const stageBadge = document.getElementById('stage-badge');
  const listingLayoutBadge = document.getElementById('listing-layout-badge');
  const fieldsCountBadge = document.getElementById('fields-count-badge');
  const stageInfoText = document.getElementById('stage-info-text');
  const saveBtn = document.getElementById('btn-save');
  const cancelBtn = document.getElementById('btn-cancel');
  const refreshBtn = document.getElementById('btn-refresh');
  const toggleAllBtn = document.getElementById('btn-toggle-all');
  const dirtyIndicator = document.getElementById('dirty-indicator');
  const filterInput = document.getElementById('field-filter-input');
  const clearSearchBtn = document.getElementById('btn-clear-search');
  const searchResultsPill = document.getElementById('search-results-pill');
  const sectionNavPills = document.getElementById('section-nav-pills');

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function resizeWindow() {
    if (window.BX24 && typeof window.BX24.fitWindow === 'function') {
      window.BX24.fitWindow();
    }
  }

  function setDirty(state) {
    isDirty = state;
    if (dirtyIndicator) {
      dirtyIndicator.style.display = state ? 'flex' : 'none';
    }
    if (cancelBtn) {
      cancelBtn.style.display = state ? 'inline-flex' : 'none';
    }
  }

  function isEmbeddedInCrm() {
    try {
      if (window.location && window.location.search && window.location.search.includes('enforce_lockout=1')) {
        return window.self !== window.top;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  function renderCrmLockoutScreen() {
    document.documentElement.classList.add('crm-lockout-active');
    const shield = document.getElementById('crm-lockout-shield');
    if (shield) shield.style.display = 'flex';
    const lEl = document.getElementById('loading');
    const cEl = document.getElementById('content');
    if (lEl) lEl.style.display = 'none';
    if (cEl) cEl.style.display = 'none';
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

  function resolveLeadId() {
    // 1. Bitrix24 CRM placement context (highest priority when inside CRM lead detail card)
    if (window.BX24 && typeof window.BX24.placement === 'object') {
      try {
        const placementInfo = window.BX24.placement.info();
        const options = placementInfo?.options;
        if (options) {
          if (typeof options === 'string') {
            const parsed = JSON.parse(options);
            const id = parsed.ID || parsed.id || parsed.ENTITY_ID;
            if (id) return String(id);
          } else if (typeof options === 'object') {
            const id = options.ID || options.id || options.ENTITY_ID;
            if (id) return String(id);
          }
        }
      } catch (e) {}
    }

    // 2. Explicit URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('ID') || urlParams.get('id') || urlParams.get('leadId');
    if (fromUrl) return String(fromUrl);

    // 3. Server injected initial lead ID
    if (window.__INITIAL_LEAD_ID__) return String(window.__INITIAL_LEAD_ID__);

    return null;
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/config', {
        headers: getCrmAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      tabConfig = await res.json();
      return tabConfig;
    } catch (err) {
      console.error('Failed to load tab configuration:', err);
      showToast('Error loading configuration', 'error');
      throw err;
    }
  }

  function fetchLead(leadId) {
    return new Promise((resolve, reject) => {
      if (!isEmbeddedInCrm()) {
        renderCrmLockoutScreen();
        return reject(new Error('Application is only accessible within Bitrix24 CRM'));
      }

      // Inside Bitrix24 SDK context
      if (window.BX24 && typeof window.BX24.callMethod === 'function') {
        window.BX24.callMethod('crm.lead.get', { id: leadId }, function (result) {
          if (result.error()) {
            console.warn('[CRM SDK] BX24.callMethod crm.lead.get failed, attempting server API fallback:', result.error());
            fetch(`/api/lead/${leadId}`, { headers: getCrmAuthHeaders() })
              .then(r => r.json())
              .then(data => {
                if (data && data.success && data.result) resolve(data.result);
                else resolve(data?.result || { ID: String(leadId), TITLE: `Lead #${leadId}`, STATUS_ID: 'NEW', UF_CRM_1791354310417: '1594' });
              })
              .catch(() => resolve({ ID: String(leadId), TITLE: `Lead #${leadId}`, STATUS_ID: 'NEW', UF_CRM_1791354310417: '1594' }));
          } else {
            resolve(result.data());
          }
        });
        return;
      }

      // Standalone browser / direct API context
      fetch(`/api/lead/${leadId}`, {
        headers: getCrmAuthHeaders()
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.success && data.result) {
            resolve(data.result);
          } else {
            resolve(data?.result || {
              ID: String(leadId),
              TITLE: `Lead #${leadId}`,
              STATUS_ID: 'NEW',
              UF_CRM_1791354310417: '1594',
              UF_CRM_ENQUIRY_TYPE: '2580',
              UF_CRM_FINANCE: '10'
            });
          }
        })
        .catch(() => {
          resolve({
            ID: String(leadId),
            TITLE: `Lead #${leadId}`,
            STATUS_ID: 'NEW',
            UF_CRM_1791354310417: '1594',
            UF_CRM_ENQUIRY_TYPE: '2580',
            UF_CRM_FINANCE: '10'
          });
        });
    });
  }

  /**
   * Determine layout strictly based on Lead Type field value
   */
  function determineLayoutFromLeadType(lead) {
    const leadTypeField = tabConfig?.leadTypeField || 'UF_CRM_1791354310417';
    const rawVal = lead?.[leadTypeField];
    const val = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';

    const listingId = String(tabConfig?.leadTypeItems?.listingId || '1596');
    const enquiryId = String(tabConfig?.leadTypeItems?.enquiryId || '1594');

    // Direct match against enum IDs
    if (val === listingId) return 'listing';
    if (val === enquiryId) return 'enquiry';

    // Direct match against textual values
    const lower = val.toLowerCase();
    if (lower.includes('listing')) return 'listing';
    if (lower.includes('enquir') || lower.includes('inquir')) return 'enquiry';

    // Fallback: scan any other field on lead containing LEAD_TYPE
    for (const [k, v] of Object.entries(lead || {})) {
      if (k.toUpperCase().includes('LEAD_TYPE') || k === 'UF_CRM_1791354310417') {
        const s = String(v).toLowerCase();
        if (s === listingId || s.includes('listing')) return 'listing';
        if (s === enquiryId || s.includes('enquir') || s.includes('inquir')) return 'enquiry';
      }
    }

    // Check STATUS_ID or stage name
    const statusId = String(lead?.STATUS_ID || '').toUpperCase();
    if (statusId.includes('LISTING')) return 'listing';
    if (statusId.includes('ENQUIRY')) return 'enquiry';

    return 'enquiry'; // Default to enquiry so all fields are immediately displayed and interactive
  }

  /**
   * Check if a field represents an interactive CRM entity lookup
   */
  function isLookupField(f) {
    if (!f) return false;
    if (f.type === 'lookup') return true;
    const lookupTypes = ['crm_company', 'crm_contact', 'crm_contact_multi', 'crm_entity', 'lookup'];
    if (lookupTypes.includes(f.type)) return true;
    if (f.lookupEntity) return true;
    const lookupCodes = [
      'COMPANY_ID', 'CONTACT_ID', 'UF_CRM_CONTACTS', 'UF_CRM_PROPERTY',
      'UF_CRM_DEVELOPER_1', 'UF_CRM_PROJECT', 'UF_CRM_1792558317', 'UF_CRM_PROJECT_1', 'UF_CRM_PROJECT_NAME',
      'UF_CRM_PROPERTY_LAYOUT', 'UF_CRM_PROPERTY_PROPERTYFINDER', 'UF_CRM_LISTING',
      'UF_CRM_LISTINGAGENT', 'UF_CRM_ASSIGNED_TO_BROKER', 'UF_CRM_OWNER_ENQUIRY'
    ];
    if (lookupCodes.includes(f.code)) return true;
    return false;
  }

  /**
   * Resolve lookup entity type (developer, contact, property, project, master_project, layout, listing, broker)
   */
  function resolveLookupEntity(f) {
    if (f.lookupEntity) return f.lookupEntity;
    const code = f.code || '';
    if (code === 'COMPANY_ID' || code === 'UF_CRM_DEVELOPER_1' || f.type === 'crm_company') return 'developer';
    if (code === 'CONTACT_ID' || code === 'UF_CRM_CONTACTS' || code === 'UF_CRM_OWNER_ENQUIRY' || f.type === 'crm_contact' || f.type === 'crm_contact_multi') return 'contact';
    if (code === 'UF_CRM_PROPERTY' || code === 'UF_CRM_PROPERTY_PROPERTYFINDER' || code === 'UF_CRM_MASTERPROPERTY') return 'property';
    if (code === 'UF_CRM_PROJECT_1' || code === 'UF_CRM_PROJECT_NAME') return 'project';
    if (code === 'UF_CRM_PROJECT' || code === 'UF_CRM_1792558317') return 'master_project';
    if (code === 'UF_CRM_PROPERTY_LAYOUT' || code === 'UF_CRM_LAYOUT') return 'layout';
    if (code === 'UF_CRM_LISTING') return 'listing';
    if (code === 'UF_CRM_LISTINGAGENT' || code === 'UF_CRM_ASSIGNED_TO_BROKER') return 'broker';
    return 'master_project';
  }

  /**
   * Extract active lookup selection context across Enquiry & Listing layout
   */
  function getActiveLookupContext() {
    const getFieldInfo = (code) => {
      let el = document.getElementById(`field_${code}`);
      if (!el && code === 'UF_CRM_1792558317') el = document.getElementById('field_UF_CRM_PROJECT');
      if (!el && code === 'UF_CRM_PROJECT') el = document.getElementById('field_UF_CRM_1792558317');
      if (!el && code === 'COMPANY_ID') el = document.getElementById('field_UF_CRM_DEVELOPER_1');
      if (!el && code === 'UF_CRM_DEVELOPER_1') el = document.getElementById('field_COMPANY_ID');
      if (!el) return null;
      let itemData = null;
      try {
        if (el.dataset.itemData) itemData = JSON.parse(el.dataset.itemData);
      } catch (_) {}
      const val = el.value.trim();
      const numMatch = val.match(/^#?(\d+)$/);
      const selectedId = el.dataset.selectedId || (numMatch ? numMatch[1] : null);
      return {
        id: selectedId ? String(selectedId) : null,
        title: el.dataset.selectedTitle || val,
        ref: el.dataset.selectedRef || null,
        itemData
      };
    };

    const listing = getFieldInfo('UF_CRM_LISTING');
    const masterProject = getFieldInfo('UF_CRM_1792558317') || getFieldInfo('UF_CRM_PROJECT');
    const project = getFieldInfo('UF_CRM_PROJECT_1') || getFieldInfo('UF_CRM_PROJECT_NAME');
    const layout = getFieldInfo('UF_CRM_PROPERTY_LAYOUT') || getFieldInfo('UF_CRM_LAYOUT');
    const property = getFieldInfo('UF_CRM_PROPERTY') || getFieldInfo('parentId1052') || getFieldInfo('UF_CRM_MASTERPROPERTY');
    const developer = getFieldInfo('UF_CRM_DEVELOPER_1') || getFieldInfo('COMPANY_ID');

    return { listing, masterProject, project, layout, property, developer };
  }

  /**
   * Determine whether a lookup item is related to currently selected records
   */
  function checkItemRelation(targetEntity, item, ctx) {
    if (!ctx) ctx = getActiveLookupContext();
    const itemId = String(item.id);
    const p1040 = item.parentId1040 ? String(item.parentId1040) : null;
    const p1044 = item.parentId1044 ? String(item.parentId1044) : null;
    const p1048 = item.parentId1048 ? String(item.parentId1048) : null;
    const p1052 = item.parentId1052 ? String(item.parentId1052) : null;
    const devId = (item.companyId || item.COMPANY_ID) ? String(item.companyId || item.COMPANY_ID) : null;

    // 1. Target: Master Project (SPA 1040)
    if (targetEntity === 'master_project') {
      if (ctx.project?.itemData?.parentId1040 && String(ctx.project.itemData.parentId1040) === itemId) {
        return { isRelated: true, reason: 'Parent of selected Project' };
      }
      if (ctx.property?.itemData?.parentId1040 && String(ctx.property.itemData.parentId1040) === itemId) {
        return { isRelated: true, reason: 'Parent of selected Property' };
      }
      if (ctx.layout?.itemData?.parentId1040 && String(ctx.layout.itemData.parentId1040) === itemId) {
        return { isRelated: true, reason: 'Parent of selected Layout' };
      }
      if (ctx.listing?.itemData?.parentId1040 && String(ctx.listing.itemData.parentId1040) === itemId) {
        return { isRelated: true, reason: 'Parent of selected Listing' };
      }
      if (ctx.developer?.id && devId && devId === String(ctx.developer.id)) {
        return { isRelated: true, reason: 'By selected Developer' };
      }
    }

    // 2. Target: Project (SPA 1044)
    if (targetEntity === 'project') {
      if (ctx.masterProject?.id && p1040 === String(ctx.masterProject.id)) {
        return { isRelated: true, reason: 'In selected Master Project' };
      }
      if (ctx.property?.itemData?.parentId1044 && String(ctx.property.itemData.parentId1044) === itemId) {
        return { isRelated: true, reason: 'Project of selected Property' };
      }
      if (ctx.layout?.itemData?.parentId1044 && String(ctx.layout.itemData.parentId1044) === itemId) {
        return { isRelated: true, reason: 'Parent of selected Layout' };
      }
      if (ctx.listing?.itemData?.parentId1044 && String(ctx.listing.itemData.parentId1044) === itemId) {
        return { isRelated: true, reason: 'Parent of selected Listing' };
      }
      if (ctx.developer?.id && devId && devId === String(ctx.developer.id)) {
        return { isRelated: true, reason: 'By selected Developer' };
      }
    }

    // 3. Target: Layout (SPA 1048)
    if (targetEntity === 'layout') {
      if (ctx.project?.id && p1044 === String(ctx.project.id)) {
        return { isRelated: true, reason: 'For selected Project' };
      }
      if (ctx.property?.itemData?.parentId1048 && String(ctx.property.itemData.parentId1048) === itemId) {
        return { isRelated: true, reason: 'Layout of selected Property' };
      }
      if (ctx.masterProject?.id && p1040 === String(ctx.masterProject.id)) {
        return { isRelated: true, reason: 'In selected Master Project' };
      }
      if (ctx.listing?.itemData?.parentId1048 && String(ctx.listing.itemData.parentId1048) === itemId) {
        return { isRelated: true, reason: 'Layout of selected Listing' };
      }
    }

    // 4. Target: Property (SPA 1052)
    if (targetEntity === 'property') {
      if (ctx.project?.id && p1044 === String(ctx.project.id)) {
        return { isRelated: true, reason: 'In selected Project' };
      }
      if (ctx.layout?.id && p1048 === String(ctx.layout.id)) {
        return { isRelated: true, reason: 'Matches selected Layout' };
      }
      if (ctx.masterProject?.id && p1040 === String(ctx.masterProject.id)) {
        return { isRelated: true, reason: 'In selected Master Project' };
      }
      if (ctx.listing?.itemData?.parentId1052 && String(ctx.listing.itemData.parentId1052) === itemId) {
        return { isRelated: true, reason: 'Property of selected Listing' };
      }
      if (ctx.developer?.id && devId && devId === String(ctx.developer.id)) {
        return { isRelated: true, reason: 'By selected Developer' };
      }
    }

    // 5. Target: Listing (SPA 1058)
    if (targetEntity === 'listing') {
      if (ctx.property?.id && p1052 === String(ctx.property.id)) {
        return { isRelated: true, reason: 'Listing for selected Property' };
      }
      if (ctx.layout?.id && p1048 === String(ctx.layout.id)) {
        return { isRelated: true, reason: 'Matches selected Layout' };
      }
      if (ctx.project?.id && p1044 === String(ctx.project.id)) {
        return { isRelated: true, reason: 'In selected Project' };
      }
      if (ctx.masterProject?.id && p1040 === String(ctx.masterProject.id)) {
        return { isRelated: true, reason: 'In selected Master Project' };
      }
      if (ctx.developer?.id && devId && devId === String(ctx.developer.id)) {
        return { isRelated: true, reason: 'By selected Developer' };
      }
    }

    // 6. Target: Developer (Company)
    if (targetEntity === 'developer') {
      if (ctx.property?.itemData?.companyId && String(ctx.property.itemData.companyId) === itemId) {
        return { isRelated: true, reason: 'Developer of selected Property' };
      }
      if (ctx.listing?.itemData?.companyId && String(ctx.listing.itemData.companyId) === itemId) {
        return { isRelated: true, reason: 'Developer of selected Listing' };
      }
      if (ctx.project?.itemData?.companyId && String(ctx.project.itemData.companyId) === itemId) {
        return { isRelated: true, reason: 'Developer of selected Project' };
      }
      if (ctx.masterProject?.itemData?.companyId && String(ctx.masterProject.itemData.companyId) === itemId) {
        return { isRelated: true, reason: 'Developer of selected Master Project' };
      }
    }

    return { isRelated: false, reason: '' };
  }

  /**
   * Open linked record directly in Bitrix24
   */
  function openLinkedRecord(f, rawId, ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (!rawId) {
      showToast('No valid linked record ID to open', 'warning');
      return;
    }
    const idStr = String(rawId).trim();
    let path = '';
    const entity = f?.lookupEntity || resolveLookupEntity(f || {});

    if (idStr.startsWith('CO_')) {
      path = `/crm/company/details/${idStr.replace(/^CO_/, '')}/`;
    } else if (idStr.startsWith('C_')) {
      path = `/crm/contact/details/${idStr.replace(/^C_/, '')}/`;
    } else if (idStr.startsWith('D_')) {
      path = `/crm/deal/details/${idStr.replace(/^D_/, '')}/`;
    } else if (idStr.startsWith('L_')) {
      path = `/crm/lead/details/${idStr.replace(/^L_/, '')}/`;
    } else if (/^DYNAMIC_(\d+)_(\d+)$/.test(idStr)) {
      const m = idStr.match(/^DYNAMIC_(\d+)_(\d+)$/);
      path = `/crm/type/${m[1]}/details/${m[2]}/`;
    } else {
      const num = idStr.replace(/[^\d]/g, '');
      if (!num) return;
      if (entity === 'developer' || entity === 'company') {
        path = `/crm/company/details/${num}/`;
      } else if (entity === 'contact') {
        path = `/crm/contact/details/${num}/`;
      } else if (entity === 'property') {
        path = `/crm/type/1052/details/${num}/`;
      } else if (entity === 'master_project') {
        path = `/crm/type/1040/details/${num}/`;
      } else if (entity === 'project') {
        path = `/crm/type/1044/details/${num}/`;
      } else if (entity === 'layout') {
        path = `/crm/type/1048/details/${num}/`;
      } else if (entity === 'broker') {
        path = `/crm/type/1094/details/${num}/`;
      } else if (entity === 'listing') {
        path = `/crm/type/1058/details/${num}/`;
      } else {
        path = `/crm/type/1052/details/${num}/`;
      }
    }

    if (window.BX24 && typeof window.BX24.openPath === 'function') {
      window.BX24.openPath(path);
    } else {
      const domain = window.__BITRIX_DOMAIN__ || (window.location ? window.location.hostname : 'csl.bitrix24.com');
      const fullUrl = path.startsWith('http') ? path : `https://${domain}${path}`;
      window.open(fullUrl, '_blank');
    }
  }

  /**
   * Create interactive Lookup Autocomplete Component (Bitrix CRM Entity Lookups)
   */
  function createLookupInput(f, currentVal, markFieldDirty) {
    const container = document.createElement('div');
    container.className = 'lookup-container';

    const entity = f.lookupEntity || resolveLookupEntity(f);
    f.lookupEntity = entity;

    const inputWrap = document.createElement('div');
    inputWrap.className = 'lookup-input-wrap';

    const icon = document.createElement('span');
    icon.className = 'lookup-icon';
    icon.textContent = '🔍';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.id = `field_${f.code}`;
    input.name = f.code;
    input.placeholder = f.placeholder || `Search ${f.label}...`;
    input.value = currentVal || '';
    input.autocomplete = 'off';

    // Check if initial value is already resolved in currentLead or needs lookup resolution
    let knownTitle = '';
    let knownRef = '';
    let knownId = '';

    if (currentLead) {
      if (currentLead[f.code + '_TITLE']) {
        knownTitle = currentLead[f.code + '_TITLE'];
        knownRef = currentLead[f.code + '_REF'] || currentVal;
      } else if (f.code === 'COMPANY_ID' && currentLead.COMPANY_TITLE) {
        knownTitle = currentLead.COMPANY_TITLE;
        knownRef = currentVal ? `CO_${currentVal}` : '';
        knownId = String(currentVal || '');
      } else if (f.code === 'CONTACT_ID' && (currentLead.CONTACT_FULL_NAME || currentLead.CONTACT_NAME)) {
        knownTitle = currentLead.CONTACT_FULL_NAME || currentLead.CONTACT_NAME;
        knownRef = currentVal ? `C_${currentVal}` : '';
        knownId = String(currentVal || '');
      } else if (f.code === 'UF_CRM_DEVELOPER_1' && (currentLead.UF_CRM_DEVELOPER_NAME || currentLead.UF_CRM_DEVELOPER_1_TITLE)) {
        knownTitle = currentLead.UF_CRM_DEVELOPER_NAME || currentLead.UF_CRM_DEVELOPER_1_TITLE;
        knownRef = currentVal || '';
      } else if ((f.code === 'UF_CRM_PROJECT_NAME' || f.code === 'UF_CRM_PROJECT_1') && currentLead.UF_CRM_PROJECT_NAME) {
        knownTitle = currentLead.UF_CRM_PROJECT_NAME;
        knownRef = currentLead.UF_CRM_PROJECT_1 || currentVal || '';
      } else if (f.code === 'UF_CRM_PROPERTY' && currentLead.UF_CRM_PROPERTY_TITLE) {
        knownTitle = currentLead.UF_CRM_PROPERTY_TITLE;
        knownRef = currentVal || '';
      } else if ((f.code === 'UF_CRM_PROPERTY_LAYOUT' || f.code === 'UF_CRM_LAYOUT') && (currentLead.UF_CRM_PROPERTY_LAYOUT_TITLE || currentLead.UF_CRM_LAYOUT_TITLE)) {
        knownTitle = currentLead.UF_CRM_PROPERTY_LAYOUT_TITLE || currentLead.UF_CRM_LAYOUT_TITLE;
        knownRef = currentVal || '';
      } else if ((f.code === 'UF_CRM_LISTINGAGENT' || f.code === 'UF_CRM_ASSIGNED_TO_BROKER' || f.code === 'UF_CRM_PORTAL_LISTING_AGENT') && (currentLead.UF_CRM_LISTINGAGENT_TITLE || currentLead.UF_CRM_ASSIGNED_TO_BROKER_TITLE || currentLead.UF_CRM_PORTAL_LISTING_AGENT_TITLE)) {
        knownTitle = currentLead.UF_CRM_LISTINGAGENT_TITLE || currentLead.UF_CRM_ASSIGNED_TO_BROKER_TITLE || currentLead.UF_CRM_PORTAL_LISTING_AGENT_TITLE;
        knownRef = currentVal || '';
      }
    }

    if (knownTitle) {
      input.value = knownTitle;
      if (knownRef) input.dataset.selectedRef = knownRef;
      if (knownId) {
        input.dataset.selectedId = knownId;
      } else {
        const idM = String(knownRef || currentVal).trim().match(/^(?:DYNAMIC_\d+_|[A-Z]+_)?(\d+)$/i);
        if (idM) input.dataset.selectedId = idM[1];
      }
    } else if (currentVal) {
      let rawVal = currentVal;
      if (Array.isArray(rawVal) && rawVal.length > 0) rawVal = rawVal[0];
      if (rawVal && typeof rawVal === 'object') {
        if (rawVal.title || rawVal.name) {
          input.value = rawVal.title || rawVal.name;
        }
        rawVal = rawVal.id || rawVal.ID || rawVal.value || '';
      }

      const refMatch = String(rawVal).trim().match(/^(?:DYNAMIC_\d+_|[A-Z]+_)?(\d+)$/i);
      if (refMatch) {
        const cleanId = refMatch[1];
        input.dataset.selectedId = cleanId;
        input.dataset.selectedRef = rawVal;
        fetch(`/api/lookup?entity=${encodeURIComponent(entity)}&q=${encodeURIComponent(cleanId)}`, {
          headers: getCrmAuthHeaders()
        })
          .then(r => r.json())
          .then(d => {
            const match = (d.items || []).find(it => String(it.id) === cleanId) || (d.items && d.items[0]);
            if (match && (input.value === String(currentVal) || input.value === cleanId || !input.value)) {
              input.value = match.title;
              input.dataset.selectedRef = match.crmRef || rawVal;
              input.dataset.selectedTitle = match.title;
              input.dataset.itemData = JSON.stringify(match);
              openBtn.style.display = 'inline-flex';
            }
          })
          .catch(() => {});
      } else {
        // Plain text title passed (e.g. from legacy data), pre-resolve ID and CRM reference
        fetch(`/api/lookup?entity=${encodeURIComponent(entity)}&q=${encodeURIComponent(String(rawVal).trim())}`, {
          headers: getCrmAuthHeaders()
        })
          .then(r => r.json())
          .then(d => {
            const match = (d.items || []).find(it => it.title.toLowerCase() === String(rawVal).trim().toLowerCase()) || (d.items && d.items[0]);
            if (match) {
              input.dataset.selectedId = match.id;
              input.dataset.selectedRef = match.crmRef || match.id;
              input.dataset.selectedTitle = match.title;
              input.dataset.itemData = JSON.stringify(match);
              input.value = match.title;
              openBtn.style.display = 'inline-flex';
            }
          })
          .catch(() => {});
      }
    }

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'lookup-clear-btn';
    clearBtn.innerHTML = '&times;';
    clearBtn.title = 'Clear selection';
    if (input.value) clearBtn.style.display = 'block';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'lookup-open-btn';
    openBtn.innerHTML = '<span>↗</span>';
    openBtn.title = `Open linked ${f.label || 'record'} in Bitrix24`;
    const hasInitialId = !!(input.dataset.selectedId || input.dataset.selectedRef || (currentVal && currentVal !== '0'));
    openBtn.style.display = hasInitialId ? 'inline-flex' : 'none';

    openBtn.addEventListener('click', (e) => {
      const targetId = input.dataset.selectedRef || input.dataset.selectedId || input.value.trim();
      openLinkedRecord(f, targetId, e);
    });

    const dropdown = document.createElement('div');
    dropdown.className = 'lookup-dropdown';

    inputWrap.appendChild(icon);
    inputWrap.appendChild(input);
    inputWrap.appendChild(clearBtn);
    inputWrap.appendChild(openBtn);
    container.appendChild(inputWrap);
    container.appendChild(dropdown);

    let debounceTimer = null;

    function closeDropdown() {
      dropdown.style.display = 'none';
      dropdown.classList.remove('dropup');
      container.classList.remove('has-open-dropdown');
      const group = container.closest('.form-group');
      if (group) group.classList.remove('has-open-dropdown');
      const section = container.closest('.form-section');
      if (section) section.classList.remove('has-open-dropdown');
    }

    function adjustDropdownPosition() {
      const rect = inputWrap.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 250 && spaceAbove > spaceBelow) {
        dropdown.classList.add('dropup');
      } else {
        dropdown.classList.remove('dropup');
      }
    }

    function openDropdown() {
      adjustDropdownPosition();
      dropdown.style.display = 'block';
      container.classList.add('has-open-dropdown');
      const group = container.closest('.form-group');
      if (group) group.classList.add('has-open-dropdown');
      const section = container.closest('.form-section');
      if (section) section.classList.add('has-open-dropdown');
    }

    async function queryLookup(query = '', refresh = false) {
      dropdown.innerHTML = '<div class="lookup-spinner">Searching Bitrix24 records...</div>';
      openDropdown();

      try {
        const cleanQuery = String(query).replace(/^#/, '').trim();
        const refreshParam = refresh ? '&refresh=1' : '';

        // Extract dependent linkage query parameters
        let extraParams = '';
        const ctx = getActiveLookupContext();
        if (f.code === 'UF_CRM_PROJECT_1') {
          const mpInput = document.getElementById('field_UF_CRM_1792558317') || document.getElementById('field_UF_CRM_PROJECT');
          const mpId = mpInput?.dataset?.selectedId;
          if (mpId) extraParams += `&master_project_id=${encodeURIComponent(mpId)}`;
        } else if (f.code === 'UF_CRM_PROPERTY_LAYOUT') {
          const pInput = document.getElementById('field_UF_CRM_PROJECT_1');
          const pId = pInput?.dataset?.selectedId;
          if (pId) extraParams += `&project_id=${encodeURIComponent(pId)}`;
        } else if (f.code === 'UF_CRM_PROPERTY' || f.code === 'UF_CRM_MASTERPROPERTY' || f.code === 'parentId1052') {
          if (ctx.project?.id) extraParams += `&project_id=${encodeURIComponent(ctx.project.id)}`;
          if (ctx.masterProject?.id) extraParams += `&master_project_id=${encodeURIComponent(ctx.masterProject.id)}`;
          if (ctx.layout?.id) extraParams += `&layout_id=${encodeURIComponent(ctx.layout.id)}`;
        } else if (f.code === 'UF_CRM_LISTING') {
          const pInput = document.getElementById('field_UF_CRM_PROJECT_1');
          const pId = pInput?.dataset?.selectedId;
          if (pId) extraParams += `&project_id=${encodeURIComponent(pId)}`;
          const mpInput = document.getElementById('field_UF_CRM_1792558317') || document.getElementById('field_UF_CRM_PROJECT');
          const mpId = mpInput?.dataset?.selectedId;
          if (mpId) extraParams += `&master_project_id=${encodeURIComponent(mpId)}`;
          const lInput = document.getElementById('field_UF_CRM_PROPERTY_LAYOUT');
          const lId = lInput?.dataset?.selectedId;
          if (lId) extraParams += `&layout_id=${encodeURIComponent(lId)}`;
          const propInput = document.getElementById('field_UF_CRM_PROPERTY');
          const propId = propInput?.dataset?.selectedId;
          if (propId) extraParams += `&property_id=${encodeURIComponent(propId)}`;
        }
        if (ctx.property?.id && f.code !== 'UF_CRM_PROPERTY' && f.code !== 'UF_CRM_MASTERPROPERTY' && f.code !== 'parentId1052') {
          extraParams += `&property_id=${encodeURIComponent(ctx.property.id)}`;
        }
        if (ctx.developer?.id && f.code !== 'UF_CRM_DEVELOPER_1' && f.code !== 'COMPANY_ID') {
          extraParams += `&developer_id=${encodeURIComponent(ctx.developer.id)}`;
        }
        if (ctx.listing?.id && f.code !== 'UF_CRM_LISTING') {
          extraParams += `&listing_id=${encodeURIComponent(ctx.listing.id)}`;
        }

        const res = await fetch(`/api/lookup?entity=${encodeURIComponent(f.lookupEntity || resolveLookupEntity(f) || 'master_project')}&q=${encodeURIComponent(cleanQuery)}${refreshParam}${extraParams}`, {
          headers: getCrmAuthHeaders()
        });
        const data = await res.json();
        let items = data.items || [];

        // Tag and prioritize related records based on active multi-directional context
        const currentEntity = f.lookupEntity || resolveLookupEntity(f) || 'master_project';
        items.forEach(it => {
          const rel = checkItemRelation(currentEntity, it, ctx);
          if (rel.isRelated) {
            it.isRelated = true;
            if (rel.reason) it.relationReason = rel.reason;
          }
        });

        // Always present related records FIRST in the dropdown
        items.sort((a, b) => (b.isRelated ? 1 : 0) - (a.isRelated ? 1 : 0));

        dropdown.innerHTML = '';

        const relatedCount = items.filter(it => it.isRelated).length;

        // Dropdown Header with records count, related counter badge and live refresh action
        const header = document.createElement('div');
        header.className = 'lookup-dropdown-header';
        const countText = relatedCount > 0
          ? `<span>${items.length} records <strong style="color: #16a34a; font-weight:700;">(${relatedCount} related)</strong></span>`
          : `<span>${items.length} records</span>`;
        header.innerHTML = `${countText}<button type="button" class="lookup-refresh-btn" title="Refresh records from Bitrix24">🔄 Refresh</button>`;
        const refreshBtn = header.querySelector('.lookup-refresh-btn');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            queryLookup(input.value.trim(), true);
          });
        }
        dropdown.appendChild(header);

        if (items.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'lookup-item';
          empty.style.cssText = 'color: #828b95; cursor: default;';
          empty.textContent = 'No matching records found';
          dropdown.appendChild(empty);
          adjustDropdownPosition();
          return;
        }

        let dividerAdded = false;
        items.forEach(item => {
          if (relatedCount > 0 && !item.isRelated && !dividerAdded) {
            const divEl = document.createElement('div');
            divEl.className = 'lookup-divider-header';
            divEl.textContent = 'Other Records';
            dropdown.appendChild(divEl);
            dividerAdded = true;
          }

          const itemEl = document.createElement('div');
          itemEl.className = 'lookup-item' + (item.isRelated ? ' is-related' : '');

          const titleSpan = document.createElement('span');
          titleSpan.className = 'lookup-item-title';
          if (item.isRelated) {
            const badge = document.createElement('span');
            badge.className = 'lookup-related-badge';
            badge.textContent = `★ Related${item.relationReason ? ': ' + item.relationReason : ''}`;
            titleSpan.appendChild(badge);
          }
          const textNode = document.createTextNode(item.title);
          titleSpan.appendChild(textNode);

          const idSpan = document.createElement('span');
          idSpan.className = 'lookup-item-id';
          idSpan.textContent = `#${item.id}`;

          itemEl.appendChild(titleSpan);
          itemEl.appendChild(idSpan);

          const selectItem = (item) => {
            if (!item) return;
            clearTimeout(debounceTimer);
            input.value = item.title;
            input.dataset.selectedId = String(item.id);
            input.dataset.selectedRef = item.crmRef || String(item.id);
            input.dataset.selectedTitle = item.title;
            input.dataset.itemData = JSON.stringify(item);
            clearBtn.style.display = 'block';
            openBtn.style.display = 'inline-flex';
            closeDropdown();

            // Auto-populate companion fields
            if ((f.code === 'COMPANY_ID' || f.code === 'UF_CRM_DEVELOPER_1') && item.title) {
              const devNameInput = document.getElementById('field_UF_CRM_DEVELOPER_NAME');
              if (devNameInput) devNameInput.value = item.title;
            }
            if ((f.code === 'UF_CRM_PROJECT_NAME' || f.code === 'UF_CRM_PROJECT_1') && item.title) {
              const altEl = document.getElementById(f.code === 'UF_CRM_PROJECT_NAME' ? 'field_UF_CRM_PROJECT_1' : 'field_UF_CRM_PROJECT_NAME');
              if (altEl) altEl.value = item.title;
            }

            // Helper to auto-populate dependent lookup input
            const setDependentLookup = (targetCode, entityName, targetId, targetTitle, targetData) => {
              let targetInput = document.getElementById(`field_${targetCode}`);
              if (!targetInput) {
                if (targetCode === 'UF_CRM_PROJECT') targetInput = document.getElementById('field_UF_CRM_1792558317');
                else if (targetCode === 'UF_CRM_1792558317') targetInput = document.getElementById('field_UF_CRM_PROJECT');
                else if (targetCode === 'UF_CRM_PROPERTY_LAYOUT') targetInput = document.getElementById('field_UF_CRM_LAYOUT');
                else if (targetCode === 'UF_CRM_LAYOUT') targetInput = document.getElementById('field_UF_CRM_PROPERTY_LAYOUT');
                else if (targetCode === 'UF_CRM_LISTINGAGENT') targetInput = document.getElementById('field_UF_CRM_ASSIGNED_TO_BROKER') || document.getElementById('field_UF_CRM_PORTAL_LISTING_AGENT');
              }
              if (!targetInput || !targetId) return;
              targetInput.dataset.selectedId = String(targetId);
              targetInput.dataset.selectedRef = `DYNAMIC_${entityName === 'master_project' ? '1040' : entityName === 'project' ? '1044' : entityName === 'layout' ? '1048' : entityName === 'property' ? '1052' : entityName === 'broker' ? '1094' : '1058'}_${targetId}`;
              if (targetData) {
                try {
                  targetInput.dataset.itemData = typeof targetData === 'string' ? targetData : JSON.stringify(targetData);
                } catch (_) {}
              }
              if (targetTitle) {
                targetInput.value = targetTitle;
                targetInput.dataset.selectedTitle = targetTitle;
              } else {
                fetch(`/api/lookup?entity=${encodeURIComponent(entityName)}&q=${encodeURIComponent(targetId)}`, { headers: getCrmAuthHeaders() })
                  .then(r => r.json())
                  .then(d => {
                    const match = (d.items || []).find(it => String(it.id) === String(targetId)) || d.items?.[0];
                    if (match && targetInput) {
                      targetInput.value = match.title;
                      targetInput.dataset.selectedTitle = match.title;
                      targetInput.dataset.itemData = JSON.stringify(match);
                    }
                  }).catch(() => {});
              }
              const targetClear = targetInput.parentElement?.querySelector('.lookup-clear-btn');
              const targetOpen = targetInput.parentElement?.querySelector('.lookup-open-btn');
              if (targetClear) targetClear.style.display = 'block';
              if (targetOpen) targetOpen.style.display = 'inline-flex';
            };

            // Cascading Dependent Lookups (Listing, Master Project, Project, Layout, Developer)
            if (f.code === 'UF_CRM_LISTING') {
              // 1. Listing selected: auto-fill linked Master Project, Project, Layout, and Developer
              if (item.parentId1040) setDependentLookup('UF_CRM_PROJECT', 'master_project', item.parentId1040);
              if (item.parentId1044) setDependentLookup('UF_CRM_PROJECT_1', 'project', item.parentId1044);
              if (item.parentId1048) setDependentLookup('UF_CRM_PROPERTY_LAYOUT', 'layout', item.parentId1048);
              if (item.companyId) setDependentLookup('UF_CRM_DEVELOPER_1', 'developer', item.companyId);

              fetch(`/api/listing/${item.id}`, { headers: getCrmAuthHeaders() })
                .then(r => r.json())
                .then(lData => {
                  const l = lData.listing;
                  if (l) {
                    if (l.parentId1040 || l.UF_CRM_16_1791173000) setDependentLookup('UF_CRM_PROJECT', 'master_project', l.parentId1040 || l.UF_CRM_16_1791173000);
                    if (l.parentId1044 || l.UF_CRM_16_1791173131) setDependentLookup('UF_CRM_PROJECT_1', 'project', l.parentId1044 || l.UF_CRM_16_1791173131);
                    if (l.parentId1048) setDependentLookup('UF_CRM_PROPERTY_LAYOUT', 'layout', l.parentId1048);
                    if (l.companyId || l.COMPANY_ID) setDependentLookup('UF_CRM_DEVELOPER_1', 'developer', l.companyId || l.COMPANY_ID);
                  }
                }).catch(() => {});
            } else if (f.code === 'UF_CRM_PROJECT_1' || f.code === 'UF_CRM_PROJECT_NAME') {
              // 2. Project selected: auto-fill Master Project & Developer
              if (item.parentId1040) {
                setDependentLookup('UF_CRM_PROJECT', 'master_project', item.parentId1040);
              }
              if (item.companyId) {
                setDependentLookup('UF_CRM_DEVELOPER_1', 'developer', item.companyId);
              }
            } else if (f.code === 'UF_CRM_PROPERTY_LAYOUT' || f.code === 'UF_CRM_LAYOUT') {
              // 3. Layout selected: auto-fill Project & Master Project
              if (item.parentId1044) {
                setDependentLookup('UF_CRM_PROJECT_1', 'project', item.parentId1044);
              }
              if (item.parentId1040) {
                setDependentLookup('UF_CRM_PROJECT', 'master_project', item.parentId1040);
              }
            } else if (f.code === 'UF_CRM_1792558317' || f.code === 'UF_CRM_PROJECT') {
              // 4. Master Project selected: auto-fill Developer if present
              if (item.companyId) {
                setDependentLookup('UF_CRM_DEVELOPER_1', 'developer', item.companyId);
              }
            } else if (f.code === 'UF_CRM_PROPERTY' || f.code === 'UF_CRM_MASTERPROPERTY' || f.code === 'parentId1052') {
              // 5. Property selected: auto-fill Project, Layout, Master Project, Developer
              if (item.parentId1044) {
                setDependentLookup('UF_CRM_PROJECT_1', 'project', item.parentId1044);
              }
              if (item.parentId1048) {
                setDependentLookup('UF_CRM_PROPERTY_LAYOUT', 'layout', item.parentId1048);
              }
              if (item.parentId1040) {
                setDependentLookup('UF_CRM_PROJECT', 'master_project', item.parentId1040);
              }
              if (item.companyId) {
                setDependentLookup('UF_CRM_DEVELOPER_1', 'developer', item.companyId);
              }
            }

            markFieldDirty();
          };

          itemEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectItem(item);
          });

          itemEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectItem(item);
          });

          dropdown.appendChild(itemEl);
        });
        adjustDropdownPosition();
      } catch (err) {
        dropdown.innerHTML = '<div class="lookup-item" style="color: var(--b24-danger);">Failed to load records</div>';
        adjustDropdownPosition();
      }
    }

    input.addEventListener('focus', () => {
      if (input.dataset.selectedTitle && input.value.trim() === input.dataset.selectedTitle) {
        queryLookup('');
      } else {
        const cleanVal = input.value.replace(/^#/, '').trim();
        queryLookup(cleanVal);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDropdown();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const firstItem = dropdown.querySelector('.lookup-item:not([style*="cursor: default"])');
        if (firstItem) {
          firstItem.click();
        } else {
          closeDropdown();
        }
      }
    });

    input.addEventListener('input', () => {
      const val = input.value.trim();
      clearBtn.style.display = val ? 'block' : 'none';

      if (!val) {
        input.dataset.selectedId = '';
        input.dataset.selectedRef = '';
        input.dataset.selectedTitle = '';
        input.dataset.itemData = '';
        openBtn.style.display = 'none';
        closeDropdown();

        if (f.code === 'COMPANY_ID' || f.code === 'UF_CRM_DEVELOPER_1') {
          const devNameInput = document.getElementById('field_UF_CRM_DEVELOPER_NAME');
          if (devNameInput) devNameInput.value = '';
        }
      } else {
        if (input.dataset.selectedTitle && input.dataset.selectedTitle !== val) {
          input.dataset.selectedId = '';
          input.dataset.selectedRef = '';
          openBtn.style.display = 'none';
        }
        const numMatch = val.match(/^#?(\d+)$/);
        if (numMatch) {
          input.dataset.selectedId = numMatch[1];
          openBtn.style.display = 'inline-flex';
        }
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const cleanQ = val.replace(/^#/, '').trim();
        queryLookup(cleanQ);
      }, 250);
      markFieldDirty();
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.dataset.selectedId = '';
      input.dataset.selectedRef = '';
      input.dataset.selectedTitle = '';
      input.dataset.itemData = '';
      clearBtn.style.display = 'none';
      openBtn.style.display = 'none';
      closeDropdown();

      if (f.code === 'COMPANY_ID' || f.code === 'UF_CRM_DEVELOPER_1') {
        const devNameInput = document.getElementById('field_UF_CRM_DEVELOPER_NAME');
        if (devNameInput) devNameInput.value = '';
      }

      markFieldDirty();
      input.focus();
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        closeDropdown();
      }
    });

    initialFormValues[f.code] = input.value;
    return { container, inputElement: input };
  }

  /**
   * Normalize Bitrix ISO 8601 date string (e.g. 2026-10-30T03:00:00+03:00) to HTML5 YYYY-MM-DD
   */
  function formatDateForInput(val) {
    if (!val || val === 'N' || val === '0000-00-00' || val === '0' || val === '01.01.1970') return '';
    const s = String(val).trim();
    if (s === 'N' || s === '0000-00-00' || s === '0' || s === '01.01.1970') return '';
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch && !isoMatch[1].startsWith('0000')) return isoMatch[1];
    const b24Match = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (b24Match && b24Match[3] !== '0000' && b24Match[3] !== '1970') return `${b24Match[3]}-${b24Match[2]}-${b24Match[1]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1970) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  /**
   * Normalize Bitrix ISO 8601 datetime string to HTML5 YYYY-MM-DDTHH:mm
   */
  function formatDateTimeForInput(val) {
    if (!val || val === 'N' || val === '0000-00-00' || val === '0' || val === '01.01.1970') return '';
    const s = String(val).trim();
    if (s === 'N' || s === '0000-00-00' || s === '0' || s === '01.01.1970') return '';
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    if (isoMatch && !isoMatch[1].startsWith('0000')) return isoMatch[1];
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1970) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${mins}`;
    }
    return '';
  }

  /**
   * Create field input control supporting lookup, enumeration, boolean, money, date, text, number
   */
  
  // ============================================================================
  // IN-WINDOW MEDIA & FILE PREVIEW COMPONENT + LIGHTBOX VIEWER
  // ============================================================================
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxBody = document.getElementById('lightbox-body');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  const lbNavPrev = document.getElementById('lb-nav-prev');
  const lbNavNext = document.getElementById('lb-nav-next');
  const lightboxFileIcon = document.getElementById('lightbox-file-icon');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const lbFilmstrip = document.getElementById('lb-filmstrip');
  const lbZoomControls = document.getElementById('lb-zoom-controls');
  const lightboxDownloadLink = document.getElementById('lightbox-download-link');

  let _lbGallery = [];
  let _lbIndex = 0;
  let _lbScale = 1;
  let _lbImgX = 0;
  let _lbImgY = 0;
  let lightboxCleanup = null;
  let pendingFileUploads = {}; // fieldCode -> Array of { file, dataUrl, name, size, isImage, isPdf }
  let removedFileIds = {};     // fieldCode -> Set of removed IDs

  function isImageFile(fileName, mimeType) {
    if (mimeType && mimeType.startsWith('image/')) return true;
    return /\.(jpe?g|png|gif|webp|svg|bmp|ico)$/i.test(fileName || '');
  }

  function isPdfFile(fileName, mimeType) {
    if (mimeType === 'application/pdf') return true;
    return /\.pdf$/i.test(fileName || '');
  }

  function getPreviewUrl(url) {
    if (!url || url.startsWith('data:') || url.includes('/api/file/proxy?url=')) return url;
    return /^https?:\/\//i.test(url) ? `/api/file/proxy?url=${encodeURIComponent(url)}` : url;
  }

  function getNativeFileUrl(url) {
    const marker = '/api/file/proxy?url=';
    if (!url || !url.includes(marker)) return url;
    try {
      return decodeURIComponent(url.slice(url.indexOf(marker) + marker.length));
    } catch (_) {
      return url;
    }
  }

  function openInBitrixViewer(url) {
    const nativeUrl = getNativeFileUrl(url);
    if (!nativeUrl) return;
    if (window.BX24 && typeof window.BX24.openPath === 'function' && !nativeUrl.startsWith('data:')) {
      window.BX24.openPath(nativeUrl);
      return;
    }
    window.open(nativeUrl, '_blank', 'noopener');
  }

  function _lbSetCounter() {
    if (!lightboxCounter) return;
    if (_lbGallery.length > 1) {
      lightboxCounter.textContent = `${_lbIndex + 1} / ${_lbGallery.length}`;
      lightboxCounter.style.display = '';
    } else {
      lightboxCounter.style.display = 'none';
    }
  }

  function _lbSetNavState() {
    if (!lbNavPrev || !lbNavNext) return;
    const multi = _lbGallery.length > 1;
    lbNavPrev.style.display = multi ? 'flex' : 'none';
    lbNavNext.style.display = multi ? 'flex' : 'none';
    lbNavPrev.disabled = _lbIndex === 0;
    lbNavNext.disabled = _lbIndex === _lbGallery.length - 1;
  }

  function _lbSyncFilmstrip() {
    if (!lbFilmstrip) return;
    lbFilmstrip.querySelectorAll('.lb-film-item').forEach((el, i) => {
      el.classList.toggle('active', i === _lbIndex);
    });
    const activeEl = lbFilmstrip.querySelectorAll('.lb-film-item')[_lbIndex];
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function _lbBuildFilmstrip(gallery) {
    if (!lbFilmstrip) return;
    lbFilmstrip.innerHTML = '';
    if (gallery.length <= 1) {
      lbFilmstrip.style.display = 'none';
      return;
    }
    lbFilmstrip.style.display = 'flex';
    gallery.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'lb-film-item' + (i === _lbIndex ? ' active' : '');
      if (item.isImage) {
        const filmImg = document.createElement('img');
        filmImg.src = item.url;
        filmImg.alt = item.name;
        filmImg.loading = 'lazy';
        filmImg.onerror = function() {
          if (!this.dataset.proxied && item.url && item.url.startsWith('http')) {
            this.dataset.proxied = '1';
            this.src = `/api/file/proxy?url=${encodeURIComponent(item.url)}`;
          }
        };
        el.appendChild(filmImg);
      } else {
        const badgeClass = item.isPdf ? 'pdf' : 'doc';
        const icon = item.isPdf ? '📄' : '📎';
        el.innerHTML = `
          <div class="lb-film-item-doc">
            <span>${icon}</span>
            <span class="lb-film-badge ${badgeClass}">${item.isPdf ? 'PDF' : 'DOC'}</span>
          </div>
        `;
      }
      el.addEventListener('click', () => _lbGoTo(i));
      lbFilmstrip.appendChild(el);
    });
  }

  function _lbGoTo(idx) {
    if (idx < 0 || idx >= _lbGallery.length) return;
    _lbIndex = idx;
    _lbScale = 1;
    _lbImgX = 0;
    _lbImgY = 0;
    _lbRenderCurrent();
    _lbSetCounter();
    _lbSetNavState();
    _lbSyncFilmstrip();
  }

  function _lbRenderCurrent() {
    if (lightboxCleanup) {
      lightboxCleanup();
      lightboxCleanup = null;
    }
    if (!lightboxBody) return;

    const existingImg = lightboxBody.querySelector('.lightbox-img');
    const existingIframe = lightboxBody.querySelector('.lightbox-iframe');
    const existingError = lightboxBody.querySelector('.lb-error-box');
    const existingPanel = lightboxBody.querySelector('.lb-document-panel');
    if (existingImg) existingImg.remove();
    if (existingIframe) existingIframe.remove();
    if (existingError) existingError.remove();
    if (existingPanel) existingPanel.remove();

    const item = _lbGallery[_lbIndex];
    if (!item) return;

    if (lightboxTitle) lightboxTitle.textContent = item.name || 'Preview';
    if (lightboxDownloadLink) {
      lightboxDownloadLink.href = getPreviewUrl(item.url);
      lightboxDownloadLink.setAttribute('download', item.name || 'download');
    }

    const zoomToggleBtn = document.getElementById('lightbox-zoom-toggle-btn');

    if (item.isPdf) {
      if (lightboxFileIcon) lightboxFileIcon.textContent = '📄';
      if (zoomToggleBtn) zoomToggleBtn.style.display = 'none';
      if (lbZoomControls) lbZoomControls.style.display = 'none';

      const proxyUrl = getPreviewUrl(item.url);
      const iframe = document.createElement('iframe');
      iframe.className = 'lightbox-iframe';
      iframe.src = proxyUrl;
      lightboxBody.appendChild(iframe);
    } else if (item.isImage) {
      if (lightboxFileIcon) lightboxFileIcon.textContent = '🖼️';
      if (lbZoomControls) lbZoomControls.style.display = 'flex';
      if (zoomToggleBtn) {
        zoomToggleBtn.style.display = 'inline-flex';
        zoomToggleBtn.classList.remove('active');
        zoomToggleBtn.title = 'Fit to Screen / 1:1 Size';
      }

      _lbScale = 1;
      _lbImgX = 0;
      _lbImgY = 0;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let hasDragged = false;

      const img = document.createElement('img');
      img.className = 'lightbox-img lb-transitioning';
      img.src = item.url;
      img.alt = item.name;
      img.onerror = () => {
        if (!img.dataset.proxied) {
          img.dataset.proxied = '1';
          let target = item.url;
          if (target.includes('/api/file/proxy?url=')) {
            try { target = decodeURIComponent(target.split('/api/file/proxy?url=')[1]); } catch (_) {}
          }
          img.src = `/api/file/proxy?url=${encodeURIComponent(target)}`;
          return;
        }
        img.style.display = 'none';
        const err = document.createElement('div');
        err.className = 'lb-error-box';
        err.innerHTML = `
          <span style="font-size:32px;">🖼️</span>
          <span>Unable to preview image</span>
          <a href="${item.url}" target="_blank" class="lb-error-link">Open in new tab ↗</a>
        `;
        lightboxBody.appendChild(err);
      };
      lightboxBody.appendChild(img);

      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.classList.remove('lb-transitioning');
      }));

      const applyTransform = (smooth = true) => {
        img.style.transition = smooth ? 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
        img.style.transform = `translate(${_lbImgX}px, ${_lbImgY}px) scale(${_lbScale})`;
      };

      const setZoom = (scale, smooth = true) => {
        _lbScale = Math.max(1, Math.min(8, scale));
        if (_lbScale === 1) {
          _lbImgX = 0;
          _lbImgY = 0;
        }
        applyTransform(smooth);
        img.classList.toggle('zoomed-in', _lbScale > 1);
        if (zoomToggleBtn) {
          zoomToggleBtn.classList.toggle('active', _lbScale > 1);
          zoomToggleBtn.title = _lbScale > 1 ? 'Fit to Screen' : '1:1 Original Size';
        }
      };

      const toggleZoom = () => setZoom(_lbScale > 1 ? 1 : 4);

      const zbIn = document.getElementById('lb-zoom-in-btn');
      const zbOut = document.getElementById('lb-zoom-out-btn');
      const zbReset = document.getElementById('lb-zoom-reset-btn');
      if (zbIn) zbIn.onclick = () => setZoom(_lbScale * 1.5);
      if (zbOut) zbOut.onclick = () => setZoom(_lbScale / 1.5);
      if (zbReset) zbReset.onclick = () => setZoom(1);

      img.addEventListener('click', () => {
        if (hasDragged) { hasDragged = false; return; }
        toggleZoom();
      });

      if (zoomToggleBtn) zoomToggleBtn.onclick = toggleZoom;

      img.addEventListener('mousedown', (e) => {
        if (_lbScale <= 1) return;
        isDragging = true;
        hasDragged = false;
        dragStartX = e.clientX - _lbImgX;
        dragStartY = e.clientY - _lbImgY;
        img.classList.add('grabbing');
        e.preventDefault();
      });

      const onMove = (e) => {
        if (!isDragging || _lbScale <= 1) return;
        const nx = e.clientX - dragStartX;
        const ny = e.clientY - dragStartY;
        if (Math.abs(nx - _lbImgX) > 3 || Math.abs(ny - _lbImgY) > 3) hasDragged = true;
        _lbImgX = nx;
        _lbImgY = ny;
        applyTransform(false);
      };

      const onUp = () => {
        if (!isDragging) return;
        isDragging = false;
        img.classList.remove('grabbing');
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);

      const onWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.85 : 1.2;
        setZoom(_lbScale * delta, false);
      };
      lightboxBody.addEventListener('wheel', onWheel, { passive: false });

      lightboxCleanup = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        lightboxBody.removeEventListener('wheel', onWheel);
        if (zbIn) zbIn.onclick = null;
        if (zbOut) zbOut.onclick = null;
        if (zbReset) zbReset.onclick = null;
        if (zoomToggleBtn) zoomToggleBtn.onclick = null;
      };
    } else {
      if (lightboxFileIcon) lightboxFileIcon.textContent = '📎';
      if (zoomToggleBtn) zoomToggleBtn.style.display = 'none';
      if (lbZoomControls) lbZoomControls.style.display = 'none';

      const panel = document.createElement('div');
      panel.className = 'lb-document-panel';
      panel.innerHTML = `
        <span class="lb-document-icon">📄</span>
        <strong class="lb-document-name">${item.name || 'Document'}</strong>
        <p>Open this file using the Bitrix24 viewer.</p>
        <button type="button" class="lb-document-open">Open in Bitrix24</button>
      `;
      panel.querySelector('.lb-document-open').addEventListener('click', () => openInBitrixViewer(item.url));
      lightboxBody.appendChild(panel);
    }
  }

  function openLightbox(title, url, isPdf = false, gallery = null, startIdx = 0, sourceEl = null) {
    if (!lightboxModal) return;
    if (gallery && gallery.length > 1) {
      _lbGallery = gallery;
      _lbIndex = startIdx;
    } else {
      _lbGallery = [{ url, name: title, isImage: !isPdf, isPdf }];
      _lbIndex = 0;
    }

    _lbBuildFilmstrip(_lbGallery);
    _lbRenderCurrent();
    _lbSetCounter();
    _lbSetNavState();

    const isEmbedded = window.self !== window.top || document.documentElement.scrollHeight > window.innerHeight + 150;
    const contentEl = lightboxModal.querySelector('.lightbox-content');
    if (isEmbedded) {
      const docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight);
      lightboxModal.style.position = 'absolute';
      lightboxModal.style.top = '0px';
      lightboxModal.style.left = '0px';
      lightboxModal.style.width = '100%';
      lightboxModal.style.height = docHeight + 'px';
      lightboxModal.style.minHeight = '100%';
      lightboxModal.style.alignItems = 'flex-start';

      let targetTop = 40;
      if (sourceEl) {
        const elTop = sourceEl.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
        targetTop = Math.max(20, elTop - 340);
      } else {
        const scrollPos = window.pageYOffset || document.documentElement.scrollTop || 0;
        targetTop = Math.max(20, scrollPos + 40);
      }

      if (contentEl) {
        contentEl.style.height = '85vh';
        contentEl.style.maxHeight = '820px';
        contentEl.style.marginTop = targetTop + 'px';
        try { contentEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      }
    } else {
      lightboxModal.style.position = 'fixed';
      lightboxModal.style.top = '0px';
      lightboxModal.style.left = '0px';
      lightboxModal.style.width = '100%';
      lightboxModal.style.height = '100vh';
      lightboxModal.style.maxHeight = '100vh';
      lightboxModal.style.alignItems = 'center';
      if (contentEl) {
        contentEl.style.height = '100%';
        contentEl.style.maxHeight = '100%';
        contentEl.style.marginTop = '';
      }
    }

    lightboxModal.style.display = 'flex';
    lightboxModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    if (lightboxCleanup) {
      lightboxCleanup();
      lightboxCleanup = null;
    }
    const contentEl = lightboxModal.querySelector('.lightbox-content');
    if (contentEl) {
      contentEl.style.height = '';
      contentEl.style.maxHeight = '';
      contentEl.style.marginTop = '';
    }
    lightboxModal.style.display = 'none';
    lightboxModal.classList.remove('is-open');
    document.body.style.overflow = '';

    if (lightboxBody) {
      const img = lightboxBody.querySelector('.lightbox-img');
      const iframe = lightboxBody.querySelector('.lightbox-iframe');
      const errorBox = lightboxBody.querySelector('.lb-error-box');
      const panel = lightboxBody.querySelector('.lb-document-panel');
      if (img) img.remove();
      if (iframe) iframe.remove();
      if (errorBox) errorBox.remove();
      if (panel) panel.remove();
    }
    _lbGallery = [];
    _lbIndex = 0;
    _lbScale = 1;
    _lbImgX = 0;
    _lbImgY = 0;
  }

  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal || e.target.classList.contains('b24-native-viewer')) {
        closeLightbox();
      }
    });
  }
  if (lbNavPrev) lbNavPrev.addEventListener('click', () => _lbGoTo(_lbIndex - 1));
  if (lbNavNext) lbNavNext.addEventListener('click', () => _lbGoTo(_lbIndex + 1));

  const b24ViewerMoreBtn = document.getElementById('b24-viewer-more-btn');
  if (b24ViewerMoreBtn) {
    b24ViewerMoreBtn.addEventListener('click', () => {
      const item = _lbGallery[_lbIndex];
      if (item && item.url) openInBitrixViewer(item.url);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!lightboxModal || lightboxModal.style.display !== 'flex') return;
    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key === 'ArrowLeft') { _lbGoTo(_lbIndex - 1); return; }
    if (e.key === 'ArrowRight') { _lbGoTo(_lbIndex + 1); return; }
    if (e.key === '+' || e.key === '=') {
      const zbIn = document.getElementById('lb-zoom-in-btn');
      if (zbIn) zbIn.click();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      const zbOut = document.getElementById('lb-zoom-out-btn');
      if (zbOut) zbOut.click();
      return;
    }
    if (e.key === '0') {
      const zbReset = document.getElementById('lb-zoom-reset-btn');
      if (zbReset) zbReset.click();
      return;
    }
  });

  // Handle local newly selected files with instant in-window FileReader preview
  function handleLocalFiles(fieldCode, files, viewportBox, stripWrap) {
    if (!pendingFileUploads[fieldCode]) {
      pendingFileUploads[fieldCode] = [];
    }

    Array.from(files).forEach(file => {
      const isImg = isImageFile(file.name, file.type);
      const isPdf = isPdfFile(file.name, file.type);
      const reader = new FileReader();

      reader.onload = function(e) {
        const dataUrl = e.target.result;
        const pendingItem = {
          file,
          dataUrl,
          name: file.name,
          size: file.size,
          isImage: isImg,
          isPdf
        };
        pendingFileUploads[fieldCode].push(pendingItem);
        setDirty(true);

        const thumb = document.createElement('div');
        thumb.className = `thumb-item ${isImg ? 'preview-thumb-wrap' : 'preview-doc-wrap'} b24-file-tile active`;
        thumb.title = `${file.name} (Ready to upload)`;

        if (isImg) {
          thumb.innerHTML = `
            <div class="b24-tile-thumb-wrap">
              <img class="thumb-item-img b24-tile-img" src="${dataUrl}" alt="${file.name}">
              <div class="thumb-zoom-overlay">🔍 View</div>
              <button type="button" class="thumb-remove-btn" title="Remove">✕</button>
            </div>
            <div class="b24-tile-footer">
              <span class="b24-tile-name" title="${file.name}">${file.name}</span>
              <div class="b24-list-actions">
                <button type="button" class="b24-list-btn view-btn" title="View / Preview">🔍 View</button>
                <button type="button" class="b24-list-btn remove-btn thumb-remove-btn-list" title="Remove">✕</button>
              </div>
            </div>
          `;
        } else {
          thumb.innerHTML = `
            <div class="b24-tile-thumb-wrap">
              <div class="doc-tile-inner">
                <span class="doc-tile-badge ${isPdf ? 'pdf' : 'doc'}">${isPdf ? 'PDF' : 'DOC'}</span>
                <span class="doc-tile-icon">📄</span>
              </div>
              <div class="thumb-zoom-overlay">🔍 View</div>
              <button type="button" class="thumb-remove-btn" title="Remove">✕</button>
            </div>
            <div class="b24-tile-footer">
              <span class="b24-tile-name" title="${file.name}">${file.name}</span>
              <div class="b24-list-actions">
                <button type="button" class="b24-list-btn view-btn" title="View / Preview">🔍 View</button>
                <button type="button" class="b24-list-btn remove-btn thumb-remove-btn-list" title="Remove">✕</button>
              </div>
            </div>
          `;
        }

        const removeLocalItem = (ev) => {
          ev.stopPropagation();
          const idx = pendingFileUploads[fieldCode].indexOf(pendingItem);
          if (idx > -1) pendingFileUploads[fieldCode].splice(idx, 1);
          thumb.remove();
          if (viewportBox) {
            viewportBox.style.display = 'none';
            viewportBox.innerHTML = '';
          }
          setDirty(true);
          resizeWindow();
        };

        const rBtn = thumb.querySelector('.thumb-remove-btn');
        if (rBtn) rBtn.addEventListener('click', removeLocalItem);
        const lrBtn = thumb.querySelector('.thumb-remove-btn-list');
        if (lrBtn) lrBtn.addEventListener('click', removeLocalItem);

        const vBtn = thumb.querySelector('.b24-list-btn.view-btn');
        if (vBtn) {
          vBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openLightbox(file.name, dataUrl, isPdf, null, 0, thumb);
            stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
          });
        }

        thumb.addEventListener('click', (ev) => {
          if (ev.target.closest('.thumb-remove-btn') || ev.target.closest('.thumb-remove-btn-list') || ev.target.closest('.b24-list-actions')) return;
          openLightbox(file.name, dataUrl, isPdf, null, 0, thumb);
          stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
        });

        stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
        stripWrap.appendChild(thumb);
        resizeWindow();
      };

      reader.readAsDataURL(file);
    });
  }


  function createFieldInput(f, currentVal, markFieldDirty) {
    if (isLookupField(f)) {
      if (!f.lookupEntity) f.lookupEntity = resolveLookupEntity(f);
      return createLookupInput(f, currentVal, markFieldDirty);
    }

    const container = document.createElement('div');
    let inputElement;

    // Automated Read-only fields (e.g. First Contacted Date)
    if (f.code === 'UF_CRM_FIRST_CONTACTED_DATE' || f.automated) {
      inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.className = 'form-control readonly-automated-input';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;
      inputElement.readOnly = true;
      inputElement.title = 'Automated based on activity and events in Bitrix24 CRM';

      let formattedDate = currentVal ? formatDateTimeForInput(currentVal) : '';
      if (formattedDate) {
        formattedDate = formattedDate.replace('T', ' ');
      }
      inputElement.value = formattedDate || 'Not contacted yet (Automated via CRM)';

      container.appendChild(inputElement);
      initialFormValues[f.code] = currentVal || '';
      return { container, inputElement };
    }

    if (f.type === 'enumeration') {
      inputElement = document.createElement('select');
      inputElement.className = 'form-control';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = f.placeholder || '-- Select option --';
      inputElement.appendChild(defaultOption);

      const options = f.options || [];
      options.forEach(opt => {
        const optEl = document.createElement('option');
        const optValue = typeof opt === 'object' ? (opt.id || opt.value) : opt;
        const optText = typeof opt === 'object' ? (opt.value || opt.id) : opt;
        optEl.value = optValue;
        optEl.textContent = optText;

        const curStr = String(currentVal === null || currentVal === undefined ? '' : currentVal).trim().toLowerCase();
        if (curStr && curStr !== '0' && (
          curStr === String(optValue).trim().toLowerCase() ||
          curStr === String(optText).trim().toLowerCase() ||
          curStr.replace(/s$/, '') === String(optValue).trim().toLowerCase().replace(/s$/, '') ||
          curStr.replace(/s$/, '') === String(optText).trim().toLowerCase().replace(/s$/, '') ||
          (optText.toLowerCase().includes(curStr) && curStr.length >= 4)
        )) {
          optEl.selected = true;
        }
        inputElement.appendChild(optEl);
      });

      container.appendChild(inputElement);
      initialFormValues[f.code] = inputElement.value;
    } else if (f.type === 'boolean') {
      const wrap = document.createElement('label');
      wrap.className = 'checkbox-wrap';

      inputElement = document.createElement('input');
      inputElement.type = 'checkbox';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;
      inputElement.checked = (currentVal === 'Y' || currentVal === true || currentVal === 1 || currentVal === '1');

      const span = document.createElement('span');
      span.className = 'checkbox-label-text';
      span.textContent = (f.placeholder && f.placeholder !== 'Yes / Confirmed') ? f.placeholder : 'Yes';

      wrap.appendChild(inputElement);
      wrap.appendChild(span);
      container.appendChild(wrap);

      initialFormValues[f.code] = inputElement.checked;
    } else if (f.type === 'text' || f.type === 'textarea') {
      inputElement = document.createElement('textarea');
      inputElement.className = 'form-control';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;
      inputElement.placeholder = f.placeholder || '';
      if (f.rows) inputElement.rows = f.rows;
      inputElement.value = Array.isArray(currentVal) ? currentVal.join(', ') : (currentVal || '');

      container.appendChild(inputElement);
      initialFormValues[f.code] = inputElement.value;
    } else if (f.type === 'money') {
      const group = document.createElement('div');
      group.className = 'input-group';

      inputElement = document.createElement('input');
      inputElement.className = 'form-control';
      inputElement.type = 'number';
      inputElement.step = 'any';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;
      inputElement.placeholder = f.placeholder || 'e.g., 2,500,000';

      let displayVal = currentVal;
      if (typeof displayVal === 'string' && displayVal.includes('|')) {
        displayVal = displayVal.split('|')[0];
      }
      inputElement.value = displayVal || '';

      const addon = document.createElement('span');
      addon.className = 'input-group-addon';
      addon.textContent = 'AED';

      group.appendChild(inputElement);
      group.appendChild(addon);
      container.appendChild(group);

      initialFormValues[f.code] = inputElement.value;
    } else if (f.type === 'file') {
      const fileContainer = document.createElement('div');
      fileContainer.className = 'file-field-container';

      inputElement = document.createElement('input');
      inputElement.type = 'file';
      inputElement.className = 'form-control file-input';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;
      inputElement.style.display = 'none';

      // Allow multiple file selection for multiple-file fields
      const isMultiple = f.multiple || f.code.includes('PHOTOS') || f.code.includes('DOCUMENTS') || f.code.endsWith('_1');
      if (isMultiple) {
        inputElement.multiple = true;
      }
      fileContainer.appendChild(inputElement);

      const card = document.createElement('div');
      card.className = 'file-upload-card';

      // 1. Bitrix24 View Switcher Bar
      const switcher = document.createElement('div');
      switcher.className = 'b24-view-switcher';
      switcher.innerHTML = `
        <button type="button" class="b24-view-btn active" data-view="tile" title="Tile view">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          Tile
        </button>
        <button type="button" class="b24-view-btn" data-view="list" title="List view">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          List
        </button>
        <button type="button" class="b24-view-btn" data-view="fit" title="Fit width">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
          Fit width
        </button>
      `;

      // 2. Dropzone box
      const dropzone = document.createElement('div');
      dropzone.className = 'dropzone-box';
      const isImgField = f.code.includes('IMAGE') || f.code.includes('PHOTO') || f.code.includes('QR_CODE');
      const uploadLabel = isImgField ? (isMultiple ? 'Upload Photos' : 'Upload Image') : (isMultiple ? 'Upload Documents' : 'Upload Document');

      dropzone.innerHTML = `
        <span class="dropzone-icon">📁</span>
        <div class="dropzone-text-group">
          <span class="dropzone-title">${uploadLabel}</span>
          <span class="dropzone-sub">Click to browse or drop file</span>
        </div>
      `;

      dropzone.addEventListener('click', () => inputElement.click());

      // 3. Inline preview viewport
      const viewportBox = document.createElement('div');
      viewportBox.className = 'inline-preview-viewport';
      viewportBox.id = `viewport_${f.code}`;
      viewportBox.style.display = 'none';

      // 4. Files strip
      const stripWrap = document.createElement('div');
      stripWrap.className = 'thumbnail-strip b24-files-container';
      stripWrap.id = `strip_${f.code}`;

      switcher.querySelectorAll('.b24-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          switcher.querySelectorAll('.b24-view-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const viewMode = btn.dataset.view;
          stripWrap.classList.remove('view-tile', 'view-list', 'view-fit');
          stripWrap.classList.add(`view-${viewMode}`);
        });
      });

      // Handle drop & file selection with instant FileReader previews
      dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files?.length) {
          handleLocalFiles(f.code, e.dataTransfer.files, viewportBox, stripWrap);
        }
      });

      inputElement.addEventListener('change', () => {
        if (inputElement.files?.length) {
          handleLocalFiles(f.code, inputElement.files, viewportBox, stripWrap);
        }
      });

      // Populate existing files
      const filesList = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
      const fieldGallery = [];

      filesList.forEach((fileItem, idx) => {
        if (!fileItem) return;

        let fileUrl = '';
        let fileName = '';
        let fid = null;

        if (typeof fileItem === 'object') {
          fileUrl = fileItem.urlMachine || fileItem.showUrl || fileItem.downloadUrl || fileItem.url || fileItem.src || fileItem.SRC || '';
          fid = fileItem.id || fileItem.ID || fileItem.fileId || null;
          if (!fileUrl && fid) {
            fileUrl = `/bitrix/tools/crm_show_file.php?fileId=${fid}`;
          }
          fileName = fileItem.name || fileItem.NAME || fileItem.fileName || fileItem.originalName || fileItem.ORIGINAL_NAME || '';
          if (!fileName && fileUrl) {
            const m = fileUrl.match(/filename=([^&]+)/i);
            if (m && m[1]) {
              try { fileName = decodeURIComponent(m[1]); } catch (_) { fileName = m[1]; }
            }
          }
          if (!fileName) {
            fileName = fid ? `File #${fid}` : `${f.label} #${idx + 1}`;
          }
        } else if (typeof fileItem === 'number' || (typeof fileItem === 'string' && /^\d+$/.test(fileItem.trim()))) {
          fid = String(fileItem).trim();
          fileUrl = `/bitrix/tools/crm_show_file.php?fileId=${fid}`;
          fileName = `${f.label} #${idx + 1}`;
        } else if (typeof fileItem === 'string' && fileItem.startsWith('http')) {
          fileUrl = fileItem;
          fileName = fileItem.split('/').pop().split('?')[0] || 'Attached File';
        } else if (typeof fileItem === 'string' && fileItem.trim()) {
          fileUrl = fileItem.trim();
          fileName = fileItem.split('/').pop().split('?')[0] || `${f.label} #${idx + 1}`;
        }

        if (!fileUrl) return;

        if (!fid && fileUrl) {
          const idMatch = fileUrl.match(/(?:fileId|file_id|id)=(\d+)/i) || fileUrl.match(/\/file\/(\d+)/i);
          if (idMatch) fid = idMatch[1];
        }

        const domain = window.__BITRIX_DOMAIN__ || (window.location ? window.location.hostname : 'csl.bitrix24.com');
        let fullUrl = fileUrl.startsWith('http') ? fileUrl : `https://${domain}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
        if (fullUrl.includes('ajax.php') && !fullUrl.includes('token=')) {
          fullUrl = `/api/file/proxy?url=${encodeURIComponent(fullUrl)}`;
        }

        const isImg = isImageFile(fileName) || (isImgField && !isPdfFile(fileName));
        const isPdf = isPdfFile(fileName);

        const item = { url: fullUrl, name: fileName, isImage: isImg, isPdf, id: fid };
        fieldGallery.push(item);

        const thumb = document.createElement('div');
        thumb.className = `thumb-item ${isImg ? 'preview-thumb-wrap' : 'preview-doc-wrap'} b24-file-tile`;
        thumb.title = `${fileName} - Click to preview`;

        if (isImg) {
          thumb.innerHTML = `
            <div class="b24-tile-thumb-wrap">
              <img class="b24-tile-img thumb-item-img" src="${fullUrl}" alt="${fileName}" loading="lazy">
              <div class="thumb-zoom-overlay">🔍 View</div>
              <button type="button" class="thumb-remove-btn" title="Remove file" aria-label="Remove file">✕</button>
            </div>
            <div class="b24-tile-footer">
              <span class="b24-tile-name" title="${fileName}">${fileName}</span>
              <div class="b24-list-actions">
                <button type="button" class="b24-list-btn view-btn" title="View / Preview">🔍 View</button>
                <button type="button" class="b24-list-btn remove-btn thumb-remove-btn-list" title="Remove file">✕</button>
              </div>
            </div>
          `;

          const imgEl = thumb.querySelector('.thumb-item-img');
          imgEl.onerror = function() {
            if (!this.dataset.proxied && fullUrl.startsWith('http')) {
              this.dataset.proxied = '1';
              let target = fullUrl;
              if (target.includes('/api/file/proxy?url=')) {
                try { target = decodeURIComponent(target.split('/api/file/proxy?url=')[1]); } catch (_) {}
              }
              this.src = `/api/file/proxy?url=${encodeURIComponent(target)}`;
            } else {
              this.onerror = null;
              const wrap = thumb.querySelector('.b24-tile-thumb-wrap');
              wrap.innerHTML = `
                <div class="doc-tile-inner"><span class="doc-tile-badge img">IMG</span><span class="doc-tile-icon">🖼️</span></div>
                <div class="thumb-zoom-overlay">🔍 View</div>
                <button type="button" class="thumb-remove-btn" title="Remove file" aria-label="Remove file">✕</button>
              `;
              const retryRemove = wrap.querySelector('.thumb-remove-btn');
              if (retryRemove) retryRemove.addEventListener('click', handleRemoveItem);
            }
          };
        } else {
          thumb.innerHTML = `
            <div class="b24-tile-thumb-wrap">
              <div class="doc-tile-inner">
                <span class="doc-tile-badge ${isPdf ? 'pdf' : 'doc'}">${isPdf ? 'PDF' : 'DOC'}</span>
                <span class="doc-tile-icon">📄</span>
              </div>
              <div class="thumb-zoom-overlay">🔍 View</div>
              <button type="button" class="thumb-remove-btn" title="Remove file" aria-label="Remove file">✕</button>
            </div>
            <div class="b24-tile-footer">
              <span class="b24-tile-name" title="${fileName}">${fileName}</span>
              <div class="b24-list-actions">
                <button type="button" class="b24-list-btn view-btn" title="View / Preview">🔍 View</button>
                <button type="button" class="b24-list-btn remove-btn thumb-remove-btn-list" title="Remove file">✕</button>
              </div>
            </div>
          `;
        }

        const handleRemoveItem = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          if (item.id) {
            if (!removedFileIds[f.code]) removedFileIds[f.code] = new Set();
            removedFileIds[f.code].add(String(item.id));
          }
          const gIdx = fieldGallery.indexOf(item);
          if (gIdx !== -1) fieldGallery.splice(gIdx, 1);
          thumb.remove();
          setDirty(true);
          resizeWindow();
          showToast(`Marked "${fileName}" for removal. Click Save Changes to apply.`, 'info');
        };

        const removeBtn = thumb.querySelector('.thumb-remove-btn');
        if (removeBtn) removeBtn.addEventListener('click', handleRemoveItem);
        const listRemoveBtn = thumb.querySelector('.thumb-remove-btn-list');
        if (listRemoveBtn) listRemoveBtn.addEventListener('click', handleRemoveItem);

        const listViewBtn = thumb.querySelector('.b24-list-btn.view-btn');
        if (listViewBtn) {
          listViewBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const currIdx = Math.max(0, fieldGallery.indexOf(item));
            openLightbox(item.name, item.url, item.isPdf, fieldGallery, currIdx, thumb);
            stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
          });
        }

        thumb.addEventListener('click', (ev) => {
          if (ev.target.closest('.thumb-remove-btn') || ev.target.closest('.thumb-remove-btn-list') || ev.target.closest('.b24-list-actions')) return;
          const currIdx = Math.max(0, fieldGallery.indexOf(item));
          openLightbox(item.name, item.url, item.isPdf, fieldGallery, currIdx, thumb);
          stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
        });

        stripWrap.appendChild(thumb);
      });

      card.appendChild(switcher);
      card.appendChild(stripWrap);
      card.appendChild(dropzone);
      card.appendChild(viewportBox);
      fileContainer.appendChild(card);
      container.appendChild(fileContainer);
      initialFormValues[f.code] = '';
    } else if (f.type === 'address') {
      inputElement = document.createElement('textarea');
      inputElement.className = 'form-control';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;
      inputElement.rows = 2;
      inputElement.placeholder = f.placeholder || 'Street, Building, Apartment/Office, District, City, Country, Zip code';
      
      let addrStr = '';
      if (typeof currentVal === 'object' && currentVal !== null) {
        addrStr = [currentVal.ADDRESS_1, currentVal.ADDRESS_2, currentVal.CITY, currentVal.PROVINCE, currentVal.COUNTRY, currentVal.POSTAL_CODE].filter(Boolean).join(', ');
      } else {
        addrStr = currentVal || '';
      }
      inputElement.value = addrStr;

      container.appendChild(inputElement);
      initialFormValues[f.code] = inputElement.value;
    } else {
      inputElement = document.createElement('input');
      inputElement.className = 'form-control';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;
      inputElement.placeholder = f.placeholder || '';

      if (f.type === 'number' || f.type === 'integer' || f.type === 'double') {
        inputElement.type = 'number';
        if (f.type === 'number' || f.type === 'double') inputElement.step = 'any';
        inputElement.value = currentVal !== undefined && currentVal !== null ? currentVal : '';
      } else if (f.type === 'date') {
        inputElement.type = 'date';
        inputElement.value = formatDateForInput(currentVal);
      } else if (f.type === 'datetime') {
        inputElement.type = 'datetime-local';
        inputElement.value = formatDateTimeForInput(currentVal);
      } else if (f.type === 'url') {
        inputElement.type = 'url';
        inputElement.value = currentVal || '';
      } else {
        inputElement.type = 'text';
        inputElement.value = Array.isArray(currentVal) ? currentVal.join(', ') : (currentVal || '');
      }

      container.appendChild(inputElement);
      initialFormValues[f.code] = inputElement.value;
    }

    if (inputElement) {
      inputElement.addEventListener('input', markFieldDirty);
      inputElement.addEventListener('change', markFieldDirty);
    }

    return { container, inputElement };
  }

  function applyEnquirySubLayout(enquiryTypeRaw) {
    if (currentLayout !== 'enquiry') return;
    const str = String(enquiryTypeRaw || '').toLowerCase().trim();
    let sub = 'all';
    if (str.includes('rent') && str.includes('commercial')) {
      sub = 'commercial_rent';
    } else if ((str.includes('buy') || str.includes('sale')) && str.includes('commercial')) {
      sub = 'commercial_buy';
    } else if (str.includes('rent') || str === '2578') {
      sub = 'rent';
    } else if (str.includes('buy') || str.includes('sale') || str === '2580') {
      sub = 'buy';
    }

    // Rules for enquiry requirement fields:
    // Rent: show monthly rent min/max, number of cheques, move date. Hide price min/max, purchase amount, finance.
    // Buy: show price min/max, purchase amount, finance. Hide rent min/max, number of cheques.
    const rentFieldCodes = [
      'UF_CRM_MONTHLYRENTMIN',
      'UF_CRM_MONTHLYRENTMAX',
      'UF_CRM_1792139023' // Number of Cheques
    ];
    const buyFieldCodes = [
      'UF_CRM_LISTINGPRICE_MIN',
      'UF_CRM_LISTINGPRICE_MAX',
      'UF_CRM_FINANCE'
    ];

    let totalActive = 0;
    const sections = tabConfig?.enquiryLayout?.sections || [];

    sections.forEach((sec, sIdx) => {
      const secId = `section_${sec.id || sIdx}`;
      const sectionCard = document.getElementById(secId);
      let secActiveCount = 0;

      (sec.fields || []).forEach(f => {
        const fg = document.querySelector(`.form-group[data-field-code="${f.code}"]`);
        let isVisible = true;

        if (sub === 'rent') {
          if (buyFieldCodes.includes(f.code)) isVisible = false;
        } else if (sub === 'buy') {
          if (rentFieldCodes.includes(f.code)) isVisible = false;
        } else if (sub === 'commercial_rent') {
          if (buyFieldCodes.includes(f.code)) isVisible = false;
        } else if (sub === 'commercial_buy') {
          if (rentFieldCodes.includes(f.code)) isVisible = false;
        }

        if (fg) {
          fg.style.display = isVisible ? '' : 'none';
        }
        if (isVisible) secActiveCount++;
      });

      totalActive += secActiveCount;

      if (sectionCard) {
        const badgeCount = sectionCard.querySelector('.section-badge-count');
        if (badgeCount) badgeCount.textContent = `${secActiveCount} fields`;
        sectionCard.style.display = secActiveCount === 0 ? 'none' : '';
      }

      const pill = sectionNavPills.children[sIdx + 1];
      if (pill) {
        pill.style.display = secActiveCount === 0 ? 'none' : '';
      }
    });

    if (fieldsCountBadge) {
      fieldsCountBadge.textContent = `${totalActive} fields in ${sections.length} sections`;
    }
    resizeWindow();
  }

  function evaluateListingFieldVisibility(f, subLayout, leadData = null) {
    if (!f || !f.rules) return true;

    // Handle External Stock dynamic transaction type
    if (subLayout === 'external_stock') {
      const ttEl = document.getElementById('field_UF_CRM_TRANSACTION_TYPE') || document.querySelector('[name="UF_CRM_TRANSACTION_TYPE"]');
      let txType = ttEl ? String(ttEl.value || '').trim().toLowerCase() : '';
      if (!txType) {
        const leadObj = leadData || currentLead;
        txType = String(leadObj?.UF_CRM_TRANSACTION_TYPE || '').trim().toLowerCase();
      }

      // If External Stock is for Rent
      const isRentTx = txType === 'rent' || txType === '2';
      const isSaleTx = txType === 'sale' || txType === '1';
      if (isRentTx) {
        if (['UF_CRM_HOAFREQUENCY', 'UF_CRM_PETDEPOSIT', 'UF_CRM_1792139023'].includes(f.code)) {
          return true;
        }
        if (['UF_CRM_PAYMENT_PLAN', 'UF_CRM_BOOKING_AMOUNT', 'UF_CRM_INSTALLMENT_DETAILS', 'UF_CRM_HANDOVER_PAYMENT'].includes(f.code)) {
          return false;
        }
      } else if (isSaleTx) {
        if (['UF_CRM_HOAFREQUENCY', 'UF_CRM_PETDEPOSIT', 'UF_CRM_1792139023'].includes(f.code)) {
          return false;
        }
      }
    }

    const rule = f.rules[subLayout] || 'show';
    if (rule === 'hide') return false;
    if (rule === 'show' || rule === 'opt') return true;
    if (rule === 'conditional') {
      if (f.conditional && f.conditional.field) {
        const depCode = f.conditional.field;
        let depVal = '';
        const depEl = document.getElementById(`field_${depCode}`) || document.querySelector(`[name="${depCode}"]`);
        if (depEl) {
          depVal = depEl.value !== undefined ? String(depEl.value).trim() : '';
        }
        if (!depVal) {
          const leadObj = leadData || currentLead;
          if (leadObj) {
            depVal = String(leadObj[depCode] || leadObj[depCode + '_TITLE'] || '').trim();
          }
        }
        const targetValues = Array.isArray(f.conditional.values) ? f.conditional.values : [f.conditional.values];
        const matches = targetValues.some(tv => String(tv).toLowerCase() === depVal.toLowerCase());
        if (matches) return true;

        // If the conditional field already has an active value on this record, keep visible
        const leadObj = leadData || currentLead;
        if (leadObj && leadObj[f.code] && String(leadObj[f.code]).trim() !== '') {
          return true;
        }
        return false;
      }
      return true;
    }
    return true;
  }

  function applyListingSubLayout(subLayout, previousSubLayout = null) {
    const isLayoutChanged = previousSubLayout && previousSubLayout !== subLayout;
    currentListingSubLayout = subLayout;
    const meta = LISTING_LAYOUT_META[subLayout] || LISTING_LAYOUT_META.rent;
    if (listingLayoutBadge) {
      listingLayoutBadge.className = `layout-pill ${meta.pillClass}`;
      listingLayoutBadge.innerHTML = `${meta.icon} ${meta.title}`;
      listingLayoutBadge.style.display = 'inline-flex';
    }

    // Determine transaction type for External Stock
    let externalTxType = 'sale';
    if (subLayout === 'external_stock') {
      const ttEl = document.getElementById('field_UF_CRM_TRANSACTION_TYPE') || document.querySelector('[name="UF_CRM_TRANSACTION_TYPE"]');
      if (ttEl && ttEl.value) {
        externalTxType = String(ttEl.value).trim().toLowerCase();
      } else if (currentLead?.UF_CRM_TRANSACTION_TYPE) {
        externalTxType = String(currentLead.UF_CRM_TRANSACTION_TYPE).trim().toLowerCase();
      }
    }

    const sections = tabConfig?.listingLayout?.sections || [];

    // When Listing Type changes, clear values belonging to the previously selected type
    if (isLayoutChanged) {
      sections.forEach(sec => {
        (sec.fields || []).forEach(f => {
          const wasVisible = evaluateListingFieldVisibility(f, previousSubLayout);
          const isNowVisible = evaluateListingFieldVisibility(f, subLayout);
          if (wasVisible && !isNowVisible) {
            const el = document.getElementById(`field_${f.code}`) || document.querySelector(`[name="${f.code}"]`);
            if (el) {
              if (el.type === 'checkbox') {
                el.checked = false;
              } else if (el.tagName === 'SELECT') {
                el.selectedIndex = 0;
                el.value = el.options[0]?.value || '';
              } else {
                el.value = '';
              }
              if (el.dataset) {
                delete el.dataset.selectedId;
                delete el.dataset.selectedRef;
                delete el.dataset.selectedTitle;
              }
              setDirty(true);
            }
          }
        });
      });
    }

    let totalActive = 0;

    sections.forEach((sec, sIdx) => {
      const secId = `section_${sec.id || sIdx}`;
      const sectionCard = document.getElementById(secId);
      let secActiveCount = 0;

      (sec.fields || []).forEach(f => {
        const fg = document.querySelector(`.form-group[data-field-code="${f.code}"]`);
        const isVisible = evaluateListingFieldVisibility(f, subLayout);
        if (fg) {
          fg.style.display = isVisible ? '' : 'none';
          const labelEl = fg.querySelector('.form-label');
          if (labelEl) {
            let customLabel = f.label;
            if (f.code === 'UF_CRM_LISTING_PRICE') {
              const isRentTx = externalTxType === 'rent' || externalTxType === '2';
              if (subLayout === 'rent' || (subLayout === 'external_stock' && isRentTx)) {
                customLabel = 'Annual Rent (AED)';
              } else {
                customLabel = 'Sale Price (AED)';
              }
            } else if (f.labelOverrides && f.labelOverrides[subLayout]) {
              customLabel = f.labelOverrides[subLayout];
            }
            const star = labelEl.querySelector('.required-star');
            labelEl.textContent = customLabel;
            if (star) labelEl.appendChild(star);
          }
        }
        if (isVisible) secActiveCount++;
      });

      totalActive += secActiveCount;

      if (sectionCard) {
        const badgeCount = sectionCard.querySelector('.section-badge-count');
        if (badgeCount) badgeCount.textContent = `${secActiveCount} fields`;
        sectionCard.style.display = secActiveCount === 0 ? 'none' : '';
      }

      const pill = sectionNavPills.children[sIdx + 1];
      if (pill) {
        pill.style.display = secActiveCount === 0 ? 'none' : '';
      }
    });

    if (fieldsCountBadge) {
      fieldsCountBadge.textContent = `${totalActive} fields in ${sections.length} sections`;
    }
    resizeWindow();
  }

  // ============================================================================
  // AUTO-CALCULATION & FIELD AUTOMATION ENGINE (LEAD LISTING LAYOUT)
  // ============================================================================
  function runLeadListingAutomations(options = {}) {
    const isInitialLoad = !!options.isInitialLoad;
    const trigger = options.triggerField || '';

    const findEl = (codes) => {
      const codeList = Array.isArray(codes) ? codes : [codes];
      for (const c of codeList) {
        const el = document.getElementById(`field_${c}`) || document.querySelector(`[name="${c}"]`);
        if (el) return el;
      }
      return null;
    };

    const getVal = (codes) => {
      const el = findEl(codes);
      if (!el) return '';
      if (el.dataset && el.dataset.selectedRef) return el.dataset.selectedRef;
      return el.value !== undefined ? String(el.value).trim() : '';
    };

    const getNum = (codes) => {
      const val = getVal(codes);
      if (!val) return 0;
      const clean = String(val).split('|')[0].replace(/[^\d.-]/g, '');
      const n = parseFloat(clean);
      return isNaN(n) ? 0 : n;
    };

    const getText = (codes) => {
      const el = findEl(codes);
      if (!el) return '';
      if (el.tagName === 'SELECT') {
        const sel = el.options[el.selectedIndex];
        return sel && sel.value ? sel.textContent.trim() : '';
      }
      return el.value !== undefined ? String(el.value).trim() : '';
    };

    const setVal = (codes, newVal, markDirty = true) => {
      const el = findEl(codes);
      if (!el) return false;
      const currentVal = el.value !== undefined ? String(el.value).trim() : '';
      const formattedNew = String(newVal !== null && newVal !== undefined ? newVal : '').trim();
      if (currentVal !== formattedNew) {
        el.value = formattedNew;
        if (isInitialLoad) {
          if (el.name) initialFormValues[el.name] = formattedNew;
        } else if (markDirty) {
          setDirty(true);
        }
        return true;
      }
      return false;
    };

    // 1. Price Per Sq Ft = Listing Price / Built-up Area
    const priceCodes = ['UF_CRM_1791952467551', 'UF_CRM_LISTINGPRICE', 'UF_CRM_LISTING_PRICE', 'OPPORTUNITY'];
    const sqftCodes = ['UF_CRM_1791952136007', 'UF_CRM_BUA', 'UF_CRM_TOTALAREA'];
    const ppsqftCodes = ['UF_CRM_PRICE_PER_SQUARE_FOOT', 'UF_CRM_LISTINGPRICEPERSQFT'];

    const price = getNum(priceCodes);
    const sqft = getNum(sqftCodes);
    const ppsqft = getNum(ppsqftCodes);

    if (price > 0 && sqft > 0) {
      if (!ppsqft || isInitialLoad || priceCodes.includes(trigger) || sqftCodes.includes(trigger)) {
        const calcPpsqft = (price / sqft).toFixed(2);
        setVal(ppsqftCodes, calcPpsqft, !isInitialLoad);
      }
    } else if (ppsqftCodes.includes(trigger) && ppsqft > 0 && sqft > 0 && (!price || price === 0)) {
      const calcPrice = Math.round(ppsqft * sqft);
      setVal(priceCodes, calcPrice, true);
    }

    // Auto-calculate / suggest standard Agency Commission if empty
    const commCodes = ['UF_CRM_BUYERAGENTCOMMISSION'];
    const commVal = getVal(commCodes);
    if (!commVal && price > 0) {
      const extTx = String(getVal(['UF_CRM_TRANSACTION_TYPE'])).trim().toLowerCase();
      const isRent = (currentListingSubLayout === 'rent') || (currentListingSubLayout === 'external_stock' && (extTx === 'rent' || extTx === '2'));
      const defaultComm = isRent ? '5.0' : '2.0';
      setVal(commCodes, defaultComm, !isInitialLoad);
    }

    // 2. Composite Title & Portal Title from actual non-empty record fields
    let beds = getVal(['UF_CRM_BEDROOMS', 'UF_CRM_1791966366775', 'UF_CRM_1791952093551', 'UF_CRM_BEDROOM']);
    const enumToNum = { '1834': '0', '1836': '1', '1838': '2', '1840': '3', '1842': '4', '1844': '5' };
    if (enumToNum[beds]) beds = enumToNum[beds];
    const propType = getText(['UF_CRM_1791952050535', 'UF_CRM_PROPERTY_TYPE']);
    const project = getText(['UF_CRM_1791952285159', 'UF_CRM_PROJECT_NAME', 'UF_CRM_PROJECT_1']);
    const community = getVal(['UF_CRM_1791952328751', 'UF_CRM_COMMUNITY', 'UF_CRM_NEIGHBORHOOD']);
    const city = getVal(['UF_CRM_1791952345511', 'UF_CRM_CITY']);

    if (propType) {
      let bedPrefix = '';
      if (beds === '0' || String(beds).toLowerCase() === 'studio') {
        bedPrefix = 'Studio';
      } else if (beds) {
        bedPrefix = `${beds} BR`;
      }
      const locParts = [project, community, city].filter(Boolean);
      const locStr = locParts.length > 0 ? ` in ${locParts.join(', ')}` : '';
      const autoTitle = [bedPrefix, propType].filter(Boolean).join(' ') + locStr;

      const titleCodes = ['UF_CRM_1791952409183', 'UF_CRM_LISTING_NAME', 'TITLE'];
      const portalTitleCodes = ['UF_CRM_SUMMARY_DESCRIPTION'];

      const curTitle = getVal(titleCodes);
      const curPortalTitle = getVal(portalTitleCodes);

      if (!curTitle || curTitle.toLowerCase().startsWith('untitled')) {
        setVal(titleCodes, autoTitle, !isInitialLoad);
      }
      if (!curPortalTitle) {
        setVal(portalTitleCodes, autoTitle, !isInitialLoad);
      }
    }
  }
  

  /**
   * Create standard form-group wrapper with label & validation feedback
   */
  function createFormGroup(f, currentVal) {
    const formGroup = document.createElement('div');
    formGroup.className = `form-group ${f.fullWidth || f.type === 'text' || f.type === 'textarea' ? 'full-width' : ''}`;
    formGroup.setAttribute('data-field-code', f.code);
    formGroup.setAttribute('data-field-label', (f.label || '').toLowerCase());

    // Apply layout visibility rule for listing records
    if (currentLayout === 'listing' && f.rules) {
      const isVis = evaluateListingFieldVisibility(f, currentListingSubLayout, currentLead);
      if (!isVis) {
        formGroup.style.display = 'none';
      }
    }

    const label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', `field_${f.code}`);
    
    // Contextual label override
    const displayLabel = (currentLayout === 'listing' && f.labelOverrides && f.labelOverrides[currentListingSubLayout])
      ? f.labelOverrides[currentListingSubLayout]
      : f.label;
    label.textContent = displayLabel;

    if (f.required) {
      const star = document.createElement('span');
      star.className = 'required-star';
      star.textContent = '*';
      label.appendChild(star);
    }
    if (f.automated || f.code === 'UF_CRM_FIRST_CONTACTED_DATE') {
      const badge = document.createElement('span');
      badge.className = 'automated-badge';
      badge.textContent = 'Automated';
      badge.title = 'Automated based on activity and events in Bitrix24 CRM';
      label.appendChild(badge);
    }
    formGroup.appendChild(label);

    const feedback = document.createElement('div');
    feedback.className = 'invalid-feedback';
    feedback.id = `err_${f.code}`;
    feedback.style.display = 'none';

    const markFieldDirty = () => {
      setDirty(true);
      if (inputObj.inputElement) inputObj.inputElement.classList.remove('is-invalid');
      feedback.style.display = 'none';
      if (currentLayout === 'listing') {
        runLeadListingAutomations({ isInitialLoad: false, triggerField: f.code });
      }
    };

    const inputObj = createFieldInput(f, currentVal, markFieldDirty);

    // Bind real-time listing layout switching when Listing Type changes
    if (currentLayout === 'listing' && (f.code === 'UF_CRM_1791952650167' || f.code === 'UF_CRM_LISTING_TYPE')) {
      inputObj.inputElement?.addEventListener('change', (e) => {
        const selectedVal = e.target.value;
        const detected = detectListingSubLayout({ UF_CRM_1791952650167: selectedVal });
        if (detected && detected !== currentListingSubLayout) {
          const prev = currentListingSubLayout;
          applyListingSubLayout(detected, prev);
          runLeadListingAutomations({ isInitialLoad: false, triggerField: 'UF_CRM_1791952650167' });
        }
      });
    }

    // Bind real-time transaction type switching for External Stock
    if (currentLayout === 'listing' && f.code === 'UF_CRM_TRANSACTION_TYPE') {
      const txHandler = () => {
        if (currentListingSubLayout === 'external_stock') {
          applyListingSubLayout('external_stock', 'external_stock');
          runLeadListingAutomations({ isInitialLoad: false, triggerField: 'UF_CRM_TRANSACTION_TYPE' });
        }
      };
      inputObj.inputElement?.addEventListener('change', txHandler);
      inputObj.inputElement?.addEventListener('input', txHandler);
    }

    // Bind real-time conditional evaluation if Tenancy Status changes
    if (currentLayout === 'listing' && (f.code === 'UF_CRM_1791970832589' || f.code === 'UF_CRM_OCCUPANCY')) {
      const tenancyHandler = () => {
        applyListingSubLayout(currentListingSubLayout);
      };
      inputObj.inputElement?.addEventListener('change', tenancyHandler);
      inputObj.inputElement?.addEventListener('input', tenancyHandler);
    }

    // Bind real-time enquiry requirement form switching when Enquiry Type changes
    if (currentLayout === 'enquiry' && (f.code === 'UF_CRM_1791952650167' || f.code === 'UF_CRM_ENQUIRY_TYPE')) {
      const enqHandler = (e) => {
        applyEnquirySubLayout(e.target.value);
      };
      inputObj.inputElement?.addEventListener('change', enqHandler);
      inputObj.inputElement?.addEventListener('input', enqHandler);
    }

    formGroup.appendChild(inputObj.container);
    formGroup.appendChild(feedback);

    return formGroup;
  }

  /**
   * Render dynamic fields arranged in sensible sections based on Lead Type
   */
  function renderLayout(layout, lead) {
    currentLayout = layout;
    fieldsContainer.innerHTML = '';
    sectionNavPills.innerHTML = '';
    initialFormValues = {};
    setDirty(false);

    // Update Header Badge & Banner based on Lead Type
    stageBadge.className = 'type-badge';

    if (layout === 'listing') {
      stageBadge.classList.add('badge-listing');
      stageBadge.textContent = 'Listing Record';
      if (stageInfoText) stageInfoText.innerHTML = '🏢 Presenting <strong>Listing Layout</strong>';

      // Detect and activate tailored listing layout
      currentListingSubLayout = detectListingSubLayout(lead);
      if (listingLayoutBadge) {
        const meta = LISTING_LAYOUT_META[currentListingSubLayout] || LISTING_LAYOUT_META.rent;
        listingLayoutBadge.className = `layout-pill ${meta.pillClass}`;
        listingLayoutBadge.innerHTML = `${meta.icon} ${meta.title}`;
        listingLayoutBadge.style.display = 'inline-flex';
      }
    } else {
      stageBadge.classList.add('badge-enquiry');
      stageBadge.textContent = 'Enquiry Record';
      if (stageInfoText) stageInfoText.innerHTML = '🔍 Presenting <strong>Enquiry Layout</strong>';
      if (listingLayoutBadge) listingLayoutBadge.style.display = 'none';
      setTimeout(() => {
        const enqVal = lead?.UF_CRM_1791952650167 || lead?.UF_CRM_ENQUIRY_TYPE || '';
        applyEnquirySubLayout(enqVal);
      }, 50);
    }

    const layoutDef = layout === 'listing' ? tabConfig.listingLayout : tabConfig.enquiryLayout;
    const sections = layoutDef?.sections || [];

    // Calculate total fields count according to active rules
    let totalFields = 0;
    sections.forEach(s => {
      const active = (s.fields || []).filter(f => layout !== 'listing' || evaluateListingFieldVisibility(f, currentListingSubLayout, lead));
      totalFields += active.length;
    });
    fieldsCountBadge.textContent = `${totalFields} fields in ${sections.length} sections`;

    // Render Section Navigation Pills
    const allPill = document.createElement('button');
    allPill.type = 'button';
    allPill.className = 'nav-pill active';
    allPill.textContent = 'All Sections';
    allPill.addEventListener('click', () => {
      document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
      allPill.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    sectionNavPills.appendChild(allPill);

    sections.forEach((sec, sIdx) => {
      const secId = `section_${sec.id || sIdx}`;
      const activeFields = (sec.fields || []).filter(f => layout !== 'listing' || evaluateListingFieldVisibility(f, currentListingSubLayout, lead));

      // Section Pill
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'nav-pill';
      pill.innerHTML = `${sec.icon || '📁'} ${sec.title}`;
      if (layout === 'listing' && activeFields.length === 0) {
        pill.style.display = 'none';
      }
      pill.addEventListener('click', () => {
        document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const targetCard = document.getElementById(secId);
        if (targetCard) {
          targetCard.classList.remove('section-collapsed');
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          targetCard.classList.add('section-highlight');
          setTimeout(() => targetCard.classList.remove('section-highlight'), 1500);
        }
      });
      sectionNavPills.appendChild(pill);

      // Section Card
      const sectionCard = document.createElement('div');
      sectionCard.className = 'form-section';
      sectionCard.id = secId;
      if (sec.defaultOpen === false) {
        sectionCard.classList.add('section-collapsed');
      }
      if (layout === 'listing' && activeFields.length === 0) {
        sectionCard.style.display = 'none';
      }

      const headerEl = document.createElement('div');
      headerEl.className = 'section-header';

      const leftWrap = document.createElement('div');
      leftWrap.className = 'section-header-left';

      const iconEl = document.createElement('span');
      iconEl.className = 'section-icon';
      iconEl.textContent = sec.icon || '📌';

      const titleEl = document.createElement('span');
      titleEl.className = 'section-title';
      titleEl.textContent = sec.title;

      const badgeCount = document.createElement('span');
      badgeCount.className = 'section-badge-count';
      badgeCount.textContent = `${activeFields.length} fields`;

      leftWrap.appendChild(iconEl);
      leftWrap.appendChild(titleEl);
      leftWrap.appendChild(badgeCount);

      const rightWrap = document.createElement('div');
      rightWrap.className = 'section-header-right';

      if (sec.description) {
        const descEl = document.createElement('span');
        descEl.className = 'section-desc-text';
        descEl.textContent = sec.description;
        rightWrap.appendChild(descEl);
      }

      const chevron = document.createElement('span');
      chevron.className = 'section-chevron';
      chevron.textContent = '▼';
      rightWrap.appendChild(chevron);

      headerEl.appendChild(leftWrap);
      headerEl.appendChild(rightWrap);

      // Collapsible toggle on header click
      headerEl.addEventListener('click', () => {
        sectionCard.classList.toggle('section-collapsed');
        resizeWindow();
      });

      sectionCard.appendChild(headerEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'section-body';

      const gridEl = document.createElement('div');
      gridEl.className = 'form-grid';

      (sec.fields || []).forEach(f => {
        let currentVal = lead[f.code + '_TITLE'] || lead[f.code];

        // Dynamic fallbacks from leadAltCode & leadAltCodes
        if ((currentVal === undefined || currentVal === null || currentVal === '') && f.leadAltCode) {
          currentVal = lead[f.leadAltCode + '_TITLE'] || lead[f.leadAltCode];
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && Array.isArray(f.leadAltCodes)) {
          for (const alt of f.leadAltCodes) {
            if (lead[alt] !== undefined && lead[alt] !== null && lead[alt] !== '') {
              currentVal = lead[alt + '_TITLE'] || lead[alt];
              break;
            }
          }
        }

        // Specific fallbacks for Bedrooms, Bathrooms, Built-up Area, and Plot Area
        if ((currentVal === undefined || currentVal === null || currentVal === '') && (f.code === 'UF_CRM_BEDROOMS' || f.code === 'UF_CRM_1791966366775')) {
          currentVal = lead['UF_CRM_1791966366775'] ?? lead['UF_CRM_BEDROOMS'] ?? lead['UF_CRM_BEDS_MIN'] ?? '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && (f.code === 'UF_CRM_BATHROOMS' || f.code === 'UF_CRM_1791966408374')) {
          currentVal = lead['UF_CRM_1791966408374'] ?? lead['UF_CRM_BATHROOMS'] ?? lead['UF_CRM_BATHS_MIN'] ?? lead['UF_CRM_TOTALBATHROOMS'] ?? '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && (f.code === 'UF_CRM_BUA' || f.code === 'UF_CRM_1791970770635' || f.code === 'UF_CRM_TOTALAREA')) {
          currentVal = lead['UF_CRM_BUA'] ?? lead['UF_CRM_1791970770635'] ?? lead['UF_CRM_TOTALAREA'] ?? lead['UF_CRM_SIZE_MIN'] ?? '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && (f.code === 'UF_CRM_PLOT_AREA' || f.code === 'UF_CRM_PLOT_SIZE' || f.code === 'UF_CRM_LOTSIZE')) {
          currentVal = lead['UF_CRM_PLOT_AREA'] ?? lead['UF_CRM_PLOT_SIZE'] ?? lead['UF_CRM_LOTSIZE'] ?? '';
        }

        // Normalize Bedrooms value if stored as enum ID or string label
        if ((f.code === 'UF_CRM_BEDROOMS' || f.code === 'UF_CRM_1791966366775') && currentVal !== '' && currentVal !== null && currentVal !== undefined) {
          const s = String(currentVal).trim();
          const enumToNum = { '1834': 0, '1836': 1, '1838': 2, '1840': 3, '1842': 4, '1844': 5 };
          if (enumToNum[s] !== undefined) {
            currentVal = enumToNum[s];
          } else if (/studio/i.test(s)) {
            currentVal = 0;
          } else {
            const m = s.match(/\d+/);
            if (m) currentVal = m[0];
          }
        }

        if ((currentVal === undefined || currentVal === null || currentVal === '') && f.code === 'UF_CRM_LISTING_NAME') {
          currentVal = lead['UF_CRM_1791952409183'] || '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && f.code === 'UF_CRM_1792139023') {
          currentVal = lead['UF_CRM_CHEQUES_1'] || lead['UF_CRM_CHEQUES'] || '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && f.code === 'UF_CRM_NUMBEROFPARKINGSPACES') {
          currentVal = lead['UF_CRM_PARKING'] || '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && f.code === 'UF_CRM_DATE_AVAILABLE') {
          currentVal = lead['UF_CRM_AVAILABLE_TO'] || lead['UF_CRM_AVAILABILITY_DATE'] || '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && f.code === 'UF_CRM_AVAILABLE_TO') {
          currentVal = lead['UF_CRM_DATE_AVAILABLE'] || lead['UF_CRM_AVAILABILITY_DATE'] || '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && f.code === 'UF_CRM_TRAKHEESI_EXPIRY') {
          currentVal = lead['UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE'] || '';
        }
        if ((currentVal === undefined || currentVal === null || currentVal === '') && f.code === 'UF_CRM_1792151466') {
          currentVal = lead['UF_CRM_PF_ID'] || '';
        }
        if (f.code === 'UF_CRM_1792563228880' || f.code === 'UF_CRM_LEAD_SOURCE_TYPE') {
          if (!currentVal) {
            currentVal = lead['UF_CRM_1792563228880'] || lead['UF_CRM_LEAD_SOURCE_TYPE'] || '';
          }
          const legacySourceMap = {
            '2324': '2506',
            '2326': '2504',
            '2328': '2502',
            '2330': '2500',
            '2332': '2498',
            '2334': '2496'
          };
          if (currentVal && legacySourceMap[String(currentVal)]) {
            currentVal = legacySourceMap[String(currentVal)];
          }
          if ((currentVal === undefined || currentVal === null || currentVal === '') && lead.SOURCE_ID) {
            const nativeSourceMap = {
              'WEB': '2506',
              'WEBFORM': '2506',
              'ADVERTISING': '2504',
              'EMAIL': '2498',
              'CALL': '2498',
              'CALLBACK': '2500',
              'PARTNER': '2496'
            };
            currentVal = nativeSourceMap[String(lead.SOURCE_ID).toUpperCase()] || '';
          }
        }
        if (currentVal === undefined || currentVal === null) currentVal = '';
        gridEl.appendChild(createFormGroup(f, currentVal));
      });

      bodyEl.appendChild(gridEl);
      sectionCard.appendChild(bodyEl);
      fieldsContainer.appendChild(sectionCard);
    });

    if (layout === 'listing') {
      runLeadListingAutomations({ isInitialLoad: true });
    }

    resizeWindow();
  }

  /**
   * Set Lead Type and immediately render layout
   */
  async function setLeadTypeAndSwitch(typeId, targetLayout) {
    const leadTypeField = tabConfig?.leadTypeField || 'UF_CRM_1791354310417';
    showToast(`Setting Lead Type to ${targetLayout === 'listing' ? 'Listing' : 'Enquiry'}...`, 'info');

    try {
      const res = await fetch(`/api/lead/${currentLeadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCrmAuthHeaders()
        },
        body: JSON.stringify({ fields: { [leadTypeField]: typeId } })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update Lead Type');

      currentLead[leadTypeField] = typeId;
      showToast(`Lead Type saved! Presenting ${targetLayout === 'listing' ? 'Listing' : 'Enquiry'} layout.`, 'success');
      renderLayout(targetLayout, currentLead);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  /**
   * Apply layout for lead based on Lead Type, or prompt to classify
   */
  function applyLayoutForLead(lead) {
    const layout = determineLayoutFromLeadType(lead);

    if (!layout) {
      stageBadge.className = 'type-badge badge-empty';
      if (stageInfoText) stageInfoText.innerHTML = '⚠️ <strong>Lead Type Required:</strong> Please choose whether this record is an Enquiry or a Listing to load the appropriate layout.';

      fieldsContainer.innerHTML = `
        <div class="alert alert-warning" style="display: flex; flex-direction: column; gap: 14px; padding: 28px; border-radius: 8px; text-align: center; align-items: center; background: #fffdf5; border: 1px solid #ffe066;">
          <div style="font-size: 16px; font-weight: 700; color: #8c6b00;">
            Select Lead Type
          </div>
          <p style="margin: 0; color: #535c69; font-size: 13px; max-width: 480px;">
            This Lead has not been classified yet. Choose a type below to immediately display the customized UAE Real Estate fields:
          </p>
          <div style="display: flex; gap: 16px; margin-top: 6px;">
            <button type="button" class="btn btn-save-b24" id="btn-choose-enquiry" style="background-color: #0288d1; color: #fff; border-color: #0277bd; padding: 10px 22px; font-size: 13px;">
              🔍 Set as Enquiry Lead
            </button>
            <button type="button" class="btn btn-save-b24" id="btn-choose-listing" style="padding: 10px 22px; font-size: 13px;">
              🏢 Set as Listing Lead
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-choose-enquiry')?.addEventListener('click', () => setLeadTypeAndSwitch('1594', 'enquiry'));
      document.getElementById('btn-choose-listing')?.addEventListener('click', () => setLeadTypeAndSwitch('1596', 'listing'));
      resizeWindow();
      return;
    }

    renderLayout(layout, lead);
  }

  /**
   * Live field search & filter
   */
  function handleFilter() {
    const q = (filterInput.value || '').trim().toLowerCase();
    clearSearchBtn.style.display = q ? 'block' : 'none';

    const allGroups = document.querySelectorAll('.form-group');
    if (!q) {
      allGroups.forEach(g => {
        g.classList.remove('field-matched', 'field-dimmed');
      });
      searchResultsPill.style.display = 'none';
      return;
    }

    let matchCount = 0;
    allGroups.forEach(g => {
      const labelText = g.getAttribute('data-field-label') || '';
      const codeText = (g.getAttribute('data-field-code') || '').toLowerCase();
      if (labelText.includes(q) || codeText.includes(q)) {
        g.classList.add('field-matched');
        g.classList.remove('field-dimmed');
        matchCount++;

        // Ensure parent section is expanded
        const parentSection = g.closest('.form-section');
        if (parentSection) {
          parentSection.classList.remove('section-collapsed');
        }
      } else {
        g.classList.remove('field-matched');
        g.classList.add('field-dimmed');
      }
    });

    searchResultsPill.textContent = `${matchCount} field${matchCount === 1 ? '' : 's'} found`;
    searchResultsPill.style.display = 'block';
    resizeWindow();
  }

  clearSearchBtn.addEventListener('click', () => {
    filterInput.value = '';
    handleFilter();
    filterInput.focus();
  });

  filterInput.addEventListener('input', handleFilter);

  /**
   * Expand / Collapse All Sections
   */
  toggleAllBtn.addEventListener('click', () => {
    allSectionsCollapsed = !allSectionsCollapsed;
    const sections = document.querySelectorAll('.form-section');
    sections.forEach(s => {
      if (allSectionsCollapsed) {
        s.classList.add('section-collapsed');
      } else {
        s.classList.remove('section-collapsed');
      }
    });
    toggleAllBtn.textContent = allSectionsCollapsed ? '↕ Expand All' : '↕ Collapse All';
    resizeWindow();
  });

  /**
   * Cancel / Discard Unsaved Changes
   */
  cancelBtn.addEventListener('click', () => {
    if (!confirm('Discard all unsaved edits and restore initial values?')) return;

    for (const [code, val] of Object.entries(initialFormValues)) {
      const input = document.getElementById(`field_${code}`);
      if (!input) continue;

      if (input.type === 'checkbox') {
        input.checked = !!val;
      } else {
        input.value = val;
      }
    }

    setDirty(false);
    showToast('Unsaved changes discarded.', 'info');
  });

  /**
   * Save form edits to Bitrix24
   */
  async function handleSave(e) {
    e.preventDefault();
    if (!currentLayout) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING RECORD...';

    const payload = {};
    const filePromises = [];
    const layoutDef = currentLayout === 'listing' ? tabConfig.listingLayout : tabConfig.enquiryLayout;
    let fieldsToCollect = [];

    if (Array.isArray(layoutDef?.sections)) {
      layoutDef.sections.forEach(sec => {
        if (Array.isArray(sec.fields)) {
          fieldsToCollect.push(...sec.fields);
        }
      });
    } else {
      fieldsToCollect = currentLayout === 'listing'
        ? (tabConfig.listingFields || [])
        : (tabConfig.enquiryFields || []);
    }

    fieldsToCollect.forEach(f => {
      const input = document.getElementById(`field_${f.code}`);
      if (!input) return;

      if (f.type === 'boolean') {
        payload[f.code] = input.checked ? 'Y' : 'N';
      } else if (f.type === 'file') {
        const pendingItems = pendingFileUploads[f.code] || [];
        const inputFiles = (input.files && input.files.length > 0) ? Array.from(input.files) : [];
        const isMultiple = input.multiple || f.multiple || f.code.includes('PHOTOS') || f.code.includes('DOCUMENTS');

        if (pendingItems.length > 0) {
          const tuples = pendingItems.map(item => {
            const b64 = (item.dataUrl || '').split(',')[1] || '';
            return { name: item.name, base64: b64 };
          });
          if (isMultiple) {
            payload[f.code] = tuples.map(t => ({ fileData: [t.name, t.base64] }));
          } else {
            payload[f.code] = { fileData: [tuples[0].name, tuples[0].base64] };
          }
        } else if (inputFiles.length > 0) {
          const fileReadPromises = inputFiles.map(file => {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = function(evt) {
                const base64Data = (evt.target.result || '').split(',')[1];
                if (base64Data) {
                  resolve({ name: file.name, base64: base64Data });
                } else {
                  resolve(null);
                }
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(file);
            });
          });

          const p = Promise.all(fileReadPromises).then(results => {
            const validFiles = results.filter(Boolean);
            if (validFiles.length > 0) {
              if (isMultiple) {
                payload[f.code] = validFiles.map(vf => ({ fileData: [vf.name, vf.base64] }));
              } else {
                payload[f.code] = { fileData: [validFiles[0].name, validFiles[0].base64] };
              }
            }
          });
          filePromises.push(p);
        }
      } else if (f.type === 'lookup' || isLookupField(f)) {
        payload[f.code] = input.dataset.selectedRef || input.dataset.selectedId || input.value.trim();
      } else if (f.type === 'money') {
        const rawMoney = input.value.trim();
        if (rawMoney) {
          const cleanNum = rawMoney.split('|')[0].replace(/[^\d.-]/g, '');
          payload[f.code] = cleanNum ? `${cleanNum}|AED` : '';
        } else {
          payload[f.code] = '';
        }
      } else {
        payload[f.code] = input.value.trim();
      }
    });

    // Synchronize native Bitrix OPPORTUNITY from Listing Price or Deal Value
    if ((payload.UF_CRM_LISTING_PRICE || payload.UF_CRM_DEAL_VALUE_1) && !payload.OPPORTUNITY) {
      const pVal = payload.UF_CRM_LISTING_PRICE || payload.UF_CRM_DEAL_VALUE_1;
      const pNum = parseFloat(String(pVal).split('|')[0]);
      if (!isNaN(pNum) && pNum > 0) {
        payload.OPPORTUNITY = pNum;
      }
    }

    if (payload.UF_CRM_LISTING_NAME && !payload.UF_CRM_1791952409183) {
      payload.UF_CRM_1791952409183 = payload.UF_CRM_LISTING_NAME;
    }

    if (payload.UF_CRM_COMMENTS_1 && !payload.COMMENTS) {
      payload.COMMENTS = payload.UF_CRM_COMMENTS_1;
    }

    if (payload.UF_CRM_PROJECT && !payload.UF_CRM_1792558317) {
      payload.UF_CRM_1792558317 = payload.UF_CRM_PROJECT;
    } else if (payload.UF_CRM_1792558317 && !payload.UF_CRM_PROJECT) {
      payload.UF_CRM_PROJECT = payload.UF_CRM_1792558317;
    }

    if (payload.UF_CRM_PROPERTY_LAYOUT && !payload.UF_CRM_LAYOUT) {
      payload.UF_CRM_LAYOUT = payload.UF_CRM_PROPERTY_LAYOUT;
    } else if (payload.UF_CRM_LAYOUT && !payload.UF_CRM_PROPERTY_LAYOUT) {
      payload.UF_CRM_PROPERTY_LAYOUT = payload.UF_CRM_LAYOUT;
    }

    if (payload.UF_CRM_LISTINGAGENT) {
      if (!payload.UF_CRM_ASSIGNED_TO_BROKER) payload.UF_CRM_ASSIGNED_TO_BROKER = payload.UF_CRM_LISTINGAGENT;
      if (!payload.UF_CRM_PORTAL_LISTING_AGENT) payload.UF_CRM_PORTAL_LISTING_AGENT = payload.UF_CRM_LISTINGAGENT;
    } else if (payload.UF_CRM_ASSIGNED_TO_BROKER) {
      if (!payload.UF_CRM_LISTINGAGENT) payload.UF_CRM_LISTINGAGENT = payload.UF_CRM_ASSIGNED_TO_BROKER;
      if (!payload.UF_CRM_PORTAL_LISTING_AGENT) payload.UF_CRM_PORTAL_LISTING_AGENT = payload.UF_CRM_ASSIGNED_TO_BROKER;
    } else if (payload.UF_CRM_PORTAL_LISTING_AGENT) {
      if (!payload.UF_CRM_LISTINGAGENT) payload.UF_CRM_LISTINGAGENT = payload.UF_CRM_PORTAL_LISTING_AGENT;
      if (!payload.UF_CRM_ASSIGNED_TO_BROKER) payload.UF_CRM_ASSIGNED_TO_BROKER = payload.UF_CRM_PORTAL_LISTING_AGENT;
    }

    // Bidirectional sync for project text name & CRM reference
    if (payload.UF_CRM_PROJECT_1 && !payload.UF_CRM_PROJECT_NAME) {
      const pInput = document.getElementById('field_UF_CRM_PROJECT_1') || document.getElementById('field_UF_CRM_PROJECT_NAME');
      if (pInput?.value) payload.UF_CRM_PROJECT_NAME = pInput.value.trim();
    }
    if (payload.UF_CRM_PROJECT_NAME && !payload.UF_CRM_PROJECT_1) {
      const pInput = document.getElementById('field_UF_CRM_PROJECT_NAME');
      if (pInput?.dataset?.selectedRef || pInput?.dataset?.selectedId) {
        payload.UF_CRM_PROJECT_1 = pInput.dataset.selectedRef || pInput.dataset.selectedId;
      }
    }
    if ((payload.COMPANY_ID || payload.UF_CRM_DEVELOPER_1) && !payload.UF_CRM_DEVELOPER_NAME) {
      const dInput = document.getElementById('field_COMPANY_ID') || document.getElementById('field_UF_CRM_DEVELOPER_1');
      if (dInput?.value) payload.UF_CRM_DEVELOPER_NAME = dInput.value.trim();
    }

    if (payload.UF_CRM_PROPERTY_PROPERTYFINDER && !payload.UF_CRM_PROPERTY) {
      payload.UF_CRM_PROPERTY = payload.UF_CRM_PROPERTY_PROPERTYFINDER;
    }

    if (payload.UF_CRM_DATE_AVAILABLE && !payload.UF_CRM_AVAILABLE_TO) {
      payload.UF_CRM_AVAILABLE_TO = payload.UF_CRM_DATE_AVAILABLE;
    } else if (payload.UF_CRM_AVAILABLE_TO && !payload.UF_CRM_DATE_AVAILABLE) {
      payload.UF_CRM_DATE_AVAILABLE = payload.UF_CRM_AVAILABLE_TO;
    }

    if (payload.UF_CRM_TRAKHEESI_EXPIRY && !payload.UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE) {
      payload.UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE = payload.UF_CRM_TRAKHEESI_EXPIRY;
    }

    if (payload.UF_CRM_1792151466 && !payload.UF_CRM_PF_ID) {
      payload.UF_CRM_PF_ID = payload.UF_CRM_1792151466;
    }

    // Synchronize Bedrooms across numeric UF_CRM_1791966366775 and enumeration UF_CRM_BEDROOMS
    if (payload.UF_CRM_BEDROOMS !== undefined || payload.UF_CRM_1791966366775 !== undefined) {
      const rawBeds = payload.UF_CRM_BEDROOMS !== undefined ? String(payload.UF_CRM_BEDROOMS).trim() : String(payload.UF_CRM_1791966366775 || '').trim();
      if (rawBeds !== '') {
        const numBeds = parseFloat(rawBeds);
        if (!isNaN(numBeds)) {
          payload.UF_CRM_1791966366775 = numBeds;
          payload.UF_CRM_BEDROOMS = numBeds;
          const bedsEnumMap = { 0: '1834', 1: '1836', 2: '1838', 3: '1840', 4: '1842', 5: '1844' };
          const enumId = bedsEnumMap[Math.floor(numBeds)] || (numBeds >= 5 ? '1844' : null);
          if (enumId) {
            payload.UF_CRM_BEDROOMS_ENUM = enumId;
          }
        }
      } else {
        payload.UF_CRM_1791966366775 = '';
        payload.UF_CRM_BEDROOMS = '';
      }
    }

    // Synchronize Bathrooms across UF_CRM_BATHROOMS and UF_CRM_1791966408374
    if (payload.UF_CRM_BATHROOMS !== undefined || payload.UF_CRM_1791966408374 !== undefined) {
      const rawBaths = payload.UF_CRM_BATHROOMS !== undefined ? String(payload.UF_CRM_BATHROOMS).trim() : String(payload.UF_CRM_1791966408374 || '').trim();
      if (rawBaths !== '') {
        const numBaths = parseFloat(rawBaths);
        const valToSet = !isNaN(numBaths) ? numBaths : rawBaths;
        payload.UF_CRM_BATHROOMS = valToSet;
        payload.UF_CRM_1791966408374 = valToSet;
      } else {
        payload.UF_CRM_BATHROOMS = '';
        payload.UF_CRM_1791966408374 = '';
      }
    }

    // Synchronize Built-up Area across UF_CRM_BUA, UF_CRM_1791970770635, and UF_CRM_TOTALAREA
    if (payload.UF_CRM_BUA !== undefined || payload.UF_CRM_1791970770635 !== undefined || payload.UF_CRM_TOTALAREA !== undefined) {
      const rawBua = payload.UF_CRM_BUA !== undefined ? String(payload.UF_CRM_BUA).trim() : String(payload.UF_CRM_1791970770635 || payload.UF_CRM_TOTALAREA || '').trim();
      if (rawBua !== '') {
        const numBua = parseFloat(rawBua);
        const valToSet = !isNaN(numBua) ? numBua : rawBua;
        payload.UF_CRM_BUA = valToSet;
        payload.UF_CRM_1791970770635 = valToSet;
        payload.UF_CRM_TOTALAREA = valToSet;
      } else {
        payload.UF_CRM_BUA = '';
        payload.UF_CRM_1791970770635 = '';
        payload.UF_CRM_TOTALAREA = '';
      }
    }

    // Synchronize Plot Area across UF_CRM_PLOT_AREA, UF_CRM_PLOT_SIZE, and UF_CRM_LOTSIZE
    if (payload.UF_CRM_PLOT_AREA !== undefined || payload.UF_CRM_PLOT_SIZE !== undefined || payload.UF_CRM_LOTSIZE !== undefined) {
      const rawPlot = payload.UF_CRM_PLOT_AREA !== undefined ? String(payload.UF_CRM_PLOT_AREA).trim() : String(payload.UF_CRM_PLOT_SIZE || payload.UF_CRM_LOTSIZE || '').trim();
      if (rawPlot !== '') {
        const numPlot = parseFloat(rawPlot);
        const valToSet = !isNaN(numPlot) ? numPlot : rawPlot;
        payload.UF_CRM_PLOT_AREA = valToSet;
        payload.UF_CRM_PLOT_SIZE = valToSet;
        payload.UF_CRM_LOTSIZE = valToSet;
      } else {
        payload.UF_CRM_PLOT_AREA = '';
        payload.UF_CRM_PLOT_SIZE = '';
        payload.UF_CRM_LOTSIZE = '';
      }
    }

    if (payload.UF_CRM_1792563228880 || payload.UF_CRM_LEAD_SOURCE_TYPE) {
      const srcVal = payload.UF_CRM_1792563228880 || payload.UF_CRM_LEAD_SOURCE_TYPE;
      payload.UF_CRM_1792563228880 = srcVal;
      payload.UF_CRM_LEAD_SOURCE_TYPE = srcVal;
      const sourceToNativeMap = {
        '2506': 'WEB',
        '2504': 'ADVERTISING',
        '2502': 'WEB',
        '2500': 'CALLBACK',
        '2498': 'CALL',
        '2496': 'PARTNER'
      };
      const nativeSource = sourceToNativeMap[srcVal];
      if (nativeSource && !payload.SOURCE_ID) {
        payload.SOURCE_ID = nativeSource;
      }
    }

    await Promise.all(filePromises);

    try {
      const res = await fetch(`/api/lead/${currentLeadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCrmAuthHeaders()
        },
        body: JSON.stringify({ fields: payload })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update lead');

      showToast('Lead details saved to Bitrix24!', 'success');
      setDirty(false);
      Object.assign(currentLead, payload);

      // Refresh initialFormValues
      fieldsToCollect.forEach(f => {
        const input = document.getElementById(`field_${f.code}`);
        if (!input) return;
        initialFormValues[f.code] = input.type === 'checkbox' ? input.checked : input.value;
      });
    } catch (err) {
      console.error('Save error:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE CHANGES';
      resizeWindow();
    }
  }

  async function handleRefresh() {
    if (isDirty) {
      const proceed = confirm('Discard unsaved changes and refresh from Bitrix24?');
      if (!proceed) return;
    }

    loadingEl.style.display = 'flex';
    contentEl.style.display = 'none';

    try {
      currentLead = await fetchLead(currentLeadId);
      applyLayoutForLead(currentLead);
      showToast('Lead record reloaded from Bitrix24.', 'info');
    } catch (err) {
      console.error('Refresh error:', err);
      showToast(`Refresh failed: ${err.message}`, 'error');
    } finally {
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      resizeWindow();
    }
  }

  async function init() {
    if (!isEmbeddedInCrm()) {
      console.warn('[SECURITY] Standalone URL access blocked. App is only accessible inside Bitrix24 CRM.');
      renderCrmLockoutScreen();
      return;
    }

    try {
      currentLeadId = resolveLeadId();
      if (!currentLeadId) {
        try {
          const latestRes = await fetch('/api/lead/latest', { headers: getCrmAuthHeaders() });
          const latestData = await latestRes.json();
          if (latestData?.id) {
            currentLeadId = String(latestData.id);
          }
        } catch (_) {}
      }
      if (!currentLeadId) {
        currentLeadId = '420';
      }

      const [cfg, lead] = await Promise.all([loadConfig(), fetchLead(currentLeadId)]);
      currentLead = lead;

      applyLayoutForLead(lead);

      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      resizeWindow();
    } catch (err) {
      console.error('Initialization error:', err);
      try {
        if (!tabConfig) tabConfig = await loadConfig();
        currentLead = currentLead || { ID: currentLeadId || '420', UF_CRM_1791354310417: '1594' };
        applyLayoutForLead(currentLead);
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        resizeWindow();
      } catch (fallbackErr) {
        loadingEl.innerHTML = `<div class="alert alert-danger">Initialization failed: ${err.message}</div>`;
      }
    }
  }

  // Event Listeners
  formEl.addEventListener('submit', handleSave);
  refreshBtn.addEventListener('click', handleRefresh);

  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  let initialized = false;
  function safeInit() {
    if (initialized) return;
    initialized = true;
    init();
  }

  window.__TAB_APP__ = {
    detectListingSubLayout,
    applyListingSubLayout,
    runLeadListingAutomations,
    getCurrentLead: () => currentLead
  };

  if (!isEmbeddedInCrm()) {
    renderCrmLockoutScreen();
  } else if (window.BX24 && typeof window.BX24.init === 'function') {
    window.BX24.init(safeInit);
    setTimeout(safeInit, 2000);
  } else {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      safeInit();
    } else {
      document.addEventListener('DOMContentLoaded', safeInit);
    }
  }
})();
