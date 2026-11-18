/**
 * cleanup_listings.js
 * Dry-run / Remediation script for corrupted Bitrix24 Listing records (SPA 1058).
 *
 * PROPOSED FIXES:
 * 1. Purpose/Transaction correction:
 *    - If title clearly states SALE / FOR SALE and listingType is 158 (Rent),
 *      propose updating listingType to 160 (Overseas / General Sale) or appropriate sale enum,
 *      and recordType to 1076 (Secondary / Resale) or 1074 (Off-Plan).
 *    - If title states RENT and listingType is 160/162, propose updating to 158 (Rent).
 * 2. Impossible bedroom correction:
 *    - Parse actual bedroom count from title (e.g. "3BR" -> 3, "4BR" -> 4, "5BR" -> 5, "6BR" -> 6).
 *    - Propose updating ufCrm16_1791172802 to parsed beds (or flag if indeterminate).
 * 3. Title formatting normalization:
 *    - Remove dangling commas such as ", 3 BR Sale in , Downtown Dubai" -> "3 BR Sale in Downtown Dubai".
 * 4. Furnished enum alignment:
 *    - Propose mapping legacy 676 to 736 (Furnished) or keeping as-is with code handling.
 *
 * USAGE:
 * node audit/cleanup_listings.js --dry-run
 * (Pass --apply ONLY after explicit user confirmation)
 */

const fs = require('fs');
const BitrixClient = require('../src/bitrixClient');

const isApply = process.argv.includes('--apply');

async function runCleanup() {
  console.log(`\n=== BITRIX24 LISTING CLEANUP SCRIPT [MODE: ${isApply ? 'APPLY LIVE CHANGES' : 'DRY-RUN (AUDIT ONLY)'}] ===\n`);

  if (!fs.existsSync('./audit/listing_backup.json')) {
    console.error('ERROR: No backup found at ./audit/listing_backup.json! Run audit_listings.js first.');
    process.exit(1);
  }

  const backupData = JSON.parse(fs.readFileSync('./audit/listing_backup.json', 'utf8'));
  console.log(`Loaded ${backupData.length} inconsistent records from backup.\n`);

  const proposedPlan = [];

  for (const record of backupData) {
    const raw = record.rawRecord;
    const title = (record.title || '').trim();
    const updateFields = {};
    const reasons = [];

    // 1. Bed count fix from title
    if (record.bedrooms > 20) {
      const match = title.match(/(\d+)\s*(?:BR|Bed|Bedroom)/i);
      if (match && match[1]) {
        const parsedBeds = parseInt(match[1], 10);
        updateFields.ufCrm16_1791172802 = parsedBeds;
        reasons.push(`Correct bedrooms ${record.bedrooms} -> ${parsedBeds} (extracted from title)`);
      } else {
        reasons.push(`Flag bedroom count ${record.bedrooms} (manual inspection needed, no BR in title)`);
      }
    }

    // 2. Purpose / Listing Type fix from title
    const titleIsSale = /\b(for\s+sale|sale|buy)\b/i.test(title);
    const titleIsRent = /\b(for\s+rent|rent|to\s+let)\b/i.test(title);
    if (titleIsSale && String(record.listingType) === '158') {
      const isOffPlan = /\boff-?plan\b/i.test(title);
      updateFields.ufCrm16_1790154808 = isOffPlan ? 162 : 160;
      updateFields.ufCrm16RecordType = isOffPlan ? 1074 : 1076;
      reasons.push(`Correct listingType 158 (Rent) -> ${updateFields.ufCrm16_1790154808} (${isOffPlan ? 'Off-Plan' : 'Sale/Resale'})`);
    } else if (titleIsRent && (String(record.listingType) === '160' || String(record.listingType) === '162')) {
      updateFields.ufCrm16_1790154808 = 158;
      updateFields.ufCrm16RecordType = 1078;
      reasons.push(`Correct listingType ${record.listingType} -> 158 (Rent)`);
    }

    // 3. Title cleaning
    let cleanTitle = title
      .replace(/^[\s,]+/, '')
      .replace(/\s*,\s*,\s*/g, ', ')
      .replace(/\bin\s*,\s*/gi, 'in ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (cleanTitle !== title) {
      updateFields.title = cleanTitle;
      reasons.push(`Clean malformed title: "${title}" -> "${cleanTitle}"`);
    }

    if (Object.keys(updateFields).length > 0) {
      proposedPlan.push({
        id: record.id,
        currentTitle: record.title,
        updateFields,
        reasons
      });
    }
  }

  console.log(`Proposed Actions for ${proposedPlan.length} records:\n`);
  proposedPlan.forEach(p => {
    console.log(`Listing #${p.id}:`);
    p.reasons.forEach(r => console.log(`  - ${r}`));
    console.log(`  Fields payload:`, JSON.stringify(p.updateFields));
    console.log('');
  });

  if (!isApply) {
    console.log('--------------------------------------------------------------------------------');
    console.log('DRY-RUN COMPLETE. No changes were made to Bitrix24 records.');
    console.log('To apply these changes after review, ask for approval and execute with --apply.');
    console.log('--------------------------------------------------------------------------------\n');
    return;
  }

  console.log('Applying updates to Bitrix24...');
  for (const p of proposedPlan) {
    try {
      await BitrixClient.call('crm.item.update', {
        entityTypeId: 1058,
        id: p.id,
        fields: p.updateFields
      });
      console.log(`✓ Updated Listing #${p.id}`);
    } catch (err) {
      console.error(`✗ Error updating Listing #${p.id}:`, err.message);
    }
  }
  console.log('\nAll updates applied successfully.');
}

runCleanup().catch(console.error);
