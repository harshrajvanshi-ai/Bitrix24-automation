const fs = require('fs');
const audit = JSON.parse(fs.readFileSync('scratch_fields_audit.json', 'utf8'));

const listingSpecific = audit.listing.userfields.filter(f => f.key.startsWith('ufCrm16_'));
const enquirySpecific = audit.enquiry.userfields.filter(f => f.key.startsWith('ufCrm18_'));

console.log('Total Lead userfields in Bitrix24:', audit.leadUserfields.length);
audit.leadUserfields.forEach((f, i) => {
  console.log(`${i + 1}. [${f.label}] fieldName: ${f.fieldName}, type: ${f.type}`);
});
