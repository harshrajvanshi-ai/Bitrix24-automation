/**
 * server.js
 * Bitrix24 Private Local Application for Real Estate CRM
 * 
 * Capabilities:
 *  1. Custom Lead Details Tab (CRM_LEAD_DETAIL_TAB) with dynamic fields by Lead Type (Enquiry / Listing)
 *  2. Automatic Lead stage routing into 'Enquiry Leads' or 'Listing Leads'
 *  3. REST Discovery of Lead Type enum IDs, custom fields, and pipeline stages
 *  4. Admin Field & Stage Management Portal (/admin)
 *  5. Automatic OAuth Token Refresh and loop-safe event handling
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');

const config = require('./src/config');
const StorageManager = require('./src/storage');
const BitrixClient = require('./src/bitrixClient');
const DiscoveryService = require('./src/discovery');
const EventRouter = require('./src/eventRouter');
const {
  syncEnquirySpaFromLead,
  syncListingSpaFromLead,
  syncLeadFromListingSpa,
  getListingFieldMapping,
  STATE_ENUM_TO_LABEL,
  STATE_LABEL_TO_ENUM
} = require('./src/spaSync');
const { verifyBitrixEventToken, verifyAdminSecret } = require('./src/middleware/auth');
const { apiLimiter, eventLimiter } = require('./src/middleware/rateLimiter');

const app = express();
app.set('trust proxy', true);

// ------------------------------------------------------------------------------
// Security & Middleware Configuration
// ------------------------------------------------------------------------------
// Allow Bitrix24 cloud portals to embed the application inside iframes
app.use(helmet({
  frameguard: false, // Disable default X-Frame-Options: SAMEORIGIN
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://api.bitrix24.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.bitrix24.com", "https://*.bitrix24.ae", "https://oauth.bitrix.info"],
      frameAncestors: [
        "'self'",
        "*.bitrix24.com",
        "*.bitrix24.ae",
        "*.bitrix24.eu",
        "*.bitrix24.in",
        "https://*.bitrix24.com",
        "https://*.bitrix24.ae"
      ]
    }
  }
}));

app.use(cors());

// Parse incoming URL-encoded bodies (standard Bitrix24 webhooks) & JSON (up to 25MB for file attachments)
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.json({ limit: '25mb' }));

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] ${timestamp} ${req.method} ${req.originalUrl} (${req.ip})`);
  next();
});

// ------------------------------------------------------------------------------
// 1. Installation Handler (/install)
// ------------------------------------------------------------------------------
/**
 * GET/POST /
 * Primary entry point redirects to /install
 */
app.all('/', (req, res) => {
  res.redirect('/install');
});

/**
 * GET/POST /install
 * Handles initial application installation from Bitrix24
 */
app.all('/install', async (req, res) => {
  res.removeHeader('X-Frame-Options');

  // Extract auth parameters passed during installation
  const authData = {
    access_token: req.body?.AUTH_ID || req.query?.AUTH_ID || req.body?.auth?.access_token,
    refresh_token: req.body?.REFRESH_ID || req.query?.REFRESH_ID || req.body?.auth?.refresh_token,
    domain: req.body?.DOMAIN || req.query?.DOMAIN || req.body?.auth?.domain,
    member_id: req.body?.member_id || req.query?.member_id || req.body?.auth?.member_id,
    application_token: req.body?.APP_SID || req.query?.APP_SID || req.body?.auth?.application_token
  };

  if (authData.access_token && authData.domain) {
    console.log(`[INSTALL] Saving OAuth credentials for domain: ${authData.domain}`);
    StorageManager.saveAuth(authData);

    const publicUrl = config.PUBLIC_URL || `https://${req.get('host')}`;

    try {
      // 1. Register CRM_LEAD_DETAIL_TAB placement
      console.log(`[INSTALL] Binding placement CRM_LEAD_DETAIL_TAB -> ${publicUrl}/tab`);
      await BitrixClient.placementBind('CRM_LEAD_DETAIL_TAB', `${publicUrl}/tab`, 'Lead Details', authData.domain);

      // 1b. Register CRM_DYNAMIC_1062_DETAIL_TAB placement (Matching Listings for Enquiry SPA)
      console.log(`[INSTALL] Binding placement CRM_DYNAMIC_1062_DETAIL_TAB -> ${publicUrl}/matching-listings`);
      await BitrixClient.placementBind('CRM_DYNAMIC_1062_DETAIL_TAB', `${publicUrl}/matching-listings`, 'Matching Listings', authData.domain);
      await BitrixClient.placementBind('CRM_DYNAMIC_18_DETAIL_TAB', `${publicUrl}/matching-listings`, 'Matching Listings', authData.domain);

      // 1c. Register CRM_DYNAMIC_1058_DETAIL_TAB placement (Listing Details for Listing SPA)
      console.log(`[INSTALL] Binding placement CRM_DYNAMIC_1058_DETAIL_TAB -> ${publicUrl}/listing-details`);
      await BitrixClient.placementBind('CRM_DYNAMIC_1058_DETAIL_TAB', `${publicUrl}/listing-details`, 'Listing Details', authData.domain);
      await BitrixClient.placementBind('CRM_DYNAMIC_16_DETAIL_TAB', `${publicUrl}/listing-details`, 'Listing Details', authData.domain);

      // 2. Register ONCRMLEADADD event
      console.log(`[INSTALL] Binding event ONCRMLEADADD -> ${publicUrl}/events`);
      await BitrixClient.eventBind('ONCRMLEADADD', `${publicUrl}/events`, authData.domain);

      // 3. Register ONCRMLEADUPDATE event
      console.log(`[INSTALL] Binding event ONCRMLEADUPDATE -> ${publicUrl}/events`);
      await BitrixClient.eventBind('ONCRMLEADUPDATE', `${publicUrl}/events`, authData.domain);

      // 4. Run full discovery
      await DiscoveryService.runFullDiscovery(true, authData.domain);
    } catch (err) {
      console.error('[INSTALL] Background binding warning:', err.message);
    }
  }

  res.sendFile(path.join(__dirname, 'views/install.html'));
});

/**
 * POST /api/install-setup
 * Invoked by install.html to perform client-context token capture and binding
 */
