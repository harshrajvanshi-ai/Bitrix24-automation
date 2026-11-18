require('dotenv').config();
const axios = require('axios');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const webhook = process.env.Inbound_webhook;
if (!webhook) {
  console.error('[ERROR] Inbound_webhook not found in environment');
  process.exit(1);
}

// Styling constants
const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1B365D' } // Deep Navy
};
const HEADER_FONT = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' }
};
const SUBHEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF2A52BE' } // Lighter Blue
};
const ZEBRA_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8F9FA' }
};
const BORDER_STYLE = {
  top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
};

function formatEnumOptions(items) {
  if (!items || !Array.isArray(items) || items.length === 0) return '';
  return items.map(it => `[${it.ID || it.id}] ${it.VALUE || it.value}`).join('\n');
}

function formatSettings(type, settings) {
  if (!settings || typeof settings !== 'object') return '';
  if (type === 'crm') {
    const targets = [];
    if (settings.LEAD === 'Y') targets.push('Lead');
    if (settings.CONTACT === 'Y') targets.push('Contact');
    if (settings.COMPANY === 'Y') targets.push('Company');
    if (settings.DEAL === 'Y') targets.push('Deal');
    if (settings.DYNAMIC) {
      Object.keys(settings.DYNAMIC).forEach(dynId => {
        if (settings.DYNAMIC[dynId] === 'Y') targets.push(`SPA #${dynId}`);
      });
    }
    return targets.length > 0 ? `Linked: ${targets.join(', ')}` : JSON.stringify(settings);
  }
  return Object.entries(settings)
    .filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function cleanLabel(meta, code) {
  return meta.formLabel || meta.listLabel || meta.filterLabel || meta.title || code;
}

async function fetchAllSchema() {
  console.log('[EXPORT] 1. Fetching SPA types from Bitrix24...');
  const typesRes = await axios.post(webhook + 'crm.type.list', {});
  const spaTypes = typesRes.data.result.types || [];
  console.log(`[EXPORT] Found ${spaTypes.length} SPAs.`);

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

  const results = [];

  for (const ent of entities) {
    console.log(`[EXPORT] Fetching fields for ${ent.name} (ID: ${ent.id})...`);
    try {
      let rawFields = {};
      if (ent.isSpa) {
        const res = await axios.post(webhook + ent.method, { entityTypeId: ent.id });
        rawFields = res.data.result.fields || {};
      } else {
        const res = await axios.post(webhook + ent.method, {});
        rawFields = res.data.result || {};
      }

      const totalFields = Object.keys(rawFields).length;
      const ufFields = [];

      for (const [code, meta] of Object.entries(rawFields)) {
        const isUf = code.startsWith('UF_') || 
                     code.startsWith('ufCrm') || 
                     code.toLowerCase().startsWith('uf_') ||
                     meta.isDynamic === true ||
                     (meta.upperName && meta.upperName.startsWith('UF_'));
        
        if (isUf) {
          ufFields.push({
            code: code,
            upperCode: meta.upperName || code,
            label: cleanLabel(meta, code),
            type: meta.type || 'string',
            isRequired: meta.isRequired ? 'Yes' : 'No',
            isMultiple: meta.isMultiple ? 'Yes' : 'No',
            isReadOnly: meta.isReadOnly ? 'Yes' : 'No',
            options: formatEnumOptions(meta.items),
            optionsCount: Array.isArray(meta.items) ? meta.items.length : 0,
            settings: formatSettings(meta.type, meta.settings)
          });
        }
      }

      results.push({
        ...ent,
        totalFields,
        ufCount: ufFields.length,
        fields: ufFields
      });

      console.log(`  -> ${ent.name}: Total ${totalFields} fields, ${ufFields.length} User Fields (UF)`);
    } catch (err) {
      console.error(`  -> Failed fetching ${ent.name}:`, err.response?.data || err.message);
    }
  }

  return results;
}

async function generateExcel(entityResults, outputPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Antigravity Real Estate Engine';
  workbook.created = new Date();

  // ==========================================
  // SHEET 1: Overview & Summary
  // ==========================================
  const summarySheet = workbook.addWorksheet('Overview & Summary', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 4 }]
  });

  // Title Banner
  summarySheet.mergeCells('A1:F2');
  const bannerCell = summarySheet.getCell('A1');
  bannerCell.value = 'BITRIX24 CRM - USER FIELDS (UF) ARCHITECTURE & SCHEMA CATALOG';
  bannerCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerCell.fill = HEADER_FILL;
  bannerCell.alignment = { horizontal: 'center', vertical: 'middle' };

  summarySheet.getRow(3).values = []; // Empty spacing row

  // Table Headers
  summarySheet.getRow(4).values = [
    'Category',
    'Entity / Tool Name',
    'Entity Type ID',
    'Total Fields',
    'Custom UF Fields',
    'Sheet Reference'
  ];
  summarySheet.getRow(4).eachCell(cell => {
    cell.font = HEADER_FONT;
    cell.fill = SUBHEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let totalUfOverall = 0;
  let totalFieldsOverall = 0;

  entityResults.forEach((ent, idx) => {
    const rowNum = 5 + idx;
    totalUfOverall += ent.ufCount;
    totalFieldsOverall += ent.totalFields;

    const row = summarySheet.getRow(rowNum);
    row.values = [
      ent.category,
      ent.name,
      ent.id,
      ent.totalFields,
      ent.ufCount,
      `${ent.name.substring(0, 20)} (UF)`
    ];

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.border = BORDER_STYLE;
      if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
      if (colNum === 3 || colNum === 4 || colNum === 5) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
  });

  // Summary Total Row
  const totalRowNum = 5 + entityResults.length;
  const totalRow = summarySheet.getRow(totalRowNum);
  totalRow.values = [
    'TOTAL',
    `${entityResults.length} Entities & SPAs`,
    '-',
    totalFieldsOverall,
    totalUfOverall,
    'All Sheets'
  ];
  totalRow.eachCell(cell => {
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1B365D' } };
    cell.border = { top: { style: 'medium' }, bottom: { style: 'double' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  summarySheet.columns = [
    { width: 32 },
    { width: 30 },
    { width: 16 },
    { width: 16 },
    { width: 20 },
    { width: 28 }
  ];

  // ==========================================
  // SHEET 2: All User Fields (Master)
  // ==========================================
  const masterSheet = workbook.addWorksheet('All User Fields (Master)', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }]
  });

  masterSheet.getRow(1).values = [
    'Entity Category',
    'Entity Name',
    'Entity Type ID',
    'Field Code',
    'Upper Code',
    'Field Label / Title',
    'Field Type',
    'Required?',
    'Multiple?',
    'Options Count',
    'Enumeration Values / Targets',
    'Settings & References'
  ];
  masterSheet.getRow(1).eachCell(cell => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  let masterRowIdx = 2;
  entityResults.forEach(ent => {
    ent.fields.forEach(f => {
      const row = masterSheet.getRow(masterRowIdx);
      row.values = [
        ent.category,
        ent.name,
        ent.id,
        f.code,
        f.upperCode,
        f.label,
        f.type,
        f.isRequired,
        f.isMultiple,
        f.optionsCount,
        f.options,
        f.settings
      ];

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Segoe UI', size: 9 };
        cell.border = BORDER_STYLE;
        if (masterRowIdx % 2 === 1) cell.fill = ZEBRA_FILL;
        if (colNum === 3 || colNum === 7 || colNum === 8 || colNum === 9 || colNum === 10) {
          cell.alignment = { horizontal: 'center', vertical: 'top' };
        } else {
          cell.alignment = { vertical: 'top', wrapText: colNum >= 11 };
        }
      });
      masterRowIdx++;
    });
  });

  masterSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: masterRowIdx - 1, column: 12 }
  };

  masterSheet.columns = [
    { width: 24 },
    { width: 22 },
    { width: 14 },
    { width: 28 },
    { width: 28 },
    { width: 32 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 45 },
    { width: 35 }
  ];

  // ==========================================
  // DEDICATED SHEETS FOR EACH ENTITY / SPA
  // ==========================================
  entityResults.forEach(ent => {
    // Worksheet name cannot exceed 31 chars
    let tabName = ent.isSpa ? `${ent.name.substring(0, 18)} [${ent.id}]` : `${ent.name} (UF)`;
    tabName = tabName.replace(/[:\\/?*\[\]]/g, '').trim().substring(0, 31);

    const sheet = workbook.addWorksheet(tabName, {
      views: [{ showGridLines: true, state: 'frozen', ySplit: 3 }]
    });

    // Sheet Banner
    sheet.mergeCells('A1:I1');
    const headerBanner = sheet.getCell('A1');
    headerBanner.value = `${ent.category.toUpperCase()}: ${ent.name.toUpperCase()} (ID: ${ent.id}) - USER FIELDS SCHEMA (${ent.ufCount} Fields)`;
    headerBanner.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    headerBanner.fill = HEADER_FILL;
    headerBanner.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    sheet.getRow(2).values = []; // spacing

    // Column Headers
    sheet.getRow(3).values = [
      '#',
      'Field Code',
      'Upper Code',
      'Field Label / Title',
      'Field Type',
      'Required?',
      'Multiple?',
      'Enum Options / Linked References',
      'Configuration & Settings'
    ];
    sheet.getRow(3).eachCell(cell => {
      cell.font = HEADER_FONT;
      cell.fill = SUBHEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    ent.fields.forEach((f, fIdx) => {
      const row = sheet.getRow(4 + fIdx);
      row.values = [
        fIdx + 1,
        f.code,
        f.upperCode,
        f.label,
        f.type,
        f.isRequired,
        f.isMultiple,
        f.options,
        f.settings
      ];

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Segoe UI', size: 9 };
        cell.border = BORDER_STYLE;
        if (fIdx % 2 === 1) cell.fill = ZEBRA_FILL;
        if (colNum === 1 || colNum === 5 || colNum === 6 || colNum === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'top' };
        } else {
          cell.alignment = { vertical: 'top', wrapText: colNum >= 8 };
        }
      });
    });

    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: Math.max(3, 3 + ent.fields.length), column: 9 }
    };

    sheet.columns = [
      { width: 6 },
      { width: 30 },
      { width: 30 },
      { width: 35 },
      { width: 16 },
      { width: 12 },
      { width: 12 },
      { width: 50 },
      { width: 35 }
    ];
  });

  console.log(`[EXPORT] Writing Excel workbook to ${outputPath}...`);
  await workbook.xlsx.writeFile(outputPath);
  console.log(`[EXPORT] Successfully generated Excel workbook: ${outputPath}`);
}

async function run() {
  const outputPath = path.resolve(__dirname, '../Bitrix24_All_User_Fields_Schema.xlsx');
  const results = await fetchAllSchema();
  await generateExcel(results, outputPath);
}

run().catch(err => {
  console.error('[ERROR] Script failed:', err);
  process.exit(1);
});
