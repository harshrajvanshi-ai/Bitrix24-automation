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

module.exports = {
  verifyBitrixEventToken,
  verifyAdminSecret
};