app.post('/api/install-setup', async (req, res) => {
  try {
    const auth = req.body?.auth || {};
    let domain = auth.domain || req.body?.domain;
    if (!domain && config.INBOUND_WEBHOOK_URL) {
      try { domain = new URL(config.INBOUND_WEBHOOK_URL).hostname; } catch (e) {}
    }

    if (auth.access_token && domain) {
      StorageManager.saveAuth({
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        domain: domain,
        member_id: auth.member_id,
        application_token: auth.application_token
      });
    }

    const publicUrl = config.PUBLIC_URL || `https://${req.get('host')}`;

    // Attempt server-side bindings if authorized
    try {
      const activeAuth = StorageManager.getAuth(domain);
      if (activeAuth?.accessToken) {
        await BitrixClient.placementBind('CRM_LEAD_DETAIL_TAB', `${publicUrl}/tab`, 'Lead Details', domain);
        await BitrixClient.placementBind('CRM_DYNAMIC_1062_DETAIL_TAB', `${publicUrl}/matching-listings`, 'Matching Listings', domain);
        await BitrixClient.placementBind('CRM_DYNAMIC_18_DETAIL_TAB', `${publicUrl}/matching-listings`, 'Matching Listings', domain);
        await BitrixClient.placementBind('CRM_DYNAMIC_1058_DETAIL_TAB', `${publicUrl}/listing-details`, 'Listing Details', domain);
        await BitrixClient.placementBind('CRM_DYNAMIC_16_DETAIL_TAB', `${publicUrl}/listing-details`, 'Listing Details', domain);
        await BitrixClient.eventBind('ONCRMLEADADD', `${publicUrl}/events`, domain);
        await BitrixClient.eventBind('ONCRMLEADUPDATE', `${publicUrl}/events`, domain);
        await DiscoveryService.runFullDiscovery(true, domain);
      }
    } catch (bindErr) {
      console.warn('[INSTALL] Server-side binding note:', bindErr.message);
    }

    res.json({ success: true, publicUrl });
  } catch (err) {
    console.error('[INSTALL] Setup API failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. Lead Details Tab Handler (/tab)
// ------------------------------------------------------------------------------
/**
 * GET/POST /tab
 * Renders the custom tab inside the Lead card (placement: CRM_LEAD_DETAIL_TAB)
 */
app.all('/tab', (req, res) => {
  // Ensure iframing is allowed
  res.removeHeader('X-Frame-Options');

  // If Bitrix24 POSTs auth details to the tab, update storage in background
  if (req.body?.AUTH_ID && req.body?.DOMAIN) {
    StorageManager.saveAuth({
      access_token: req.body.AUTH_ID,
      refresh_token: req.body.REFRESH_ID,
      domain: req.body.DOMAIN,
      member_id: req.body.member_id
    });
  }

  // Extract lead ID from PLACEMENT_OPTIONS or direct parameters if present
  let initialLeadId = null;
  const placementOpts = req.body?.PLACEMENT_OPTIONS || req.query?.PLACEMENT_OPTIONS;
  if (placementOpts) {
    try {
      const parsed = typeof placementOpts === 'string' ? JSON.parse(placementOpts) : placementOpts;
      initialLeadId = parsed.ID || parsed.id || parsed.ENTITY_ID;
    } catch (e) {}
  }
  if (!initialLeadId) {
    initialLeadId = req.query?.ID || req.query?.id || req.query?.leadId || req.body?.ID || req.body?.id;
  }

  // Read HTML file and inject initialLeadId and bitrixDomain if present
  const htmlPath = path.join(__dirname, 'views/tab.html');
  let html = fs.readFileSync(htmlPath, 'utf-8');

  if (initialLeadId) {
    html = html.replace(
      'window.__INITIAL_LEAD_ID__ = null;',
      `window.__INITIAL_LEAD_ID__ = "${initialLeadId}";`
    );
  }

  const auth = StorageManager.getAuth('latest');
  let bitrixDomain = req.body?.DOMAIN || req.query?.DOMAIN || auth?.domain;
  if (!bitrixDomain && config.INBOUND_WEBHOOK_URL) {
    try { bitrixDomain = new URL(config.INBOUND_WEBHOOK_URL).hostname; } catch (e) {}
  }
  if (!bitrixDomain) bitrixDomain = 'csl.bitrix24.com';

  html = html.replace(
    'window.__BITRIX_DOMAIN__ = null;',
    `window.__BITRIX_DOMAIN__ = "${bitrixDomain}";`
  );

  res.send(html);
});

// ------------------------------------------------------------------------------
// 2b. Matching Listings SPA Tab & Placement Manager
// ------------------------------------------------------------------------------
/**
 * GET/POST /matching-listings
 * Placement handler for Enquiry SPA (placement: CRM_DYNAMIC_1062_DETAIL_TAB)
 */
app.all('/matching-listings', (req, res) => {
  res.removeHeader('X-Frame-Options');

  if (req.body?.AUTH_ID && req.body?.DOMAIN) {
    StorageManager.saveAuth({
      access_token: req.body.AUTH_ID,
      refresh_token: req.body.REFRESH_ID,
      domain: req.body.DOMAIN,
      member_id: req.body.member_id
    });
  }

  res.sendFile(path.join(__dirname, 'views/matching-listings.html'));
});

/**
 * GET /matching-install
 * Installation and management interface for CRM_DYNAMIC_1062_DETAIL_TAB placement
 */
app.all('/matching-install', (req, res) => {
  res.removeHeader('X-Frame-Options');
  res.sendFile(path.join(__dirname, 'views/matching-install.html'));
});

// ------------------------------------------------------------------------------
// 2c. Listing Details SPA Tab & Placement Manager
// ------------------------------------------------------------------------------
/**
 * GET/POST /listing-details
 * Placement handler for Listing SPA (placement: CRM_DYNAMIC_1058_DETAIL_TAB)
 */
app.all('/listing-details', (req, res) => {
  res.removeHeader('X-Frame-Options');

  if (req.body?.AUTH_ID && req.body?.DOMAIN) {
    StorageManager.saveAuth({
      access_token: req.body.AUTH_ID,
      refresh_token: req.body.REFRESH_ID,
      domain: req.body.DOMAIN,
      member_id: req.body.member_id
    });
  }

  res.sendFile(path.join(__dirname, 'views/listing-details.html'));
});

/**
 * GET /listing-install
 * Installation and management interface for CRM_DYNAMIC_1058_DETAIL_TAB placement
 */
app.all('/listing-install', (req, res) => {
  res.removeHeader('X-Frame-Options');
  res.sendFile(path.join(__dirname, 'views/listing-install.html'));
});

/**
 * GET /api/listing/:id
 * Fetches Listing SPA item by ID
 */
app.get('/api/listing/:id', async (req, res) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    if (!listingId) {
      return res.status(400).json({ success: false, error: 'Invalid listing ID' });
    }
    const result = await BitrixClient.call('crm.item.get', {
      entityTypeId: 1058,
      id: listingId
    });
    res.json({ success: true, item: result?.item || result });
  } catch (err) {
    console.error(`[API] Error fetching listing #${req.params.id}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST/PUT /api/listing/:id/update
 * Updates Listing SPA item by ID
 */
app.all('/api/listing/:id/update', async (req, res) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    if (!listingId) {
      return res.status(400).json({ success: false, error: 'Invalid listing ID' });
    }
    const fields = req.body?.fields || req.body;
    const result = await BitrixClient.call('crm.item.update', {
      entityTypeId: 1058,
      id: listingId,
      fields
    });
    // Asynchronously synchronize linked Lead
    syncLeadFromListingSpa(listingId).catch(leadErr => {
      console.warn(`[SPA SYNC] Background sync to lead from listing #${listingId} failed:`, leadErr.message);
    });

    res.json({ success: true, item: result?.item || result });
  } catch (err) {
    console.error(`[API] Error updating listing #${req.params.id}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stages/listing
 * Returns stages for Listing SPA (entityTypeId 1058 or 16)
 */
app.get('/api/stages/listing', async (req, res) => {
  try {
    let stages = [];
    try {
      const r = await BitrixClient.call('crm.status.list', {
        filter: { '%ENTITY_ID': 'DYNAMIC_1058_STAGE' },
        order: { SORT: 'ASC' }
      });
      if (Array.isArray(r)) stages = r;
      else if (r && Array.isArray(r.result)) stages = r.result;
    } catch (_) {}

    if (!stages || stages.length === 0) {
      try {
        const r2 = await BitrixClient.call('crm.status.list', {
          filter: { '%ENTITY_ID': 'DYNAMIC_16_STAGE' },
          order: { SORT: 'ASC' }
        });
        if (Array.isArray(r2)) stages = r2;
        else if (r2 && Array.isArray(r2.result)) stages = r2.result;
      } catch (_) {}
    }

    if (stages && stages.length > 0) {
      return res.json({
        success: true,
        stages: stages.map(s => ({ id: s.STATUS_ID, value: s.NAME || s.STATUS_ID }))
      });
    }

    res.json({
      success: true,
      stages: [
        { id: 'DT1058_0:NEW', value: 'New / Draft' },
        { id: 'DT1058_0:PREPARATION', value: 'Under Review' },
        { id: 'DT1058_0:CLIENT', value: 'Active / Published' },
        { id: 'DT1058_0:UNDER_OFFER', value: 'Under Offer' },
        { id: 'DT1058_0:SUCCESS', value: 'Won / Transacted' },
        { id: 'DT1058_0:FAIL', value: 'Lost / Canceled' }
      ]
    });
  } catch (err) {
    res.json({
      success: true,
      stages: [
        { id: 'DT1058_0:NEW', value: 'New / Draft' },
        { id: 'DT1058_0:PREPARATION', value: 'Under Review' },
        { id: 'DT1058_0:CLIENT', value: 'Active / Published' },
        { id: 'DT1058_0:UNDER_OFFER', value: 'Under Offer' },
        { id: 'DT1058_0:SUCCESS', value: 'Won / Transacted' },
        { id: 'DT1058_0:FAIL', value: 'Lost / Canceled' }
      ]
    });
  }
});

/**
 * POST /api/b24/:method
 * Secure proxy endpoint for Bitrix24 REST methods (supporting dev & testing)
 */
app.post('/api/b24/:method', apiLimiter, async (req, res) => {
  try {
    const method = req.params.method;
    const params = req.body || {};
    const result = await BitrixClient.call(method, params, 'latest');
    res.json({ success: true, result });
  } catch (err) {
    console.error(`[PROXY] Bitrix API call ${req.params.method} failed:`, err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      error_description: err.response?.data?.error_description || err.message
    });
  }
});

// ------------------------------------------------------------------------------
// 3. Event Handler (/events)
// ------------------------------------------------------------------------------
/**
 * POST /events
 * Receives ONCRMLEADADD and ONCRMLEADUPDATE outbound webhooks from Bitrix24
 */
app.post('/events', eventLimiter, verifyBitrixEventToken, async (req, res) => {
  const event = req.body?.event || req.body?.['event'] || 'UNKNOWN_EVENT';
  const entityTypeId = (
    req.body?.data?.FIELDS?.ENTITY_TYPE_ID ||
    req.body?.['data[FIELDS][ENTITY_TYPE_ID]']
  );
  const rawId = (
    req.body?.data?.FIELDS?.ID ||
    req.body?.data?.FIELDS?.id ||
    req.body?.['data[FIELDS][ID]'] ||
    req.body?.['data[FIELDS][id]'] ||
    req.body?.id
  );
  const domain = req.body?.auth?.domain || req.body?.['auth[domain]'] || 'latest';

  console.log(`[EVENT] Received ${event} for ID #${rawId} (entity: ${entityTypeId || 'LEAD'}) from domain: ${domain}`);

  if (!rawId) {
    return res.status(400).json({ success: false, error: 'Missing entity ID in payload' });
  }

  // Acknowledge receipt promptly with 200 OK to prevent Bitrix24 webhook timeouts
  res.status(200).json({
    success: true,
    message: 'Event accepted for asynchronous processing',
    event,
    id: rawId
  });

  // Handle Smart Process Item events (specifically Enquiry SPA 1062)
  if (String(entityTypeId) === '1062' || event.startsWith('ONCRMDYNAMICITEM')) {
    try {
      const itemRes = await BitrixClient.call('crm.item.get', { entityTypeId: 1062, id: rawId }, domain);
      const linkedLeadId = itemRes?.item?.xmlId || itemRes?.item?.ufCrm18Lead;
      if (linkedLeadId) {
        await syncEnquirySpaFromLead(linkedLeadId, domain);
      }
    } catch (spaErr) {
      console.warn(`[EVENT] Error handling Enquiry SPA event for #${rawId}:`, spaErr.message);
    }
    return;
  }

  // Handle Lead events
  try {
    await EventRouter.handleLeadEvent(rawId, event, domain);
  } catch (err) {
    console.error(`[EVENT] Asynchronous routing failed for Lead #${rawId}:`, err.message);
  }
});

// ------------------------------------------------------------------------------
// 4. Client REST & Tab API Endpoints
// ------------------------------------------------------------------------------
/**
 * GET /api/config
 * Returns configured field schema and discovered stage/item IDs for the tab
 */
app.get('/api/config', (req, res) => {
  const fieldsConfig = config.loadFieldsConfig();
  const discovered = StorageManager.getDiscoveredConfig();

  res.json({
    ...fieldsConfig,
    discovered
  });
});

// Lookup in-memory cache with 60-second TTL
const lookupCache = { data: {}, timestamp: {} };

async function fetchAllSpaItems(entityTypeId, mapFn) {
  let all = [];
  let start = 0;
  while (true) {
    const res = await BitrixClient.call('crm.item.list', {
      entityTypeId,
      select: ['id', 'title'],
      order: { id: 'DESC' },
      start
    }).catch(err => {
      console.warn(`[LOOKUP] Error fetching SPA ${entityTypeId} at start=${start}:`, err.message);
      return { items: [] };
    });
    const items = res.items || [];
    all.push(...items.map(mapFn));
    if (items.length < 50) break;
    start += 50;
    if (all.length >= 1000) break;
  }
  return all;
}

async function fetchAllCompanies() {
  let all = [];
  let start = 0;
  while (true) {
    const res = await BitrixClient.call('crm.company.list', {
      select: ['ID', 'TITLE'],
      order: { ID: 'DESC' },
      start
    }).catch(err => {
      console.warn(`[LOOKUP] Error fetching companies at start=${start}:`, err.message);
      return [];
    });
    all.push(...(res || []).map(i => ({ id: i.ID, title: i.TITLE || `Company #${i.ID}`, crmRef: `CO_${i.ID}` })));
    if (!res || res.length < 50) break;
    start += 50;
    if (all.length >= 1000) break;
  }
  return all;
}

async function fetchAllContacts() {
  let all = [];
  let start = 0;
  while (true) {
    const res = await BitrixClient.call('crm.contact.list', {
      select: ['ID', 'NAME', 'LAST_NAME'],
      order: { ID: 'DESC' },
      start
    }).catch(err => {
      console.warn(`[LOOKUP] Error fetching contacts at start=${start}:`, err.message);
      return [];
    });
    all.push(...(res || []).map(i => ({
      id: i.ID,
      title: `${i.NAME || ''} ${i.LAST_NAME || ''}`.trim() || `Contact #${i.ID}`,
      crmRef: `C_${i.ID}`
    })));
    if (!res || res.length < 50) break;
    start += 50;
    if (all.length >= 1000) break;
  }
  return all;
}

async function searchLookupLive(entity, query) {
  if (!query) return [];
  const cleanQ = String(query).trim();
  const idMatch = cleanQ.match(/^(?:DYNAMIC_\d+_|[A-Z]+_)?(\d+)$/i);
  const numericId = idMatch ? parseInt(idMatch[1], 10) : null;

  const spaMap = {
    project: { entityTypeId: 1044, prefix: 'DYNAMIC_1044_' },
    master_project: { entityTypeId: 1040, prefix: 'DYNAMIC_1040_' },
    property: { entityTypeId: 1052, prefix: 'DYNAMIC_1052_' },
    layout: { entityTypeId: 1048, prefix: 'DYNAMIC_1048_' },
    broker: { entityTypeId: 1094, prefix: 'DYNAMIC_1094_' },
    agent: { entityTypeId: 1094, prefix: 'DYNAMIC_1094_' },
    listing: { entityTypeId: 1058, prefix: 'DYNAMIC_1058_' },
    enquiry: { entityTypeId: 1062, prefix: 'DYNAMIC_1062_' },
  };

  const spa = spaMap[entity];
  if (spa) {
    let items = [];
    if (numericId !== null) {
      const byId = await BitrixClient.call('crm.item.list', {
        entityTypeId: spa.entityTypeId,
        filter: { '=id': numericId },
        select: ['id', 'title']
      }).catch(() => ({ items: [] }));
      if (byId.items && byId.items.length > 0) {
        items.push(...byId.items);
      }
    }
    const byTitle = await BitrixClient.call('crm.item.list', {
      entityTypeId: spa.entityTypeId,
      filter: { '%title': cleanQ },
      select: ['id', 'title'],
      order: { id: 'DESC' }
    }).catch(() => ({ items: [] }));
    if (byTitle.items) {
      for (const it of byTitle.items) {
        if (!items.some(x => x.id === it.id)) items.push(it);
      }
    }
    return items.map(i => ({
      id: i.id,
      title: i.title || `${entity} #${i.id}`,
      crmRef: `${spa.prefix}${i.id}`
    }));
  }

  if (entity === 'developer' || entity === 'company') {
    let items = [];
    if (numericId !== null) {
      const byId = await BitrixClient.call('crm.company.list', { filter: { '=ID': numericId }, select: ['ID', 'TITLE'] }).catch(() => []);
      if (byId && byId.length) items.push(...byId);
    }
    const byTitle = await BitrixClient.call('crm.company.list', { filter: { '%TITLE': cleanQ }, select: ['ID', 'TITLE'], order: { ID: 'DESC' } }).catch(() => []);
    if (byTitle) {
      for (const it of byTitle) {
        if (!items.some(x => String(x.ID) === String(it.ID))) items.push(it);
      }
    }
    return items.map(i => ({ id: i.ID, title: i.TITLE || `Company #${i.ID}`, crmRef: `CO_${i.ID}` }));
  }

  if (entity === 'contact' || entity === 'owner' || entity === 'tenant') {
    let items = [];
    if (numericId !== null) {
      const byId = await BitrixClient.call('crm.contact.list', { filter: { '=ID': numericId }, select: ['ID', 'NAME', 'LAST_NAME'] }).catch(() => []);
      if (byId && byId.length) items.push(...byId);
    }
    const byName = await BitrixClient.call('crm.contact.list', { filter: { '%NAME': cleanQ }, select: ['ID', 'NAME', 'LAST_NAME'], order: { ID: 'DESC' } }).catch(() => []);
    if (byName) {
      for (const it of byName) {
        if (!items.some(x => String(x.ID) === String(it.ID))) items.push(it);
      }
    }
    return items.map(i => ({ id: i.ID, title: `${i.NAME || ''} ${i.LAST_NAME || ''}`.trim() || `Contact #${i.ID}`, crmRef: `C_${i.ID}` }));
  }

  return [];
}

async function fetchLookupData(entity, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && lookupCache.data[entity] && (now - lookupCache.timestamp[entity] < 60000)) {
    return lookupCache.data[entity];
  }

  let items = [];
  try {
    if (entity === 'master_project') {
      items = await fetchAllSpaItems(1040, i => ({ id: i.id, title: i.title || `Master Project #${i.id}`, crmRef: `DYNAMIC_1040_${i.id}` }));
    } else if (entity === 'project') {
      items = await fetchAllSpaItems(1044, i => ({ id: i.id, title: i.title || `Project #${i.id}`, crmRef: `DYNAMIC_1044_${i.id}` }));
    } else if (entity === 'property') {
      items = await fetchAllSpaItems(1052, i => ({ id: i.id, title: i.title || `Property #${i.id}`, crmRef: `DYNAMIC_1052_${i.id}` }));
    } else if (entity === 'layout') {
      items = await fetchAllSpaItems(1048, i => ({ id: i.id, title: i.title || `Layout #${i.id}`, crmRef: `DYNAMIC_1048_${i.id}` }));
    } else if (entity === 'broker' || entity === 'agent') {
      items = await fetchAllSpaItems(1094, i => ({ id: i.id, title: i.title || `Broker #${i.id}`, crmRef: `DYNAMIC_1094_${i.id}` }));
    } else if (entity === 'listing') {
      items = await fetchAllSpaItems(1058, i => ({ id: i.id, title: i.title || `Listing #${i.id}`, crmRef: `DYNAMIC_1058_${i.id}` }));
    } else if (entity === 'enquiry') {
      items = await fetchAllSpaItems(1062, i => ({ id: i.id, title: i.title || `Enquiry #${i.id}`, crmRef: `DYNAMIC_1062_${i.id}` }));
    } else if (entity === 'developer' || entity === 'company') {
      items = await fetchAllCompanies();
    } else if (entity === 'contact' || entity === 'owner' || entity === 'tenant') {
      const [contactItems, companyItems] = await Promise.all([
        fetchAllContacts(),
        fetchAllCompanies()
      ]);
      items = [...contactItems, ...companyItems];
    } else if (entity === 'user') {
      const res = await BitrixClient.call('user.get', { ACTIVE: true }).catch(() => []);
      items = (res || []).map(i => ({ id: i.ID, title: `${i.NAME || ''} ${i.LAST_NAME || ''}`.trim() || `User #${i.ID}`, crmRef: `U_${i.ID}` }));
    }

    lookupCache.data[entity] = items;
    lookupCache.timestamp[entity] = now;
  } catch (err) {
    console.warn(`[LOOKUP] Error fetching ${entity}:`, err.message);
    if (lookupCache.data[entity]) return lookupCache.data[entity];
  }

  return items;
}

// Native Bitrix24 CRM binding configuration for lookup fields
const CRM_LOOKUP_CONFIG = {
  // Smart Process userfields in Bitrix natively store pure numeric ID (e.g. 402, 336, 326)
  UF_CRM_PROJECT_1: { entity: 'project', prefix: '' },
  UF_CRM_1791794196: { entity: 'project', prefix: '', isArray: true },
  UF_CRM_PROJECT: { entity: 'master_project', prefix: '' },
  UF_CRM_1792558317: { entity: 'master_project', prefix: '' },
  UF_CRM_PROPERTY: { entity: 'property', prefix: '' },
  UF_CRM_PROPERTY_PROPERTYFINDER: { entity: 'property', prefix: '' },
  UF_CRM_MASTERPROPERTY: { entity: 'property', prefix: '' },
  UF_CRM_LAYOUT: { entity: 'layout', prefix: '' },
  UF_CRM_PROPERTY_LAYOUT: { entity: 'layout', prefix: '' },
  UF_CRM_PORTAL_LISTING_AGENT: { entity: 'broker', prefix: '' },
  UF_CRM_REFERRAL_AGENT_SELLER: { entity: 'broker', prefix: '' },
  UF_CRM_ASSIGNED_TO_BROKER: { entity: 'broker', prefix: '' },
  UF_CRM_LISTINGAGENT: { entity: 'broker', prefix: '' },
  UF_CRM_COLISTINGAGENT: { entity: 'broker', prefix: '' },
  UF_CRM_EXTERNAL_LISTING_BROKER: { entity: 'broker', prefix: '' },
  UF_CRM_REFERRAL_AGENT_LANDLORD: { entity: 'broker', prefix: '' },
  UF_CRM_REFERRAL_AGENT_BUYER: { entity: 'broker', prefix: '' },
  UF_CRM_REFERRAL_AGENT_TENANT: { entity: 'broker', prefix: '' },
  UF_CRM_REFERRED_BY: { entity: 'broker', prefix: '' },
  UF_CRM_REFER_TO: { entity: 'broker', prefix: '' },
  UF_CRM_PROPSPACE_AGENT: { entity: 'broker', prefix: '' },
  UF_CRM_LISTING: { entity: 'listing', prefix: '' },
  UF_CRM_ENQUIRY: { entity: 'enquiry', prefix: '' },

  // Company userfields in Bitrix natively store CO_<id>
  UF_CRM_DEVELOPER_1: { entity: 'developer', prefix: 'CO_' },
  UF_CRM_YOUR_COMPANY_DETAILS: { entity: 'company', prefix: 'CO_' },

  // Contact userfields in Bitrix natively store C_<id>
  UF_CRM_OWNER_LISTING: { entity: 'contact', prefix: 'C_' },
  UF_CRM_PROPERTYOWNERCONTACT: { entity: 'contact', prefix: 'C_' },
  UF_CRM_PROPERTY_OWNER_2: { entity: 'contact', prefix: 'C_' },
  UF_CRM_TENANT: { entity: 'contact', prefix: 'C_' },
  UF_CRM_OWNER_ENQUIRY: { entity: 'contact', prefix: 'C_' },
  UF_CRM_CONTACTS: { entity: 'contact', prefix: 'C_' },
  UF_CRM_OWNERID: { entity: 'contact', prefix: 'C_' },
};

/**
 * Normalizes lookup fields into native Bitrix24 CRM entity bindings
 * SPAs -> pure numeric ID string (e.g. "402", "336")
 * Companies -> "CO_14"
 * Contacts -> "C_66"
 */
async function normalizeLookupFields(fields) {
  const normalized = { ...fields };
  for (const [code, val] of Object.entries(normalized)) {
    const cfg = CRM_LOOKUP_CONFIG[code];
    if (!cfg || val === undefined || val === null) continue;

    const strVal = String(val).trim();
    if (strVal === '') {
      normalized[code] = cfg.isArray ? [] : '';
      continue;
    }

    // Extract numeric ID if value has prefix like DYNAMIC_1044_402, T414_402, CO_14, C_66, or is pure 402
    const idMatch = strVal.match(/^(?:DYNAMIC_\d+_|T[0-9a-f]+_|CO_|C_|L_|D_)?(\d+)$/i);
    let resolvedId = idMatch ? idMatch[1] : null;

    if (!resolvedId) {
      // Title string passed (e.g. "Creek Beach Residences" or "testin project new")
      try {
        const items = await fetchLookupData(cfg.entity);
        let match = items.find(it => it.title.toLowerCase() === strVal.toLowerCase() || String(it.id) === strVal);
        if (!match) {
          const live = await searchLookupLive(cfg.entity, strVal);
          if (live && live.length > 0) {
            match = live.find(it => it.title.toLowerCase() === strVal.toLowerCase() || String(it.id) === strVal) || live[0];
          }
        }
        if (match) {
          resolvedId = String(match.id);
        }
      } catch (e) {
        console.warn(`[LOOKUP] Could not resolve title "${strVal}" for ${code}:`, e.message);
      }
    }

    if (resolvedId) {
      if (cfg.isArray) {
        normalized[code] = [resolvedId];
      } else if (cfg.prefix) {
        normalized[code] = `${cfg.prefix}${resolvedId}`;
      } else {
        // Pure numeric ID string for Smart Process userfields
        normalized[code] = resolvedId;
      }
    }
  }

  // Synchronize Project companion fields: UF_CRM_1791794196 and UF_CRM_PROJECT_NAME
  if (normalized.UF_CRM_PROJECT_1) {
    const projId = String(normalized.UF_CRM_PROJECT_1).replace(/\D/g, '');
    if (projId) {
      if (!normalized.UF_CRM_1791794196) {
        normalized.UF_CRM_1791794196 = [projId];
      }
      try {
        const items = await fetchLookupData('project');
        let proj = items.find(it => String(it.id) === projId);
        if (!proj) {
          const live = await searchLookupLive('project', projId);
          if (live && live.length > 0) proj = live[0];
        }
        if (proj && !normalized.UF_CRM_PROJECT_NAME) {
          normalized.UF_CRM_PROJECT_NAME = proj.title;
        }
      } catch (e) {}
    }
  }

  // Synchronize Developer companion field: UF_CRM_DEVELOPER_NAME
  if (normalized.UF_CRM_DEVELOPER_1) {
    const devId = String(normalized.UF_CRM_DEVELOPER_1).replace(/\D/g, '');
    if (devId) {
      try {
        const items = await fetchLookupData('developer');
        let dev = items.find(it => String(it.id) === devId);
        if (!dev) {
          const live = await searchLookupLive('developer', devId);
          if (live && live.length > 0) dev = live[0];
        }
        if (dev && !normalized.UF_CRM_DEVELOPER_NAME) {
          normalized.UF_CRM_DEVELOPER_NAME = dev.title;
        }
      } catch (e) {}
    }
  }

  return normalized;
}

/**
 * GET /api/lookup
 * Query lookup data for Master Projects, Projects, Properties, Developers, Contacts
 */
app.get('/api/lookup', async (req, res) => {
  const entity = (req.query.entity || req.query.type || '').toLowerCase().trim();
  const query = (req.query.q || '').toLowerCase().trim();
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';

  if (!entity) {
    return res.status(400).json({ success: false, error: 'Missing entity query parameter' });
  }

  let allItems = await fetchLookupData(entity, forceRefresh);
  let results = allItems;
  if (query) {
    const isNum = /^\d+$/.test(query);
    results = allItems.filter(item => {
      const titleMatch = item.title && item.title.toLowerCase().includes(query);
      const idMatch = isNum ? String(item.id) === query : String(item.id).includes(query);
      const refMatch = item.crmRef && item.crmRef.toLowerCase().includes(query);
      return titleMatch || idMatch || refMatch;
    });

    // If query returned no matches in cache, do an immediate live Bitrix lookup
    if (results.length === 0) {
      try {
        const liveItems = await searchLookupLive(entity, query);
        if (liveItems && liveItems.length > 0) {
          const existingIds = new Set(allItems.map(i => String(i.id)));
          for (const li of liveItems) {
            if (!existingIds.has(String(li.id))) {
              allItems.unshift(li);
              existingIds.add(String(li.id));
            }
          }
          lookupCache.data[entity] = allItems;
          results = liveItems;
        }
      } catch (err) {
        console.warn(`[LOOKUP] Live search fallback failed for ${entity} "${query}":`, err.message);
      }
    }
  }

  res.json({ success: true, count: results.length, items: results.slice(0, 50) });
});


// Build picklist / enumeration value-to-numeric-ID lookup map from configuration
function getEnumTranslationMap() {
  const fieldsConfig = config.loadFieldsConfig();
  const map = {};
  function scan(arr) {
    for (const f of (arr || [])) {
      if (f.type === 'enumeration' && Array.isArray(f.options)) {
        if (!map[f.code]) map[f.code] = {};
        for (const opt of f.options) {
          if (opt.id && opt.value) {
            map[f.code][opt.value.trim().toLowerCase()] = String(opt.id);
            map[f.code][String(opt.id).trim().toLowerCase()] = String(opt.id);
          }
        }
      }
    }
  }

  if (fieldsConfig?.listingLayout?.sections) {
    for (const s of fieldsConfig.listingLayout.sections) scan(s.fields);
  }
  if (fieldsConfig?.enquiryLayout?.sections) {
    for (const s of fieldsConfig.enquiryLayout.sections) scan(s.fields);
  }
  scan(fieldsConfig?.listingFields);
  scan(fieldsConfig?.enquiryFields);

  return map;
}

function normalizeEnumFields(fields) {
  const enumMap = getEnumTranslationMap();
  const normalized = { ...fields };

  for (const [code, val] of Object.entries(normalized)) {
    if (enumMap[code]) {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed !== '') {
          const lower = trimmed.toLowerCase();
          if (enumMap[code][lower]) {
            normalized[code] = enumMap[code][lower];
          }
        }
      } else if (Array.isArray(val)) {
        normalized[code] = val.map(v => {
          if (typeof v === 'string') {
            const lower = v.trim().toLowerCase();
            return enumMap[code][lower] || v;
          }
          return v;
        });
      }
    }
  }

  return normalized;
}

