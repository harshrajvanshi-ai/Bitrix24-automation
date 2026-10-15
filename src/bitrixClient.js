/**
 * src/bitrixClient.js
 * Server-side Bitrix24 REST API client with automatic OAuth token refresh & retry
 */

const axios = require('axios');
const StorageManager = require('./storage');
const config = require('./config');

class BitrixClient {
  /**
   * Refresh OAuth access token using refresh_token
   */
  static async refreshAccessToken(authRecord) {
    if (!authRecord?.refreshToken) {
      throw new Error('Cannot refresh token: No refresh_token stored.');
    }
    if (!config.CLIENT_ID || !config.CLIENT_SECRET) {
      throw new Error('Cannot refresh token: CLIENT_ID or CLIENT_SECRET missing in environment.');
    }

    const oauthEndpoint = config.IS_BOX
      ? `https://${authRecord.domain}/oauth/token/`
      : config.BITRIX_OAUTH_SERVER;

    console.log(`[AUTH] Refreshing OAuth access token for domain ${authRecord.domain}...`);

    try {
      const response = await axios.get(oauthEndpoint, {
        params: {
          grant_type: 'refresh_token',
          client_id: config.CLIENT_ID,
          client_secret: config.CLIENT_SECRET,
          refresh_token: authRecord.refreshToken
        },
        timeout: 10000
      });

      if (response.data?.error) {
        throw new Error(`OAuth Refresh Error: ${response.data.error_description || response.data.error}`);
      }

      const refreshed = response.data;
      const updated = StorageManager.updateTokens(authRecord.domain, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_in: refreshed.expires_in
      });

      console.log(`[AUTH] OAuth token refreshed successfully for domain: ${authRecord.domain}`);
      return updated;
    } catch (err) {
      const errDetails = err.response?.data || err.message;
      console.error('[AUTH] Failed to refresh OAuth token:', errDetails);
      throw new Error(`Token refresh failed: ${JSON.stringify(errDetails)}`);
    }
  }

  /**
   * Generic REST call with automatic expired_token detection and single retry
   */
  static async call(method, params = {}, identifier = 'latest') {
    let auth = StorageManager.getAuth(identifier);
    let endpoint;
    let postData = { ...params };

    if (auth && auth.accessToken) {
      endpoint = `${auth.clientEndpoint.replace(/\/+$/, '')}/${method}`;
      postData.auth = auth.accessToken;
    } else if (config.INBOUND_WEBHOOK_URL) {
      endpoint = `${config.INBOUND_WEBHOOK_URL.replace(/\/+$/, '')}/${method}`;
    } else {
      throw new Error('Bitrix24 authentication missing. Please install the local application first.');
    }

    try {
      const res = await axios.post(
        endpoint,
        postData,
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );

      if (res.data?.error) {
        throw new Error(res.data.error_description || res.data.error);
      }

      return res.data?.result;
    } catch (err) {
      const errCode = (err.response?.data?.error || err.message || '').toLowerCase();

      // Check if token has expired and retry once
      if (errCode.includes('expired_token') || errCode.includes('invalid_token') || err.response?.status === 401) {
        console.warn(`[API] Token expired for method ${method}. Attempting refresh and retry...`);
        try {
          auth = await this.refreshAccessToken(auth);
          // Retry original request with new token
          const retryRes = await axios.post(
            endpoint,
            { ...params, auth: auth.accessToken },
            { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
          );
          return retryRes.data?.result;
        } catch (refreshErr) {
          console.error('[API] Retry after refresh failed:', refreshErr.message);
          if (config.INBOUND_WEBHOOK_URL) {
            console.log(`[API] Falling back to INBOUND_WEBHOOK_URL for method ${method}...`);
            const fallbackEndpoint = `${config.INBOUND_WEBHOOK_URL.replace(/\/+$/, '')}/${method}`;
            const fallbackRes = await axios.post(
              fallbackEndpoint,
              params,
              { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
            );
            return fallbackRes.data?.result;
          }
          throw refreshErr;
        }
      }

      console.error(`[API] Bitrix24 method ${method} failed:`, err.response?.data || err.message);
      throw err;
    }
  }

  // --- Convenience REST Wrappers ---

  static async crmLeadGet(id, identifier = 'latest') {
    return this.call('crm.lead.get', { id }, identifier);
  }

  static async crmLeadUpdate(id, fields, identifier = 'latest') {
    return this.call('crm.lead.update', { id, fields }, identifier);
  }

  static async crmLeadFields(identifier = 'latest') {
    return this.call('crm.lead.fields', {}, identifier);
  }

  static async crmLeadUserfieldList(filter = {}, identifier = 'latest') {
    return this.call('crm.lead.userfield.list', { filter, order: { SORT: 'ASC' } }, identifier);
  }

  static async crmLeadUserfieldAdd(fields, identifier = 'latest') {
    return this.call('crm.lead.userfield.add', { fields }, identifier);
  }

  static async crmStatusList(filter = { ENTITY_ID: 'STATUS' }, identifier = 'latest') {
    return this.call('crm.status.list', { filter, order: { SORT: 'ASC' } }, identifier);
  }

  static async crmStatusAdd(fields, identifier = 'latest') {
    return this.call('crm.status.add', { fields }, identifier);
  }

  static async placementBind(placement, handler, title, identifier = 'latest') {
    return this.call('placement.bind', {
      PLACEMENT: placement,
      HANDLER: handler,
      TITLE: title
    }, identifier);
  }

  static async eventBind(event, handler, identifier = 'latest') {
    return this.call('event.bind', {
      event,
      handler
    }, identifier);
  }

  static async appInfo(identifier = 'latest') {
    return this.call('app.info', {}, identifier);
  }
}

module.exports = BitrixClient;
