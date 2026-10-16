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
// 3. Event Handler (/events)
// ------------------------------------------------------------------------------
/**
 * POST /events
 * Receives ONCRMLEADADD and ONCRMLEADUPDATE outbound webhooks from Bitrix24
 */
app.post('/events', eventLimiter, verifyBitrixEventToken, async (req, res) => {
  const event = req.body?.event || req.body?.['event'] || 'UNKNOWN_EVENT';
  const leadId = (
    req.body?.data?.FIELDS?.ID ||
    req.body?.data?.FIELDS?.id ||
    req.body?.['data[FIELDS][ID]'] ||
    req.body?.['data[FIELDS][id]'] ||
    req.body?.id
  );
  const domain = req.body?.auth?.domain || req.body?.['auth[domain]'] || 'latest';

  console.log(`[EVENT] Received ${event} for Lead #${leadId} from domain: ${domain}`);

  if (!leadId) {
    return res.status(400).json({ success: false, error: 'Missing lead ID in payload' });
  }

  // Acknowledge receipt promptly with 200 OK to prevent Bitrix24 webhook timeouts
  res.status(200).json({
    success: true,
    message: 'Event accepted for asynchronous routing',
    event,
    leadId
  });

  // Asynchronously execute lead type evaluation and stage transition
  try {
    await EventRouter.handleLeadEvent(leadId, event, domain);
  } catch (err) {
    console.error(`[EVENT] Asynchronous routing failed for Lead #${leadId}:`, err.message);
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

// Lookup in-memory cache
const lookupCache = { data: {}, timestamp: {} };

async function fetchLookupData(entity) {
  const now = Date.now();
  if (lookupCache.data[entity] && (now - lookupCache.timestamp[entity] < 300000)) {
    return lookupCache.data[entity];
  }

  let items = [];
  try {
    if (entity === 'master_project') {
      const res = await BitrixClient.call('crm.item.list', { entityTypeId: 1040, select: ['id', 'title'], order: { title: 'ASC' } });
      items = (res.items || []).map(i => ({ id: i.id, title: i.title || `Master Project #${i.id}` }));
    } else if (entity === 'project') {
      const res = await BitrixClient.call('crm.item.list', { entityTypeId: 1044, select: ['id', 'title'], order: { title: 'ASC' } });
      items = (res.items || []).map(i => ({ id: i.id, title: i.title || `Project #${i.id}` }));
    } else if (entity === 'property') {
      const res = await BitrixClient.call('crm.item.list', { entityTypeId: 1052, select: ['id', 'title'], order: { title: 'ASC' } });
      items = (res.items || []).map(i => ({ id: i.id, title: i.title || `Property #${i.id}` }));
    } else if (entity === 'developer' || entity === 'company') {
      const res = await BitrixClient.call('crm.company.list', { select: ['ID', 'TITLE'], order: { TITLE: 'ASC' } });
      items = (res || []).map(i => ({ id: i.ID, title: i.TITLE || `Company #${i.ID}` }));
    } else if (entity === 'contact' || entity === 'owner' || entity === 'tenant') {
      const [contacts, companies] = await Promise.all([
        BitrixClient.call('crm.contact.list', { select: ['ID', 'NAME', 'LAST_NAME'], order: { LAST_NAME: 'ASC' } }).catch(() => []),
        BitrixClient.call('crm.company.list', { select: ['ID', 'TITLE'], order: { TITLE: 'ASC' } }).catch(() => [])
      ]);
      const contactItems = (contacts || []).map(i => ({
        id: i.ID,
        title: `${i.NAME || ''} ${i.LAST_NAME || ''}`.trim() || `Contact #${i.ID}`
      }));
      const companyItems = (companies || []).map(i => ({
        id: i.ID,
        title: i.TITLE || `Company #${i.ID}`
      }));
      items = [...contactItems, ...companyItems];
    } else if (entity === 'layout') {
      const res = await BitrixClient.call('crm.item.list', { entityTypeId: 1048, select: ['id', 'title'], order: { title: 'ASC' } });
      items = (res.items || []).map(i => ({ id: i.id, title: i.title || `Layout #${i.id}` }));
    } else if (entity === 'broker' || entity === 'agent') {
      const res = await BitrixClient.call('crm.item.list', { entityTypeId: 1094, select: ['id', 'title'], order: { title: 'ASC' } });
      items = (res.items || []).map(i => ({ id: i.id, title: i.title || `Broker #${i.id}` }));
    } else if (entity === 'user') {
      const res = await BitrixClient.call('user.get', { ACTIVE: true });
      items = (res || []).map(i => ({ id: i.ID, title: `${i.NAME || ''} ${i.LAST_NAME || ''}`.trim() || `User #${i.ID}` }));
    } else if (entity === 'listing') {
      const res = await BitrixClient.call('crm.item.list', { entityTypeId: 1058, select: ['id', 'title'], order: { title: 'ASC' } });
      items = (res.items || []).map(i => ({ id: i.id, title: i.title || `Listing #${i.id}` }));
    } else if (entity === 'enquiry') {
      const res = await BitrixClient.call('crm.item.list', { entityTypeId: 1062, select: ['id', 'title'], order: { title: 'ASC' } });
      items = (res.items || []).map(i => ({ id: i.id, title: i.title || `Enquiry #${i.id}` }));
    }

    lookupCache.data[entity] = items;
    lookupCache.timestamp[entity] = now;
  } catch (err) {
    console.warn(`[LOOKUP] Error fetching ${entity}:`, err.message);
    if (lookupCache.data[entity]) return lookupCache.data[entity];
  }

  return items;
}

/**
 * GET /api/lookup
 * Query lookup data for Master Projects, Projects, Properties, Developers, Contacts
 */
app.get('/api/lookup', async (req, res) => {
  const entity = (req.query.entity || req.query.type || '').toLowerCase().trim();
  const query = (req.query.q || '').toLowerCase().trim();

  if (!entity) {
    return res.status(400).json({ success: false, error: 'Missing entity query parameter' });
  }

  const allItems = await fetchLookupData(entity);
  let results = allItems;
  if (query) {
    results = allItems.filter(item => item.title.toLowerCase().includes(query) || String(item.id).includes(query));
  }

  res.json({ success: true, count: results.length, items: results.slice(0, 30) });
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

  // Normalize picklist / enumeration fields from label strings to Bitrix numeric IDs
  fields = normalizeEnumFields(fields);

  // Normalize file fields to ensure proper { fileData: [name, base64] } structure for Bitrix24
  fields = normalizeFileFields(fields);

  try {
    const result = await BitrixClient.crmLeadUpdate(leadId, fields);
    res.json({ success: true, result });
  } catch (err) {
    console.error(`[API] Failed to update Lead #${leadId}:`, err.message);
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
      // Resolve Number of Cheques fallback for legacy leads
      if (!lead.UF_CRM_1792139023 && (lead.UF_CRM_CHEQUES_1 || lead.UF_CRM_CHEQUES)) {
        lead.UF_CRM_1792139023 = lead.UF_CRM_CHEQUES_1 || lead.UF_CRM_CHEQUES;
      }
      // Resolve Number of Parking Spaces fallback for legacy leads
      if (!lead.UF_CRM_NUMBEROFPARKINGSPACES && lead.UF_CRM_PARKING) {
        lead.UF_CRM_NUMBEROFPARKINGSPACES = lead.UF_CRM_PARKING;
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