// Known Bitrix24 multiple-file user fields that accept arrays of files
const knownMultipleFileFields = new Set([
  'UF_CRM_DOCS_1', 'UF_CRM_PRIMARY_IMAGE_1', 'UF_CRM_EXPOSE_IMAGES',
  'UF_CRM_WEBSITE_IMAGES', 'UF_CRM_PHOTOS_AND_DOCUMENTS', 'UF_CRM_PHOTOS',
  'UF_CRM_DOCUMENTS'
]);

function normalizeFileFields(fields) {
  const normalized = { ...fields };
  for (const [code, val] of Object.entries(normalized)) {
    if (!val) continue;

    // Check if value is raw [fileName, base64String] without fileData wrapper
    if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'string' && typeof val[1] === 'string' && val[1].length > 10) {
      if (knownMultipleFileFields.has(code)) {
        normalized[code] = [{ fileData: [val[0], val[1]] }];
      } else {
        normalized[code] = { fileData: [val[0], val[1]] };
      }
    } else if (Array.isArray(val)) {
      // Check if it's an array of files that need fileData wrapper
      normalized[code] = val.map(item => {
        if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string') {
          return { fileData: [item[0], item[1]] };
        }
        return item;
      });
    }
  }
  return normalized;
}

/**
 * POST /api/lead/:id
 * Saves lead edits back to Bitrix24 via crm.lead.update
 */
