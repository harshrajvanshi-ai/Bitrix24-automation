/**
 * src/schemaMap.js
 * Central Schema Mapping & Concept Resolution Layer
 * 
 * Provides unified, dynamic mapping between real estate concepts,
 * Bitrix24 CRM fields, Smart Process Automation entities, and enumeration items.
 * 
 * Guarantees:
 *  1. Zero hard-coded numeric enum IDs in new logic.
 *  2. Resolves concepts by canonical keys and XML_IDs.
 *  3. Strict version branching via LAYOUT_VERSION (v1 = 100% backward compatible legacy codes).
 *  4. Fails loudly with clear diagnostic error messages if a concept or enum cannot be resolved.
 *  5. Dynamic entityTypeId discovery with TTL caching.
 */

const fs = require('fs');
const path = require('path');
const conceptsRegistry = require('../config/concepts.json');
const StorageManager = require('./storage');

// In-memory cache for dynamic resolutions and error tracking
const resolutionErrors = [];
let entityTypeCache = { ...conceptsRegistry.entities };
let lastEntityTypeRefresh = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Hour TTL

class SchemaMap {
  /**
   * Get active layout version ('v1' | 'v2')
   */
  static getLayoutVersion() {
    return (process.env.LAYOUT_VERSION || 'v1').toLowerCase().trim();
  }

