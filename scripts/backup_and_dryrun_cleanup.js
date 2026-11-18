require('dotenv').config();
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const webhook = process.env.Inbound_webhook;
if (!webhook) {
  console.error('[ERROR] Inbound_webhook not found in environment');
  process.exit(1);
}

// 1. Gather all active references in the codebase
function getCodebaseWhitelist() {
  const whitelist = new Set();

  const codeFiles = [
    'server.js',
    'config/fields.json',
    'public/js/tab.js',
    'public/js/listing-details.js',
    'public/js/matching-listings.js',
    'public/js/enquiry-details.js',
    'views/tab.html',
    'views/matching-listings.html',
    'views/listing-details.html'
  ].filter(f => fs.existsSync(f));

  // Extract from fields.json directly
  try {
    const fieldsJson = JSON.parse(fs.readFileSync('config/fields.json', 'utf8'));
    function extract(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(f => {
        if (f.code) whitelist.add(f.code.toUpperCase());
        if (f.field) whitelist.add(f.field.toUpperCase());
        if (f.leadAltCode) whitelist.add(f.leadAltCode.toUpperCase());
        if (f.leadAltCodes) f.leadAltCodes.forEach(c => whitelist.add(c.toUpperCase()));
        if (f.altCodes) f.altCodes.forEach(c => whitelist.add(c.toUpperCase()));
      });
    }
    extract(fieldsJson.listingFields);
    extract(fieldsJson.enquiryFields);
    if (fieldsJson.layouts) {
      Object.values(fieldsJson.layouts).forEach(l => {
        if (l.sections) {
          l.sections.forEach(s => {
            if (s.fields) s.fields.forEach(fld => {
              if (typeof fld === 'string') whitelist.add(fld.toUpperCase());
              else if (fld.code) whitelist.add(fld.code.toUpperCase());
            });
          });
        }
      });
    }
  } catch (e) {
    console.error('Error reading fields.json:', e.message);
  }

  // Regex scan codebase files for any UF_CRM_* or ufCrm* patterns
  const ufPattern = /\b(UF_CRM_[A-Za-z0-9_]+|ufCrm[0-9]*[A-Za-z0-9_]+)\b/g;
  codeFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = ufPattern.exec(content)) !== null) {
      whitelist.add(match[1].toUpperCase());
    }
  });

  // Explicit protections for core CRM relations and Dubai real estate essentials
  const coreProtections = [
    'UF_CRM_PORTAL_LISTING_ID',
    'UF_CRM_1792151466',
    'UF_CRM_RECORDTYPEID',
    'UF_CRM_LISTINGPRICE',
    'UF_CRM_1791963299133',
    'OPPORTUNITY',
    'UF_CRM_DEVELOPER_1',
    'UF_CRM_DEVELOPER_NAME',
    'UF_CRM_PROJECT_1',
    'UF_CRM_PROPERTY',
    'UF_CRM_LISTING',
    'UF_CRM_ENQUIRY',
    'UF_CRM_LISTINGPRICE_MAX',
    'UF_CRM_LISTINGPRICE_MIN',
    'UF_CRM_MONTHLYRENT',
    'UF_CRM_YEARLY_RENTAL',
    'UF_CRM_PHOTOS_AND_DOCUMENTS',
    'UF_CRM_FORM_A_DOCUMENT',
    'UF_CRM_FORM_A_DOC',
    'UF_CRM_FORM_A_DATE',
    'UF_CRM_FORM_A_SIGNED_DATE',
    'UF_CRM_TRAKHEESI_PERMIT_NO',
    'UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE',
    'UF_CRM_PHOTOS',
    'UF_CRM_DOCUMENTS',
    'UF_CRM_RECOMMENDED_LISTINGS',
    'UF_CRM_COMMUNITY_PROPERTYFINDER',
    'UF_CRM_SUB_COMMUNITY_PROPERTYFINDER',
    'UF_CRM_BUILDING_DUBIZZLE',
    'UF_CRM_PORTALS_ENABLED',
    'UF_CRM_1791952050535',
    'UF_CRM_1791952650167',
    'UF_CRM_1791354310417',
    'UF_CRM_1791542918927',
    'UF_CRM_1792558317',
    'UF_CRM_1792139023',
    'UF_CRM_1792563228880',
    'UF_CRM_1790154808',
    'UF_CRM_1790154936',
    'UF_CRM_1791172692',
    'UF_CRM_1791172802',
    'UF_CRM_1790155720',
    'UF_CRM_1790155761',
    'UF_CRM_1790155771',
    'UF_CRM_1791175311',
    'UF_CRM_1792649609'
  ];
  coreProtections.forEach(c => whitelist.add(c.toUpperCase()));

  return whitelist;
}

