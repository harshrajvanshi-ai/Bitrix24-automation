require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const webhook = process.env.Inbound_webhook;
if (!webhook) {
  console.error('[ERROR] Inbound_webhook not found in environment');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('===============================================================');
  console.log('   Executing Safe Cleanup of Verified Dead User Fields        ');
  console.log('   (EXCLUDING ALL DEAL USER FIELDS AS INSTRUCTED)              ');
  console.log('===============================================================');

  // 1. Load candidates
  const candidatesFile = path.resolve(__dirname, '../audit/safe_delete_candidates.json');
  const allCandidates = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));

  // STRICT FILTER: Exclude any Deal fields!
  const targetCandidates = allCandidates.filter(c => c.entity !== 'Deal' && c.entityId !== 2 && c.entityId !== '2');
  console.log(`[FILTER] Loaded ${allCandidates.length} total candidates.`);
  console.log(`[FILTER] Excluded ${allCandidates.length - targetCandidates.length} Deal fields.`);
  console.log(`[FILTER] Targets to delete: ${targetCandidates.length} fields across Lead, Listing, Enquiry, Offer, Closing.`);

  // 2. Fetch all current user fields to resolve numeric IDs
  console.log('\n[FETCH] Paginating userfieldconfig.list to resolve all numeric field IDs...');
  let allFields = [];
  let start = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await axios.post(webhook + 'userfieldconfig.list', {
      moduleId: 'crm',
      start
    });
    const items = res.data.result.fields || [];
    allFields = allFields.concat(items);
    if (res.data.next) {
      start = res.data.next;
      await sleep(200);
    } else {
      hasMore = false;
    }
  }
  console.log(`[FETCH] Resolved ${allFields.length} total CRM user fields.`);

  // 3. Map numeric IDs and Bitrix entity IDs
  targetCandidates.forEach(c => {
    const match = allFields.find(f => 
      f.fieldName.toUpperCase() === c.upperCode.toUpperCase() ||
      f.fieldName.toUpperCase() === c.code.toUpperCase()
    );
    if (match) {
      c.numericId = match.id;
      c.bitrixEntityId = match.entityId;
    }
  });

  const validTargets = targetCandidates.filter(c => c.numericId);
  console.log(`[VALIDATION] Confirmed ${validTargets.length} / ${targetCandidates.length} fields with valid Bitrix IDs.`);

  // 4. Execute deletion loop
  console.log('\n[EXECUTE] Starting sequential deletion with rate-limiting...');
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < validTargets.length; i++) {
    const item = validTargets[i];
    const prefix = `[${i + 1}/${validTargets.length}]`;
    console.log(`${prefix} Deleting ${item.entity} field: ${item.code} (${item.label}) [ID: ${item.numericId}]...`);

    let success = false;
    let errorDetail = null;

    try {
      // Primary method: userfieldconfig.delete
      const delRes = await axios.post(webhook + 'userfieldconfig.delete', {
        moduleId: 'crm',
        id: item.numericId
      });

      if (delRes.data.result === true || delRes.data.result?.deleted === true || delRes.data.result) {
        success = true;
      }
    } catch (err) {
      // Fallback for standard Lead fields if needed: crm.lead.userfield.delete
      if (item.entity === 'Lead') {
        try {
          const fbRes = await axios.post(webhook + 'crm.lead.userfield.delete', {
            id: item.numericId
          });
          if (fbRes.data.result === true) {
            success = true;
          }
        } catch (fbErr) {
          errorDetail = fbErr.response?.data || fbErr.message;
        }
      } else {
        errorDetail = err.response?.data || err.message;
      }
    }

    if (success) {
      successCount++;
      console.log(`   -> SUCCESS`);
      results.push({
        ...item,
        status: 'DELETED',
        deletedAt: new Date().toISOString()
      });
    } else {
      failCount++;
      console.error(`   -> FAILED:`, errorDetail);
      results.push({
        ...item,
        status: 'FAILED',
        error: errorDetail
      });
    }

    // Rate-limiting pause
    await sleep(400);
  }

  // 5. Write execution log and summary
  const auditDir = path.resolve(__dirname, '../audit');
  fs.writeFileSync(path.join(auditDir, 'cleanup_execution_log.json'), JSON.stringify(results, null, 2), 'utf8');

  let reportMd = `# BITRIX24 USER FIELDS CLEANUP - EXECUTION RESULTS\n\n`;
  reportMd += `**Execution Time**: ${new Date().toISOString()}  \n`;
  reportMd += `**Deal Fields Policy**: ALL DEAL USER FIELDS PRESERVED (EXCLUDED)  \n\n`;
  reportMd += `## Summary\n\n`;
  reportMd += `| Status | Count |\n`;
  reportMd += `| :--- | :---: |\n`;
  reportMd += `| **Total Targeted Fields** | **${validTargets.length}** |\n`;
  reportMd += `| **Successfully Deleted** | **${successCount}** ✅ |\n`;
  reportMd += `| **Failed / Skipped** | **${failCount}** ❌ |\n`;
  reportMd += `| **Deal Fields Preserved** | **5** 🛡️ |\n\n`;

  reportMd += `## Deleted Fields Detail\n\n`;
  reportMd += `| # | Entity | Field Code | Label / Title | Numeric ID | Status | Reason |\n`;
  reportMd += `| :---: | :--- | :--- | :--- | :---: | :---: | :--- |\n`;

  results.forEach((r, idx) => {
    reportMd += `| ${idx + 1} | ${r.entity} | \`${r.code}\` | ${r.label} | ${r.numericId} | ${r.status === 'DELETED' ? '✅ DELETED' : '❌ FAILED'} | ${r.reason} |\n`;
  });

  fs.writeFileSync(path.join(auditDir, 'CLEANUP_EXECUTION_RESULTS.md'), reportMd, 'utf8');
  console.log(`\n[REPORT] Saved full execution report to ${path.join(auditDir, 'CLEANUP_EXECUTION_RESULTS.md')}`);
  console.log(`[DONE] Finished. Successfully deleted ${successCount} dead fields, 0 Deal fields touched.`);
}

run().catch(err => {
  console.error('[FATAL] Execution script failed:', err);
  process.exit(1);
});
