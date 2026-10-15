const fs = require('fs');
const audit = JSON.parse(fs.readFileSync('scratch_fields_audit.json', 'utf8'));

const listingSpecific = audit.listing.userfields.filter(f => f.key.startsWith('ufCrm16_'));
const enquirySpecific = audit.enquiry.userfields.filter(f => f.key.startsWith('ufCrm18_'));

console.log('=== LISTING (ufCrm16_) FIELDS (Total: ' + listingSpecific.length + ') ===');
listingSpecific.forEach((f, i) => {
  console.log(`${i + 1}. [${f.title}] key: ${f.key}, type: ${f.type}`);
});

console.log('\n=== ENQUIRY (ufCrm18_) FIELDS (Total: ' + enquirySpecific.length + ') ===');
enquirySpecific.forEach((f, i) => {
  console.log(`${i + 1}. [${f.title}] key: ${f.key}, type: ${f.type}`);
});
