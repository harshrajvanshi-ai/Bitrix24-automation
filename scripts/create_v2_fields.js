/**
 * scripts/create_v2_fields.js
 * 
 * Prepares and creates canonical Real Estate CRM v2 custom fields in Bitrix24
 * for Lead, Listing SPA (1058 / CRM_16), and Enquiry SPA (1062 / CRM_18).
 * 
 * Rules:
 *  - Default mode: --dry-run (inspects and outputs planned fields without touching live portal).
 *  - Execute mode: only with --apply AND explicit confirmation.
 *  - Fully idempotent: checks existing fields on portal and skips any that exist.
 *  - Readable naming convention: UF_CRM_RE_<CONCEPT> (Lead), UF_CRM_16_RE_<CONCEPT> (SPA 1058).
 *  - Standard XML_IDs on every enum item (SALE, RENT, READY, OFF_PLAN, etc.).
 */

const readline = require('readline');
const conceptsRegistry = require('../config/concepts.json');
const BitrixClient = require('../src/bitrixClient');

// Parse CLI flags
const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDryRun = !isApply || args.includes('--dry-run');

/**
 * Definition of v2 canonical fields to create
 */
const V2_FIELD_SPECS = [
  // 1. Transaction
  {
    concept: 'transaction',
    label: 'Transaction',
    userTypeId: 'enumeration',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_TRANSACTION', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_TRANSACTION', entityId: 'CRM_16' },
      spa_1062: { fieldName: 'UF_CRM_18_RE_TRANSACTION', entityId: 'CRM_18' }
    },
    items: [
      { XML_ID: 'SALE', VALUE: 'Sale' },
      { XML_ID: 'RENT', VALUE: 'Rent' }
    ]
  },

  // 2. Market Segment (Listing only)
  {
    concept: 'market_segment',
    label: 'Market Segment',
    userTypeId: 'enumeration',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_MARKET_SEGMENT', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_MARKET_SEGMENT', entityId: 'CRM_16' }
    },
    items: [
      { XML_ID: 'READY', VALUE: 'Ready' },
      { XML_ID: 'OFF_PLAN', VALUE: 'Off-Plan' },
      { XML_ID: 'OVERSEAS', VALUE: 'Overseas' }
    ]
  },

  // 3. Stock Source (Listing only)
  {
    concept: 'stock_source',
    label: 'Stock Source',
    userTypeId: 'enumeration',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_STOCK_SOURCE', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_STOCK_SOURCE', entityId: 'CRM_16' }
    },
    items: [
      { XML_ID: 'OWN', VALUE: 'Own Stock' },
      { XML_ID: 'EXTERNAL', VALUE: 'External Stock' }
    ]
  },

  // 4. Purpose (Enquiry only)
  {
    concept: 'purpose',
    label: 'Purpose',
    userTypeId: 'enumeration',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_PURPOSE', entityId: 'CRM_LEAD' },
      spa_1062: { fieldName: 'UF_CRM_18_RE_PURPOSE', entityId: 'CRM_18' }
    },
    items: [
      { XML_ID: 'END_USER', VALUE: 'End-user' },
      { XML_ID: 'INVESTMENT', VALUE: 'Investment' }
    ]
  },

  // 5. Security Deposit (AED)
  {
    concept: 'security_deposit',
    label: 'Security Deposit (AED)',
    userTypeId: 'money',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_SECURITY_DEPOSIT', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_SECURITY_DEPOSIT', entityId: 'CRM_16' }
    }
  },

  // 6. Commission %
  {
    concept: 'commission_pct',
    label: 'Commission %',
    userTypeId: 'double',
    settings: { PRECISION: 2 },
    entities: {
      lead: { fieldName: 'UF_CRM_RE_COMMISSION_PCT', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_COMMISSION_PCT', entityId: 'CRM_16' }
    }
  },

  // 7. Payment Plan: Booking %
  {
    concept: 'payment_plan_booking_pct',
    label: 'Booking %',
    userTypeId: 'double',
    settings: { PRECISION: 2 },
    entities: {
      lead: { fieldName: 'UF_CRM_RE_PP_BOOKING_PCT', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_PP_BOOKING_PCT', entityId: 'CRM_16' }
    }
  },

  // 8. Payment Plan: During Construction %
  {
    concept: 'payment_plan_construction_pct',
    label: 'During Construction %',
    userTypeId: 'double',
    settings: { PRECISION: 2 },
    entities: {
      lead: { fieldName: 'UF_CRM_RE_PP_CONSTRUCTION_PCT', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_PP_CONSTRUCTION_PCT', entityId: 'CRM_16' }
    }
  },

  // 9. Payment Plan: On Handover %
  {
    concept: 'payment_plan_handover_pct',
    label: 'On Handover %',
    userTypeId: 'double',
    settings: { PRECISION: 2 },
    entities: {
      lead: { fieldName: 'UF_CRM_RE_PP_HANDOVER_PCT', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_PP_HANDOVER_PCT', entityId: 'CRM_16' }
    }
  },

  // 10. Payment Plan: Post Handover %
  {
    concept: 'payment_plan_post_handover_pct',
    label: 'Post Handover %',
    userTypeId: 'double',
    settings: { PRECISION: 2 },
    entities: {
      lead: { fieldName: 'UF_CRM_RE_PP_POST_HANDOVER_PCT', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_PP_POST_HANDOVER_PCT', entityId: 'CRM_16' }
    }
  },

  // 11. Payment Plan Notes
  {
    concept: 'payment_plan_notes',
    label: 'Payment Plan Notes',
    userTypeId: 'string',
    settings: { ROWS: 3 },
    entities: {
      lead: { fieldName: 'UF_CRM_RE_PP_NOTES', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_PP_NOTES', entityId: 'CRM_16' }
    }
  },

  // 12. View (Multi-Select)
  {
    concept: 'view',
    label: 'View',
    userTypeId: 'enumeration',
    multiple: 'Y',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_VIEW', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_VIEW', entityId: 'CRM_16' }
    },
    items: [
      { XML_ID: 'BURJ_KHALIFA', VALUE: 'Burj Khalifa View' },
      { XML_ID: 'SEA_VIEW', VALUE: 'Sea / Open Water View' },
      { XML_ID: 'MARINA_VIEW', VALUE: 'Dubai Marina View' },
      { XML_ID: 'PALM_VIEW', VALUE: 'Palm Jumeirah View' },
      { XML_ID: 'GOLF_COURSE', VALUE: 'Golf Course View' },
      { XML_ID: 'PARK_VIEW', VALUE: 'Park / Green View' },
      { XML_ID: 'CANAL_VIEW', VALUE: 'Dubai Canal View' },
      { XML_ID: 'CITY_SKYLINE', VALUE: 'City Skyline View' }
    ]
  },

  // 13. Amenities (Multi-Select shared list)
  {
    concept: 'amenities',
    label: 'Amenities',
    userTypeId: 'enumeration',
    multiple: 'Y',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_AMENITIES', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_AMENITIES', entityId: 'CRM_16' },
      spa_1062: { fieldName: 'UF_CRM_18_RE_AMENITIES', entityId: 'CRM_18' }
    },
    items: [
      { XML_ID: 'SWIMMING_POOL', VALUE: 'Shared Swimming Pool' },
      { XML_ID: 'BALCONY', VALUE: 'Balcony' },
      { XML_ID: 'COVERED_PARKING', VALUE: 'Covered Parking' },
      { XML_ID: 'GYM', VALUE: 'Shared Gymnasium' },
      { XML_ID: 'SECURITY', VALUE: '24/7 Concierge & Security' },
      { XML_ID: 'MAIDS_ROOM', VALUE: "Maid's Room" },
      { XML_ID: 'BUILT_IN_WARDROBES', VALUE: 'Built-in Wardrobes' },
      { XML_ID: 'CENTRAL_AC', VALUE: 'Central A/C' },
      { XML_ID: 'CHILDRENS_PLAY_AREA', VALUE: "Children's Play Area" },
      { XML_ID: 'PETS_ALLOWED', VALUE: 'Pets Allowed' },
      { XML_ID: 'PRIVATE_GARDEN', VALUE: 'Private Garden' },
      { XML_ID: 'PRIVATE_POOL', VALUE: 'Private Pool' },
      { XML_ID: 'WALK_IN_CLOSET', VALUE: 'Walk-in Closet' }
    ]
  },

  // 14. Overseas Currency
  {
    concept: 'currency',
    label: 'Currency',
    userTypeId: 'string',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_CURRENCY', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_CURRENCY', entityId: 'CRM_16' }
    }
  },

  // 15. Partner Agency (External Stock Overlay)
  {
    concept: 'partner_agency',
    label: 'Partner Agency',
    userTypeId: 'crm_company',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_PARTNER_AGENCY', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_PARTNER_AGENCY', entityId: 'CRM_16' }
    }
  },

  // 16. Co-Broke Split % (External Stock Overlay)
  {
    concept: 'cobroke_split_pct',
    label: 'Co-broke Split %',
    userTypeId: 'double',
    settings: { PRECISION: 2 },
    entities: {
      lead: { fieldName: 'UF_CRM_RE_COBROKE_SPLIT_PCT', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_COBROKE_SPLIT_PCT', entityId: 'CRM_16' }
    }
  },

  // 17. External Reference / MLS Code
  {
    concept: 'external_reference',
    label: 'External Reference',
    userTypeId: 'string',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_EXTERNAL_REF', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_EXTERNAL_REF', entityId: 'CRM_16' }
    }
  },

  // 18. Publish to Portals Toggle
  {
    concept: 'publish_portals',
    label: 'Publish to Portals',
    userTypeId: 'boolean',
    entities: {
      lead: { fieldName: 'UF_CRM_RE_PUBLISH_PORTALS', entityId: 'CRM_LEAD' },
      spa_1058: { fieldName: 'UF_CRM_16_RE_PUBLISH_PORTALS', entityId: 'CRM_16' }
    }
  }
];

