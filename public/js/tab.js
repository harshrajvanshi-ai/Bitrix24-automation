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
  let initialFormValues = {};
  let isDirty = false;
  let allSectionsCollapsed = false;

  // DOM Elements
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  const formEl = document.getElementById('lead-tab-form');
  const fieldsContainer = document.getElementById('fields-container');
  const stageBadge = document.getElementById('stage-badge');
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
      const res = await fetch('/api/config');
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
      if (!window.BX24) {
        fetch(`/api/lead/${leadId}`)
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
   * Create interactive Lookup Autocomplete Component (Bitrix CRM Entity Lookups)
   */
  function createLookupInput(f, currentVal, markFieldDirty) {
    const container = document.createElement('div');
    container.className = 'lookup-container';

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
    if (currentLead && currentLead[f.code + '_TITLE']) {
      input.value = currentLead[f.code + '_TITLE'];
      input.dataset.selectedRef = currentLead[f.code + '_REF'] || currentVal;
      const idM = String(currentVal).trim().match(/^(?:DYNAMIC_\d+_|[A-Z]+_)?(\d+)$/i);
      if (idM) input.dataset.selectedId = idM[1];
    } else if (currentVal) {
      const refMatch = String(currentVal).trim().match(/^(?:DYNAMIC_\d+_|[A-Z]+_)?(\d+)$/i);
      if (refMatch) {
        const cleanId = refMatch[1];
        input.dataset.selectedId = cleanId;
        input.dataset.selectedRef = currentVal;
        fetch(`/api/lookup?entity=${encodeURIComponent(f.lookupEntity || 'master_project')}&q=${encodeURIComponent(cleanId)}`)
          .then(r => r.json())
          .then(d => {
            const match = (d.items || []).find(it => String(it.id) === cleanId) || (d.items && d.items[0]);
            if (match && (input.value === currentVal || input.value === cleanId || !input.value)) {
              input.value = match.title;
              input.dataset.selectedRef = match.crmRef || currentVal;
            }
          })
          .catch(() => {});
      } else {
        // Plain text title passed (e.g. from legacy data), pre-resolve ID and CRM reference
        fetch(`/api/lookup?entity=${encodeURIComponent(f.lookupEntity || 'master_project')}&q=${encodeURIComponent(String(currentVal).trim())}`)
          .then(r => r.json())
          .then(d => {
            const match = (d.items || []).find(it => it.title.toLowerCase() === String(currentVal).trim().toLowerCase()) || (d.items && d.items[0]);
            if (match) {
              input.dataset.selectedId = match.id;
              input.dataset.selectedRef = match.crmRef || match.id;
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

    const dropdown = document.createElement('div');
    dropdown.className = 'lookup-dropdown';

    inputWrap.appendChild(icon);
    inputWrap.appendChild(input);
    inputWrap.appendChild(clearBtn);
    container.appendChild(inputWrap);
    container.appendChild(dropdown);

    let debounceTimer = null;

    async function queryLookup(query = '', refresh = false) {
      dropdown.innerHTML = '<div class="lookup-spinner">Searching Bitrix24 records...</div>';
      dropdown.style.display = 'block';

      try {
        const refreshParam = refresh ? '&refresh=1' : '';
        const res = await fetch(`/api/lookup?entity=${encodeURIComponent(f.lookupEntity || 'master_project')}&q=${encodeURIComponent(query)}${refreshParam}`);
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
            clearBtn.style.display = 'block';
            dropdown.style.display = 'none';
            markFieldDirty();
          });

          dropdown.appendChild(itemEl);
        });
      } catch (err) {
        dropdown.innerHTML = '<div class="lookup-item" style="color: var(--b24-danger);">Failed to load records</div>';
      }
    }

    input.addEventListener('focus', () => {
      queryLookup(input.value.trim());
    });

    input.addEventListener('input', () => {
      clearBtn.style.display = input.value ? 'block' : 'none';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryLookup(input.value.trim());
      }, 250);
      markFieldDirty();
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.dataset.selectedId = '';
      input.dataset.selectedRef = '';
      clearBtn.style.display = 'none';
      dropdown.style.display = 'none';
      markFieldDirty();
      input.focus();
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        dropdown.style.display = 'none';
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
    if (f.type === 'lookup') {
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
          fileUrl = fileItem.showUrl || fileItem.downloadUrl || '';
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

  /**
   * Create standard form-group wrapper with label & validation feedback
   */
  function createFormGroup(f, currentVal) {
    const formGroup = document.createElement('div');
    formGroup.className = `form-group ${f.fullWidth || f.type === 'text' ? 'full-width' : ''}`;
    formGroup.setAttribute('data-field-code', f.code);
    formGroup.setAttribute('data-field-label', f.label.toLowerCase());

    const label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', `field_${f.code}`);
    label.textContent = f.label;
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
    };

    const inputObj = createFieldInput(f, currentVal, markFieldDirty);
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
    } else {
      stageBadge.classList.add('badge-enquiry');
      stageBadge.textContent = 'Enquiry Record';
      if (stageInfoText) stageInfoText.innerHTML = '🔍 Presenting <strong>Enquiry Layout</strong>';
    }

    const layoutDef = layout === 'listing' ? tabConfig.listingLayout : tabConfig.enquiryLayout;
    const sections = layoutDef?.sections || [];

    // Calculate total fields count
    let totalFields = 0;
    sections.forEach(s => totalFields += (s.fields || []).length);
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

      // Section Pill
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'nav-pill';
      pill.innerHTML = `${sec.icon || '📁'} ${sec.title}`;
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
      badgeCount.textContent = `${(sec.fields || []).length} fields`;

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
        if (currentVal === undefined || currentVal === null) currentVal = '';
        gridEl.appendChild(createFormGroup(f, currentVal));
      });

      bodyEl.appendChild(gridEl);
      sectionCard.appendChild(bodyEl);
      fieldsContainer.appendChild(sectionCard);
    });

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
        headers: { 'Content-Type': 'application/json' },
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
      } else if (f.type === 'lookup') {
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

    await Promise.all(filePromises);

    try {
      const res = await fetch(`/api/lead/${currentLeadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  if (window.BX24 && typeof window.BX24.init === 'function') {
    window.BX24.init(safeInit);
    setTimeout(safeInit, 2000);
  } else {
    document.addEventListener('DOMContentLoaded', safeInit);
  }
})();
