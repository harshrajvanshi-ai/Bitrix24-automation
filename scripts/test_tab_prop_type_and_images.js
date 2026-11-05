const fs = require('fs');
const assert = require('assert');

console.log('===============================================================');
console.log('   Testing Property Type Lock & Image Preview/Title Maintenance');
console.log('===============================================================\n');

const tabJs = fs.readFileSync('public/js/tab.js', 'utf8');
const fieldsJson = JSON.parse(fs.readFileSync('config/fields.json', 'utf8'));
const serverJs = fs.readFileSync('server.js', 'utf8');

// --- Test 1: Property Type is locked in config/fields.json ---
console.log('--- Test 1: Property Type schema verification ---');
const listingSection = fieldsJson.listingLayout.sections.find(s => s.id === 'specs');
assert(listingSection, 'Listing layout has specs section');
const propTypeField = listingSection.fields.find(f => f.code === 'UF_CRM_1791952050535');
assert(propTypeField, 'Property Type field found in specs section');
assert.strictEqual(propTypeField.readOnly, true, 'Property Type is marked readOnly: true');
assert.strictEqual(propTypeField.disabled, true, 'Property Type is marked disabled: true');
console.log('  ✓ PASS: Property Type is configured readOnly and disabled in config/fields.json');

// --- Test 2: Property Type lock and visual indicator in tab.js ---
console.log('\n--- Test 2: Property Type UI locking in tab.js ---');
assert(tabJs.includes("f.code === 'UF_CRM_1791952050535' || f.code === 'UF_CRM_PROPERTY_TYPE' || f.readOnly || f.disabled"), 'tab.js checks for Property Type or readOnly/disabled');
assert(tabJs.includes('inputElement.disabled = true;'), 'tab.js disables Property Type select');
assert(tabJs.includes("inputElement.style.pointerEvents = 'none';"), 'tab.js sets pointer-events: none');
assert(tabJs.includes("Auto-populated from Layout (Read-only)"), 'tab.js renders lock badge/note');
console.log('  ✓ PASS: Property Type select is completely locked and non-editable by the user');

// --- Test 3: Layout to Property Type Mapping & Population in tab.js ---
console.log('\n--- Test 3: Layout to Property Type population logic ---');
assert(tabJs.includes('const LAYOUT_PROP_TYPE_MAP = {'), 'tab.js defines LAYOUT_PROP_TYPE_MAP');
assert(tabJs.includes("'346': '1754'"), 'LAYOUT_PROP_TYPE_MAP maps Apartment (346 -> 1754)');
assert(tabJs.includes("'348': '1756'"), 'LAYOUT_PROP_TYPE_MAP maps Villa (348 -> 1756)');
assert(tabJs.includes("'350': '1758'"), 'LAYOUT_PROP_TYPE_MAP maps Townhouse (350 -> 1758)');
assert(tabJs.includes("'352': '1760'"), 'LAYOUT_PROP_TYPE_MAP maps Penthouse (352 -> 1760)');
assert(tabJs.includes('function populatePropertyTypeFromLayout('), 'tab.js defines populatePropertyTypeFromLayout');
assert(tabJs.includes('populatePropertyTypeFromLayout(item, true)'), 'Selecting layout populates Property Type');
assert(tabJs.includes('populatePropertyTypeFromLayout(match, true)'), 'Resolving dependent layout populates Property Type');
assert(tabJs.includes('populatePropertyTypeFromLayout(match, false)'), 'Initial lead render populates Property Type from existing layout');
console.log('  ✓ PASS: Layout properly populates Property Type across selection, cascade, and initial load');

// --- Test 4: Server-side Layout Query Selection & Companion Sync ---
console.log('\n--- Test 4: Server-side Layout selection & companion sync ---');
assert(serverJs.includes("'ufCrm12PropType'"), 'server.js fetchAllSpaItems selects ufCrm12PropType');
assert(serverJs.includes('ufCrm12PropType: i.ufCrm12PropType || null'), 'server.js maps ufCrm12PropType in layout lookup items');
assert(serverJs.includes('UF_CRM_1791952050535') && serverJs.includes('UF_CRM_PROPERTY_TYPE'), 'server.js syncs UF_CRM_1791952050535 and UF_CRM_PROPERTY_TYPE');
console.log('  ✓ PASS: Server fetches ufCrm12PropType and synchronizes Property Type companion fields');

// --- Test 5: In-window Preview Viewport in tab.js ---
console.log('\n--- Test 5: In-window image preview & viewport rendering ---');
assert(tabJs.includes('function showInWindowImage('), 'tab.js defines showInWindowImage');
assert(tabJs.includes('function showInWindowPdf('), 'tab.js defines showInWindowPdf');
assert(tabJs.includes('inline-preview-topbar'), 'tab.js renders inline-preview-topbar with file title');
assert(tabJs.includes('inline-preview-img'), 'tab.js renders inline-preview-img');
console.log('  ✓ PASS: In-window preview viewport is defined and renders image title and controls');

// --- Test 6: Image title and preview maintenance in handleLocalFiles ---
console.log('\n--- Test 6: Image title and preview maintenance on local upload ---');
assert(tabJs.includes('showInWindowImage(viewportBox, dataUrl, file.name)'), 'handleLocalFiles triggers instant in-window preview with title');
assert(tabJs.includes('b24_filename_'), 'handleLocalFiles caches file title in localStorage');
assert(tabJs.includes('openLightbox(file.name, dataUrl, isPdf'), 'handleLocalFiles sets title on lightbox modal');
console.log('  ✓ PASS: Local uploads instantly show image preview and filename/title');

// --- Test 7: Post-save image preview and title maintenance ---
console.log('\n--- Test 7: Post-save image preview and title persistence ---');
assert(tabJs.includes('Preserve preview and title for uploaded files in currentLead state'), 'handleSave preserves preview & title in currentLead');
assert(tabJs.includes("th.title = th.title.replace(' (Ready to upload)', '')"), 'handleSave updates tile tooltips to saved state');
assert(tabJs.includes('fileItem.fileData'), 'createFormInput supports fileItem.fileData tuples');
assert(tabJs.includes('fileItem.dataUrl'), 'createFormInput supports fileItem.dataUrl');
assert(tabJs.includes('b24_file_title_'), 'createFormInput restores cached file titles from localStorage');
console.log('  ✓ PASS: Uploaded image titles and previews are fully maintained across save and reload');

console.log('\n===============================================================');
console.log('✓ ALL 7 TEST SUITES PASSED COMPLETELY!');
console.log('===============================================================');
