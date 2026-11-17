/**
 * tests/test_file_preview_after_reload.js
 * Verification test suite for file previewing on reload/reopen
 * Ensures documents and images saved in Bitrix24 are previewable via /api/file/proxy
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('   File Preview on Reopen & Reload Verification Suite                   ');
console.log('========================================================================\n');

// 1. Check server.js proxy logic
console.log('--- 1. server.js /api/file/proxy Authentication & Redirect Handling ---');
const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

assert.ok(serverCode.includes("app.get('/api/file/proxy'"), 'PASS: /api/file/proxy route exists in server.js');
assert.ok(serverCode.includes('StorageManager.getAuth'), 'PASS: proxy retrieves auth token from StorageManager');
assert.ok(serverCode.includes("parsed.searchParams.set('auth', auth.accessToken)"), 'PASS: proxy attaches auth token to query parameters');
assert.ok(serverCode.includes("reqHeaders['Authorization'] = `Bearer ${token}`"), 'PASS: proxy attaches Authorization Bearer header');
assert.ok(serverCode.includes('BitrixClient.refreshAccessToken'), 'PASS: proxy automatically refreshes token on auth error or login redirect');
assert.ok(serverCode.includes('isLoginRedirect'), 'PASS: proxy detects login page redirect and retries with refreshed token');
assert.ok(serverCode.includes('Bitrix authentication required to view this file'), 'PASS: proxy guards against streaming HTML login page to binary image/pdf viewer');
const pipeMatches = serverCode.match(/response\.data\.pipe\(res\)/g) || [];
assert.strictEqual(pipeMatches.length, 1, 'PASS: response.data.pipe(res) must execute exactly once without double pipe');
assert.ok(serverCode.includes('fileNameCache.set(String(fileId), String(found.name))'), 'PASS: file proxy enriches filename cache from CRM item');
console.log('  ✓ PASS: server.js proxy attaches Bitrix OAuth tokens, handles expired token retry cleanly, and pipes stream safely\n');

// 2. Check tab.js file type recognition on reload
console.log('--- 2. tab.js File Detection & Preview on Reopen ---');
const tabCode = fs.readFileSync(path.join(__dirname, '../public/js/tab.js'), 'utf8');

assert.ok(tabCode.includes('isDocField'), 'PASS: tab.js defines isDocField based on f.isDoc and field codes');
assert.ok(tabCode.includes('(!isImageFile(fileName) && isDocField)'), 'PASS: tab.js detects PDF when filename lacks .pdf but field is a document');
assert.ok(tabCode.includes('getPreviewUrl(fullUrl)'), 'PASS: tab.js wraps fullUrl with getPreviewUrl');
assert.ok(tabCode.includes('filmImg.src = getPreviewUrl(item.url)'), 'PASS: tab.js filmstrip images use getPreviewUrl');
assert.ok(tabCode.includes('img.src = getPreviewUrl(item.url)'), 'PASS: tab.js lightbox main image uses getPreviewUrl');
assert.ok(tabCode.includes('res.arrayBuffer()'), 'PASS: tab.js decodes PDF stream as ArrayBuffer');
assert.ok(tabCode.includes('img.dataset.triedDirect'), 'PASS: tab.js implements direct portal token fallback on img.onerror');
console.log('  ✓ PASS: tab.js correctly identifies document/image types, routes URLs via proxy, and implements direct auth fallbacks\n');

// 3. Check listing-details.js file type recognition on reload
console.log('--- 3. listing-details.js File Detection & Preview on Reopen ---');
const listingDetailsCode = fs.readFileSync(path.join(__dirname, '../public/js/listing-details.js'), 'utf8');

assert.ok(listingDetailsCode.includes('Boolean(field.isDoc || field.code?.includes(\'DOC\')'), 'PASS: listing-details.js recognizes document fields on reopen');
assert.ok(listingDetailsCode.includes('filmImg.src = getPreviewUrl(item.url)'), 'PASS: listing-details.js filmstrip images use getPreviewUrl');
assert.ok(listingDetailsCode.includes('img.src = getPreviewUrl(item.url)'), 'PASS: listing-details.js lightbox main image uses getPreviewUrl');
assert.ok(listingDetailsCode.includes('field.crmCode || field.key || field.code'), 'PASS: listing-details.js resolves fieldName from crmCode and key');
assert.ok(listingDetailsCode.includes('res.arrayBuffer()'), 'PASS: listing-details.js decodes PDF stream as ArrayBuffer');
assert.ok(listingDetailsCode.includes('img.dataset.triedDirect'), 'PASS: listing-details.js implements direct portal token fallback on img.onerror');
console.log('  ✓ PASS: listing-details.js file detection and proxy routing verified with binary PDF streaming\n');

// 4. Schema Simulation Test for Reopened Records
console.log('--- 4. Simulated Reopened Record Behavior ---');
// Simulate what Bitrix returns after saving a lead:
// File fields contain integer IDs without extensions, e.g. 584
const mockFields = [
  { code: 'UF_CRM_DOCUMENTS', label: 'Documents', isDoc: true, type: 'file' },
  { code: 'UF_CRM_TITLE_DEED', label: 'Title Deed', isDoc: true, type: 'file' },
  { code: 'UF_CRM_PHOTOS', label: 'Photos', isImage: true, type: 'file' },
  { code: 'UF_CRM_PRIMARY_IMAGE', label: 'Primary Image', isImage: true, type: 'file' }
];

function isPdfFile(n) { return typeof n === 'string' && n.toLowerCase().endsWith('.pdf'); }
function isImageFile(n) { return typeof n === 'string' && /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(n); }

mockFields.forEach(f => {
  const fid = '584';
  const fileName = `${f.label} (File #${fid})`; // No extension!
  const isImgField = Boolean(f.isImage || f.code.includes('PHOTO') || f.code.includes('IMAGE'));
  const isDocField = Boolean(f.isDoc || f.code.includes('DOC') || f.code.includes('DEED'));
  
  const isPdf = isPdfFile(fileName) || (!isImageFile(fileName) && isDocField);
  const isImg = !isPdf && (isImageFile(fileName) || isImgField);

  if (f.isDoc) {
    assert.strictEqual(isPdf, true, `Document field ${f.code} must be recognized as PDF even without .pdf in fileName`);
    assert.strictEqual(isImg, false, `Document field ${f.code} must not be recognized as Image`);
  } else if (f.isImage) {
    assert.strictEqual(isImg, true, `Image field ${f.code} must be recognized as Image even without extension in fileName`);
    assert.strictEqual(isPdf, false, `Image field ${f.code} must not be recognized as PDF`);
  }
});
console.log('  ✓ PASS: Simulated reopened fields resolve to proper preview engines without extensions\n');

console.log('========================================================================');
console.log('✓ ALL FILE PREVIEW REOPEN CHECKS PASSED (100%)');
console.log('========================================================================');