app.post('/api/lead/:id', apiLimiter, async (req, res) => {
  const leadId = req.params.id;
  let fields = req.body?.fields || {};

  if (!leadId) {
    return res.status(400).json({ success: false, error: 'Missing lead ID' });
  }

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ success: false, error: 'No fields provided to update' });
  }

  console.log(`[API] Updating Lead #${leadId} fields:`, Object.keys(fields));

  // Handle dedicated Listing Name & Enquiry Name fields (completely separate from native Lead Name TITLE)
  if (fields.UF_CRM_LISTING_NAME && !fields.UF_CRM_1791952409183) {
    fields.UF_CRM_1791952409183 = fields.UF_CRM_LISTING_NAME;
  } else if (fields.UF_CRM_1791952409183 && !fields.UF_CRM_LISTING_NAME) {
    fields.UF_CRM_LISTING_NAME = fields.UF_CRM_1791952409183;
  }

  // Sync Contact lookup (UF_CRM_CONTACTS) with native Bitrix CONTACT_ID
  if (fields.UF_CRM_CONTACTS) {
    const rawContact = Array.isArray(fields.UF_CRM_CONTACTS) ? fields.UF_CRM_CONTACTS[0] : fields.UF_CRM_CONTACTS;
    const cMatch = String(rawContact).match(/(?:C_)?(\d+)/i);
    if (cMatch && cMatch[1]) {
      fields.CONTACT_ID = parseInt(cMatch[1], 10);
      fields.UF_CRM_CONTACTS = [`C_${cMatch[1]}`];
    }
  }

  // Sync Comments (UF_CRM_COMMENTS_1) with native Bitrix COMMENTS
  if (fields.UF_CRM_COMMENTS_1 !== undefined && fields.UF_CRM_COMMENTS_1 !== null) {
    fields.COMMENTS = fields.UF_CRM_COMMENTS_1;
  } else if (fields.COMMENTS !== undefined && !fields.UF_CRM_COMMENTS_1) {
    fields.UF_CRM_COMMENTS_1 = fields.COMMENTS;
  }

  // Sync Deal Value / Budget / Price with native Bitrix OPPORTUNITY & CURRENCY_ID
  const dealAmount = fields.UF_CRM_DEAL_VALUE_1 || fields.UF_CRM_LISTINGPRICE_MAX || fields.UF_CRM_LISTINGPRICE;
  if (dealAmount) {
    const parts = String(dealAmount).split('|');
    const num = parseFloat(parts[0]);
    if (!isNaN(num) && num > 0) {
      fields.OPPORTUNITY = num;
      if (parts[1]) fields.CURRENCY_ID = parts[1];
    }
  }

  // Sync Address fields with native Bitrix Lead ADDRESS properties
  if (fields.UF_CRM_1791970638065 && !fields.ADDRESS) {
    fields.ADDRESS = fields.UF_CRM_1791970638065;
  }
  if (fields.UF_CRM_CITY && !fields.ADDRESS_CITY) {
    fields.ADDRESS_CITY = fields.UF_CRM_CITY;
  }
  if (fields.UF_CRM_POSTALCODE && !fields.ADDRESS_POSTAL_CODE) {
    fields.ADDRESS_POSTAL_CODE = fields.UF_CRM_POSTALCODE;
  }
  if (fields.UF_CRM_STATE && !fields.ADDRESS_PROVINCE) {
    fields.ADDRESS_PROVINCE = STATE_ENUM_TO_LABEL[String(fields.UF_CRM_STATE)] || fields.UF_CRM_STATE;
  }

  // Sync Master Project companion fields (UF_CRM_PROJECT <-> UF_CRM_1792558317)
  if (fields.UF_CRM_PROJECT && !fields.UF_CRM_1792558317) {
    fields.UF_CRM_1792558317 = fields.UF_CRM_PROJECT;
  } else if (fields.UF_CRM_1792558317 && !fields.UF_CRM_PROJECT) {
    fields.UF_CRM_PROJECT = fields.UF_CRM_1792558317;
  }

  // Sync Property Layout companion fields (UF_CRM_PROPERTY_LAYOUT <-> UF_CRM_LAYOUT)
  if (fields.UF_CRM_PROPERTY_LAYOUT && !fields.UF_CRM_LAYOUT) {
    fields.UF_CRM_LAYOUT = fields.UF_CRM_PROPERTY_LAYOUT;
  } else if (fields.UF_CRM_LAYOUT && !fields.UF_CRM_PROPERTY_LAYOUT) {
    fields.UF_CRM_PROPERTY_LAYOUT = fields.UF_CRM_LAYOUT;
  }

  // Sync Property companion fields (UF_CRM_PROPERTY_PROPERTYFINDER <-> UF_CRM_PROPERTY)
  if (fields.UF_CRM_PROPERTY_PROPERTYFINDER && !fields.UF_CRM_PROPERTY) {
    fields.UF_CRM_PROPERTY = fields.UF_CRM_PROPERTY_PROPERTYFINDER;
  } else if (fields.UF_CRM_PROPERTY && !fields.UF_CRM_PROPERTY_PROPERTYFINDER) {
    fields.UF_CRM_PROPERTY_PROPERTYFINDER = fields.UF_CRM_PROPERTY;
  }

  // Handle Cheques field mapping: map legacy UF_CRM_CHEQUES / UF_CRM_CHEQUES_1 to new native enumeration field UF_CRM_1792139023
  if ((fields.UF_CRM_CHEQUES || fields.UF_CRM_CHEQUES_1) && !fields.UF_CRM_1792139023) {
    fields.UF_CRM_1792139023 = fields.UF_CRM_CHEQUES_1 || fields.UF_CRM_CHEQUES;
  }
  if (fields.UF_CRM_1792139023 && !fields.UF_CRM_CHEQUES_1) {
    fields.UF_CRM_CHEQUES_1 = fields.UF_CRM_1792139023;
  }

  // Handle Parking Spaces mapping: map legacy UF_CRM_PARKING to native field UF_CRM_NUMBEROFPARKINGSPACES
  if (fields.UF_CRM_PARKING && !fields.UF_CRM_NUMBEROFPARKINGSPACES) {
    fields.UF_CRM_NUMBEROFPARKINGSPACES = fields.UF_CRM_PARKING;
    delete fields.UF_CRM_PARKING;
  }

  // Handle Date Available mapping: sync UF_CRM_DATE_AVAILABLE and UF_CRM_AVAILABLE_TO
  if (fields.UF_CRM_DATE_AVAILABLE && !fields.UF_CRM_AVAILABLE_TO) {
    fields.UF_CRM_AVAILABLE_TO = fields.UF_CRM_DATE_AVAILABLE;
  } else if (fields.UF_CRM_AVAILABLE_TO && !fields.UF_CRM_DATE_AVAILABLE) {
    fields.UF_CRM_DATE_AVAILABLE = fields.UF_CRM_AVAILABLE_TO;
  }

  // Handle Trakheesi Permit Expiry mapping: sync UF_CRM_TRAKHEESI_EXPIRY and UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE
  if (fields.UF_CRM_TRAKHEESI_EXPIRY && !fields.UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE) {
    fields.UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE = fields.UF_CRM_TRAKHEESI_EXPIRY;
  }

  // Handle Property Finder Listing Id mapping: sync UF_CRM_1792151466 and UF_CRM_PF_ID
  if (fields.UF_CRM_PF_ID && !fields.UF_CRM_1792151466) {
    fields.UF_CRM_1792151466 = fields.UF_CRM_PF_ID;
  } else if (fields.UF_CRM_1792151466 && !fields.UF_CRM_PF_ID) {
    fields.UF_CRM_PF_ID = fields.UF_CRM_1792151466;
  }

  // Handle Lead Source Type mapping: sync native UF_CRM_1792563228880, UF_CRM_LEAD_SOURCE_TYPE, and native SOURCE_ID
  if (fields.UF_CRM_1792563228880 && !fields.UF_CRM_LEAD_SOURCE_TYPE) {
    fields.UF_CRM_LEAD_SOURCE_TYPE = fields.UF_CRM_1792563228880;
  } else if (fields.UF_CRM_LEAD_SOURCE_TYPE && !fields.UF_CRM_1792563228880) {
    fields.UF_CRM_1792563228880 = fields.UF_CRM_LEAD_SOURCE_TYPE;
  }
  if (fields.UF_CRM_1792563228880) {
    const legacySourceMap = {
      '2324': '2506',
      '2326': '2504',
      '2328': '2502',
      '2330': '2500',
      '2332': '2498',
      '2334': '2496'
    };
    if (legacySourceMap[String(fields.UF_CRM_1792563228880)]) {
      fields.UF_CRM_1792563228880 = legacySourceMap[String(fields.UF_CRM_1792563228880)];
      fields.UF_CRM_LEAD_SOURCE_TYPE = fields.UF_CRM_1792563228880;
    }
    const sourceToNativeMap = {
      '2506': 'WEB',
      '2504': 'ADVERTISING',
      '2502': 'WEB',
      '2500': 'CALLBACK',
      '2498': 'CALL',
      '2496': 'PARTNER'
    };
    const mappedNative = sourceToNativeMap[String(fields.UF_CRM_1792563228880)];
    if (mappedNative && !fields.SOURCE_ID) {
      fields.SOURCE_ID = mappedNative;
    }
  }

  // Normalize picklist / enumeration fields from label strings to Bitrix numeric IDs
  fields = normalizeEnumFields(fields);

  // Normalize lookup fields to native Bitrix24 CRM binding identifiers (DYNAMIC_1044_, CO_, C_, etc.)
  fields = await normalizeLookupFields(fields);

  // Normalize file fields to ensure proper { fileData: [name, base64] } structure for Bitrix24
  fields = normalizeFileFields(fields);

  // Ensure MULTIPLE: 'Y' userfields are arrays in Bitrix
  const multipleUfCodes = [
    'UF_CRM_ADDITIONALCITIES',
    'UF_CRM_ADDITIONALPOSTALCODES',
    'UF_CRM_COUNTIES',
    'UF_CRM_NEIGHBORHOODS',
    'UF_CRM_SUBDIVISIONS',
    'UF_CRM_SCHOOLDISTRICTS',
    'UF_CRM_RECOMMENDED_LISTINGS',
    'UF_CRM_CONTACTS'
  ];
  for (const mCode of multipleUfCodes) {
    if (fields[mCode] !== undefined && fields[mCode] !== null && fields[mCode] !== '') {
      if (!Array.isArray(fields[mCode])) {
        fields[mCode] = [String(fields[mCode]).trim()];
      }
    }
  }

  try {
    const result = await BitrixClient.crmLeadUpdate(leadId, fields);

    // Asynchronously synchronize linked Enquiry SPA item
    syncEnquirySpaFromLead(leadId).catch(spaErr => {
      console.warn(`[SPA SYNC] Background sync failed for Lead #${leadId}:`, spaErr.message);
    });

    // Asynchronously synchronize linked Listing SPA item
    syncListingSpaFromLead(leadId).catch(spaErr => {
      console.warn(`[SPA SYNC] Background listing sync failed for Lead #${leadId}:`, spaErr.message);
    });

    res.json({ success: true, result });
  } catch (err) {
    console.error(`[API] Failed to update Lead #${leadId}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mapping/listing
 * Returns complete field mapping and enum translation dictionaries between Lead Listing and Listing SPA (1058)
 */
app.get('/api/mapping/listing', (req, res) => {
  try {
    const mapping = getListingFieldMapping();
    res.json(mapping);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/lead/:id/sync-listing
 * On-demand endpoint to synchronize Lead with its linked Listing SPA item
 */
app.post('/api/lead/:id/sync-listing', async (req, res) => {
  try {
    const result = await syncListingSpaFromLead(req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/lead/:id
 * Direct API endpoint to fetch a lead (used as fallback if BX24 SDK unavailable)
 */
app.get('/api/lead/:id', apiLimiter, async (req, res) => {
  try {
    const lead = await BitrixClient.crmLeadGet(req.params.id);
    if (lead) {
      // Resolve Listing Name from UF_CRM_LISTING_NAME or legacy UF_CRM_1791952409183
      if (!lead.UF_CRM_LISTING_NAME && lead.UF_CRM_1791952409183) {
        lead.UF_CRM_LISTING_NAME = lead.UF_CRM_1791952409183;
      }

      // Resolve Contact fallback from native CONTACT_ID
      if ((!lead.UF_CRM_CONTACTS || (Array.isArray(lead.UF_CRM_CONTACTS) && lead.UF_CRM_CONTACTS.length === 0)) && lead.CONTACT_ID && String(lead.CONTACT_ID) !== '0') {
        lead.UF_CRM_CONTACTS = [`C_${lead.CONTACT_ID}`];
      }

      // Resolve Comments fallback from native COMMENTS
      if (!lead.UF_CRM_COMMENTS_1 && lead.COMMENTS) {
        lead.UF_CRM_COMMENTS_1 = lead.COMMENTS.replace(/\[\/?p\]/gi, '').trim();
      }

      // Resolve Deal Value fallback from native OPPORTUNITY
      if (!lead.UF_CRM_DEAL_VALUE_1 && lead.OPPORTUNITY && parseFloat(lead.OPPORTUNITY) > 0) {
        lead.UF_CRM_DEAL_VALUE_1 = `${lead.OPPORTUNITY}|${lead.CURRENCY_ID || 'AED'}`;
      }

      // Resolve Address fallbacks from native Lead address fields
      if (!lead.UF_CRM_1791970638065 && lead.ADDRESS) {
        lead.UF_CRM_1791970638065 = lead.ADDRESS;
      }
      if (!lead.UF_CRM_CITY && lead.ADDRESS_CITY) {
        lead.UF_CRM_CITY = lead.ADDRESS_CITY;
      }
      if (!lead.UF_CRM_POSTALCODE && lead.ADDRESS_POSTAL_CODE) {
        lead.UF_CRM_POSTALCODE = lead.ADDRESS_POSTAL_CODE;
      }
      if (!lead.UF_CRM_STATE && lead.ADDRESS_PROVINCE) {
        const normProv = String(lead.ADDRESS_PROVINCE).trim().toLowerCase();
        lead.UF_CRM_STATE = STATE_LABEL_TO_ENUM[normProv] || lead.ADDRESS_PROVINCE;
      }
      if (lead.UF_CRM_STATE && STATE_ENUM_TO_LABEL[String(lead.UF_CRM_STATE)]) {
        lead.UF_CRM_STATE_LABEL = STATE_ENUM_TO_LABEL[String(lead.UF_CRM_STATE)];
      }

      // Resolve Master Project fallback
      if (!lead.UF_CRM_PROJECT && lead.UF_CRM_1792558317) {
        lead.UF_CRM_PROJECT = lead.UF_CRM_1792558317;
      } else if (!lead.UF_CRM_1792558317 && lead.UF_CRM_PROJECT) {
        lead.UF_CRM_1792558317 = lead.UF_CRM_PROJECT;
      }

      // Resolve Property Layout fallback
      if (!lead.UF_CRM_PROPERTY_LAYOUT && lead.UF_CRM_LAYOUT) {
        lead.UF_CRM_PROPERTY_LAYOUT = lead.UF_CRM_LAYOUT;
      } else if (!lead.UF_CRM_LAYOUT && lead.UF_CRM_PROPERTY_LAYOUT) {
        lead.UF_CRM_LAYOUT = lead.UF_CRM_PROPERTY_LAYOUT;
      }

      // Resolve Property fallback
      if (!lead.UF_CRM_PROPERTY_PROPERTYFINDER && lead.UF_CRM_PROPERTY) {
        lead.UF_CRM_PROPERTY_PROPERTYFINDER = lead.UF_CRM_PROPERTY;
      } else if (!lead.UF_CRM_PROPERTY && lead.UF_CRM_PROPERTY_PROPERTYFINDER) {
        lead.UF_CRM_PROPERTY = lead.UF_CRM_PROPERTY_PROPERTYFINDER;
      }

      // Resolve Number of Cheques fallback for legacy leads
      if (!lead.UF_CRM_1792139023 && (lead.UF_CRM_CHEQUES_1 || lead.UF_CRM_CHEQUES)) {
        lead.UF_CRM_1792139023 = lead.UF_CRM_CHEQUES_1 || lead.UF_CRM_CHEQUES;
      }
      // Resolve Number of Parking Spaces fallback for legacy leads
      if (!lead.UF_CRM_NUMBEROFPARKINGSPACES && lead.UF_CRM_PARKING) {
        lead.UF_CRM_NUMBEROFPARKINGSPACES = lead.UF_CRM_PARKING;
      }

      // Resolve Date Available fallback (UF_CRM_AVAILABLE_TO <-> UF_CRM_DATE_AVAILABLE)
      if (!lead.UF_CRM_DATE_AVAILABLE && (lead.UF_CRM_AVAILABLE_TO || lead.UF_CRM_AVAILABILITY_DATE)) {
        lead.UF_CRM_DATE_AVAILABLE = lead.UF_CRM_AVAILABLE_TO || lead.UF_CRM_AVAILABILITY_DATE;
      }
      if (!lead.UF_CRM_AVAILABLE_TO && lead.UF_CRM_DATE_AVAILABLE) {
        lead.UF_CRM_AVAILABLE_TO = lead.UF_CRM_DATE_AVAILABLE;
      }

      // Resolve Trakheesi Permit Expiry fallback
      if (!lead.UF_CRM_TRAKHEESI_EXPIRY && lead.UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE) {
        lead.UF_CRM_TRAKHEESI_EXPIRY = lead.UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE;
      }

      // Resolve Property Finder Listing Id fallback
      if (!lead.UF_CRM_1792151466 && lead.UF_CRM_PF_ID) {
        lead.UF_CRM_1792151466 = lead.UF_CRM_PF_ID;
      }
      if (!lead.UF_CRM_PF_ID && lead.UF_CRM_1792151466) {
        lead.UF_CRM_PF_ID = lead.UF_CRM_1792151466;
      }

      // Enrich CRM lookup fields with resolved titles and references
      for (const [code, cfg] of Object.entries(CRM_LOOKUP_CONFIG)) {
        if (lead[code]) {
          const rawVal = String(lead[code]).trim();
          const refMatch = rawVal.match(/^(?:DYNAMIC_\d+_|CO_|C_|L_|D_)?(\d+)$/i);
          if (refMatch) {
            try {
              const items = await fetchLookupData(cfg.entity);
              let found = items.find(it => String(it.id) === refMatch[1]);
              if (!found) {
                const live = await searchLookupLive(cfg.entity, refMatch[1]);
                if (live && live.length > 0) found = live[0];
              }
              if (found) {
                lead[code + '_TITLE'] = found.title;
                lead[code + '_REF'] = found.crmRef || rawVal;
              }
            } catch (e) {}
          }
        }
      }
      // Note: Enquiry Name and Listing Name are kept separate from native Lead Name (lead.TITLE)
    }
    res.json({ success: true, result: lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------------------------------
// 5. Admin & Field Manager Endpoints (/admin)
// ------------------------------------------------------------------------------
/**
 * GET /admin
 * Serves the visual Admin Field & Schema Manager
 */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/admin.html'));
});

/**
 * GET /api/admin/discovery
 * Fetches discovery report and field presence in Bitrix24
 */
app.get('/api/admin/discovery', verifyAdminSecret, async (req, res) => {
  try {
    const leadType = await DiscoveryService.discoverLeadTypeField();
    const stages = await DiscoveryService.discoverStages();
    const fields = await DiscoveryService.checkConfiguredFields();
    const fieldsConfig = config.loadFieldsConfig();

    res.json({
      success: true,
      leadType,
      stages,
      fields,
      config: fieldsConfig
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/discovery
 * Re-runs full discovery and saves results
 */
app.post('/api/admin/discovery', verifyAdminSecret, async (req, res) => {
  try {
    const discovery = await DiscoveryService.runFullDiscovery(false);
    res.json({ success: true, discovery });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/create-stages
 * Auto-creates 'Enquiry Leads' and 'Listing Leads' stages in Bitrix24
 */
app.post('/api/admin/create-stages', verifyAdminSecret, async (req, res) => {
  try {
    const stageDiscovery = await DiscoveryService.discoverStages(true);
    res.json({ success: true, created: stageDiscovery.createdStages, stages: stageDiscovery });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/bind-placements
 * Syncs and re-binds all placements (Lead Details & Matching Listings)
 */
app.post('/api/admin/bind-placements', verifyAdminSecret, async (req, res) => {
  try {
    const publicUrl = config.PUBLIC_URL || `https://${req.get('host')}`;
    const domain = req.body?.domain || 'latest';
    const results = [];

    // 1. Lead Details
    try {
      await BitrixClient.placementBind('CRM_LEAD_DETAIL_TAB', `${publicUrl}/tab`, 'Lead Details', domain);
      results.push({ placement: 'CRM_LEAD_DETAIL_TAB', status: 'bound', title: 'Lead Details' });
    } catch (e) {
      results.push({ placement: 'CRM_LEAD_DETAIL_TAB', status: 'error', error: e.message });
    }

    // 2. Matching Listings for Enquiry SPA (entityTypeId: 1062)
    try {
      await BitrixClient.placementBind('CRM_DYNAMIC_1062_DETAIL_TAB', `${publicUrl}/matching-listings`, 'Matching Listings', domain);
      results.push({ placement: 'CRM_DYNAMIC_1062_DETAIL_TAB', status: 'bound', title: 'Matching Listings' });
    } catch (e) {
      results.push({ placement: 'CRM_DYNAMIC_1062_DETAIL_TAB', status: 'error', error: e.message });
    }

    // 2b. Matching Listings for Enquiry SPA (type id: 18)
    try {
      await BitrixClient.placementBind('CRM_DYNAMIC_18_DETAIL_TAB', `${publicUrl}/matching-listings`, 'Matching Listings', domain);
      results.push({ placement: 'CRM_DYNAMIC_18_DETAIL_TAB', status: 'bound', title: 'Matching Listings' });
    } catch (e) {
      results.push({ placement: 'CRM_DYNAMIC_18_DETAIL_TAB', status: 'error', error: e.message });
    }

    // 3. Listing Details for Listing SPA (entityTypeId: 1058)
    try {
      await BitrixClient.placementBind('CRM_DYNAMIC_1058_DETAIL_TAB', `${publicUrl}/listing-details`, 'Listing Details', domain);
      results.push({ placement: 'CRM_DYNAMIC_1058_DETAIL_TAB', status: 'bound', title: 'Listing Details' });
    } catch (e) {
      results.push({ placement: 'CRM_DYNAMIC_1058_DETAIL_TAB', status: 'error', error: e.message });
    }

    // 3b. Listing Details for Listing SPA (type id: 16)
    try {
      await BitrixClient.placementBind('CRM_DYNAMIC_16_DETAIL_TAB', `${publicUrl}/listing-details`, 'Listing Details', domain);
      results.push({ placement: 'CRM_DYNAMIC_16_DETAIL_TAB', status: 'bound', title: 'Listing Details' });
    } catch (e) {
      results.push({ placement: 'CRM_DYNAMIC_16_DETAIL_TAB', status: 'error', error: e.message });
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/create-missing-fields
 * Creates all missing configured fields in Bitrix24
 */
app.post('/api/admin/create-missing-fields', verifyAdminSecret, async (req, res) => {
  try {
    const fieldsCheck = await DiscoveryService.checkConfiguredFields();
    const created = [];

    for (const field of fieldsCheck.missing) {
      await DiscoveryService.createCustomField(field);
      created.push(field.code);
    }

    res.json({ success: true, created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/create-field
 * Creates a brand new custom field on Lead and updates config/fields.json
 */
app.post('/api/admin/create-field', verifyAdminSecret, async (req, res) => {
  try {
    const { label, code, type, tab, options } = req.body;
    if (!label || !code) {
      return res.status(400).json({ success: false, error: 'Label and code are required' });
    }

    const fieldDef = {
      code: code.toUpperCase(),
      label,
      type: type || 'string',
      required: false,
      multiple: false,
      options: options || []
    };

    // 1. Create in Bitrix24
    await DiscoveryService.createCustomField(fieldDef);

    // 2. Add to config/fields.json if requested
    const currentConfig = config.loadFieldsConfig();
    if (tab === 'enquiry' || tab === 'both') {
      currentConfig.enquiryFields.push(fieldDef);
    }
    if (tab === 'listing' || tab === 'both') {
      currentConfig.listingFields.push(fieldDef);
    }
    config.saveFieldsConfig(currentConfig);

    res.json({ success: true, field: fieldDef });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------------------------------
// 6. Diagnostics & Root Endpoints
// ------------------------------------------------------------------------------
/**
 * GET /health
 * Service health check
 */
app.get('/health', (req, res) => {
  const auth = StorageManager.getAuth('latest');
  const discovered = StorageManager.getDiscoveredConfig();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    bitrixConnected: Boolean(auth?.accessToken),
    portalDomain: auth?.domain || null,
    discovery: {
      leadTypeField: discovered.leadTypeField || null,
      enquiryStage: discovered.stages?.enquiryStageId || null,
      listingStage: discovered.stages?.listingStageId || null
    }
  });
});

/**
 * GET /
 * Welcome & Service Overview
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Bitrix24 Real Estate Lead Application',
    version: '1.0.0',
    endpoints: {
      install: '/install',
      tab: '/tab',
      events: 'POST /events',
      admin: '/admin',
      config: 'GET /api/config',
      health: 'GET /health'
    }
  });
});

// ------------------------------------------------------------------------------
// Global Error Handlers
// ------------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

// ------------------------------------------------------------------------------
// Server Initialization
// ------------------------------------------------------------------------------
if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`=======================================================`);
    console.log(`Bitrix24 Real Estate Lead App running on port ${config.PORT}`);
    console.log(`Public URL: ${config.PUBLIC_URL || `http://localhost:${config.PORT}`}`);
    console.log(`Install URL:  ${config.PUBLIC_URL || `http://localhost:${config.PORT}`}/install`);
    console.log(`Tab URL:      ${config.PUBLIC_URL || `http://localhost:${config.PORT}`}/tab`);
    console.log(`Events URL:   ${config.PUBLIC_URL || `http://localhost:${config.PORT}`}/events`);
    console.log(`Admin Portal: ${config.PUBLIC_URL || `http://localhost:${config.PORT}`}/admin`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
module.exports.app = app;