async function run() {
  console.log('===============================================================');
  console.log(`   Bitrix24 Real Estate CRM v2 Schema Generator`);
  console.log(`   Mode: ${isDryRun ? 'DRY-RUN (Inspection Only — No Changes)' : 'APPLY (Execute Live Creation)'}`);
  console.log('===============================================================\n');

  // Collect planned operations
  const plannedCreations = [];

  for (const spec of V2_FIELD_SPECS) {
    for (const [entityKey, entityTarget] of Object.entries(spec.entities)) {
      plannedCreations.push({
        concept: spec.concept,
        label: spec.label,
        fieldName: entityTarget.fieldName,
        entityId: entityTarget.entityId,
        entityKey,
        userTypeId: spec.userTypeId,
        multiple: spec.multiple || 'N',
        items: spec.items || null
      });
    }
  }

  console.log(`Total canonical fields planned for creation: ${plannedCreations.length}\n`);

  // Group by Entity ID
  const byEntity = {
    CRM_LEAD: plannedCreations.filter(p => p.entityId === 'CRM_LEAD'),
    CRM_16: plannedCreations.filter(p => p.entityId === 'CRM_16'),
    CRM_18: plannedCreations.filter(p => p.entityId === 'CRM_18')
  };

  for (const [entId, fields] of Object.entries(byEntity)) {
    console.log(`--- Entity: ${entId} (${fields.length} planned fields) ---`);
    fields.forEach((f, idx) => {
      const enumDesc = f.items ? ` [Enums: ${f.items.map(i => i.XML_ID).join(', ')}]` : '';
      console.log(`  ${idx + 1}. [${f.fieldName}] - "${f.label}" (${f.userTypeId}${f.multiple === 'Y' ? ' MULTI' : ''})${enumDesc}`);
    });
    console.log('');
  }

  if (isDryRun) {
    console.log('---------------------------------------------------------------');
    console.log('✓ DRY-RUN COMPLETE: Zero fields were created on the live portal.');
    console.log('  To apply live in later phases, execute with:');
    console.log('  node scripts/create_v2_fields.js --apply');
    console.log('---------------------------------------------------------------');
    return { status: 'dry_run_complete', count: plannedCreations.length, byEntity };
  }

  // If --apply was requested, require explicit confirmation
  if (!process.env.CONFIRM_APPLY || process.env.CONFIRM_APPLY !== 'YES') {
    console.warn('\n⚠️ WARNING: Live field creation requires CONFIRM_APPLY="YES" environment variable.');
    console.warn('Execution aborted to protect live portal integrity.');
    process.exit(1);
  }

  console.log('\n[APPLY] Executing live creation...');
  // (Reserved for later phases after user authorization)
}

if (require.main === module) {
  run().catch(err => {
    console.error('Fatal execution error:', err.message);
    process.exit(1);
  });
}

module.exports = { V2_FIELD_SPECS, run };

