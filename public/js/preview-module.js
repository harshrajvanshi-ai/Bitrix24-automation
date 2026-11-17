/**
 * public/js/preview-module.js
 * Universal, modular preview and document viewer for Bitrix24 Real Estate Application.
 * 
 * Features:
 *  - Fullscreen Bitrix24 Native Look-and-Feel Lightbox with side chevron navigation
 *  - High-performance Mozilla PDF.js Canvas Viewer with multi-page continuous scroll and single-page modes
 *  - Pan, drag, pinch, and smooth zoom capabilities for photos and documents
 *  - Authenticated proxy URL resolution (/api/file/proxy) with OAuth token & placement forwarding
 *  - Direct Bitrix24 native viewer path integration (BX24.openPath)
 *  - Self-bootstrapping DOM injection (automatically injects modal if not present on page)
 *  - Works in browser and Node.js environments
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PreviewModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Module configuration
  const _config = {
    entityTypeId: 1058,
    ownerId: null,
    domain: null,
    token: null
  };

  // Lightbox internal state
  let _lbGallery = [];
  let _lbIndex = 0;
  let _lbScale = 1;
  let _lbImgX = 0;
  let _lbImgY = 0;
  let _lightboxCleanup = null;
  let _isInitialized = false;

  // DOM Elements cache
  let _modalEl = null;
  let _titleEl = null;
  let _counterEl = null;
  let _bodyEl = null;
  let _filmstripEl = null;
  let _navPrevEl = null;
  let _navNextEl = null;
  let _downloadLinkEl = null;
  let _zoomToggleBtn = null;
  let _zoomControls = null;
  let _fileIconEl = null;
  let _closeBtn = null;
  let _moreBtn = null;

  /**
   * Configures default parameters for preview URLs and Bitrix environment.
   */
  function configure(opts = {}) {
    if (opts.entityTypeId !== undefined) _config.entityTypeId = opts.entityTypeId;
    if (opts.ownerId !== undefined) _config.ownerId = opts.ownerId;
    if (opts.domain !== undefined) _config.domain = opts.domain;
    if (opts.token !== undefined) _config.token = opts.token;
  }

  /**
   * Retrieves active authentication headers for CRM fetch calls.
   */
  function getCrmAuthHeaders() {
    const headers = {};
    let token = _config.token;
    let domain = _config.domain;

    if (typeof window !== 'undefined') {
      if (window.BX24 && typeof window.BX24.getAuth === 'function') {
        const auth = window.BX24.getAuth();
        if (auth && auth.access_token) {
          token = auth.access_token;
          domain = auth.domain || domain;
        }
      }
      if (!token && window.__BITRIX_AUTH_TOKEN__) token = window.__BITRIX_AUTH_TOKEN__;
      if (!token && typeof sessionStorage !== 'undefined') {
        token = sessionStorage.getItem('b24_access_token') || '';
      }
      if (!domain && typeof sessionStorage !== 'undefined') {
        domain = sessionStorage.getItem('b24_domain') || '';
      }
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Bitrix-Auth'] = token;
    }
    if (domain) {
      headers['X-Bitrix-Domain'] = domain;
    }
    return headers;
  }

  /**
   * Resolves a same-origin proxy URL for Bitrix file attachments with active authentication.
   */
  function getPreviewUrl(url, fieldCode, fileId, overrideOwnerId, overrideOwnerTypeId) {
    if (!url || typeof url !== 'string' || url.startsWith('data:')) return url;
    let base = url;
    let extractedField = fieldCode || '';
    let extractedFileId = fileId || '';

    if (url.includes('/api/file/proxy')) {
      try {
        const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'http://localhost';
        const u = new URL(url, origin);
        const extracted = u.searchParams.get('url');
        if (extracted) base = extracted;
        if (!extractedField && u.searchParams.get('fieldName')) extractedField = u.searchParams.get('fieldName');
        if (!extractedFileId && u.searchParams.get('fileId')) extractedFileId = u.searchParams.get('fileId');
      } catch (_) {
        try {
          base = decodeURIComponent(url.split('/api/file/proxy?url=')[1].split('&')[0]);
        } catch (_) {}
      }
    }

    if (!/^https?:\/\//i.test(base)) {
      let domain = _config.domain;
      if (typeof window !== 'undefined') {
        domain = (window.BX24 && typeof window.BX24.getAuth === 'function' ? window.BX24.getAuth()?.domain : null) ||
                 window.__BITRIX_DOMAIN__ ||
                 (window.location ? window.location.hostname : 'csl.bitrix24.com');
      }
      base = `https://${domain || 'csl.bitrix24.com'}${base.startsWith('/') ? '' : '/'}${base}`;
    }

    const effectiveId = overrideOwnerId || _config.ownerId || (typeof window !== 'undefined' && (window.currentListingId || window.currentLeadId || window.currentListing?.id || window.currentLead?.id));
    const typeId = overrideOwnerTypeId || _config.entityTypeId || (typeof window !== 'undefined' && window.CONFIG?.entityTypeId) || 1058;

    if (base.includes('crm_show_file.php') || base.includes('show_file.php')) {
      if (effectiveId && !base.includes('ownerId=')) {
        base += `${base.includes('?') ? '&' : '?'}ownerTypeId=${typeId}&ownerId=${encodeURIComponent(effectiveId)}`;
      }
      if (!base.includes('ownerTypeId=')) {
        base += `${base.includes('?') ? '&' : '?'}ownerTypeId=${typeId}`;
      }
      if (extractedField && !base.includes('fieldName=')) {
        base += `${base.includes('?') ? '&' : '?'}fieldName=${encodeURIComponent(extractedField)}`;
      }
    }

    let token = _config.token || '';
    let domain = _config.domain || '';
    let memberId = '';
    let refreshToken = '';

    if (typeof window !== 'undefined') {
      if (window.BX24 && typeof window.BX24.getAuth === 'function') {
        const auth = window.BX24.getAuth();
        if (auth) {
          token = auth.access_token || token;
          domain = auth.domain || domain;
          memberId = auth.member_id || '';
          refreshToken = auth.refresh_token || '';
        }
      }
      if (!token && window.__BITRIX_AUTH_TOKEN__) token = window.__BITRIX_AUTH_TOKEN__;
      if (!token && typeof sessionStorage !== 'undefined') {
        token = sessionStorage.getItem('b24_access_token') || '';
      }
      if (!domain && typeof sessionStorage !== 'undefined') {
        domain = sessionStorage.getItem('b24_domain') || '';
      }
    }

    const params = new URLSearchParams();
    params.set('url', base);
    if (effectiveId) {
      params.set('ownerId', String(effectiveId));
      params.set('id', String(effectiveId));
    }
    if (typeId) {
      params.set('ownerTypeId', String(typeId));
      params.set('entityTypeId', String(typeId));
    }
    if (extractedField) params.set('fieldName', extractedField);
    if (extractedFileId) params.set('fileId', String(extractedFileId));
    if (token) params.set('auth', token);
    if (domain) params.set('domain', domain);
    if (memberId) params.set('member_id', memberId);
    if (refreshToken) params.set('refresh_token', refreshToken);

    return `/api/file/proxy?${params.toString()}`;
  }

  /**
   * Decodes the raw native Bitrix file URL from a proxy URL.
   */
  function getNativeFileUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('data:')) return url;
    if (url.includes('/api/file/proxy')) {
      try {
        const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'http://localhost';
        const u = new URL(url, origin);
        const extracted = u.searchParams.get('url');
        if (extracted) return extracted;
      } catch (_) {}
      const marker = '/api/file/proxy?url=';
      try {
        const part = url.slice(url.indexOf(marker) + marker.length);
        return decodeURIComponent(part.split('&')[0]);
      } catch (_) {
        return url;
      }
    }
    return url;
  }

  /**
   * Opens a file directly using Bitrix native viewer (BX24.openPath) or new window.
   */
  function openInBitrixViewer(url) {
    const nativeUrl = getNativeFileUrl(url);
    if (!nativeUrl || typeof window === 'undefined') return;
    if (window.BX24 && typeof window.BX24.openPath === 'function' && !nativeUrl.startsWith('data:')) {
      window.BX24.openPath(nativeUrl);
      return;
    }
    window.open(nativeUrl, '_blank', 'noopener');
  }

  /**
   * Ensures the Lightbox modal HTML is present in the DOM. Injects if absent.
   */
  function ensureModal() {
    if (typeof document === 'undefined') return false;
    _modalEl = document.getElementById('lightbox-modal');
    if (!_modalEl) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div id="lightbox-modal" class="lightbox-modal b24-native-viewer" style="display: none;" role="dialog" aria-modal="true" aria-label="File Preview">
          <div class="lightbox-content b24-viewer-wrap">
            <div class="lightbox-header b24-viewer-topbar">
              <div class="lightbox-header-left" style="display:none">
                <span id="lightbox-file-icon" class="lightbox-file-icon"></span>
                <span id="lightbox-counter" class="lightbox-counter"></span>
              </div>
              <div class="b24-viewer-title-box">
                <span id="lightbox-title" class="lightbox-title b24-viewer-filename">File Preview</span>
              </div>
              <div class="lightbox-actions b24-viewer-actions">
                <button type="button" id="lb-zoom-in-btn" class="b24-v-btn" title="Zoom In (+)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                </button>
                <button type="button" id="lb-zoom-out-btn" class="b24-v-btn" title="Zoom Out (-)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                </button>
                <button type="button" id="lightbox-zoom-toggle-btn" class="b24-v-btn" title="Fit to Screen / 1:1 Size">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                </button>
                <a id="lightbox-download-link" href="#" target="_blank" download class="b24-v-btn" title="Download file">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </a>
                <button type="button" id="b24-viewer-more-btn" class="b24-v-btn" title="More options">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </button>
                <button type="button" id="lightbox-close-btn" class="b24-v-close-btn" aria-label="Close preview" title="Close (Esc)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
            <div id="lightbox-body" class="lightbox-body b24-viewer-body">
              <button type="button" id="lb-nav-prev" class="lb-nav-btn lb-nav-prev b24-v-nav prev" aria-label="Previous" style="display:none">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button type="button" id="lb-nav-next" class="lb-nav-btn lb-nav-next b24-v-nav next" aria-label="Next" style="display:none">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
              <div id="lb-zoom-controls" class="lb-zoom-controls" style="display:none">
                <button type="button" id="lb-zoom-reset-btn" style="display:none"></button>
              </div>
            </div>
            <div id="lb-filmstrip" class="lb-filmstrip" style="display:none"></div>
          </div>
        </div>
      `;
      _modalEl = wrapper.firstElementChild;
      document.body.appendChild(_modalEl);
    }

    _titleEl = document.getElementById('lightbox-title');
    _counterEl = document.getElementById('lightbox-counter');
    _bodyEl = document.getElementById('lightbox-body');
    _filmstripEl = document.getElementById('lb-filmstrip');
    _navPrevEl = document.getElementById('lb-nav-prev');
    _navNextEl = document.getElementById('lb-nav-next');
    _downloadLinkEl = document.getElementById('lightbox-download-link');
    _zoomToggleBtn = document.getElementById('lightbox-zoom-toggle-btn');
    _zoomControls = document.getElementById('lb-zoom-controls');
    _fileIconEl = document.getElementById('lightbox-file-icon');
    _closeBtn = document.getElementById('lightbox-close-btn');
    _moreBtn = document.getElementById('b24-viewer-more-btn');

    if (!_isInitialized) {
      _bindGlobalEvents();
      _isInitialized = true;
    }
    return true;
  }

  function _bindGlobalEvents() {
    if (_closeBtn) _closeBtn.addEventListener('click', closeLightbox);
    if (_modalEl) {
      _modalEl.addEventListener('click', (e) => {
        if (e.target === _modalEl || e.target.classList.contains('b24-native-viewer')) {
          closeLightbox();
        }
      });
    }
    if (_navPrevEl) _navPrevEl.addEventListener('click', () => _lbGoTo(_lbIndex - 1));
    if (_navNextEl) _navNextEl.addEventListener('click', () => _lbGoTo(_lbIndex + 1));
    if (_moreBtn) {
      _moreBtn.addEventListener('click', () => {
        const item = _lbGallery[_lbIndex];
        if (item && item.url) openInBitrixViewer(item.url);
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!_modalEl || _modalEl.style.display !== 'flex') return;
      if (e.key === 'Escape') {
        closeLightbox();
        return;
      }
      if (e.key === 'ArrowLeft') {
        _lbGoTo(_lbIndex - 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        _lbGoTo(_lbIndex + 1);
        return;
      }
      if (e.key === '+' || e.key === '=') {
        const zbIn = document.getElementById('lb-zoom-in-btn');
        if (zbIn) zbIn.click();
        return;
      }
      if (e.key === '-' || e.key === '_') {
        const zbOut = document.getElementById('lb-zoom-out-btn');
        if (zbOut) zbOut.click();
        return;
      }
      if (e.key === '0') {
        const zbReset = document.getElementById('lb-zoom-reset-btn');
        if (zbReset) zbReset.click();
        return;
      }
    });
  }

  /**
   * HTML5 Canvas PDF Viewer (Multi-page continuous vertical scrolling & single-page inline)
   */
  function renderPdf(container, pdfUrl, title, isLightbox = false) {
    if (!container) return null;
    if (!isLightbox) {
      container.innerHTML = '';
    } else {
      const oldViewer = container.querySelector('.b24-pdf-viewer');
      if (oldViewer) oldViewer.remove();
    }

    const viewerWrap = document.createElement('div');
    viewerWrap.className = isLightbox ? 'b24-pdf-viewer lb-pdf-viewer' : 'b24-pdf-viewer inline-pdf-viewer';

    const docName = title || 'document.pdf';
    viewerWrap.innerHTML = `
      <div class="b24-pdf-controls" style="${isLightbox ? 'display:none !important;' : ''}">
        <div class="b24-pdf-ctrl-group">
          <button type="button" class="b24-pdf-btn pdf-prev-btn" title="Previous page" disabled>&lsaquo; Prev</button>
          <span class="b24-pdf-page-indicator">
            Page <span class="pdf-current-page">1</span> of <span class="pdf-total-pages">-</span>
          </span>
          <button type="button" class="b24-pdf-btn pdf-next-btn" title="Next page" disabled>Next &rsaquo;</button>
        </div>
        <div class="b24-pdf-ctrl-group">
          <button type="button" class="b24-pdf-btn pdf-zoom-out" title="Zoom out">&minus;</button>
          <span class="b24-pdf-zoom-val">Fit</span>
          <button type="button" class="b24-pdf-btn pdf-zoom-in" title="Zoom in">&plus;</button>
          <button type="button" class="b24-pdf-btn pdf-zoom-fit" title="Fit width">Fit</button>
        </div>
        <div class="b24-pdf-ctrl-group">
          <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="b24-pdf-btn b24-pdf-link-btn" title="Open PDF in new tab">↗ Open Tab</a>
          <a href="${pdfUrl}" download="${docName}" class="b24-pdf-btn b24-pdf-link-btn" title="Download PDF file">⤓ Download</a>
        </div>
      </div>
      <div class="b24-pdf-canvas-stage">
        <div class="b24-pdf-loading">
          <div class="b24-pdf-spinner"></div>
          <span>Rendering PDF document...</span>
        </div>
        ${!isLightbox ? '<canvas class="b24-pdf-canvas" style="display:none;"></canvas>' : ''}
      </div>
    `;
    container.appendChild(viewerWrap);

    const prevBtn = viewerWrap.querySelector('.pdf-prev-btn');
    const nextBtn = viewerWrap.querySelector('.pdf-next-btn');
    const curPageEl = viewerWrap.querySelector('.pdf-current-page');
    const totalPagesEl = viewerWrap.querySelector('.pdf-total-pages');
    const zoomInBtn = viewerWrap.querySelector('.pdf-zoom-in');
    const zoomOutBtn = viewerWrap.querySelector('.pdf-zoom-out');
    const zoomFitBtn = viewerWrap.querySelector('.pdf-zoom-fit');
    const zoomValEl = viewerWrap.querySelector('.b24-pdf-zoom-val');
    const stage = viewerWrap.querySelector('.b24-pdf-canvas-stage');
    const loadingEl = viewerWrap.querySelector('.b24-pdf-loading');
    const singleCanvas = viewerWrap.querySelector('.b24-pdf-canvas');
    const singleCtx = singleCanvas ? singleCanvas.getContext('2d') : null;

    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 'fit';
    let activeRenderTasks = [];
    let zoomLevel = 1.0;

    function cancelActiveTasks() {
      activeRenderTasks.forEach((task) => {
        try {
          if (task && typeof task.cancel === 'function') task.cancel();
        } catch (_) {}
      });
      activeRenderTasks = [];
    }

    function showFallback(errMsg) {
      if (!loadingEl || !stage) return;
      loadingEl.style.display = 'none';
      stage.innerHTML = `
        <div class="b24-pdf-fallback-card">
          <div class="pdf-fallback-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <h3 class="pdf-fallback-title">PDF Document Preview</h3>
          <p class="pdf-fallback-desc">
            ${errMsg ? 'Browser security policy prevented direct in-frame rendering.' : 'Click below to open or download this document.'}
          </p>
          <div class="pdf-fallback-btns">
            <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
              <span>↗</span> Open in New Window
            </a>
            <a href="${pdfUrl}" download="${docName}" class="btn btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
              <span>⤓</span> Download File
            </a>
          </div>
        </div>
      `;
    }

    function renderPage(num) {
      if (!pdfDoc || !singleCanvas || !singleCtx) return;
      pageRendering = true;
      pdfDoc.getPage(num).then((page) => {
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        let currentScale = 1.0;
        if (scale === 'fit') {
          const availableWidth = Math.max(stage.clientWidth - 40, 200);
          currentScale = Math.min(Math.max(availableWidth / unscaledViewport.width, 0.4), 2.5);
          if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;
        } else {
          currentScale = scale;
          if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;
        }

        const viewport = page.getViewport({ scale: currentScale });
        const outputScale = window.devicePixelRatio || 1;
        singleCanvas.width = Math.floor(viewport.width * outputScale);
        singleCanvas.height = Math.floor(viewport.height * outputScale);
        singleCanvas.style.width = Math.floor(viewport.width) + 'px';
        singleCanvas.style.height = Math.floor(viewport.height) + 'px';

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        const renderContext = {
          canvasContext: singleCtx,
          transform: transform,
          viewport: viewport
        };

        const renderTask = page.render(renderContext);
        renderTask.promise.then(() => {
          pageRendering = false;
          if (loadingEl) loadingEl.style.display = 'none';
          singleCanvas.style.display = 'block';
          if (curPageEl) curPageEl.textContent = num;
          if (prevBtn) prevBtn.disabled = num <= 1;
          if (nextBtn) nextBtn.disabled = num >= pdfDoc.numPages;

          if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
          }
        }).catch((err) => {
          pageRendering = false;
          console.warn('PDF page render error:', err);
          showFallback(err.message);
        });
      }).catch((err) => {
        pageRendering = false;
        console.warn('PDF getPage error:', err);
        showFallback(err.message);
      });
    }

    function queueRenderPage(num) {
      if (pageRendering) pageNumPending = num;
      else renderPage(num);
    }

    async function renderAllLightboxPages() {
      if (!pdfDoc) return;
      cancelActiveTasks();

      const oldCards = stage.querySelectorAll('.b24-pdf-page-card');
      oldCards.forEach((c) => c.remove());

      if (loadingEl) loadingEl.style.display = 'flex';

      const containerWidth = container.clientWidth || (_bodyEl ? _bodyEl.clientWidth : 0) || (typeof window !== 'undefined' ? window.innerWidth : 800);
      const baseWidth = Math.min(Math.max(containerWidth - 60, 320), 860);

      const numPages = pdfDoc.numPages;
      for (let p = 1; p <= numPages; p++) {
        try {
          const page = await pdfDoc.getPage(p);
          const unscaledViewport = page.getViewport({ scale: 1.0 });

          const baseScale = baseWidth / unscaledViewport.width;
          const finalScale = baseScale * zoomLevel;
          const viewport = page.getViewport({ scale: finalScale });

          const card = document.createElement('div');
          card.className = 'b24-pdf-page-card';
          card.dataset.pageNum = String(p);

          const canvas = document.createElement('canvas');
          canvas.className = 'b24-pdf-canvas';
          const ctx = canvas.getContext('2d');

          const outputScale = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = Math.floor(viewport.width) + 'px';
          canvas.style.height = Math.floor(viewport.height) + 'px';

          card.appendChild(canvas);

          if (numPages > 1) {
            const badge = document.createElement('div');
            badge.className = 'b24-pdf-page-num-badge';
            badge.textContent = `Page ${p} of ${numPages}`;
            card.appendChild(badge);
          }

          stage.appendChild(card);
          if (loadingEl) loadingEl.style.display = 'none';

          const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
          const renderContext = {
            canvasContext: ctx,
            transform: transform,
            viewport: viewport
          };

          const task = page.render(renderContext);
          activeRenderTasks.push(task);

          await task.promise.catch((err) => {
            if (err?.name !== 'RenderingCancelledException') {
              console.warn(`PDF page ${p} render warning:`, err);
            }
          });
        } catch (pageErr) {
          console.warn(`PDF getPage ${p} error:`, pageErr);
        }
      }

      if (loadingEl) loadingEl.style.display = 'none';
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (pageNum >= (pdfDoc?.numPages || 1)) return;
        pageNum++;
        queueRenderPage(pageNum);
      });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        const current = typeof scale === 'number' ? scale : 1.0;
        scale = Math.min(3.0, Math.round((current + 0.25) * 100) / 100);
        queueRenderPage(pageNum);
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        const current = typeof scale === 'number' ? scale : 1.0;
        scale = Math.max(0.5, Math.round((current - 0.25) * 100) / 100);
        queueRenderPage(pageNum);
      });
    }

    if (zoomFitBtn) {
      zoomFitBtn.addEventListener('click', () => {
        scale = 'fit';
        queueRenderPage(pageNum);
      });
    }

    function startRenderDoc(pdfLib, docSource) {
      const task = pdfLib.getDocument(docSource);
      task.promise.then((doc) => {
        pdfDoc = doc;
        if (totalPagesEl) totalPagesEl.textContent = doc.numPages;
        if (isLightbox) {
          renderAllLightboxPages();
        } else {
          renderPage(pageNum);
        }
      }).catch((err) => {
        console.warn('PDF loadingTask error:', err);
        showFallback(err.message);
      });
    }

    function initDoc(pdfLib) {
      try {
        pdfLib.GlobalWorkerOptions.workerSrc = '/js/vendor/pdf.worker.min.js';
        if (pdfUrl.startsWith('data:application/pdf;base64,')) {
          const base64 = pdfUrl.split('base64,')[1];
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          startRenderDoc(pdfLib, { data: bytes });
          return;
        }

        fetch(pdfUrl, { headers: getCrmAuthHeaders() })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('text/html')) throw new Error('Received HTML login page instead of PDF');
            return res.arrayBuffer();
          })
          .then((buf) => {
            const bytes = new Uint8Array(buf);
            if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
              throw new Error('Invalid PDF header signature');
            }
            startRenderDoc(pdfLib, { data: bytes });
          })
          .catch(async (fetchErr) => {
            console.warn('[PDF PREVIEW] Primary proxy stream failed:', fetchErr.message);
            const nativeUrl = getNativeFileUrl(pdfUrl);
            const freshAuth = window.BX24 && typeof window.BX24.getAuth === 'function' ? window.BX24.getAuth() : null;
            if (nativeUrl && freshAuth && freshAuth.access_token) {
              try {
                const directUrl = nativeUrl + (nativeUrl.includes('?') ? '&' : '?') + `auth=${encodeURIComponent(freshAuth.access_token)}`;
                const directRes = await fetch(directUrl);
                if (directRes.ok) {
                  const directBuf = await directRes.arrayBuffer();
                  const directBytes = new Uint8Array(directBuf);
                  if (directBytes.length >= 4 && directBytes[0] === 0x25 && directBytes[1] === 0x50) {
                    startRenderDoc(pdfLib, { data: directBytes });
                    return;
                  }
                }
              } catch (_) {}
            }
            try {
              const fallbackTask = pdfLib.getDocument({ url: pdfUrl, withCredentials: false });
              fallbackTask.promise.then((doc) => {
                pdfDoc = doc;
                if (totalPagesEl) totalPagesEl.textContent = doc.numPages;
                if (isLightbox) renderAllLightboxPages();
                else renderPage(pageNum);
              }).catch((err) => {
                showFallback(err.message);
              });
            } catch (e) {
              showFallback(e.message);
            }
          });
      } catch (e) {
        console.warn('initDoc error:', e);
        showFallback(e.message);
      }
    }

    if (typeof window !== 'undefined') {
      if (window.pdfjsLib) {
        initDoc(window.pdfjsLib);
      } else {
        const script = document.createElement('script');
        script.src = '/js/vendor/pdf.min.js';
        script.onload = () => {
          if (window.pdfjsLib) initDoc(window.pdfjsLib);
          else showFallback();
        };
        script.onerror = () => showFallback();
        document.head.appendChild(script);
      }
    }

    return {
      zoomIn: () => {
        if (isLightbox) {
          zoomLevel = Math.min(3.0, Math.round((zoomLevel + 0.25) * 100) / 100);
          renderAllLightboxPages();
        } else {
          const current = typeof scale === 'number' ? scale : 1.0;
          scale = Math.min(3.0, Math.round((current + 0.25) * 100) / 100);
          queueRenderPage(pageNum);
        }
      },
      zoomOut: () => {
        if (isLightbox) {
          zoomLevel = Math.max(0.5, Math.round((zoomLevel - 0.25) * 100) / 100);
          renderAllLightboxPages();
        } else {
          const current = typeof scale === 'number' ? scale : 1.0;
          scale = Math.max(0.5, Math.round((current - 0.25) * 100) / 100);
          queueRenderPage(pageNum);
        }
      },
      toggleZoom: () => {
        if (isLightbox) {
          zoomLevel = zoomLevel !== 1.0 ? 1.0 : 1.5;
          if (_zoomToggleBtn) _zoomToggleBtn.classList.toggle('active', zoomLevel > 1.0);
          renderAllLightboxPages();
        } else {
          scale = scale === 'fit' ? 1.5 : 'fit';
          queueRenderPage(pageNum);
        }
      },
      fit: () => {
        if (isLightbox) {
          zoomLevel = 1.0;
          if (_zoomToggleBtn) _zoomToggleBtn.classList.remove('active');
          renderAllLightboxPages();
        } else {
          scale = 'fit';
          queueRenderPage(pageNum);
        }
      },
      cleanup: () => {
        cancelActiveTasks();
      }
    };
  }

  function _lbSetCounter() {
    if (!_counterEl) return;
    if (_lbGallery.length > 1) {
      _counterEl.textContent = `${_lbIndex + 1} / ${_lbGallery.length}`;
      _counterEl.style.display = '';
    } else {
      _counterEl.style.display = 'none';
    }
  }

  function _lbSetNavState() {
    if (!_navPrevEl || !_navNextEl) return;
    const multi = _lbGallery.length > 1;
    _navPrevEl.style.display = multi ? 'flex' : 'none';
    _navNextEl.style.display = multi ? 'flex' : 'none';
    _navPrevEl.disabled = _lbIndex === 0;
    _navNextEl.disabled = _lbIndex === _lbGallery.length - 1;
  }

  function _lbSyncFilmstrip() {
    if (!_filmstripEl) return;
    _filmstripEl.querySelectorAll('.lb-film-item').forEach((el, i) => {
      el.classList.toggle('active', i === _lbIndex);
    });
    const activeEl = _filmstripEl.querySelectorAll('.lb-film-item')[_lbIndex];
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  function _lbBuildFilmstrip(gallery) {
    if (!_filmstripEl) return;
    _filmstripEl.innerHTML = '';
    if (gallery.length <= 1) {
      _filmstripEl.style.display = 'none';
      return;
    }
    _filmstripEl.style.display = 'flex';
    gallery.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'lb-film-item' + (i === _lbIndex ? ' active' : '');
      if (item.isImage) {
        const filmImg = document.createElement('img');
        filmImg.src = getPreviewUrl(item.url, item.fieldCode, item.id);
        filmImg.alt = item.name;
        filmImg.loading = 'lazy';
        filmImg.onerror = function () {
          if (!this.dataset.proxied) {
            this.dataset.proxied = '1';
            this.src = getPreviewUrl(item.url, item.fieldCode, item.id);
          } else if (!this.dataset.triedDirect) {
            this.dataset.triedDirect = '1';
            const freshAuth = window.BX24 && typeof window.BX24.getAuth === 'function' ? window.BX24.getAuth() : null;
            const nativeUrl = getNativeFileUrl(item.url);
            if (nativeUrl && freshAuth && freshAuth.access_token) {
              this.src = nativeUrl + (nativeUrl.includes('?') ? '&' : '?') + `auth=${encodeURIComponent(freshAuth.access_token)}`;
            }
          }
        };
        el.appendChild(filmImg);
      } else {
        const badgeClass = item.isPdf ? 'pdf' : 'doc';
        const icon = item.isPdf ? 'PDF' : 'DOC';
        el.innerHTML = `
          <div class="lb-film-item-doc">
            <span>${icon}</span>
            <span class="lb-film-badge ${badgeClass}">${item.isPdf ? 'PDF' : 'DOC'}</span>
          </div>
        `;
      }
      el.addEventListener('click', () => _lbGoTo(i));
      _filmstripEl.appendChild(el);
    });
  }

  function _lbGoTo(idx) {
    if (idx < 0 || idx >= _lbGallery.length) return;
    _lbIndex = idx;
    _lbScale = 1;
    _lbImgX = 0;
    _lbImgY = 0;
    _lbRenderCurrent();
    _lbSetCounter();
    _lbSetNavState();
    _lbSyncFilmstrip();
  }

  function _lbRenderCurrent() {
    if (_lightboxCleanup) {
      _lightboxCleanup();
      _lightboxCleanup = null;
    }

    if (!_bodyEl) return;
    const existingImg = _bodyEl.querySelector('.lightbox-img');
    const existingIframe = _bodyEl.querySelector('.lightbox-iframe');
    const existingError = _bodyEl.querySelector('.lb-error-box');
    const existingPdf = _bodyEl.querySelector('.b24-pdf-viewer');
    if (existingImg) existingImg.remove();
    if (existingIframe) existingIframe.remove();
    if (existingError) existingError.remove();
    if (existingPdf) existingPdf.remove();

    const item = _lbGallery[_lbIndex];
    if (!item) return;

    if (_titleEl) _titleEl.textContent = item.name || 'Preview';
    if (_downloadLinkEl) {
      _downloadLinkEl.href = getPreviewUrl(item.url, item.fieldCode, item.id);
      _downloadLinkEl.setAttribute('download', item.name || 'download');
    }

    if (item.isPdf) {
      if (_fileIconEl) _fileIconEl.textContent = '';
      if (_zoomToggleBtn) {
        _zoomToggleBtn.style.display = 'inline-flex';
        _zoomToggleBtn.classList.remove('active');
        _zoomToggleBtn.title = 'Fit Width / Actual Size';
      }
      if (_zoomControls) _zoomControls.style.display = 'flex';

      const zbIn = document.getElementById('lb-zoom-in-btn');
      const zbOut = document.getElementById('lb-zoom-out-btn');
      if (zbIn) zbIn.style.display = 'inline-flex';
      if (zbOut) zbOut.style.display = 'inline-flex';

      const proxyUrl = getPreviewUrl(item.url, item.fieldCode, item.id);
      const pdfCtrl = renderPdf(_bodyEl, proxyUrl, item.name, true);

      if (zbIn) zbIn.onclick = () => pdfCtrl?.zoomIn?.();
      if (zbOut) zbOut.onclick = () => pdfCtrl?.zoomOut?.();
      if (_zoomToggleBtn) _zoomToggleBtn.onclick = () => pdfCtrl?.toggleZoom?.();

      _lightboxCleanup = () => {
        if (pdfCtrl?.cleanup) pdfCtrl.cleanup();
        if (zbIn) zbIn.onclick = null;
        if (zbOut) zbOut.onclick = null;
        if (_zoomToggleBtn) _zoomToggleBtn.onclick = null;
      };
    } else if (item.isImage) {
      if (_fileIconEl) _fileIconEl.textContent = '';
      if (_zoomControls) _zoomControls.style.display = 'flex';

      if (_zoomToggleBtn) {
        _zoomToggleBtn.style.display = 'inline-flex';
        _zoomToggleBtn.classList.remove('active');
        _zoomToggleBtn.title = 'Fit to Screen / 1:1 Size';
      }

      _lbScale = 1;
      _lbImgX = 0;
      _lbImgY = 0;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let hasDragged = false;

      const img = document.createElement('img');
      img.className = 'lightbox-img lb-transitioning';
      img.src = getPreviewUrl(item.url, item.fieldCode, item.id);
      img.alt = item.name;
      img.onerror = () => {
        if (!img.dataset.triedDirect) {
          img.dataset.triedDirect = '1';
          const freshAuth = window.BX24 && typeof window.BX24.getAuth === 'function' ? window.BX24.getAuth() : null;
          const nativeUrl = getNativeFileUrl(item.url);
          if (nativeUrl && freshAuth && freshAuth.access_token) {
            img.src = nativeUrl + (nativeUrl.includes('?') ? '&' : '?') + `auth=${encodeURIComponent(freshAuth.access_token)}`;
            return;
          }
        }
        img.style.display = 'none';
        const err = document.createElement('div');
        err.className = 'lb-error-box';
        err.innerHTML = `
          <span>Unable to preview image</span>
          <a href="${item.url}" target="_blank" class="lb-error-link">Open in new tab</a>
        `;
        _bodyEl.appendChild(err);
      };
      _bodyEl.appendChild(img);

      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            img.classList.remove('lb-transitioning');
          })
        );
      }

      const applyTransform = (smooth = true) => {
        img.style.transition = smooth ? 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
        img.style.transform = `translate(${_lbImgX}px, ${_lbImgY}px) scale(${_lbScale})`;
      };

      const setZoom = (scale, smooth = true) => {
        _lbScale = Math.max(1, Math.min(8, scale));
        if (_lbScale === 1) {
          _lbImgX = 0;
          _lbImgY = 0;
        }
        applyTransform(smooth);
        img.classList.toggle('zoomed-in', _lbScale > 1);
        if (_zoomToggleBtn) {
          _zoomToggleBtn.classList.toggle('active', _lbScale > 1);
          _zoomToggleBtn.title = _lbScale > 1 ? 'Fit to Screen' : '1:1 Original Size';
        }
      };

      const toggleZoom = () => setZoom(_lbScale > 1 ? 1 : 4);

      const zbIn = document.getElementById('lb-zoom-in-btn');
      const zbOut = document.getElementById('lb-zoom-out-btn');
      const zbReset = document.getElementById('lb-zoom-reset-btn');
      if (zbIn) zbIn.onclick = () => setZoom(_lbScale * 1.5);
      if (zbOut) zbOut.onclick = () => setZoom(_lbScale / 1.5);
      if (zbReset) zbReset.onclick = () => setZoom(1);

      img.addEventListener('click', () => {
        if (hasDragged) {
          hasDragged = false;
          return;
        }
        toggleZoom();
      });

      if (_zoomToggleBtn) _zoomToggleBtn.onclick = toggleZoom;

      img.addEventListener('mousedown', (e) => {
        if (_lbScale <= 1) return;
        isDragging = true;
        hasDragged = false;
        dragStartX = e.clientX - _lbImgX;
        dragStartY = e.clientY - _lbImgY;
        img.classList.add('grabbing');
        e.preventDefault();
      });

      const onMove = (e) => {
        if (!isDragging || _lbScale <= 1) return;
        const nx = e.clientX - dragStartX;
        const ny = e.clientY - dragStartY;
        if (Math.abs(nx - _lbImgX) > 3 || Math.abs(ny - _lbImgY) > 3) hasDragged = true;
        _lbImgX = nx;
        _lbImgY = ny;
        applyTransform(false);
      };

      const onUp = () => {
        if (!isDragging) return;
        isDragging = false;
        img.classList.remove('grabbing');
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);

      const onWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.85 : 1.2;
        setZoom(_lbScale * delta, false);
      };
      _bodyEl.addEventListener('wheel', onWheel, { passive: false });

      _lightboxCleanup = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        _bodyEl.removeEventListener('wheel', onWheel);
        if (zbIn) zbIn.onclick = null;
        if (zbOut) zbOut.onclick = null;
        if (zbReset) zbReset.onclick = null;
        if (_zoomToggleBtn) _zoomToggleBtn.onclick = null;
      };
    } else {
      if (_fileIconEl) _fileIconEl.textContent = '';
      if (_zoomToggleBtn) _zoomToggleBtn.style.display = 'none';
      if (_zoomControls) _zoomControls.style.display = 'none';

      const panel = document.createElement('div');
      panel.className = 'lb-document-panel';
      const icon = document.createElement('span');
      icon.className = 'lb-document-icon';
      icon.textContent = 'PDF';
      const name = document.createElement('strong');
      name.className = 'lb-document-name';
      name.textContent = item.name || 'Document';
      const message = document.createElement('p');
      message.textContent = 'Open this file using the Bitrix24 viewer.';
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'lb-document-open';
      openButton.textContent = 'Open in Bitrix24';
      openButton.addEventListener('click', () => openInBitrixViewer(item.url));
      panel.append(icon, name, message, openButton);
      _bodyEl.appendChild(panel);
    }
  }

  /**
   * Opens the fullscreen gallery lightbox.
   */
  function openLightbox(title, url, isPdf = false, gallery = null, startIdx = 0, sourceEl = null) {
    ensureModal();

    if (gallery && gallery.length > 1) {
      _lbGallery = gallery;
      _lbIndex = startIdx;
    } else {
      _lbGallery = [{ url, name: title, isImage: !isPdf, isPdf }];
      _lbIndex = 0;
    }

    _lbBuildFilmstrip(_lbGallery);
    _lbRenderCurrent();
    _lbSetCounter();
    _lbSetNavState();

    if (_modalEl) {
      const contentEl = _modalEl.querySelector('.lightbox-content');
      _modalEl.style.position = 'fixed';
      _modalEl.style.inset = '0';
      _modalEl.style.top = '0px';
      _modalEl.style.left = '0px';
      _modalEl.style.width = '100vw';
      _modalEl.style.height = '100vh';
      _modalEl.style.zIndex = '999999';
      _modalEl.style.display = 'flex';
      _modalEl.style.alignItems = 'center';
      _modalEl.style.justifyContent = 'center';

      if (contentEl) {
        contentEl.style.height = '90vh';
        contentEl.style.maxHeight = '90vh';
        contentEl.style.marginTop = '0px';
        contentEl.style.width = '92vw';
        contentEl.style.maxWidth = '1200px';
        try {
          contentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
      }

      _modalEl.style.display = 'flex';
      _modalEl.classList.add('is-open');
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.overflow = 'hidden';
    }
  }

  /**
   * Closes the fullscreen gallery lightbox.
   */
  function closeLightbox() {
    if (_lightboxCleanup) {
      _lightboxCleanup();
      _lightboxCleanup = null;
    }
    if (_modalEl) {
      const contentEl = _modalEl.querySelector('.lightbox-content');
      if (contentEl) {
        contentEl.style.height = '';
        contentEl.style.maxHeight = '';
        contentEl.style.marginTop = '';
      }
      _modalEl.style.display = 'none';
      _modalEl.classList.remove('is-open');
      _modalEl.style.position = '';
      _modalEl.style.top = '';
      _modalEl.style.left = '';
      _modalEl.style.width = '';
      _modalEl.style.height = '';
      _modalEl.style.minHeight = '';
      _modalEl.style.maxHeight = '';
      _modalEl.style.alignItems = '';
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.overflow = '';
    }
    if (_bodyEl) {
      const img = _bodyEl.querySelector('.lightbox-img');
      const iframe = _bodyEl.querySelector('.lightbox-iframe');
      const errorBox = _bodyEl.querySelector('.lb-error-box');
      const pdfViewer = _bodyEl.querySelector('.b24-pdf-viewer');
      if (img) img.remove();
      if (iframe) iframe.remove();
      if (errorBox) errorBox.remove();
      if (pdfViewer) pdfViewer.remove();
    }
    _lbGallery = [];
    _lbIndex = 0;
    _lbScale = 1;
    _lbImgX = 0;
    _lbImgY = 0;
    if (_zoomToggleBtn) {
      _zoomToggleBtn.style.display = 'none';
      _zoomToggleBtn.onclick = null;
    }
    if (_zoomControls) _zoomControls.style.display = 'none';
    if (_filmstripEl) _filmstripEl.style.display = 'none';
    if (_counterEl) _counterEl.style.display = 'none';
    if (_navPrevEl) _navPrevEl.style.display = 'none';
    if (_navNextEl) _navNextEl.style.display = 'none';
  }

  return {
    configure,
    getCrmAuthHeaders,
    getPreviewUrl,
    getNativeFileUrl,
    openInBitrixViewer,
    renderPdf,
    openLightbox,
    closeLightbox,
    ensureModal
  };
}));
