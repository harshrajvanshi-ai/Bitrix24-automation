/**
 * public/js/record-owner-guard.js
 * Client-side Ownership & Manager Verification Helper for Bitrix24 Placement Tabs
 *
 * Implements Salesforce Formula Checks (#6, #7, #10):
 *  - #6 (Enquiry): "Am I the record owner" -> item.assignedById === user.current.ID
 *  - #7 (Offer): "Am I the offer Manager" -> item.ufCrm22_1791173596 === user.current
 *  - #10 (Listing): "Am I the record owner" -> item.assignedById === user.current.ID
 *
 * Evaluated per-viewer dynamically in the browser (never stored on server).
 */

(function (window) {
  'use strict';

  let cachedUser = null;

  const RecordOwnerGuard = {
    /**
     * Fetch current logged-in Bitrix24 user (cached per session)
     */
    getCurrentUser: function () {
      return new Promise(function (resolve, reject) {
        if (cachedUser) {
          return resolve(cachedUser);
        }

        if (window.BX24 && typeof window.BX24.callMethod === 'function') {
          window.BX24.callMethod('user.current', {}, function (result) {
            if (result.error()) {
              console.warn('[OWNER-GUARD] user.current error:', result.error().toString());
              // Fallback to BX24.getAuth().user_id if available
              const auth = typeof window.BX24.getAuth === 'function' ? window.BX24.getAuth() : null;
              if (auth && (auth.user_id || auth.userId)) {
                cachedUser = { ID: String(auth.user_id || auth.userId) };
                return resolve(cachedUser);
              }
              reject(new Error(result.error().toString()));
            } else {
              cachedUser = result.data();
              resolve(cachedUser);
            }
          });
        } else {
          // Dev / non-iframe fallback
          resolve({ ID: '1', NAME: 'Current', LAST_NAME: 'User' });
        }
      });
    },

    /**
     * Check if current user is the record owner (assignedById match)
     * Used for Enquiry (#6) and Listing (#10)
     */
    isRecordOwner: function (item, currentUserId) {
      if (!item || !currentUserId) return false;
      const assigned = String(item.assignedById || item.ASSIGNED_BY_ID || '').trim();
      const current = String(currentUserId).trim();
      return assigned === current;
    },

    /**
     * Check if current user is the Offer Manager (#7)
     * Compares offer manager field (ufCrm22_1791173596 or assignedById)
     */
    isOfferManager: function (item, user) {
      if (!item || !user) return false;
      const currentId = String(user.ID || user.id || '').trim();
      const currentName = `${user.NAME || ''} ${user.LAST_NAME || ''}`.trim().toLowerCase();

      // Check manager userfield ufCrm22_1791173596
      const managerField = (item.ufCrm22_1791173596 || item.UF_CRM_22_1791173596 || '').toString().trim().toLowerCase();
      if (managerField) {
        if (managerField === currentId) return true;
        if (currentName && managerField.includes(currentName)) return true;
      }

      // Fallback: check assignedById
      const assigned = String(item.assignedById || item.ASSIGNED_BY_ID || '').trim();
      return assigned === currentId;
    },

    /**
     * Automatically evaluate ownership and enable/disable UI controls
     *
     * @param {Object} options
     *  - item: The CRM item data object
     *  - entityTypeId: 1040 | 1044 | 1058 | 1062 | 1070
     *  - editControlsSelector: CSS selector for buttons/inputs that require ownership (e.g. '.owner-only')
     *  - badgeElementId: Optional element to display "Owner" / "Viewer" badge
     *  - onEvaluated: Callback function({ isOwner, user, item })
     */
    applyOwnershipControls: async function (options) {
      options = options || {};
      const item = options.item;
      const entityTypeId = parseInt(options.entityTypeId, 10);
      const selector = options.editControlsSelector || '.owner-only, [data-requires-owner="true"]';

      try {
        const user = await this.getCurrentUser();
        let isOwner = false;

        if (entityTypeId === 1070) {
          // Offer Manager check
          isOwner = this.isOfferManager(item, user);
        } else {
          // Standard Record Owner check (Enquiry 1062, Listing 1058, etc.)
          isOwner = this.isRecordOwner(item, user?.ID);
        }

        // Apply state to DOM elements
        const elements = document.querySelectorAll(selector);
        elements.forEach(function (el) {
          if (isOwner) {
            el.disabled = false;
            el.classList.remove('owner-restricted');
            el.classList.add('owner-permitted');
            el.removeAttribute('title');
          } else {
            el.disabled = true;
            el.classList.add('owner-restricted');
            el.classList.remove('owner-permitted');
            el.setAttribute('title', 'Only the assigned record owner can perform this action');
          }
        });

        // Optional badge update
        if (options.badgeElementId) {
          const badge = document.getElementById(options.badgeElementId);
          if (badge) {
            badge.textContent = isOwner ? '👑 Record Owner' : '👁️ Viewer';
            badge.className = isOwner ? 'badge badge-success' : 'badge badge-secondary';
          }
        }

        if (typeof options.onEvaluated === 'function') {
          options.onEvaluated({ isOwner, user, item });
        }

        return { isOwner, user };
      } catch (err) {
        console.error('[OWNER-GUARD] Evaluation failed:', err);
        return { isOwner: false, error: err.message };
      }
    }
  };

  window.RecordOwnerGuard = RecordOwnerGuard;
})(window);
