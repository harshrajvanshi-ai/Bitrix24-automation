/**
 * public/js/admin.js
 * Admin portal interactive logic for field discovery, stage setup, and custom field creation
 */

(function () {
  'use strict';

  let adminSecret = sessionStorage.getItem('ADMIN_SECRET') || '';

  // DOM Elements
  const authOverlay = document.getElementById('auth-overlay');
  const adminMain = document.getElementById('admin-main');
  const secretInput = document.getElementById('admin-secret-input');
  const unlockBtn = document.getElementById('btn-unlock-admin');
  const authError = document.getElementById('auth-error');

  const refreshDiscoveryBtn = document.getElementById('btn-refresh-discovery');
  const syncPlacementsBtn = document.getElementById('btn-sync-placements');
  const openCreateModalBtn = document.getElementById('btn-open-create-field');
  const createMissingStagesBtn = document.getElementById('btn-create-missing-stages');
  const createMissingFieldsBtn = document.getElementById('btn-create-missing-fields');

  const modal = document.getElementById('modal-create-field');
  const cancelModalBtn = document.getElementById('btn-cancel-modal');
  const createFieldForm = document.getElementById('form-create-field');
  const fieldTypeSelect = document.getElementById('new-field-type');
  const enumOptionsGroup = document.getElementById('enum-options-group');

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

  function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
      'x-admin-secret': adminSecret
    };
    if (body) headers['Content-Type'] = 'application/json';

    return fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    });
  }

  async function loadDiscovery() {
    try {
      const data = await apiCall('/api/admin/discovery');
      renderDiscovery(data);
    } catch (err) {
      console.error('Discovery load error:', err);
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  function renderDiscovery(data) {
    const { leadType, stages, fields, config: cfg } = data;

    // 1. Lead Type Card
    const leadTypeTag = document.getElementById('lead-type-status-tag');
    const leadTypeDetails = document.getElementById('lead-type-details');
    if (leadType.found) {
      leadTypeTag.className = 'status-tag tag-success';
      leadTypeTag.textContent = 'Found in CRM';
    } else {
      leadTypeTag.className = 'status-tag tag-danger';
      leadTypeTag.textContent = 'Not Found';
    }

    leadTypeDetails.innerHTML = `
      <div><strong>Field Code:</strong> <span class="badge">${leadType.fieldCode || 'Not Set'}</span></div>
      <div><strong>Enquiry Item ID:</strong> ${leadType.enquiryItemId ? `<span class="badge">${leadType.enquiryItemId}</span>` : '<span style="color:#c62828;">Not mapped</span>'}</div>
      <div><strong>Listing Item ID:</strong> ${leadType.listingItemId ? `<span class="badge">${leadType.listingItemId}</span>` : '<span style="color:#c62828;">Not mapped</span>'}</div>
      <div style="color: var(--b24-text-muted); font-size: 11px; margin-top: 4px;">Available items: ${leadType.items.map(i => `${i.value} (#${i.id})`).join(', ') || 'None'}</div>
    `;

    // 2. Stages Card
    const stagesDetails = document.getElementById('stages-details');
    const missingStages = [];
    if (!stages.enquiryStageId) missingStages.push('Enquiry Leads');
    if (!stages.listingStageId) missingStages.push('Listing Leads');

    if (missingStages.length > 0) {
      createMissingStagesBtn.style.display = 'inline-block';
    } else {
      createMissingStagesBtn.style.display = 'none';
    }

    stagesDetails.innerHTML = `
      <div><strong>Enquiry Stage:</strong> ${stages.enquiryStageId ? `<span class="badge">${stages.enquiryStageId}</span> (${stages.enquiryStageName})` : '<span style="color:#c62828;">Missing</span>'}</div>
      <div><strong>Listing Stage:</strong> ${stages.listingStageId ? `<span class="badge">${stages.listingStageId}</span> (${stages.listingStageName})` : '<span style="color:#c62828;">Missing</span>'}</div>
      <div><strong>Terminal / Won / Lost Stages:</strong> <span class="badge">${stages.finalStages.length} stages monitored</span></div>
    `;

    // 3. Schema Sync
    const summary = document.getElementById('missing-fields-summary');
    const tbody = document.getElementById('schema-table-body');
    tbody.innerHTML = '';

    if (fields.missing.length > 0) {
      createMissingFieldsBtn.style.display = 'inline-block';
      summary.innerHTML = `<span style="color: #c62828; font-weight: 600;">⚠️ ${fields.missing.length} configured fields do not exist yet in Bitrix24.</span> Click below to create them automatically.`;
    } else {
      createMissingFieldsBtn.style.display = 'none';
      summary.innerHTML = `<span style="color: #2e7d32; font-weight: 600;">✓ All ${fields.existing.length} configured fields exist in Bitrix24!</span>`;
    }

    const allConfigured = [
      ...(cfg.enquiryFields || []).map(f => ({ ...f, tab: 'Enquiry' })),
      ...(cfg.listingFields || []).map(f => ({ ...f, tab: 'Listing' }))
    ];

    allConfigured.forEach(field => {
      const isMissing = fields.missing.some(m => m.code === field.code);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge">${field.code}</span></td>
        <td><strong>${field.label}</strong> ${field.required ? '<span style="color:#c92a2a">*</span>' : ''}</td>
        <td>${field.type}</td>
        <td>${isMissing ? '<span class="status-tag tag-danger">Missing</span>' : '<span class="status-tag tag-success">Active</span>'}</td>
        <td><span class="status-tag ${field.tab === 'Enquiry' ? 'tag-info' : 'tag-success'}">${field.tab}</span></td>
      `;
      tbody.appendChild(tr);
    });

    // 4. Render Table Lists
    renderTabFieldTables(cfg);
  }

  function renderTabFieldTables(cfg) {
    document.getElementById('enquiry-count').textContent = `${cfg.enquiryFields?.length || 0} fields`;
    document.getElementById('listing-count').textContent = `${cfg.listingFields?.length || 0} fields`;

    const enquiryTbody = document.getElementById('enquiry-fields-body');
    enquiryTbody.innerHTML = '';
    (cfg.enquiryFields || []).forEach(f => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge">${f.code}</span></td>
        <td>${f.label}</td>
        <td>${f.type}</td>
        <td>${f.required ? 'Yes' : 'No'}</td>
      `;
      enquiryTbody.appendChild(tr);
    });

    const listingTbody = document.getElementById('listing-fields-body');
    listingTbody.innerHTML = '';
    (cfg.listingFields || []).forEach(f => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge">${f.code}</span></td>
        <td>${f.label}</td>
        <td>${f.type}</td>
        <td>${f.required ? 'Yes' : 'No'}</td>
      `;
      listingTbody.appendChild(tr);
    });
  }

  // --- Actions ---

  unlockBtn.addEventListener('click', async () => {
    const val = secretInput.value.trim();
    if (!val) return;
    adminSecret = val;

    try {
      authError.style.display = 'none';
      unlockBtn.disabled = true;
      unlockBtn.textContent = 'Verifying...';

      await apiCall('/api/admin/discovery');

      sessionStorage.setItem('ADMIN_SECRET', adminSecret);
      authOverlay.style.display = 'none';
      adminMain.style.display = 'block';
      loadDiscovery();
    } catch (err) {
      authError.textContent = 'Invalid ADMIN_SECRET or server unavailable.';
      authError.style.display = 'block';
    } finally {
      unlockBtn.disabled = false;
      unlockBtn.textContent = 'Unlock Admin Dashboard';
    }
  });

  refreshDiscoveryBtn.addEventListener('click', async () => {
    refreshDiscoveryBtn.disabled = true;
    refreshDiscoveryBtn.textContent = 'Running...';
    try {
      await apiCall('/api/admin/discovery', 'POST');
      await loadDiscovery();
      showToast('Discovery completed successfully!', 'success');
    } catch (err) {
      showToast(`Discovery error: ${err.message}`, 'error');
    } finally {
      refreshDiscoveryBtn.disabled = false;
      refreshDiscoveryBtn.textContent = '↻ Run Schema Discovery';
    }
  });

  createMissingStagesBtn.addEventListener('click', async () => {
    const confirmCreate = confirm('Do you want to create the missing "Enquiry Leads" and "Listing Leads" stages in Bitrix24?');
    if (!confirmCreate) return;

    createMissingStagesBtn.disabled = true;
    try {
      const res = await apiCall('/api/admin/create-stages', 'POST');
      showToast(`Stages created: ${res.created.join(', ')}`, 'success');
      loadDiscovery();
    } catch (err) {
      showToast(`Error creating stages: ${err.message}`, 'error');
    } finally {
      createMissingStagesBtn.disabled = false;
    }
  });

  createMissingFieldsBtn.addEventListener('click', async () => {
    const confirmCreate = confirm('This will call crm.lead.userfield.add for all missing fields on Lead. Proceed?');
    if (!confirmCreate) return;

    createMissingFieldsBtn.disabled = true;
    createMissingFieldsBtn.textContent = 'Creating in Bitrix24...';

    try {
      const res = await apiCall('/api/admin/create-missing-fields', 'POST');
      showToast(`Created ${res.created.length} fields in Bitrix24!`, 'success');
      loadDiscovery();
    } catch (err) {
      showToast(`Error creating fields: ${err.message}`, 'error');
    } finally {
      createMissingFieldsBtn.disabled = false;
      createMissingFieldsBtn.textContent = '⚡ Auto-Create All Missing Fields in Bitrix24';
    }
  });

  if (syncPlacementsBtn) {
    syncPlacementsBtn.addEventListener('click', async () => {
      syncPlacementsBtn.disabled = true;
      syncPlacementsBtn.textContent = 'Syncing...';
      try {
        const res = await apiCall('/api/admin/bind-placements', 'POST');
        
        // Also call client-side BX24 if running inside Bitrix24 iframe
        if (window.BX24 && typeof window.BX24.callMethod === 'function') {
          const publicUrl = window.location.origin;
          window.BX24.callMethod('placement.bind', {
            PLACEMENT: 'CRM_LEAD_DETAIL_TAB',
            HANDLER: publicUrl + '/tab',
            TITLE: 'Lead Details'
          });
          window.BX24.callMethod('placement.bind', {
            PLACEMENT: 'CRM_DYNAMIC_1062_DETAIL_TAB',
            HANDLER: publicUrl + '/matching-listings',
            TITLE: 'Matching Listings'
          });
          window.BX24.callMethod('placement.bind', {
            PLACEMENT: 'CRM_DYNAMIC_18_DETAIL_TAB',
            HANDLER: publicUrl + '/matching-listings',
            TITLE: 'Matching Listings'
          });
        }

        showToast('App placements synchronized! Lead Details & Matching Listings tabs are active.', 'success');
      } catch (err) {
        showToast(`Sync error: ${err.message}`, 'error');
      } finally {
        syncPlacementsBtn.disabled = false;
        syncPlacementsBtn.textContent = '⚡ Sync Placements';
      }
    });
  }

  // Modal handlers
  openCreateModalBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
  });
  cancelModalBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  fieldTypeSelect.addEventListener('change', () => {
    enumOptionsGroup.style.display = fieldTypeSelect.value === 'enumeration' ? 'block' : 'none';
  });

  createFieldForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = document.getElementById('new-field-label').value.trim();
    let code = document.getElementById('new-field-code').value.trim().toUpperCase();
    if (!code.startsWith('UF_CRM_')) code = 'UF_CRM_' + code;
    const type = fieldTypeSelect.value;
    const tab = document.getElementById('new-field-tab').value;
    const rawOptions = document.getElementById('new-field-options').value;
    const options = type === 'enumeration'
      ? rawOptions.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const submitBtn = document.getElementById('btn-submit-create-field');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
      await apiCall('/api/admin/create-field', 'POST', {
        label,
        code,
        type,
        tab,
        options
      });
      showToast(`Field ${code} created in Bitrix24 and added to config!`, 'success');
      modal.style.display = 'none';
      createFieldForm.reset();
      enumOptionsGroup.style.display = 'none';
      loadDiscovery();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create in Bitrix24';
    }
  });

  // Check stored secret on load
  if (adminSecret) {
    apiCall('/api/admin/discovery')
      .then(data => {
        authOverlay.style.display = 'none';
        adminMain.style.display = 'block';
        renderDiscovery(data);
      })
      .catch(() => {
        authOverlay.style.display = 'flex';
        adminMain.style.display = 'none';
      });
  }
})();