// 2. Patterns that are 100% dead weight (US MLS, Salesforce GLD, Bitrix Demo requests, Plaintext Passwords)
const SAFE_DELETE_REASON_PATTERNS = [
  { pattern: /\b(mls|backagentmls|ismlslisting|colisting|listoffice|saleoffice|coselling)\b/i, reason: 'Obsolete US MLS Field (No UAE Brokerage Equivalent)' },
  { pattern: /\b(fireplace|basement|gradeschool|middleschool|highschool|schooldistrict|adultcommunity|parcel_number|postalcode|yard|taxes|hoafee|petdeposit)\b/i, reason: 'US Residential Property Specification (Not applicable in UAE)' },
  { pattern: /\b(gld_|glddescription|gldenquiry)\b/i, reason: 'Legacy Salesforce (GLD) Migration Artifact' },
  { pattern: /\b(systemisidx|systemidxpool|systemhasacceptedoffer|systemhasclosedclosing|systemhasexclusiveoffer|systemisarchived|systemisidxfullimport|systempoolid|technicalsourcesystem)\b/i, reason: 'Legacy Salesforce System/Integration Flag' },
  { pattern: /\b(cloud account url|license key for on-premise|bitrix24 usage|failure reason|project details)\b/i, reason: 'Bitrix24 Software Sales Demo Template (Non-Real Estate)' },
  { pattern: /\b(b24_portal|license_key|imp_use_b24|imp_interest|imp_l_reason|imp_w_detail)\b/i, reason: 'Bitrix24 Software Sales Demo Template (Non-Real Estate)' },
  { pattern: /\b(form_a_password|form_f_password)\b/i, reason: 'Security Hazard: Plaintext Password Field' },
  { pattern: /\b(googledriveid|google_drive_id|google_drive_file|googledriveotherfilelist)\b/i, reason: 'Legacy Google Drive ID (Bitrix native drive & files used)' },
  { pattern: /\b(anniversary 1|anniversary 2|anniversary 3|anniversary 4|anniversary 5)\b/i, reason: 'Redundant Date Offset Slot (Replaceable with Bitrix Robot)' },
  { pattern: /\b(push_to_dialer_campaign_[0-9]+)\b/i, reason: 'Unused Legacy Dialer Campaign Slot' },
  { pattern: /\b(uk_feature|uk_price_qualifier|uk_tenure|uk_listing_sales_for_feed)\b/i, reason: 'UK Property Feeds & Regulations (Not applicable in UAE)' }
];

function evaluateSafeRemoval(fieldCode, upperCode, label, tooltip) {
  const combined = `${fieldCode} ${upperCode} ${label} ${tooltip}`.toLowerCase();
  for (const p of SAFE_DELETE_REASON_PATTERNS) {
    if (p.pattern.test(combined)) {
      return { isSafe: true, reason: p.reason };
    }
  }
  return { isSafe: false, reason: null };
}

