/**
 * src/storage.js
 * Persistent storage manager for OAuth tokens, discovered stages, and field mappings.
 * Uses atomic JSON file persistence (no native compilation issues).
 */

const fs = require('fs');
const path = require('path');

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const STORAGE_DIR = process.env.STORAGE_DIR || (isVercel ? path.join('/tmp', 'storage') : path.resolve(__dirname, '../storage'));
const STORAGE_FILE = path.join(STORAGE_DIR, 'tokens.json');

// Ensure storage directory exists safely
try {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[STORAGE] Warning creating storage directory:', err.message);
}

// Initial state template
const DEFAULT_STATE = {
  auth: {}, // keyed by domain and/or member_id
  discovered: {
    leadTypeField: null,
    leadTypeItems: {
      enquiryId: null,
      listingId: null
    },
    stages: {
      enquiryStageId: null,
      listingStageId: null
    },
    finalStages: []
  },
  lastUpdated: null
};

function readStorage() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      try {
        if (!fs.existsSync(STORAGE_DIR)) {
          fs.mkdirSync(STORAGE_DIR, { recursive: true });
        }
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf-8');
      } catch (writeErr) {
        // Read-only filesystem fallback
      }
      return DEFAULT_STATE;
    }
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[STORAGE] Error reading storage file:', err.message);
    return DEFAULT_STATE;
  }
}

function writeStorage(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    const tempFile = `${STORAGE_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, STORAGE_FILE);
  } catch (err) {
    console.error('[STORAGE] Error writing storage file:', err.message);
  }
}

class StorageManager {
  /**
   * Save or update OAuth authentication data
   */
  static saveAuth(auth) {
    const data = readStorage();
    const domain = (auth.domain || '').toLowerCase().trim();
    const memberId = auth.member_id || auth.memberId || 'default';

    const authRecord = {
      domain,
      memberId,
      accessToken: auth.access_token || auth.accessToken,
      refreshToken: auth.refresh_token || auth.refreshToken,
      clientEndpoint: auth.client_endpoint || auth.clientEndpoint || `https://${domain}/rest/`,
      applicationToken: auth.application_token || auth.applicationToken || null,
      expiresAt: auth.expires ? (Date.now() + (parseInt(auth.expires_in || auth.expires, 10) * 1000)) : null,
      updatedAt: new Date().toISOString()
    };

    if (domain) data.auth[domain] = authRecord;
    if (memberId) data.auth[memberId] = authRecord;
    data.auth['latest'] = authRecord; // fallback reference

    writeStorage(data);
    return authRecord;
  }

  /**
   * Retrieve OAuth tokens by domain or memberId
   */
  static getAuth(identifier = 'latest') {
    const data = readStorage();
    if (!identifier || identifier === 'latest') {
      return data.auth['latest'] || Object.values(data.auth)[0] || null;
    }
    const cleanId = String(identifier).toLowerCase().trim();
    return data.auth[cleanId] || data.auth['latest'] || null;
  }

  /**
   * Update tokens after OAuth refresh
   */
  static updateTokens(identifier, newTokens) {
    const current = this.getAuth(identifier);
    if (!current) {
      throw new Error(`Cannot update tokens for unknown identifier: ${identifier}`);
    }

    return this.saveAuth({
      ...current,
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || current.refreshToken,
      expires_in: newTokens.expires_in || 3600
    });
  }

  /**
   * Save discovered field codes and stage IDs
   */
  static saveDiscoveredConfig(discovered) {
    const data = readStorage();
    data.discovered = {
      ...data.discovered,
      ...discovered
    };
    writeStorage(data);
    return data.discovered;
  }

  /**
   * Retrieve discovered configuration
   */
  static getDiscoveredConfig() {
    const data = readStorage();
    return data.discovered || DEFAULT_STATE.discovered;
  }
}

module.exports = StorageManager;