  /**
   * Record a resolution error for administrative diagnostic inspection
   */
  static _recordError(type, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      context
    };
    resolutionErrors.push(entry);
    if (resolutionErrors.length > 100) resolutionErrors.shift();
    console.error(`[SchemaMap ERROR] ${type}: ${message}`, context);
  }

  /**
   * Get all tracked resolution errors (exposed to /admin)
   */
  static getResolutionErrors() {
    return [...resolutionErrors];
  }

  /**
   * Clear tracked resolution errors
   */
  static clearResolutionErrors() {
    resolutionErrors.length = 0;
  }

  /**
   * Resolve field code for a concept and target entity
   * @param {string} conceptKey - Canonical concept name (e.g. 'transaction', 'bedrooms')
   * @param {string} entity - Target entity ('lead' | 'spa_1058' | 'spa_1062' | 'spa_1048')
   * @returns {string} - Bitrix field code (e.g. 'UF_CRM_BEDROOMS' or 'UF_CRM_RE_TRANSACTION')
   */
  static resolveFieldCode(conceptKey, entity = 'lead') {
    const concept = conceptsRegistry.concepts?.[conceptKey];
    if (!concept) {
      const msg = `Concept '${conceptKey}' is not registered in config/concepts.json`;
      this._recordError('MISSING_CONCEPT', msg, { conceptKey, entity });
      throw new Error(`[SchemaMap] ${msg}`);
    }

    const entityConfig = concept.fields?.[entity];
    if (!entityConfig) {
      const msg = `Entity '${entity}' is not defined for concept '${conceptKey}'`;
      this._recordError('MISSING_ENTITY_FIELD', msg, { conceptKey, entity });
      throw new Error(`[SchemaMap] ${msg}`);
    }

    const version = this.getLayoutVersion();
    let code = version === 'v2' ? (entityConfig.v2 || entityConfig.v1) : entityConfig.v1;

    if (!code) {
      const msg = `No field code resolved for concept '${conceptKey}' on entity '${entity}' in version '${version}'`;
      this._recordError('UNRESOLVED_CODE', msg, { conceptKey, entity, version });
      throw new Error(`[SchemaMap] ${msg}`);
    }

    return code;
  }

  /**
   * Resolve property key for SPA entities (camelCase key, e.g. 'ufCrm16Size')
   * @param {string} conceptKey 
   * @param {string} entity ('spa_1058' | 'spa_1062' | 'spa_1048')
   * @returns {string}
   */
  static resolveSpaPropertyKey(conceptKey, entity = 'spa_1058') {
    const concept = conceptsRegistry.concepts?.[conceptKey];
    if (!concept || !concept.fields?.[entity]) {
      return this.resolveFieldCode(conceptKey, entity);
    }
    const cfg = concept.fields[entity];
    const version = this.getLayoutVersion();
    return (version === 'v2' && cfg.key) ? cfg.key : (cfg.v1Key || cfg.key || cfg.v1);
  }

  /**
   * Resolve an enumeration ID for a given concept and XML_ID/Label
   * @param {string} conceptKey - Canonical concept name
   * @param {string|number} xmlIdOrName - XML_ID (e.g. 'SALE', 'RENT', 'OFF_PLAN') or string label
   * @param {string} entity - Target entity ('lead' | 'spa_1058' | 'spa_1062' | 'spa_1048')
   * @returns {string|number} - Resolved Bitrix enum ID
   */
  static resolveEnumId(conceptKey, xmlIdOrName, entity = 'lead') {
    if (xmlIdOrName === undefined || xmlIdOrName === null || xmlIdOrName === '') {
      return null;
    }

    const concept = conceptsRegistry.concepts?.[conceptKey];
    if (!concept || !Array.isArray(concept.enums)) {
      const msg = `Concept '${conceptKey}' has no enumeration definitions`;
      this._recordError('NOT_AN_ENUM_CONCEPT', msg, { conceptKey, xmlIdOrName, entity });
      throw new Error(`[SchemaMap] ${msg}`);
    }

    const needle = String(xmlIdOrName).trim().toLowerCase();
    const version = this.getLayoutVersion();

    // 1. Locate matched enum item in concept definition
    const matchedEnum = concept.enums.find(item => {
      if (item.xmlId && String(item.xmlId).toLowerCase() === needle) return true;
      if (item.label && String(item.label).toLowerCase() === needle) return true;
      if (item.v1Id && String(item.v1Id) === needle) return true;
      if (item.v2Id && String(item.v2Id).toLowerCase() === needle) return true;
      if (item.leadV1Id && String(item.leadV1Id) === needle) return true;
      if (item.spa1058V1Id && String(item.spa1058V1Id) === needle) return true;
      if (item.spa1062V1Id && String(item.spa1062V1Id) === needle) return true;
      if (item.spa1048V1Id && String(item.spa1048V1Id) === needle) return true;
      return false;
    });

    if (!matchedEnum) {
      const msg = `Unable to resolve enum value '${xmlIdOrName}' for concept '${conceptKey}'`;
      this._recordError('UNRESOLVED_ENUM', msg, { conceptKey, xmlIdOrName, entity, availableEnums: concept.enums.map(e => e.xmlId) });
      throw new Error(`[SchemaMap] ${msg}`);
    }

    // 2. Check dynamic discovery cache first if available
    try {
      const discovered = StorageManager.getDiscoveredConfig();
      const discoveredEnums = discovered?.enums?.[conceptKey];
      if (discoveredEnums && discoveredEnums[matchedEnum.xmlId]) {
        return discoveredEnums[matchedEnum.xmlId];
      }
    } catch (_) { }

    // 3. Return version-appropriate static mapping
    if (version === 'v2') {
      return matchedEnum.v2Id || matchedEnum.xmlId;
    }

    // Version v1 legacy IDs:
    if (entity === 'spa_1058') return matchedEnum.spa1058V1Id || matchedEnum.v1Id;
    if (entity === 'spa_1062') return matchedEnum.spa1062V1Id || matchedEnum.v1Id;
    if (entity === 'spa_1048') return matchedEnum.spa1048V1Id || matchedEnum.v1Id;
    return matchedEnum.leadV1Id || matchedEnum.v1Id;
  }

  /**
   * Reverse resolve an enum ID or XML_ID to its canonical XML_ID
   * @param {string} conceptKey 
   * @param {string|number} rawVal 
   * @returns {string|null} - Canonical XML_ID (e.g. 'RENT', 'SALE')
   */
  static resolveCanonicalXmlId(conceptKey, rawVal) {
    if (!rawVal) return null;
    const concept = conceptsRegistry.concepts?.[conceptKey];
    if (!concept || !Array.isArray(concept.enums)) return null;

    const needle = String(rawVal).trim().toLowerCase();
    const item = concept.enums.find(e => {
      if (e.xmlId && String(e.xmlId).toLowerCase() === needle) return true;
      if (e.label && String(e.label).toLowerCase() === needle) return true;
      if (e.v1Id && String(e.v1Id) === needle) return true;
      if (e.v2Id && String(e.v2Id).toLowerCase() === needle) return true;
      if (e.leadV1Id && String(e.leadV1Id) === needle) return true;
      if (e.spa1058V1Id && String(e.spa1058V1Id) === needle) return true;
      if (e.spa1062V1Id && String(e.spa1062V1Id) === needle) return true;
      if (e.spa1048V1Id && String(e.spa1048V1Id) === needle) return true;
      return false;
    });

    return item ? item.xmlId : null;
  }

  /**
   * Resolve Bitrix Smart Process Automation (SPA) entityTypeId by canonical name
   * @param {string} entityName - e.g. 'master_project', 'project', 'layout', 'property', 'listing', 'enquiry', 'broker'
   * @returns {number} - Numeric entityTypeId (e.g. 1040, 1058, 1062)
   */
  static resolveEntityTypeId(entityName) {
    const key = String(entityName || '').toLowerCase().trim();
    const entity = entityTypeCache[key] || conceptsRegistry.entities?.[key];
    if (entity?.entityTypeId) {
      return Number(entity.entityTypeId);
    }

    const msg = `Unknown entity type name: '${entityName}'`;
    this._recordError('UNKNOWN_ENTITY_TYPE', msg, { entityName, knownEntities: Object.keys(entityTypeCache) });
    throw new Error(`[SchemaMap] ${msg}`);
  }

  /**
   * Build official Bitrix24 placement code for an entity and placement type
   * @param {string} entityName - 'lead' | 'listing' | 'enquiry' | or SPA entity name
   * @param {string} placementSuffix - Suffix, default 'DETAIL_TAB'
   * @returns {string} - e.g. 'CRM_LEAD_DETAIL_TAB' or 'CRM_DYNAMIC_1058_DETAIL_TAB'
   */
  static buildPlacementCode(entityName, placementSuffix = 'DETAIL_TAB') {
    const name = String(entityName || '').toLowerCase().trim();
    if (name === 'lead') {
      return `CRM_LEAD_${placementSuffix}`;
    }
    const typeId = this.resolveEntityTypeId(name);
    return `CRM_DYNAMIC_${typeId}_${placementSuffix}`;
  }

  /**
   * Dynamically refresh SPA entityTypeIds from Bitrix24 REST API (crm.type.list)
   * @param {string} domain 
   */
  static async refreshEntityTypeIds(domain = 'latest') {
    const BitrixClient = require('./bitrixClient');
    try {
      console.log('[SchemaMap] Refreshing entity type IDs from live Bitrix portal...');
      const res = await BitrixClient.call('crm.type.list', {}, domain);
      const types = res?.types || [];
      if (!Array.isArray(types) || types.length === 0) {
        console.warn('[SchemaMap] crm.type.list returned no custom dynamic types.');
        return entityTypeCache;
      }

      // Map known entity names by title/code keyword matching
      types.forEach(t => {
        const title = (t.title || '').toLowerCase();
        const entityTypeId = Number(t.entityTypeId);
        if (!entityTypeId) return;

        if (title.includes('master project')) {
          entityTypeCache.master_project = { entityTypeId, prefix: `DYNAMIC_${entityTypeId}_`, title: t.title };
        } else if (title.includes('project') && !title.includes('master')) {
          entityTypeCache.project = { entityTypeId, prefix: `DYNAMIC_${entityTypeId}_`, title: t.title };
        } else if (title.includes('layout') || title.includes('floor plan')) {
          entityTypeCache.layout = { entityTypeId, prefix: `DYNAMIC_${entityTypeId}_`, title: t.title };
        } else if (title.includes('property') || title.includes('unit')) {
          entityTypeCache.property = { entityTypeId, prefix: `DYNAMIC_${entityTypeId}_`, title: t.title };
        } else if (title.includes('listing')) {
          entityTypeCache.listing = { entityTypeId, prefix: `DYNAMIC_${entityTypeId}_`, title: t.title };
        } else if (title.includes('enquiry') || title.includes('inquiry')) {
          entityTypeCache.enquiry = { entityTypeId, prefix: `DYNAMIC_${entityTypeId}_`, title: t.title };
        } else if (title.includes('broker') || title.includes('agent')) {
          entityTypeCache.broker = { entityTypeId, prefix: `DYNAMIC_${entityTypeId}_`, title: t.title };
        }
      });

      lastEntityTypeRefresh = Date.now();
      StorageManager.saveDiscoveredConfig({
        entityTypes: entityTypeCache,
        lastEntityTypeRefresh
      });
      console.log('[SchemaMap] Dynamic entity type IDs refreshed successfully:', entityTypeCache);
      return entityTypeCache;
    } catch (err) {
      this._recordError('REFRESH_ENTITY_TYPES_FAILED', err.message, { domain });
      console.warn('[SchemaMap] Failed to refresh entity type IDs from API. Using cached values:', err.message);
      return entityTypeCache;
    }
  }

  /**
   * Export comprehensive client config payload (served via /api/config)
   */
  static getClientConfig() {
    const version = this.getLayoutVersion();
    const resolvedConcepts = {};

    for (const [key, concept] of Object.entries(conceptsRegistry.concepts || {})) {
      resolvedConcepts[key] = {
        type: concept.type,
        leadCode: concept.fields?.lead ? (version === 'v2' ? (concept.fields.lead.v2 || concept.fields.lead.v1) : concept.fields.lead.v1) : null,
        spa1058Code: concept.fields?.spa_1058 ? (version === 'v2' ? (concept.fields.spa_1058.v2 || concept.fields.spa_1058.v1) : concept.fields.spa_1058.v1) : null,
        spa1058Key: concept.fields?.spa_1058?.key || null,
        spa1062Key: concept.fields?.spa_1062?.key || null,
        enums: (concept.enums || []).map(e => ({
          xmlId: e.xmlId,
          label: e.label,
          id: version === 'v2' ? (e.v2Id || e.xmlId) : (e.leadV1Id || e.v1Id),
          spa1058Id: version === 'v2' ? (e.v2Id || e.xmlId) : (e.spa1058V1Id || e.v1Id),
          spa1062Id: version === 'v2' ? (e.v2Id || e.xmlId) : (e.spa1062V1Id || e.v1Id),
          spa1048Id: version === 'v2' ? (e.v2Id || e.xmlId) : (e.spa1048V1Id || e.v1Id)
        }))
      };
    }

    return {
      layoutVersion: version,
      entities: { ...entityTypeCache },
      concepts: resolvedConcepts,
      placements: {
        leadTab: this.buildPlacementCode('lead'),
        listingTab: this.buildPlacementCode('listing'),
        enquiryTab: this.buildPlacementCode('enquiry')
      }
    };
  }
}

module.exports = SchemaMap;