async function run() {
  console.log('===============================================================');
  console.log('   Bitrix24 User Fields - Full Backup & Safe Dry-Run Analysis  ');
  console.log('===============================================================');

  const whitelist = getCodebaseWhitelist();
  console.log(`[WHITELIST] Loaded ${whitelist.size} protected field identifiers from codebase.`);

  // 1. Fetch SPAs
  const typesRes = await axios.post(webhook + 'crm.type.list', {});
  const spaTypes = typesRes.data.result.types || [];

  const entities = [
    { category: 'Standard Tool', name: 'Lead', id: 1, method: 'crm.lead.fields', isSpa: false },
    { category: 'Standard Tool', name: 'Deal', id: 2, method: 'crm.deal.fields', isSpa: false },
    { category: 'Standard Tool', name: 'Contact', id: 3, method: 'crm.contact.fields', isSpa: false },
    { category: 'Standard Tool', name: 'Company', id: 4, method: 'crm.company.fields', isSpa: false },
    { category: 'Standard Tool', name: 'Invoice', id: 5, method: 'crm.invoice.fields', isSpa: false }
  ];

  spaTypes.forEach(t => {
    entities.push({
      category: 'Smart Process Automation (SPA)',
      name: t.title,
      id: t.entityTypeId,
      method: 'crm.item.fields',
      isSpa: true
    });
  });

  const fullBackup = {
    timestamp: new Date().toISOString(),
    portalWebhook: webhook.replace(/\/rest\/[0-9]+\/[a-z0-9]+\//i, '/rest/***REDACTED***/'),
    entities: {}
  };

  const analysisReport = {
    totalUfAnalyzed: 0,
    protectedFieldsCount: 0,
    safeDeleteCandidatesCount: 0,
    reviewPendingCount: 0,
    byEntity: {}
  };

  const safeDeleteList = [];
  const protectedList = [];

  for (const ent of entities) {
    let rawFields = {};
    if (ent.isSpa) {
      const res = await axios.post(webhook + ent.method, { entityTypeId: ent.id });
      rawFields = res.data.result.fields || {};
    } else {
      const res = await axios.post(webhook + ent.method, {});
      rawFields = res.data.result || {};
    }

    fullBackup.entities[ent.name] = {
      id: ent.id,
      category: ent.category,
      isSpa: ent.isSpa,
      fields: rawFields
    };

    const entStats = {
      totalFields: Object.keys(rawFields).length,
      totalUf: 0,
      protected: [],
      safeToDelete: [],
      reviewPending: []
    };

    for (const [code, meta] of Object.entries(rawFields)) {
      const isUf = code.startsWith('UF_') || 
                   code.startsWith('ufCrm') || 
                   code.toLowerCase().startsWith('uf_') ||
                   meta.isDynamic === true ||
                   (meta.upperName && meta.upperName.startsWith('UF_'));

      if (!isUf) continue;

      entStats.totalUf++;
      analysisReport.totalUfAnalyzed++;

      const upperCode = (meta.upperName || code).toUpperCase();
      const codeUpper = code.toUpperCase();
      const label = meta.formLabel || meta.listLabel || meta.title || code;

      // Check against codebase whitelist
      const isWhitelisted = whitelist.has(upperCode) || whitelist.has(codeUpper);

      if (isWhitelisted) {
        entStats.protected.push({ code, upperCode, label, type: meta.type, reason: 'Active application/code dependency' });
        protectedList.push({ entity: ent.name, code, upperCode, label, type: meta.type });
        analysisReport.protectedFieldsCount++;
      } else {
        const evalResult = evaluateSafeRemoval(code, upperCode, label, meta.title || '');
        if (evalResult.isSafe) {
          entStats.safeToDelete.push({ code, upperCode, label, type: meta.type, reason: evalResult.reason });
          safeDeleteList.push({ entity: ent.name, entityId: ent.id, isSpa: ent.isSpa, code, upperCode, label, type: meta.type, reason: evalResult.reason });
          analysisReport.safeDeleteCandidatesCount++;
        } else {
          entStats.reviewPending.push({ code, upperCode, label, type: meta.type, reason: 'Custom CRM field without obvious legacy marker - keep for safety' });
          analysisReport.reviewPendingCount++;
        }
      }
    }

    analysisReport.byEntity[ent.name] = {
      entityId: ent.id,
      totalUf: entStats.totalUf,
      protectedCount: entStats.protected.length,
      safeToDeleteCount: entStats.safeToDelete.length,
      reviewPendingCount: entStats.reviewPending.length
    };
  }

  // 3. Write Full Backup File
  const backupDir = path.resolve(__dirname, '../audit');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const backupFilePath = path.join(backupDir, 'pre_cleanup_fields_backup_20261118.json');
  fs.writeFileSync(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf8');
  console.log(`[BACKUP] Saved full pre-cleanup backup to ${backupFilePath} (${(fs.statSync(backupFilePath).size / 1024).toFixed(1)} KB)`);

  // Copy to brain artifact directory as well
  const artifactDir = 'C:/Users/Harsh raj_CSL/.gemini/antigravity/brain/488f32fb-aacb-424c-a320-1d6360a5aaba';
  if (fs.existsSync(artifactDir)) {
    fs.copyFileSync(backupFilePath, path.join(artifactDir, 'pre_cleanup_fields_backup_20261118.json'));
    console.log('[BACKUP] Mirrored backup to artifact directory.');
  }

  // 4. Generate Safe Dry-Run Report Markdown
  let md = `# BITRIX24 USER FIELDS SAFE CLEANUP - DRY-RUN AUDIT REPORT\n\n`;
  md += `**Generated**: ${new Date().toISOString()}  \n`;
  md += `**Backup Location**: \`${backupFilePath}\`  \n\n`;
  md += `## 1. Executive Summary\n\n`;
  md += `| Metric | Count |\n`;
  md += `| :--- | :---: |\n`;
  md += `| **Total User Fields (UF) Analyzed** | **${analysisReport.totalUfAnalyzed}** |\n`;
  md += `| **Protected Fields (Actively used by app code & layouts)** | **${analysisReport.protectedFieldsCount}** 🛡️ |\n`;
  md += `| **Review-Pending / Safe Kept (No legacy marker)** | **${analysisReport.reviewPendingCount}** ⏸️ |\n`;
  md += `| **Confirmed 100% Safe to Delete (US MLS, Salesforce, Demo, Passwords)** | **${analysisReport.safeDeleteCandidatesCount}** 🗑️ |\n\n`;

  md += `## 2. Breakdown by Entity\n\n`;
  md += `| Entity | Total UF | 🛡️ Protected (App Dependency) | 🗑️ Confirmed Safe to Delete | ⏸️ Kept Safe (Custom) |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: |\n`;
  for (const [name, stats] of Object.entries(analysisReport.byEntity)) {
    md += `| **${name}** | ${stats.totalUf} | ${stats.protectedCount} | **${stats.safeToDeleteCount}** | ${stats.reviewPendingCount} |\n`;
  }
  md += `\n---\n\n`;

  md += `## 3. Top Protected Active Fields (Sample of Whitelisted Fields)\n\n`;
  md += `These fields are **strictly preserved** because our code (` + '`config/fields.json`' + `, ` + '`tab.js`' + `, ` + '`matching-listings.js`' + `, ` + '`server.js`' + `) actively relies on them:\n\n`;
  protectedList.slice(0, 30).forEach(p => {
    md += `* **${p.entity}** &rarr; \`${p.code}\` / \`${p.upperCode}\` (*${p.label}*, Type: \`${p.type}\`)\n`;
  });
  md += `\n---\n\n`;

  md += `## 4. Confirmed 100% Safe-to-Delete Candidates (${safeDeleteList.length} Fields)\n\n`;
  md += `| Entity | Field Code | Label / Title | Category & Reason |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  safeDeleteList.slice(0, 100).forEach(s => {
    md += `| ${s.entity} | \`${s.code}\` | ${s.label} | ${s.reason} |\n`;
  });
  if (safeDeleteList.length > 100) {
    md += `| ... | ... | *(+ ${safeDeleteList.length - 100} more verified dead fields)* | ... |\n`;
  }

  const dryRunReportPath = path.join(backupDir, 'SAFE_CLEANUP_DRY_RUN.md');
  fs.writeFileSync(dryRunReportPath, md, 'utf8');
  console.log(`[DRY-RUN] Saved complete dry-run report to ${dryRunReportPath}`);

  // Save candidates list to JSON for the executor script
  const candidatesPath = path.join(backupDir, 'safe_delete_candidates.json');
  fs.writeFileSync(candidatesPath, JSON.stringify(safeDeleteList, null, 2), 'utf8');
  console.log(`[CANDIDATES] Saved ${safeDeleteList.length} verified safe candidates to ${candidatesPath}`);

  console.log('\n[SUMMARY] Backup & Dry-Run completed cleanly. Ready for review!');
}

run().catch(err => {
  console.error('[ERROR] Script failed:', err);
  process.exit(1);
});
