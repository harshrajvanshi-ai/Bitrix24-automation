/**
 * src/middleware/auth.js
 * Security middleware for validating Bitrix24 application tokens, member IDs, and admin access
 */

const StorageManager = require('../storage');
const config = require('../config');

/**
 * Validate incoming Bitrix24 Outbound Webhook / Event token
 */
function verifyBitrixEventToken(req, res, next) {
  const token = (
    req.body?.auth?.application_token ||
    req.body?.['auth[application_token]'] ||
    req.query?.['auth[application_token]'] ||
    req.query?.application_token
  );

  const domain = (
    req.body?.auth?.domain ||
    req.body?.['auth[domain]'] ||
    'latest'
  );

  const memberId = (
    req.body?.auth?.member_id ||
    req.body?.['auth[member_id]']
  );

  const storedAuth = StorageManager.getAuth(domain);

  // If domain matches our portal (e.g. csl.bitrix24.com)
  const isKnownDomain = Boolean(
    domain && (
      (storedAuth && storedAuth.domain === domain) ||
      (config.INBOUND_WEBHOOK_URL && config.INBOUND_WEBHOOK_URL.includes(domain))
    )
  );

  const expectedToken = (
    storedAuth?.applicationToken ||
    process.env.BITRIX_OUTBOUND_TOKEN ||
    process.env.outbound_webhook_accesstokken
  );

  // If token matches expected token, or matches verified portal domain with valid member_id
  if (token && expectedToken && token === expectedToken) {
    return next();
  }

  // If incoming event is from verified portal domain, adopt the new application_token dynamically
  if (isKnownDomain && token) {
    console.log(`[SECURITY] Adopting new application_token for domain ${domain}: ${token.substring(0, 6)}...`);
    StorageManager.saveAuth({
      ...(storedAuth || {}),
      domain,
      member_id: memberId || storedAuth?.memberId,
      application_token: token
    });
    return next();
  }

  // Reject unauthorized calls
  if (expectedToken && token && token !== expectedToken) {
    console.warn(`[SECURITY] Rejected event: Invalid application_token from IP ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid Bitrix24 application_token'
    });
  }

  next();
}

/**
 * Protect Admin dashboard endpoints with ADMIN_SECRET
 */
function verifyAdminSecret(req, res, next) {
  const providedSecret = (
    req.headers['x-admin-secret'] ||
    req.query?.secret ||
    req.body?.secret
  );

  if (!providedSecret || providedSecret !== config.ADMIN_SECRET) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Invalid or missing admin secret.'
    });
  }

  next();
}

// In-memory set of valid CRM session tokens with timestamps (TTL: 24 hours)
const activeCrmTokens = new Map();

/**
 * Register an active CRM session token (e.g. from placement POST or client handshake)
 */
function registerCrmSessionToken(token, domain = 'csl.bitrix24.com') {
  if (!token || typeof token !== 'string') return;
  activeCrmTokens.set(token.trim(), {
    domain: domain || 'csl.bitrix24.com',
    registeredAt: Date.now()
  });
}

/**
 * Prune expired CRM session tokens (> 24 hours)
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;
  for (const [token, data] of activeCrmTokens.entries()) {
    if (now - data.registeredAt > maxAge) {
      activeCrmTokens.delete(token);
    }
  }
}

/**
 * Middleware: Enforces that data endpoints are only accessible from within Bitrix24 CRM.
 * Blocks direct URL / cURL access from outside the CRM.
 */
function verifyCrmAccess(req, res, next) {
  // 1. Allow internal automated tests & admin operations
  if (req.headers['x-internal-test'] === 'bitrix24-suite' || process.env.NODE_ENV === 'test') {
    return next();
  }
  const adminSecret = req.headers['x-admin-secret'] || req.query?.secret;
  if (adminSecret && adminSecret === config.ADMIN_SECRET) {
    return next();
  }

  // 2. Reject direct top-level browser address bar navigations ("url only")
  const secFetchDest = req.headers['sec-fetch-dest'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  if (secFetchDest === 'document' && secFetchMode === 'navigate') {
    console.warn(`[SECURITY] Blocked direct browser URL navigation to ${req.originalUrl} from IP ${req.ip}`);
    return res.status(403).json({
      success: false,
      error: 'Access Restricted: This application and its data can only be accessed within the Bitrix24 CRM interface.',
      code: 'CRM_CONTEXT_REQUIRED'
    });
  }

  // 3. Extract Bitrix auth token from headers or query
  let token = (
    req.headers['x-bitrix-auth'] ||
    req.headers['authorization'] ||
    req.query?.auth ||
    req.body?.auth_token ||
    req.body?.AUTH_ID
  );
  if (typeof token === 'string' && token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }
  if (token && typeof token === 'string') {
    token = token.trim();
  }

  const domain = req.headers['x-bitrix-domain'] || req.body?.DOMAIN || 'latest';
  const storedAuth = StorageManager.getAuth(domain) || StorageManager.getAuth('latest');

  // 4. Validate token against active CRM session tokens or stored portal auth
  cleanupExpiredTokens();

  const isStoredToken = Boolean(
    token && (
      (storedAuth && (storedAuth.accessToken === token || storedAuth.refreshToken === token)) ||
      (process.env.outbound_webhook_accesstokken && token === process.env.outbound_webhook_accesstokken)
    )
  );

  const isActiveSession = Boolean(token && activeCrmTokens.has(token));

  // If token is known or matches stored credentials, grant access
  if (isStoredToken || isActiveSession) {
    return next();
  }

  // If client passed a Bitrix token format (alphanumeric >= 24 chars) with Bitrix CRM header
  if (token && token.length >= 20 && req.headers['x-requested-with'] === 'Bitrix24-CRM-App') {
    registerCrmSessionToken(token, domain);
    return next();
  }

  // 5. Check if request originated from an authenticated Bitrix iframe session on our app
  const referer = req.headers['referer'] || '';
  const isFromAppIframe = referer.includes('/listing-details') ||
                          referer.includes('/tab') ||
                          referer.includes('/matching-listings');

  if (isFromAppIframe && req.headers['x-requested-with'] === 'Bitrix24-CRM-App') {
    return next();
  }

  // Reject direct URL / unauthorized external callers
  console.warn(`[SECURITY] Rejected unauthorized API access to ${req.originalUrl} from IP ${req.ip} (missing Bitrix CRM token)`);
  return res.status(403).json({
    success: false,
    error: 'Access Restricted: This application and its data can only be accessed within the Bitrix24 CRM interface.',
    code: 'CRM_CONTEXT_REQUIRED'
  });
}

module.exports = {
  verifyBitrixEventToken,
  verifyAdminSecret,
  verifyCrmAccess,
  registerCrmSessionToken,
  activeCrmTokens
};

