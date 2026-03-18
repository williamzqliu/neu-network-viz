/* drawer/drawer.js
 * Bottom drawer dispatch layer.
 * Decides which drawer module to render based on view + subview.
 * Also handles the expand/collapse animation of the drawer container.
 *
 * Depends on: utils.js, datastore.js
 * Called by: panels.js (Drawer.update), main.js (toggleUnivDrawer)
 * Calls: DrawerV1, DrawerV2, DrawerV3
 * Module name for Logger: 'Drawer'
 *
 * DOM targets:
 *   #univ-drawer             - the outer drawer element
 *   #univ-drawer-btn         - the toggle button
 *   #univ-drawer-content     - the expandable content area
 *   #univ-drawer-inner       - the rendered chart content
 *
 * Public methods:
 *   Drawer.update(view, subview)   - re-render drawer content for current view
 */

'use strict';

const Drawer = (() => {

  /* ── update: called by Panels on every view/subview switch ───────────── */
  function update(view, subview) {
    Logger.info('Drawer', `update view=${view} subview=${subview}`);

    // Only render if drawer is currently open
    const isOpen = (typeof DrawerManager !== 'undefined')
      ? DrawerManager.isOpen()
      : document.getElementById('univ-drawer')?.classList.contains('is-open');

    if (!isOpen) return;

    _render(view, subview);
  }

  /* ── toggle: delegated to DrawerManager ──────────────────────────────── */
  function toggle() {
    // DrawerManager handles all state + animation; Drawer just renders content
    if (typeof DrawerManager !== 'undefined') {
      DrawerManager.toggle();
    }
  }

  /* ── _render: dispatch to correct drawer module ──────────────────────── */
  function _render(view, subview) {
    const inner = getEl('univ-drawer-inner', 'Drawer');
    if (!inner) return;

    try {
      if (view === 'collab') {
        DrawerV1.render(inner, subview);
      } else if (view === 'units') {
        DrawerV2.render(inner, subview);
      }
      // bridging, overview, methods: drawer disabled
    } catch (e) {
      Logger.error('Drawer', `render failed for ${view}/${subview}`, e);
      inner.innerHTML = `<div class="drawer-error">Chart unavailable</div>`;
    }
  }

  return { update, toggle };
})();
