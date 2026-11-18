/**
 * scripts/export_complete_database_excel.js
 * Generates an end-to-end, multi-tab Excel workbook of the complete Bitrix24 CRM database:
 * - Standard CRM Tools (Leads, Deals, Contacts, Companies)
 * - All Smart Process Automations (SPAs 1040, 1044, 1048, 1052, 1058, 1062, 1070, 1074, 1094)
 * - Master Schema & Data Dictionary (Field types, codes, labels, enums, required flags)
 * - Live Records Export for each entity
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const BitrixClient = require('../src/bitrixClient');

const OUTPUT_FILE = path.resolve(__dirname, '../Bitrix24_Complete_Database_Export.xlsx');

const SPAS = [
  { id: 8, entityTypeId: 1040, title: 'Master Project', category: 'SPA' },
  { id: 10, entityTypeId: 1044, title: 'Project', category: 'SPA' },
  { id: 12, entityTypeId: 1048, title: 'Layout', category: 'SPA' },
  { id: 14, entityTypeId: 1052, title: 'Property', category: 'SPA' },
  { id: 16, entityTypeId: 1058, title: 'Listing', category: 'SPA' },
  { id: 18, entityTypeId: 1062, title: 'Enquiry', category: 'SPA' },
  { id: 22, entityTypeId: 1070, title: 'Offer', category: 'SPA' },
  { id: 24, entityTypeId: 1074, title: 'Closing', category: 'SPA' },
  { id: 34, entityTypeId: 1094, title: 'Brokers', category: 'SPA' }
];

const STANDARD_TOOLS = [
  { key: 'lead', title: 'Leads', fieldsMethod: 'crm.lead.fields', listMethod: 'crm.lead.list', category: 'Standard Tool' },
  { key: 'deal', title: 'Deals', fieldsMethod: 'crm.deal.fields', listMethod: 'crm.deal.list', category: 'Standard Tool' },
  { key: 'contact', title: 'Contacts', fieldsMethod: 'crm.contact.fields', listMethod: 'crm.contact.list', category: 'Standard Tool' },
  { key: 'company', title: 'Companies', fieldsMethod: 'crm.company.fields', listMethod: 'crm.company.list', category: 'Standard Tool' }
];

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1A365D' } // Corporate dark navy
};

const HEADER_FONT = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' }
};

const BORDER_STYLE = {
  top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
};

function styleHeaderRow(row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER_STYLE;
  });
}

function autoFitColumns(worksheet, minWidth = 12) {
  worksheet.columns.forEach((column) => {
    let maxLength = minWidth;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const valStr = cell.value ? String(cell.value) : '';
      if (valStr.length > maxLength && valStr.length < 80) {
        maxLength = valStr.length;
      }
    });
    column.width = Math.min(maxLength + 3, 50);
  });
}

async function safeFetch(method, params = {}) {
  try {
    return await BitrixClient.call(method, params);
  } catch (err) {
    console.warn(`[WARN] Fetch failed for ${method}:`, err.message);
    return null;
  }
}

async function fetchAllItems(entityTypeId, maxRecords = 100) {
  const all = [];
  let start = 0;
  while (all.length < maxRecords) {
    const res = await safeFetch('crm.item.list', {
      entityTypeId,
      select: ['*', 'UF_*'],
      start
    });
    const items = res?.items || (Array.isArray(res) ? res : []);
    if (!items || items.length === 0) break;
    all.push(...items);
    if (!res.next) break;
    start = res.next;
  }
  return all;
}

async function fetchStandardItems(method, maxRecords = 100) {
  const all = [];
  let start = 0;
  while (all.length < maxRecords) {
    const res = await safeFetch(method, {
      select: ['*', 'UF_*'],
      start
    });
    const items = res?.items || (Array.isArray(res) ? res : []);
    if (!items || items.length === 0) break;
    all.push(...items);
    if (!res.next) break;
    start = res.next;
  }
  return all;
}

async function generateDatabaseWorkbook() {
  console.log('=== STARTING BITRIX24 COMPLETE DATABASE EXCEL EXPORT ===\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Antigravity AI Assistant';
  workbook.created = new Date();

  const overviewData = [];
  const dictionaryRows = [];

  // -------------------------------------------------------------------------
  // 1. EXTRACT SCHEMAS FOR STANDARD TOOLS
  // -------------------------------------------------------------------------
  console.log('[1/4] Querying Field Schemas for Standard CRM Tools...');
  for (const tool of STANDARD_TOOLS) {
    process.stdout.write(`  - Fetching ${tool.title}... `);
    const fieldsRes = await safeFetch(tool.fieldsMethod);
    const fields = fieldsRes?.fields || fieldsRes || {};
    const fieldKeys = Object.keys(fields);
    console.log(`${fieldKeys.length} fields`);

    overviewData.push({
      category: tool.category,
      entity: tool.title,
      typeId: 'Standard',
      fieldCount: fieldKeys.length,
      recordCount: 0 // Will populate next
    });

    for (const [key, def] of Object.entries(fields)) {
      let enumStr = '';
      if (def.items && Array.isArray(def.items)) {
        enumStr = def.items.map(i => `${i.ID || i.id}: ${i.VALUE || i.value}`).join(' | ');
      }
      dictionaryRows.push({
        category: tool.category,
        entity: tool.title,
        typeId: 'Standard',
        fieldCode: key,
        crmCode: def.upperName || key.toUpperCase(),
        title: def.title || def.formLabel || def.listLabel || key,
        type: def.type || 'string',
        isRequired: def.isRequired ? 'Yes' : 'No',
        isReadOnly: def.isReadOnly ? 'Yes' : 'No',
        isMultiple: def.isMultiple ? 'Yes' : 'No',
        enumOptions: enumStr
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. EXTRACT SCHEMAS FOR SPAS
  // -------------------------------------------------------------------------
  console.log('\n[2/4] Querying Field Schemas for Smart Process Automations (SPAs)...');
  for (const spa of SPAS) {
    process.stdout.write(`  - Fetching ${spa.title} (SPA ${spa.entityTypeId})... `);
    const fieldsRes = await safeFetch('crm.item.fields', { entityTypeId: spa.entityTypeId });
    const fields = fieldsRes?.fields || fieldsRes || {};
    const fieldKeys = Object.keys(fields);
    console.log(`${fieldKeys.length} fields`);

    overviewData.push({
      category: spa.category,
      entity: spa.title,
      typeId: spa.entityTypeId,
      fieldCount: fieldKeys.length,
      recordCount: 0 // Will populate next
    });

    for (const [key, def] of Object.entries(fields)) {
      let enumStr = '';
      if (def.items && Array.isArray(def.items)) {
        enumStr = def.items.map(i => `${i.ID || i.id}: ${i.VALUE || i.value}`).join(' | ');
      }
      dictionaryRows.push({
        category: spa.category,
        entity: spa.title,
        typeId: spa.entityTypeId,
        fieldCode: key,
        crmCode: def.upperName || key,
        title: def.title || def.formLabel || def.listLabel || key,
        type: def.type || 'string',
        isRequired: def.isRequired ? 'Yes' : 'No',
        isReadOnly: def.isReadOnly ? 'Yes' : 'No',
        isMultiple: def.isMultiple ? 'Yes' : 'No',
        enumOptions: enumStr
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. FETCH LIVE RECORDS
  // -------------------------------------------------------------------------
  console.log('\n[3/4] Exporting Live Records for each database entity...');

  const liveDataMap = {};

  // Standard entities
  for (const tool of STANDARD_TOOLS) {
    process.stdout.write(`  - Fetching live records for ${tool.title}... `);
    const items = await fetchStandardItems(tool.listMethod, 100);
    liveDataMap[tool.key] = items;
    console.log(`${items.length} records`);
    const ov = overviewData.find(o => o.entity === tool.title);
    if (ov) ov.recordCount = items.length;
  }

  // SPAs
  for (const spa of SPAS) {
    process.stdout.write(`  - Fetching live records for ${spa.title} (SPA ${spa.entityTypeId})... `);
    const items = await fetchAllItems(spa.entityTypeId, 100);
    liveDataMap[spa.entityTypeId] = items;
    console.log(`${items.length} records`);
    const ov = overviewData.find(o => o.typeId === spa.entityTypeId);
    if (ov) ov.recordCount = items.length;
  }

  // -------------------------------------------------------------------------
  // 4. ASSEMBLE EXCEL SHEETS
  // -------------------------------------------------------------------------
  console.log('\n[4/4] Writing and styling Excel worksheets...');

  // --- SHEET 1: DATABASE OVERVIEW ---
  const wsOverview = workbook.addWorksheet('0. DATABASE OVERVIEW', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsOverview.columns = [
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Entity Name', key: 'entity', width: 22 },
    { header: 'Entity Type ID', key: 'typeId', width: 16 },
    { header: 'Total Fields in Schema', key: 'fieldCount', width: 22 },
    { header: 'Active Live Records', key: 'recordCount', width: 20 },
    { header: 'Description / Purpose in CRM', key: 'desc', width: 45 }
  ];
  styleHeaderRow(wsOverview.getRow(1));

  const descriptions = {
    'Leads': 'Inbound enquiries and new property inquiries prior to qualification',
    'Deals': 'Sales and rental transaction pipelines and active escrow negotiations',
    'Contacts': 'Individual buyers, sellers, landlords, tenants, and external brokers',
    'Companies': 'Real estate developers, agencies, banks, and legal entities',
    'Master Project': 'High-level master community definitions (e.g. Downtown Dubai, Palm Jumeirah)',
    'Project': 'Specific towers and sub-developments within master projects',
    'Layout': 'Floor plan types, unit architecture specifications, and typical layouts',
    'Property': 'Physical property units with title deed, unit number, and floor details',
    'Listing': 'Market-facing listing records published to portals (Bayut, Dubizzle, PF)',
    'Enquiry': 'Qualified client property search briefs with budget, bedroom, and area criteria',
    'Offer': 'Formal written offers made by buyers/tenants on listings',
    'Closing': 'Finalized deals with agreed commission splits and payment schedules',
    'Brokers': 'External co-broke agents and external network brokerage listings'
  };

  overviewData.forEach(item => {
    const row = wsOverview.addRow({
      category: item.category,
      entity: item.entity,
      typeId: item.typeId,
      fieldCount: item.fieldCount,
      recordCount: item.recordCount,
      desc: descriptions[item.entity] || ''
    });
    row.height = 20;
    row.getCell('recordCount').alignment = { horizontal: 'right' };
    row.getCell('fieldCount').alignment = { horizontal: 'right' };
    row.getCell('typeId').alignment = { horizontal: 'center' };
  });
  autoFitColumns(wsOverview);

  // --- SHEET 2: COMPLETE DATA DICTIONARY ---
  const wsDict = workbook.addWorksheet('1. COMPLETE DATA DICTIONARY', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsDict.columns = [
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Entity Name', key: 'entity', width: 18 },
    { header: 'Entity ID', key: 'typeId', width: 12 },
    { header: 'Field Key / Code', key: 'fieldCode', width: 28 },
    { header: 'CRM Code (Upper)', key: 'crmCode', width: 28 },
    { header: 'Field Label / Title', key: 'title', width: 30 },
    { header: 'Data Type', key: 'type', width: 15 },
    { header: 'Required', key: 'isRequired', width: 12 },
    { header: 'Read Only', key: 'isReadOnly', width: 12 },
    { header: 'Multiple', key: 'isMultiple', width: 12 },
    { header: 'Enumeration Values / Options', key: 'enumOptions', width: 60 }
  ];
  styleHeaderRow(wsDict.getRow(1));

  dictionaryRows.forEach(item => {
    const row = wsDict.addRow(item);
    row.height = 19;
    row.getCell('typeId').alignment = { horizontal: 'center' };
    row.getCell('isRequired').alignment = { horizontal: 'center' };
    row.getCell('isReadOnly').alignment = { horizontal: 'center' };
    row.getCell('isMultiple').alignment = { horizontal: 'center' };
  });
  autoFitColumns(wsDict);

  // Helper to add a generic records sheet
  function addRecordsSheet(sheetName, items, columnDefs) {
    const ws = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columnDefs;
    styleHeaderRow(ws.getRow(1));

    items.forEach(raw => {
      const rowData = {};
      columnDefs.forEach(col => {
        const val = raw[col.key];
        if (val === undefined || val === null) {
          rowData[col.key] = '';
        } else if (typeof val === 'object') {
          if (Array.isArray(val)) {
            rowData[col.key] = val.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
          } else {
            rowData[col.key] = val.VALUE || val.value || val.amount || JSON.stringify(val);
          }
        } else {
          rowData[col.key] = val;
        }
      });
      const r = ws.addRow(rowData);
      r.height = 20;
    });
    autoFitColumns(ws);
    return ws;
  }

  // --- SHEET 3: LISTINGS DATA (SPA 1058) ---
  addRecordsSheet('SPA - Listings (1058)', liveDataMap[1058] || [], [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Listing Title', key: 'title', width: 35 },
    { header: 'Listing Type Enum', key: 'ufCrm16_1790154808', width: 18 },
    { header: 'Record Type Enum', key: 'ufCrm16RecordType', width: 18 },
    { header: 'Property Type', key: 'ufCrm16PropertyType', width: 16 },
    { header: 'Bedrooms', key: 'ufCrm16_1791172802', width: 12 },
    { header: 'Listing Price (AED)', key: 'ufCrm16_1790154936', width: 20 },
    { header: 'Price Field', key: 'ufCrm16Price', width: 18 },
    { header: 'Monthly Rent', key: 'ufCrm16MonthlyRent', width: 18 },
    { header: 'Yearly Rental', key: 'ufCrm16YearlyRental', width: 18 },
    { header: 'Area / Community', key: 'ufCrm16_1791172692', width: 22 },
    { header: 'PF Community', key: 'ufCrm16CommunityPropertyfinder', width: 22 },
    { header: 'Furnished Enum', key: 'ufCrm16Furnished', width: 16 },
    { header: 'Stage ID', key: 'stageId', width: 18 },
    { header: 'Created Time', key: 'createdTime', width: 22 }
  ]);

  // --- SHEET 4: ENQUIRIES DATA (SPA 1062) ---
  addRecordsSheet('SPA - Enquiries (1062)', liveDataMap[1062] || [], [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Enquiry Title', key: 'title', width: 35 },
    { header: 'Listing Type (Enquiry)', key: 'ufCrm18ListingType', width: 20 },
    { header: 'Property Type', key: 'ufCrm18_1790155720', width: 16 },
    { header: 'Bedrooms Min', key: 'ufCrm18BedroomsMin', width: 14 },
    { header: 'Bedrooms Max', key: 'ufCrm18BedroomsMax', width: 14 },
    { header: 'Sale Price Min', key: 'ufCrm18PriceMin', width: 18 },
    { header: 'Sale Price Max', key: 'ufCrm18PriceMax', width: 18 },
    { header: 'Rent Min', key: 'ufCrm18MonthlyRentMin', width: 18 },
    { header: 'Rent Max', key: 'ufCrm18MonthlyRentMax', width: 18 },
    { header: 'Area / Location', key: 'ufCrm18_1791175311', width: 22 },
    { header: 'Furnished Flag', key: 'ufCrm18Furnished', width: 16 },
    { header: 'Stage ID', key: 'stageId', width: 18 },
    { header: 'Created Time', key: 'createdTime', width: 22 }
  ]);

  // --- SHEET 5: PROPERTIES DATA (SPA 1052) ---
  addRecordsSheet('SPA - Properties (1052)', liveDataMap[1052] || [], [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Property Title / Unit', key: 'title', width: 35 },
    { header: 'Stage ID', key: 'stageId', width: 18 },
    { header: 'Parent Project', key: 'parentId1044', width: 16 },
    { header: 'Parent Master Project', key: 'parentId1040', width: 18 },
    { header: 'Created Time', key: 'createdTime', width: 22 }
  ]);

  // --- SHEET 6: PROJECTS DATA (SPA 1044) ---
  addRecordsSheet('SPA - Projects (1044)', liveDataMap[1044] || [], [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Project Name', key: 'title', width: 35 },
    { header: 'Stage ID', key: 'stageId', width: 18 },
    { header: 'Parent Master Project', key: 'parentId1040', width: 22 },
    { header: 'Created Time', key: 'createdTime', width: 22 }
  ]);

  // --- SHEET 7: MASTER PROJECTS DATA (SPA 1040) ---
  addRecordsSheet('SPA - Master Projects (1040)', liveDataMap[1040] || [], [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Master Project Name', key: 'title', width: 35 },
    { header: 'Stage ID', key: 'stageId', width: 18 },
    { header: 'Created Time', key: 'createdTime', width: 22 }
  ]);

  // --- SHEET 8: LAYOUTS DATA (SPA 1048) ---
  addRecordsSheet('SPA - Layouts (1048)', liveDataMap[1048] || [], [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Layout Title', key: 'title', width: 35 },
    { header: 'Stage ID', key: 'stageId', width: 18 },
    { header: 'Parent Project', key: 'parentId1044', width: 18 },
    { header: 'Created Time', key: 'createdTime', width: 22 }
  ]);

  // --- SHEET 9: OFFERS & CLOSINGS DATA (SPAs 1070 & 1074) ---
  const offersClosings = [
    ...(liveDataMap[1070] || []).map(o => ({ ...o, _entity: 'Offer (1070)' })),
    ...(liveDataMap[1074] || []).map(c => ({ ...c, _entity: 'Closing (1074)' }))
  ];
  addRecordsSheet('SPA - Offers & Closings', offersClosings, [
    { header: 'Type', key: '_entity', width: 16 },
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Title', key: 'title', width: 35 },
    { header: 'Opportunity / Amount', key: 'opportunity', width: 22 },
    { header: 'Currency', key: 'currencyId', width: 12 },
    { header: 'Stage ID', key: 'stageId', width: 18 },
    { header: 'Created Time', key: 'createdTime', width: 22 }
  ]);

  // --- SHEET 10: STANDARD TOOLS - LEADS ---
  addRecordsSheet('Standard - Leads', liveDataMap['lead'] || [], [
    { header: 'ID', key: 'ID', width: 10 },
    { header: 'Lead Title', key: 'TITLE', width: 35 },
    { header: 'Status / Stage', key: 'STATUS_ID', width: 18 },
    { header: 'Opportunity', key: 'OPPORTUNITY', width: 16 },
    { header: 'Currency', key: 'CURRENCY_ID', width: 12 },
    { header: 'Lead Type Enum', key: 'UF_CRM_1791952650167', width: 18 },
    { header: 'Listing Type Enum', key: 'UF_CRM_LISTING_TYPE', width: 18 },
    { header: 'Responsible Person ID', key: 'ASSIGNED_BY_ID', width: 20 },
    { header: 'Date Created', key: 'DATE_CREATE', width: 22 }
  ]);

  // --- SHEET 11: STANDARD TOOLS - DEALS, CONTACTS & COMPANIES ---
  const dealsAndContacts = [
    ...(liveDataMap['deal'] || []).map(d => ({ ...d, _type: 'Deal', _id: d.ID, _title: d.TITLE, _stage: d.STAGE_ID })),
    ...(liveDataMap['contact'] || []).map(c => ({ ...c, _type: 'Contact', _id: c.ID, _title: `${c.NAME || ''} ${c.LAST_NAME || ''}`.trim() || 'Contact #' + c.ID, _stage: '' })),
    ...(liveDataMap['company'] || []).map(co => ({ ...co, _type: 'Company', _id: co.ID, _title: co.TITLE || 'Company #' + co.ID, _stage: '' }))
  ];
  addRecordsSheet('Standard - Deals & Contacts', dealsAndContacts, [
    { header: 'Tool Category', key: '_type', width: 16 },
    { header: 'ID', key: '_id', width: 10 },
    { header: 'Name / Title', key: '_title', width: 35 },
    { header: 'Stage / Status', key: '_stage', width: 18 },
    { header: 'Opportunity', key: 'OPPORTUNITY', width: 16 },
    { header: 'Currency', key: 'CURRENCY_ID', width: 12 },
    { header: 'Date Created', key: 'DATE_CREATE', width: 22 }
  ]);

  console.log(`\nWriting workbook to disk: ${OUTPUT_FILE}...`);
  await workbook.xlsx.writeFile(OUTPUT_FILE);
  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`\n✓ SUCCESS! Complete Database Excel generated: ${OUTPUT_FILE}`);
  console.log(`  File size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`  Total worksheets: ${workbook.worksheets.length}`);
}

generateDatabaseWorkbook().catch(err => {
  console.error('\n✗ FATAL ERROR:', err);
  process.exit(1);
});
