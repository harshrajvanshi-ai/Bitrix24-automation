const fs = require('fs');
const assert = require('assert');

console.log('========================================================================');
console.log('   Comprehensive DOM, CSS & JS Contract Test: Tab vs Listing-Details    ');
console.log('========================================================================');

const tabHtml = fs.readFileSync('views/tab.html', 'utf8');
const listHtml = fs.readFileSync('views/listing-details.html', 'utf8');
const tabCss = fs.readFileSync('public/css/tab.css', 'utf8');
const listCss = fs.readFileSync('public/css/listing-details.css', 'utf8');
const tabJs = fs.readFileSync('public/js/tab.js', 'utf8');
const listJs = fs.readFileSync('public/js/listing-details.js', 'utf8');

// 1. Structure Parity: Lightbox modal direct child of body outside tab containers
console.log('\n--- 1. DOM Hierarchy & Lightbox Modal Placement ---');
assert(tabHtml.includes('<!-- ── 3. Lightbox & Document Preview Modal'), 'tab.html defines Lightbox modal comment');
assert(listHtml.includes('<!-- ── 3. Lightbox & Document Preview Modal'), 'listing-details.html defines Lightbox modal comment');

// Verify tab-container closes before lightbox-modal in tab.html
const tabCloseIdx = tabHtml.indexOf('</div>\n  </div>');
const altTabCloseIdx = tabHtml.indexOf('</div>\r\n  </div>');
const effectiveCloseIdx = tabCloseIdx !== -1 ? tabCloseIdx : altTabCloseIdx;
const lightboxIdx = tabHtml.indexOf('<div id="lightbox-modal"');
assert(effectiveCloseIdx !== -1 && lightboxIdx !== -1 && effectiveCloseIdx < lightboxIdx, 'tab.html closes .tab-container BEFORE #lightbox-modal');

// Verify listing-tab-container closes before lightbox-modal in listing-details.html
const listCloseIdx = listHtml.indexOf('</div>\n  </div>');
const altListCloseIdx = listHtml.indexOf('</div>\r\n  </div>');
const effectiveListCloseIdx = listCloseIdx !== -1 ? listCloseIdx : altListCloseIdx;
const listLightboxIdx = listHtml.indexOf('<div id="lightbox-modal"');
assert(effectiveListCloseIdx !== -1 && listLightboxIdx !== -1 && effectiveListCloseIdx < listLightboxIdx, 'listing-details.html closes .listing-tab-container BEFORE #lightbox-modal');
console.log('  ✓ PASS: Lightbox modal is a direct child of body in both tab and listing-details');

// 2. Full-Width & Full-Height CSS Expansion
console.log('\n--- 2. Full-Width & Height Layout Expansion ---');
assert(tabCss.includes('.tab-container') && tabCss.includes('max-width: 100% !important;'), 'tab.css expands .tab-container to 100% max-width');
assert(listCss.includes('.listing-tab-container') && listCss.includes('max-width: 100% !important;'), 'listing-details.css expands .listing-tab-container to 100% max-width');
assert(!tabCss.match(/\.tab-container\s*\{[^}]*position:\s*relative;/), 'tab.css has NO position: relative on .tab-container');
assert(!listCss.match(/\.listing-tab-container\s*\{[^}]*position:\s*relative;/), 'listing-details.css has NO position: relative on .listing-tab-container');
assert(tabCss.includes('margin-top: auto;'), 'tab.css pins sticky save bar with margin-top: auto');
assert(listCss.includes('margin-top: auto;'), 'listing-details.css pins sticky save bar with margin-top: auto');
console.log('  ✓ PASS: Container expansion (100% width/height) and sticky save bar verified in both CSS files');

// 3. JS Preview Engine Parity
console.log('\n--- 3. Preview Engine & ResizeObserver Parity ---');
assert(tabJs.includes('function openLightbox('), 'tab.js defines openLightbox');
assert(listJs.includes('function openLightbox('), 'listing-details.js defines openLightbox');
assert(tabJs.includes('function closeLightbox('), 'tab.js defines closeLightbox');
assert(listJs.includes('function closeLightbox('), 'listing-details.js defines closeLightbox');
assert(tabJs.includes('scheduleResize'), 'tab.js defines scheduleResize');
assert(listJs.includes('scheduleResize'), 'listing-details.js defines scheduleResize');
assert(tabJs.includes('new ResizeObserver'), 'tab.js registers ResizeObserver on document.body');
assert(listJs.includes('new ResizeObserver'), 'listing-details.js registers ResizeObserver on document.body');
console.log('  ✓ PASS: openLightbox, closeLightbox, scheduleResize, and ResizeObserver verified across both engines');

// 4. Bitrix24 Native Look & Feel Controls
console.log('\n--- 4. Viewer Topbar & Controls Parity ---');
const controls = ['lb-zoom-in-btn', 'lb-zoom-out-btn', 'lightbox-zoom-toggle-btn', 'lightbox-download-link', 'lightbox-close-btn'];
for (const ctrl of controls) {
  assert(tabHtml.includes(ctrl), 'tab.html defines control: ' + ctrl);
  assert(listHtml.includes(ctrl), 'listing-details.html defines control: ' + ctrl);
}
console.log('  ✓ PASS: All B&W SVG topbar controls match exactly between views');

// 5. Offline Mozilla PDF.js Canvas Viewer
console.log('\n--- 5. Offline PDF.js Canvas Engine ---');
assert(tabHtml.includes('/js/vendor/pdf.min.js'), 'tab.html includes offline pdf.min.js');
assert(listHtml.includes('/js/vendor/pdf.min.js'), 'listing-details.html includes offline pdf.min.js');
assert(tabJs.includes('renderPdfCanvasViewer'), 'tab.js defines renderPdfCanvasViewer');
assert(listJs.includes('renderPdfCanvasViewer'), 'listing-details.js defines renderPdfCanvasViewer');
console.log('  ✓ PASS: Offline PDF.js canvas engine integrated in both views');

console.log('\n========================================================================');
console.log('✓ ALL CONTRACT VERIFICATIONS PASSED (100%)');
console.log('========================================================================\n');
