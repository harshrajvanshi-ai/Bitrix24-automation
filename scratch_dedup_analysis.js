const fs = require('fs');
const audit = JSON.parse(fs.readFileSync('scratch_fields_audit.json', 'utf8'));

// Listing fields from SPA 1058
const listingUFs = audit.listing.userfields.filter(f => f.key.startsWith('ufCrm16_'));
// Enquiry fields from SPA 1062
const enquiryUFs = audit.enquiry.userfields.filter(f => f.key.startsWith('ufCrm18_'));

console.log('=== EXACT TOTALS IN SPAS ===');
console.log(`Listing SPA (entityTypeId 1058) specific fields: ${listingUFs.length}`);
console.log(`Enquiry SPA (entityTypeId 1062) specific fields: ${enquiryUFs.length}`);

// Let's analyze duplicates / overlapping concepts across both SPAs:
// Normalized titles:
function norm(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const listingByTitle = {};
listingUFs.forEach(f => {
  listingByTitle[norm(f.title)] = f;
});

const enquiryByTitle = {};
enquiryUFs.forEach(f => {
  enquiryByTitle[norm(f.title)] = f;
});

const sharedTitles = Object.keys(listingByTitle).filter(k => enquiryByTitle[k]);
console.log(`\n=== FIELDS PRESENT IN BOTH SPAS (Overlap: ${sharedTitles.length}) ===`);
sharedTitles.forEach(k => {
  console.log(`- "${listingByTitle[k].title}" (Listing: ${listingByTitle[k].key} vs Enquiry: ${enquiryByTitle[k].key})`);
});

const uniqueToListing = Object.keys(listingByTitle).filter(k => !enquiryByTitle[k]);
console.log(`\n=== UNIQUE TO LISTING (${uniqueToListing.length}) ===`);
uniqueToListing.forEach(k => console.log(`- "${listingByTitle[k].title}" (${listingByTitle[k].key})`));

const uniqueToEnquiry = Object.keys(enquiryByTitle).filter(k => !enquiryByTitle[k]);
console.log(`\n=== UNIQUE TO ENQUIRY (${uniqueToEnquiry.length}) ===`);
uniqueToEnquiry.forEach(k => console.log(`- "${enquiryByTitle[k].title}" (${enquiryByTitle[k].key})`));

const totalDistinct = new Set([...Object.keys(listingByTitle), ...Object.keys(enquiryByTitle)]);
console.log(`\nTOTAL DISTINCT REAL ESTATE ATTRIBUTES (Deduplicated): ${totalDistinct.size}`);
