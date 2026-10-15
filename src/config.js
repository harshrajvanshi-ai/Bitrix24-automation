/**
 * src/config.js
 * Centralized configuration and environment loader
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const FIELDS_CONFIG_PATH = path.resolve(__dirname, '../config/fields.json');

function loadFieldsConfig() {
  try {
    if (fs.existsSync(FIELDS_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(FIELDS_CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('[CONFIG] Failed to load config/fields.json:', err.message);
  }
  return {
    leadTypeField: 'UF_CRM_LEAD_TYPE',
    leadTypeValues: { enquiry: 'Enquiry', listing: 'Listing' },
    stageMapping: { enquiryStage: 'Enquiry Leads', listingStage: 'Listing Leads' },
    enquiryFields: [],
    listingFields: []
  };
}

function saveFieldsConfig(newConfig) {
  fs.writeFileSync(FIELDS_CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
}

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  PUBLIC_URL: (process.env.PUBLIC_URL || '').replace(/^['"]|['"]$/g, '').replace(/\/+$/, ''),
  CLIENT_ID: (process.env.CLIENT_ID || '').replace(/^['"]|['"]$/g, '').trim(),
  CLIENT_SECRET: (process.env.CLIENT_SECRET || '').replace(/^['"]|['"]$/g, '').trim(),
  ADMIN_SECRET: (process.env.ADMIN_SECRET || 'secret123').replace(/^['"]|['"]$/g, '').trim(),
  INBOUND_WEBHOOK_URL: (process.env.Inbound_webhook || process.env.BITRIX_INBOUND_WEBHOOK_URL || '').replace(/^['"]|['"]$/g, '').trim(),
  BITRIX_OAUTH_SERVER: process.env.BITRIX_OAUTH_SERVER || 'https://oauth.bitrix.info/oauth/token/',
  IS_BOX: process.env.IS_BOX === 'true',
  loadFieldsConfig,
  saveFieldsConfig,
  FIELDS_CONFIG_PATH
};
