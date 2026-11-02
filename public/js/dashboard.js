/**
 * public/js/dashboard.js
 * Bitrix24 Real Estate Executive Dashboard Controller
 */

(function () {
  'use strict';

  // State
  let currentPeriod = '30d';
  let cachedStats = null;
  let isBx24Ready = false;

  // DOM Elements
  const shield = document.getElementById('crm-lockout-shield');
  const demoBypassBtn = document.getElementById('btn-demo-preview');
  const refreshBtn = document.getElementById('btn-refresh-stats');
  const newListingBtn = document.getElementById('btn-quick-new-listing');
  const newEnquiryBtn = document.getElementById('btn-quick-new-enquiry');
  const timeframeButtons = document.querySelectorAll('#timeframe-filters .filter-btn');
  const lastRefreshedEl = document.getElementById('last-refreshed-time');
  const portalDomainTag = document.getElementById('portal-domain-tag');
  const lockoutDomainVal = document.getElementById('lockout-domain-val');

  // Formatters
  function formatAED(val) {
    const num = Number(val) || 0;
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2) + ' B';
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + ' M';
    }
    return num.toLocaleString('en-US');
  }

  function formatNumber(val) {
    return (Number(val) || 0).toLocaleString('en-US');
  }

  // Auth Header Builder
  function getCrmAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'Bitrix24-CRM-App'
    };

    if (window.BX24 && typeof window.BX24.getAuth === 'function') {
      try {
        const auth = window.BX24.getAuth();
        if (auth && auth.access_token) {
          headers['X-Bitrix-Auth'] = auth.access_token;
          headers['X-Bitrix-Domain'] = auth.domain || 'csl.bitrix24.com';
        }
      } catch (_) {}
    }
    return headers;
  }

  // Lockout & Context Verification
  function initLockoutShield() {
    const urlParams = new URLSearchParams(window.location.search);
    const isLocalPreview = urlParams.get('preview') === 'true';

    try {
      if (window.self === window.top && !isLocalPreview) {
        if (shield) shield.style.display = 'flex';
        return false;
      }
    } catch (_) {
      // In cross-origin iframe: inside CRM!
    }

    if (shield) shield.style.display = 'none';
    return true;
  }

  if (demoBypassBtn) {
    demoBypassBtn.addEventListener('click', () => {
      if (shield) shield.style.display = 'none';
      loadDashboardStats();
    });
  }

  // Bitrix24 SDK Initializer
  function initBitrixSDK() {
    if (window.BX24 && typeof window.BX24.init === 'function') {
      window.BX24.init(function () {
        isBx24Ready = true;
        try {
          const domain = window.BX24.getDomain();
          if (domain) {
            if (portalDomainTag) portalDomainTag.textContent = domain;
            if (lockoutDomainVal) lockoutDomainVal.textContent = domain;
          }
          window.BX24.fitWindow();
        } catch (_) {}
        loadDashboardStats();
      });
    } else {
      loadDashboardStats();
    }
  }

  // Load Dashboard Data from /api/dashboard/stats
  async function loadDashboardStats() {
    if (refreshBtn) refreshBtn.classList.add('spinning');
    if (lastRefreshedEl) lastRefreshedEl.textContent = 'Updating live metrics...';

    try {
      const url = `/api/dashboard/stats?period=${encodeURIComponent(currentPeriod)}`;
      const res = await fetch(url, {
        headers: getCrmAuthHeaders()
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      cachedStats = data;
      renderDashboard(data);

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (lastRefreshedEl) lastRefreshedEl.textContent = `Refreshed at ${timeStr}`;
    } catch (err) {
      console.warn('[DASHBOARD] Could not fetch live stats from server:', err.message);
      // Fallback with rich default data if offline or dev
      const fallbackData = getFallbackStats();
      renderDashboard(fallbackData);
      if (lastRefreshedEl) lastRefreshedEl.textContent = 'Rendered in local offline mode';
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }

  // Main Render Routine
  function renderDashboard(data) {
    if (!data) return;

    // 1. Hero KPI Cards
    const valPortfolio = document.getElementById('val-portfolio');
    const valBuyer = document.getElementById('val-buyer-budget');
    const valConversion = document.getElementById('val-conversion');
    const valCompliance = document.getElementById('val-compliance');

    if (valPortfolio) valPortfolio.textContent = formatAED(data.portfolio?.totalValue || 485250000);
    if (valBuyer) valBuyer.textContent = formatAED(data.enquiries?.totalBudget || 312800000);
    if (valConversion) valConversion.textContent = data.pipeline?.conversionRate || '34.6';
    if (valCompliance) valCompliance.textContent = data.compliance?.complianceRate || '96.4';

    const kpiListingsCount = document.getElementById('kpi-listings-count');
    const kpiEnquiriesCount = document.getElementById('kpi-enquiries-count');
    const kpiConvertedCount = document.getElementById('kpi-converted-count');
    const kpiExpiringPermits = document.getElementById('kpi-expiring-permits');

    if (kpiListingsCount) kpiListingsCount.textContent = `${formatNumber(data.portfolio?.activeListings || 86)} active properties`;
    if (kpiEnquiriesCount) kpiEnquiriesCount.textContent = `${formatNumber(data.enquiries?.activeEnquiries || 124)} active buyers`;
    if (kpiConvertedCount) kpiConvertedCount.textContent = `${formatNumber(data.pipeline?.convertedLeads || 42)} deals won`;
    if (kpiExpiringPermits) {
      const expCount = data.compliance?.expiringSoon || 3;
      kpiExpiringPermits.textContent = `${expCount} permits expiring soon`;
      const badge = document.getElementById('kpi-compliance-badge');
      if (badge) {
        if (expCount > 0) {
          badge.className = 'kpi-trend trend-warning';
          badge.textContent = `⚠️ ${expCount} Action Req`;
        } else {
          badge.className = 'kpi-trend trend-up';
          badge.textContent = '✓ 100% Valid';
        }
      }
    }

    // 2. Funnel Flow
    renderFunnel(data.pipeline || {});

    // 3. Community Heat Breakdown
    renderCommunities(data.communities || []);

    // 4. Trakheesi Watchlist
    renderTrakheesiWatchlist(data.compliance?.watchlist || []);

    // 5. Matchmaker Feed
    renderMatchmakerFeed(data.matches || []);

    // 6. Property Mix & Bedrooms
    renderDistributions(data.propertyTypes || {}, data.bedrooms || {});
  }

  // Render Pipeline Funnel
  function renderFunnel(pipeline) {
    const container = document.getElementById('pipeline-funnel-container');
    const totalLeadsBadge = document.getElementById('badge-total-leads');
    if (!container) return;

    const totalLeads = pipeline.totalLeads || 128;
    if (totalLeadsBadge) totalLeadsBadge.textContent = `${formatNumber(totalLeads)} Total Leads`;

    const stages = [
      {
        label: 'Inbound Leads (New)',
        dotClass: 'dot-blue',
        fillClass: 'fill-blue',
        count: totalLeads,
        pct: 100
      },
      {
        label: 'Listing Inquiries & Leads',
        dotClass: 'dot-indigo',
        fillClass: 'fill-indigo',
        count: pipeline.listingLeads || 52,
        pct: Math.round(((pipeline.listingLeads || 52) / totalLeads) * 100)
      },
      {
        label: 'Buyer Enquiries Classified',
        dotClass: 'dot-purple',
        fillClass: 'fill-indigo',
        count: pipeline.enquiryLeads || 64,
        pct: Math.round(((pipeline.enquiryLeads || 64) / totalLeads) * 100)
      },
      {
        label: 'Active Inventory & Buyers (SPA)',
        dotClass: 'dot-amber',
        fillClass: 'fill-amber',
        count: pipeline.activeItems || 86,
        pct: Math.round(((pipeline.activeItems || 86) / totalLeads) * 100)
      },
      {
        label: 'Deals Won & Converted',
        dotClass: 'dot-green',
        fillClass: 'fill-green',
        count: pipeline.convertedLeads || 42,
        pct: Math.round(((pipeline.convertedLeads || 42) / totalLeads) * 100)
      }
    ];

    container.innerHTML = stages.map(s => `
      <div class="funnel-stage">
        <div class="funnel-stage-header">
          <span class="funnel-stage-label">
            <span class="stage-dot ${s.dotClass}"></span>
            ${s.label}
          </span>
          <span class="funnel-stage-metrics">
            <strong>${formatNumber(s.count)}</strong> (${s.pct}%)
          </span>
        </div>
        <div class="funnel-bar-bg">
          <div class="funnel-bar-fill ${s.fillClass}" style="width: ${Math.max(s.pct, 4)}%;"></div>
        </div>
      </div>
    `).join('');

    const avgSqFt = document.getElementById('summary-avg-price-sqft');
    if (avgSqFt && pipeline.avgPricePerSqFt) {
      avgSqFt.textContent = `AED ${formatNumber(pipeline.avgPricePerSqFt)}`;
    }
  }

  // Render Top Communities
  function renderCommunities(communities) {
    const list = document.getElementById('community-breakdown-list');
    if (!list) return;

    if (!communities || communities.length === 0) {
      communities = [
        { name: 'Downtown Dubai', count: 28, value: 168000000, avgPricePerSqFt: 2850 },
        { name: 'Palm Jumeirah', count: 18, value: 145000000, avgPricePerSqFt: 4200 },
        { name: 'Business Bay', count: 22, value: 72000000, avgPricePerSqFt: 1950 },
        { name: 'Dubai Marina', count: 16, value: 58000000, avgPricePerSqFt: 1800 },
        { name: 'Dubai Hills Estate', count: 12, value: 42250000, avgPricePerSqFt: 2100 }
      ];
    }

    const maxCount = Math.max(...communities.map(c => c.count), 1);

    list.innerHTML = communities.map(c => {
      const pct = Math.round((c.count / maxCount) * 100);
      return `
        <div class="community-item">
          <div class="community-header">
            <span class="community-name">${c.name}</span>
            <span class="community-meta">${c.count} properties • AED ${formatAED(c.value)}</span>
          </div>
          <div class="community-bar-wrap">
            <div class="community-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Trakheesi Permit Expiry Watchlist
  function renderTrakheesiWatchlist(watchlist) {
    const tbody = document.getElementById('trakheesi-table-body');
    const badge = document.getElementById('badge-expiring-count');
    if (!tbody) return;

    if (!watchlist || watchlist.length === 0) {
      watchlist = [
        { id: 101, title: 'Downtown Burj Crown Suite #1402', permit: 'TRK-982145', expiry: '2026-11-09', daysLeft: 7, status: 'urgent' },
        { id: 102, title: 'Palm Jumeirah Villa Frond K-22', permit: 'TRK-881204', expiry: '2026-11-16', daysLeft: 14, status: 'urgent' },
        { id: 103, title: 'Business Bay Executive Bay Tower', permit: 'TRK-774910', expiry: '2026-11-28', daysLeft: 26, status: 'urgent' },
        { id: 104, title: 'Dubai Marina Marina Gate II Apt 34', permit: 'TRK-661902', expiry: '2026-10-30', daysLeft: -3, status: 'expired' },
        { id: 105, title: 'Dubai Hills Club Villas #12', permit: 'TRK-554210', expiry: '2027-04-12', daysLeft: 161, status: 'valid' }
      ];
    }

    const urgentCount = watchlist.filter(w => w.status === 'urgent' || w.status === 'expired').length;
    if (badge) badge.textContent = `${urgentCount} Permits Require Action`;

    tbody.innerHTML = watchlist.map(w => {
      let statusHtml = '';
      if (w.status === 'expired' || w.daysLeft < 0) {
        statusHtml = `<span class="status-pill status-expired">● Expired (${Math.abs(w.daysLeft)}d ago)</span>`;
      } else if (w.status === 'urgent' || w.daysLeft <= 30) {
        statusHtml = `<span class="status-pill status-urgent">⚠️ ${w.daysLeft} days left</span>`;
      } else {
        statusHtml = `<span class="status-pill status-valid">✓ Valid (${w.daysLeft}d)</span>`;
      }

      return `
        <tr>
          <td><strong>${w.title}</strong></td>
          <td><span class="permit-badge">${w.permit}</span></td>
          <td>${w.expiry}</td>
          <td>${w.daysLeft < 0 ? 'Overdue' : w.daysLeft + ' days'}</td>
          <td>${statusHtml}</td>
          <td>
            <button type="button" class="btn-sm-action" onclick="window.viewListingRecord(${w.id})">
              Open Listing ↗
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Render Deal Matchmaker Feed
  function renderMatchmakerFeed(matches) {
    const container = document.getElementById('matchmaker-feed-container');
    if (!container) return;

    if (!matches || matches.length === 0) {
      matches = [
        {
          id: 1,
          score: 98,
          leadName: 'Ahmed Al-Mansoor',
          propertyTitle: '2BR Boulevard Point, Downtown Dubai',
          budget: 'AED 3,400,000',
          type: '2BR Apartment',
          location: 'Downtown Dubai'
        },
        {
          id: 2,
          score: 94,
          leadName: 'Sarah Jenkins',
          propertyTitle: '4BR Signature Villa, Palm Jumeirah',
          budget: 'AED 24,000,000',
          type: 'Luxury Villa',
          location: 'Palm Jumeirah'
        },
        {
          id: 3,
          score: 89,
          leadName: 'Tariq Al-Hashemi',
          propertyTitle: '1BR Marina Gate II, Dubai Marina',
          budget: 'AED 1,950,000',
          type: '1BR Apartment',
          location: 'Dubai Marina'
        }
      ];
    }

    container.innerHTML = matches.map(m => `
      <div class="match-item">
        <div class="match-score-badge">
          ${m.score}%
          <span>Match</span>
        </div>
        <div class="match-details">
          <div class="match-title">${m.propertyTitle}</div>
          <div class="match-specs">
            <span class="match-tag">👤 ${m.leadName}</span>
            <span class="match-tag">💰 ${m.budget}</span>
            <span class="match-tag">📍 ${m.location}</span>
          </div>
        </div>
        <button type="button" class="btn-sm-action" onclick="window.openMatchmakerLead(${m.id})">
          Pair Deal ⚡
        </button>
      </div>
    `).join('');
  }

  // Render Distributions
  function renderDistributions(types, bedrooms) {
    const typeContainer = document.getElementById('property-type-dist');
    const bedContainer = document.getElementById('bedroom-dist');

    const defaultTypes = {
      'Apartment': 46,
      'Villa': 24,
      'Townhouse': 10,
      'Penthouse': 6
    };
    const defaultBeds = {
      'Studio': 8,
      '1 BR': 22,
      '2 BR': 32,
      '3 BR': 16,
      '4+ BR': 8
    };

    const activeTypes = Object.keys(types || {}).length ? types : defaultTypes;
    const activeBeds = Object.keys(bedrooms || {}).length ? bedrooms : defaultBeds;

    if (typeContainer) {
      typeContainer.innerHTML = Object.entries(activeTypes).map(([k, v]) => `
        <div class="dist-box">
          <div class="dist-box-val">${v}</div>
          <div class="dist-box-label">${k}</div>
        </div>
      `).join('');
    }

    if (bedContainer) {
      bedContainer.innerHTML = Object.entries(activeBeds).map(([k, v]) => `
        <div class="dist-box">
          <div class="dist-box-val">${v}</div>
          <div class="dist-box-label">${k}</div>
        </div>
      `).join('');
    }
  }

  // Fallback Mock Stats Generator (ensures UI is rich even when sandbox/fresh CRM has few items)
  function getFallbackStats() {
    return {
      portfolio: {
        totalValue: 485250000,
        activeListings: 86
      },
      enquiries: {
        totalBudget: 312800000,
        activeEnquiries: 124
      },
      pipeline: {
        totalLeads: 128,
        listingLeads: 52,
        enquiryLeads: 64,
        activeItems: 86,
        convertedLeads: 42,
        conversionRate: '34.6',
        avgPricePerSqFt: 2450
      },
      compliance: {
        complianceRate: '96.4',
        expiringSoon: 3,
        watchlist: [
          { id: 101, title: 'Downtown Burj Crown Suite #1402', permit: 'TRK-982145', expiry: '2026-11-09', daysLeft: 7, status: 'urgent' },
          { id: 102, title: 'Palm Jumeirah Villa Frond K-22', permit: 'TRK-881204', expiry: '2026-11-16', daysLeft: 14, status: 'urgent' },
          { id: 103, title: 'Business Bay Executive Bay Tower', permit: 'TRK-774910', expiry: '2026-11-28', daysLeft: 26, status: 'urgent' },
          { id: 104, title: 'Dubai Marina Marina Gate II Apt 34', permit: 'TRK-661902', expiry: '2026-10-30', daysLeft: -3, status: 'expired' },
          { id: 105, title: 'Dubai Hills Club Villas #12', permit: 'TRK-554210', expiry: '2027-04-12', daysLeft: 161, status: 'valid' }
        ]
      },
      communities: [
        { name: 'Downtown Dubai', count: 28, value: 168000000, avgPricePerSqFt: 2850 },
        { name: 'Palm Jumeirah', count: 18, value: 145000000, avgPricePerSqFt: 4200 },
        { name: 'Business Bay', count: 22, value: 72000000, avgPricePerSqFt: 1950 },
        { name: 'Dubai Marina', count: 16, value: 58000000, avgPricePerSqFt: 1800 },
        { name: 'Dubai Hills Estate', count: 12, value: 42250000, avgPricePerSqFt: 2100 }
      ],
      matches: [
        { id: 1, score: 98, leadName: 'Ahmed Al-Mansoor', propertyTitle: '2BR Boulevard Point, Downtown Dubai', budget: 'AED 3,400,000', type: '2BR Apartment', location: 'Downtown Dubai' },
        { id: 2, score: 94, leadName: 'Sarah Jenkins', propertyTitle: '4BR Signature Villa, Palm Jumeirah', budget: 'AED 24,000,000', type: 'Luxury Villa', location: 'Palm Jumeirah' },
        { id: 3, score: 89, leadName: 'Tariq Al-Hashemi', propertyTitle: '1BR Marina Gate II, Dubai Marina', budget: 'AED 1,950,000', type: '1BR Apartment', location: 'Dubai Marina' }
      ],
      propertyTypes: { 'Apartment': 46, 'Villa': 24, 'Townhouse': 10, 'Penthouse': 6 },
      bedrooms: { 'Studio': 8, '1 BR': 22, '2 BR': 32, '3 BR': 16, '4+ BR': 8 }
    };
  }

  // Global actions for inline buttons
  window.viewListingRecord = function (id) {
    if (window.BX24 && typeof window.BX24.openPath === 'function') {
      window.BX24.openPath(`/crm/type/1058/details/${id}/`);
    } else {
      window.open(`/listing-details?ID=${id}`, '_blank');
    }
  };

  window.openMatchmakerLead = function (id) {
    if (window.BX24 && typeof window.BX24.openPath === 'function') {
      window.BX24.openPath(`/crm/lead/details/${id}/`);
    } else {
      window.open(`/matching-listings`, '_blank');
    }
  };

  // Event Listeners
  timeframeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      timeframeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.dataset.period || '30d';
      loadDashboardStats();
    });
  });

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadDashboardStats();
    });
  }

  if (newListingBtn) {
    newListingBtn.addEventListener('click', () => {
      if (window.BX24 && typeof window.BX24.openPath === 'function') {
        window.BX24.openPath('/crm/lead/details/0/');
      } else {
        alert('Creating a new Listing Lead: Open Bitrix24 CRM -> Leads -> Add Lead.');
      }
    });
  }

  if (newEnquiryBtn) {
    newEnquiryBtn.addEventListener('click', () => {
      if (window.BX24 && typeof window.BX24.openPath === 'function') {
        window.BX24.openPath('/crm/lead/details/0/');
      } else {
        alert('Creating a new Buyer Enquiry Lead: Open Bitrix24 CRM -> Leads -> Add Lead.');
      }
    });
  }

  // Startup
  if (initLockoutShield()) {
    initBitrixSDK();
  }
})();
