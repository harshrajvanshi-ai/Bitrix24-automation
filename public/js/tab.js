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
    if (str === '2580' || str === 'overseas sale' || str === '160') return 'overseas_sale';
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
      return window.self !== window.top;
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
    if (window.__INITIAL_LEAD_ID__) return window.__INITIAL_LEAD_ID__;

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
    return urlParams.get('ID') || urlParams.get('id') || urlParams.get('leadId');
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

      if (!window.BX24) {
        fetch(`/api/lead/${leadId}`, {
          headers: getCrmAuthHeaders()
        })
          .then(r => r.json())
          .then(data => resolve(data.result || data))
          .catch(reject);
        return;
      }

      window.BX24.callMethod('crm.lead.get', { id: leadId }, function (result) {
        if (result.error()) {
          reject(new Error(result.error().toString()));
        } else {
          resolve(result.data());
        }
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

    return null; // Lead Type not set
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
      'UF_CRM_DEVELOPER_1', 'UF_CRM_PROJECT', 'UF_CRM_PROJECT_1', 'UF_CRM_PROJECT_NAME',
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
        const res = await fetch(`/api/lookup?entity=${encodeURIComponent(f.lookupEntity || 'master_project')}&q=${encodeURIComponent(cleanQuery)}${refreshParam}`, {
          headers: getCrmAuthHeaders()
        });
        const data = await res.json();
        const items = data.items || [];

        dropdown.innerHTML = '';

        // Dropdown Header with records count and live refresh action
        const header = document.createElement('div');
        header.className = 'lookup-dropdown-header';
        header.innerHTML = `<span>${items.length} records</span><button type="button" class="lookup-refresh-btn" title="Refresh records from Bitrix24">🔄 Refresh</button>`;
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

        items.forEach(item => {
          const itemEl = document.createElement('div');
          itemEl.className = 'lookup-item';

          const titleSpan = document.createElement('span');
          titleSpan.className = 'lookup-item-title';
          titleSpan.textContent = item.title;

          const idSpan = document.createElement('span');
          idSpan.className = 'lookup-item-id';
          idSpan.textContent = `#${item.id}`;

          itemEl.appendChild(titleSpan);
          itemEl.appendChild(idSpan);

          itemEl.addEventListener('click', () => {
            input.value = item.title;
            input.dataset.selectedId = item.id;
            input.dataset.selectedRef = item.crmRef || item.id;
            input.dataset.selectedTitle = item.title;
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

            markFieldDirty();
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
      const cleanVal = input.value.replace(/^#/, '').trim();
      queryLookup(cleanVal);
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
    if (!val) return '';
    const s = String(val).trim();
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    const b24Match = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (b24Match) return `${b24Match[3]}-${b24Match[2]}-${b24Match[1]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
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
    if (!val) return '';
    const s = String(val).trim();
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    if (isoMatch) return isoMatch[1];
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
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
  function createFieldInput(f, currentVal, markFieldDirty) {
    if (isLookupField(f)) {
      if (!f.lookupEntity) f.lookupEntity = resolveLookupEntity(f);
      return createLookupInput(f, currentVal, markFieldDirty);
    }

    const container = document.createElement('div');
    let inputElement;

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
          curStr.replace(/s$/, '') === String(optText).trim().toLowerCase().replace(/s$/, '')
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
      span.textContent = f.placeholder || 'Yes / Confirmed';

      wrap.appendChild(inputElement);
      wrap.appendChild(span);
      container.appendChild(wrap);

      initialFormValues[f.code] = inputElement.checked;
    } else if (f.type === 'text') {
      inputElement = document.createElement('textarea');
      inputElement.className = 'form-control';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;
      inputElement.placeholder = f.placeholder || '';
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

      // Support single or multiple existing files returned by Bitrix24
      const filesList = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
      filesList.forEach((fileItem, idx) => {
        if (!fileItem) return;
        const fileChip = document.createElement('div');
        fileChip.className = 'file-preview-chip';

        let fileUrl = '';
        let fileName = '';

        if (typeof fileItem === 'object') {
          fileUrl = fileItem.urlMachine || fileItem.showUrl || fileItem.downloadUrl || fileItem.url || '';
          fileName = fileItem.name || `${f.label || 'Attached File'}${filesList.length > 1 ? ` #${idx + 1}` : ''}`;
        } else if (typeof fileItem === 'string' && fileItem.startsWith('http')) {
          fileUrl = fileItem;
          fileName = fileItem.split('/').pop() || 'Attached File';
        }

        const domain = window.__BITRIX_DOMAIN__ || 'csl.bitrix24.com';
        const fullUrl = fileUrl ? (fileUrl.startsWith('http') ? fileUrl : `https://${domain}${fileUrl}`) : '';

        fileChip.innerHTML = `📎 <span class="file-name">${fileName}</span> ${fullUrl ? `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="file-download-link">View File</a>` : ''}`;
        fileContainer.appendChild(fileChip);
      });

      inputElement = document.createElement('input');
      inputElement.type = 'file';
      inputElement.className = 'form-control file-input';
      inputElement.id = `field_${f.code}`;
      inputElement.name = f.code;

      // Allow multiple file selection for multiple-file fields
      const isMultiple = f.multiple || f.code.includes('PHOTOS') || f.code.includes('DOCUMENTS') || f.code.endsWith('_1');
      if (isMultiple) {
        inputElement.multiple = true;
      }

      fileContainer.appendChild(inputElement);
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
        if (f.type === 'double') inputElement.step = 'any';
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

  function applyListingSubLayout(subLayout) {
    currentListingSubLayout = subLayout;
    const meta = LISTING_LAYOUT_META[subLayout] || LISTING_LAYOUT_META.rent;
    if (listingLayoutBadge) {
      listingLayoutBadge.className = `layout-pill ${meta.pillClass}`;
      listingLayoutBadge.innerHTML = `${meta.icon} ${meta.title}`;
      listingLayoutBadge.style.display = 'inline-flex';
    }

    let totalActive = 0;
    const sections = tabConfig?.listingLayout?.sections || [];

    sections.forEach((sec, sIdx) => {
      const secId = `section_${sec.id || sIdx}`;
      const sectionCard = document.getElementById(secId);
      let secActiveCount = 0;

      (sec.fields || []).forEach(f => {
        const fg = document.querySelector(`.form-group[data-field-code="${f.code}"]`);
        const rule = f.rules ? (f.rules[subLayout] || 'show') : 'show';
        if (fg) {
          fg.style.display = rule === 'hide' ? 'none' : '';
          const labelEl = fg.querySelector('.form-label');
          if (labelEl) {
            const customLabel = (f.labelOverrides && f.labelOverrides[subLayout]) ? f.labelOverrides[subLayout] : f.label;
            const star = labelEl.querySelector('.required-star');
            labelEl.textContent = customLabel;
            if (star) labelEl.appendChild(star);
          }
        }
        if (rule !== 'hide') secActiveCount++;
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

    // 2. Composite Title & Portal Title from actual non-empty record fields
    const beds = getVal(['UF_CRM_1791952093551', 'UF_CRM_BEDROOM']);
    const propType = getText(['UF_CRM_1791952050535', 'UF_CRM_PROPERTY_TYPE']);
    const project = getText(['UF_CRM_1791952285159', 'UF_CRM_PROJECT_NAME', 'UF_CRM_PROJECT_1']);
    const community = getVal(['UF_CRM_1791952328751', 'UF_CRM_COMMUNITY']);
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
    formGroup.className = `form-group ${f.fullWidth || f.type === 'text' ? 'full-width' : ''}`;
    formGroup.setAttribute('data-field-code', f.code);
    formGroup.setAttribute('data-field-label', (f.label || '').toLowerCase());

    // Apply layout visibility rule for listing records
    if (currentLayout === 'listing' && f.rules) {
      const rule = f.rules[currentListingSubLayout] || 'show';
      if (rule === 'hide') {
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
          applyListingSubLayout(detected);
        }
      });
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
    }

    const layoutDef = layout === 'listing' ? tabConfig.listingLayout : tabConfig.enquiryLayout;
    const sections = layoutDef?.sections || [];

    // Calculate total fields count according to active rules
    let totalFields = 0;
    sections.forEach(s => {
      const active = (s.fields || []).filter(f => layout !== 'listing' || !f.rules || (f.rules[currentListingSubLayout] || 'show') !== 'hide');
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
      const activeFields = (sec.fields || []).filter(f => layout !== 'listing' || !f.rules || (f.rules[currentListingSubLayout] || 'show') !== 'hide');

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
        if (input.files && input.files.length > 0) {
          const files = Array.from(input.files);
          const isMultiple = input.multiple;

          const fileReadPromises = files.map(file => {
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
      } else {
        payload[f.code] = input.value.trim();
      }
    });

    if (payload.UF_CRM_LISTING_NAME && !payload.UF_CRM_1791952409183) {
      payload.UF_CRM_1791952409183 = payload.UF_CRM_LISTING_NAME;
    }

    if (payload.UF_CRM_COMMENTS_1 && !payload.COMMENTS) {
      payload.COMMENTS = payload.UF_CRM_COMMENTS_1;
    }

    if (payload.UF_CRM_PROJECT && !payload.UF_CRM_1792558317) {
      payload.UF_CRM_1792558317 = payload.UF_CRM_PROJECT;
    }

    if (payload.UF_CRM_PROPERTY_LAYOUT && !payload.UF_CRM_LAYOUT) {
      payload.UF_CRM_LAYOUT = payload.UF_CRM_PROPERTY_LAYOUT;
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
        loadingEl.innerHTML = '<div class="alert alert-danger">Error: Could not determine Lead ID from context.</div>';
        return;
      }

      const [cfg, lead] = await Promise.all([loadConfig(), fetchLead(currentLeadId)]);
      currentLead = lead;

      applyLayoutForLead(lead);

      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      resizeWindow();
    } catch (err) {
      console.error('Initialization error:', err);
      loadingEl.innerHTML = `<div class="alert alert-danger">Initialization failed: ${err.message}</div>`;
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
    document.addEventListener('DOMContentLoaded', safeInit);
  }
})();
