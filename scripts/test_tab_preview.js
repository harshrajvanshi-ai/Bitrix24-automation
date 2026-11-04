const fs = require('fs');
const assert = require('assert');

const tabHtml = fs.readFileSync('views/tab.html', 'utf8');
const tabCss = fs.readFileSync('public/css/tab.css', 'utf8');
const tabJs = fs.readFileSync('public/js/tab.js', 'utf8');

console.log('Verifying Preview Integration in Tab...');

// 1. HTML Lightbox Modal
assert(tabHtml.includes('id="lightbox-modal"'), 'views/tab.html defines #lightbox-modal');
assert(tabHtml.includes('id="lightbox-title"'), 'views/tab.html defines #lightbox-title');
assert(tabHtml.includes('id="lightbox-body"'), 'views/tab.html defines #lightbox-body');
assert(tabHtml.includes('id="lightbox-close-btn"'), 'views/tab.html defines #lightbox-close-btn');
assert(tabHtml.includes('id="lb-zoom-in-btn"'), 'views/tab.html defines #lb-zoom-in-btn');
assert(tabHtml.includes('id="lb-zoom-out-btn"'), 'views/tab.html defines #lb-zoom-out-btn');
assert(tabHtml.includes('id="lightbox-zoom-toggle-btn"'), 'views/tab.html defines #lightbox-zoom-toggle-btn');
assert(tabHtml.includes('id="lightbox-download-link"'), 'views/tab.html defines #lightbox-download-link');
assert(tabHtml.includes('id="lb-nav-prev"'), 'views/tab.html defines #lb-nav-prev');
assert(tabHtml.includes('id="lb-nav-next"'), 'views/tab.html defines #lb-nav-next');
console.log('✓ All 10 Lightbox DOM elements verified in views/tab.html');

// 2. CSS Styles
assert(tabCss.includes('.lightbox-modal') && tabCss.includes('.b24-native-viewer'), 'tab.css defines .lightbox-modal and .b24-native-viewer');
assert(tabCss.includes('.b24-file-tile'), 'tab.css defines .b24-file-tile');
assert(tabCss.includes('.preview-thumb-wrap'), 'tab.css defines .preview-thumb-wrap');
assert(tabCss.includes('.preview-doc-wrap'), 'tab.css defines .preview-doc-wrap');
assert(tabCss.includes('.dropzone-box'), 'tab.css defines .dropzone-box');
assert(tabCss.includes('.inline-preview-viewport'), 'tab.css defines .inline-preview-viewport');
assert(tabCss.includes('.b24-view-switcher'), 'tab.css defines .b24-view-switcher');
console.log('✓ All CSS classes for preview and tiles verified in public/css/tab.css');

// 3. JS Logic
assert(tabJs.includes('function openLightbox('), 'tab.js defines openLightbox');
assert(tabJs.includes('function closeLightbox('), 'tab.js defines closeLightbox');
assert(tabJs.includes('function handleLocalFiles('), 'tab.js defines handleLocalFiles');
assert(tabJs.includes('new FileReader()'), 'tab.js creates FileReader for instant client previews');
assert(tabJs.includes('getPreviewUrl'), 'tab.js defines getPreviewUrl for proxy routing');
assert(tabJs.includes('openInBitrixViewer'), 'tab.js defines openInBitrixViewer');
assert(tabJs.includes('pendingFileUploads'), 'tab.js tracks pendingFileUploads');
assert(tabJs.includes('b24-view-switcher'), 'tab.js creates b24-view-switcher');
assert(tabJs.includes('b24-file-tile'), 'tab.js renders b24-file-tile');
console.log('✓ All JavaScript preview and FileReader handlers verified in public/js/tab.js');
console.log('\n✓ PREVIEW INTEGRATION VERIFICATION PASSED COMPLETELY!');
