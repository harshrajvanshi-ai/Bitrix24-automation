/**
 * scripts/randomize_company_names.js
 * Updates all CRM company records in Bitrix24 with realistic, distinctive real estate developer,
 * investment, holding, and asset management company names.
 */

const BitrixClient = require('../src/bitrixClient');

const REAL_ESTATE_COMPANIES = [
  'Emaar Properties PJSC',
  'Sobha Realty Development',
  'Nakheel Properties PJSC',
  'Meraas Holding LLC',
  'Aldar Properties',
  'Damac Properties PJSC',
  'Omniyat Real Estate Group',
  'Ellington Properties Development',
  'Select Group Developments',
  'Deyaar Development PJSC',
  'Azizi Developments LLC',
  'Binghatti Properties Holding',
  'Danube Properties Development',
  'MAG Lifestyle Development',
  'Al Futtaim Group Real Estate',
  'Majid Al Futtaim Properties',
  'Arada Developments LLC',
  'Wasl Asset Management Group',
  'Al Habtoor Group Real Estate',
  'Reportage Properties LLC',
  'Tiger Properties Development',
  'Dubai South Real Estate',
  'Meydan Group Development',
  'Diamond Developers',
  'Samana Developers LLC',
  'Imtiaz Developments',
  'London Gate Real Estate',
  'Seven Tides Real Estate',
  'AHS Properties Development',
  'Vincitore Real Estate Development',
  'Pantheon Development LLC',
  'Bloom Holding Real Estate',
  'Shurooq Investment & Development',
  'Continental Investments LLC',
  'Prescott Real Estate Development',
  'Swiss Property Development AG',
  'Lootah Real Estate Development',
  'Fakhruddin Properties',
  'Peak Summit Real Estate',
  'Aqua Properties LLC',
  'Viva City Real Estate Development',
  'Gemini Property Developers',
  'Forum Group Real Estate',
  'Union Properties PJSC',
  'Gulf General Investment Co (GGICO)',
  'Green Group Real Estate',
  'Prestige One Developments',
  'Devmark Real Estate Group',
  'Palma Holding LLC',
  'LIV Developers LLC',
  'Gensler Middle East LLC',
  'Dar Al Arkan Real Estate',
  'Al Rostamani Real Estate',
  'Habtoor Grand Investments',
  'Sobha Hartland Ventures'
];

async function updateCompanyNames() {
  console.log('=== RANDOMIZING / ASSIGNING REALISTIC NAMES TO CRM COMPANIES ===\n');

  const res = await BitrixClient.call('crm.company.list', {
    order: { ID: 'ASC' },
    select: ['ID', 'TITLE']
  });

  const companies = res.items || res || [];
  console.log(`Found ${companies.length} company records in Bitrix24.\n`);

  let nameIndex = 0;
  const updatedRecords = [];

  for (const company of companies) {
    const id = company.ID;
    const oldTitle = company.TITLE;

    // Pick a distinct realistic name from the pool
    const newTitle = REAL_ESTATE_COMPANIES[nameIndex % REAL_ESTATE_COMPANIES.length];
    nameIndex++;

    try {
      await BitrixClient.call('crm.company.update', {
        id: id,
        fields: {
          TITLE: newTitle
        }
      });
      console.log(`✓ Company #${id}: "${oldTitle}" -> "${newTitle}"`);
      updatedRecords.push({ id, oldTitle, newTitle });
    } catch (err) {
      console.error(`✗ Failed to update Company #${id}:`, err.message);
    }
  }

  console.log('\n===============================================================');
  console.log(`✓ Successfully updated ${updatedRecords.length} of ${companies.length} company records!`);
  console.log('===============================================================\n');
}

updateCompanyNames().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
