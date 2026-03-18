/* core/panels.js
 * Panel dispatch center. The only place that decides what left, right,
 * and drawer show for each view + subview combination.
 *
 * All view switches must call Panels.update(view, subview).
 * Nothing else should directly call LeftV1.render(), RightV1.render(), etc.
 *
 * Depends on: utils.js, datastore.js
 * Called by:  core/main.js (switchView, switchSubView)
 * Calls:      left/*.js, right/*.js, drawer/*.js
 */

'use strict';

const Panels = (() => {

  /* ── Default subview per view ──────────────────────────────────────────── */
  const DEFAULT_SUBVIEW = {
    collab:   'collabmap',
    units:    'dept',
    bridging: 'clusters',
  };

  /* ── Public: update all panels for a given view + subview ──────────────── */
  function update(view, subview) {
    const sv = subview || DEFAULT_SUBVIEW[view] || '';

    // Persist into state so any module can read current routing
    DS.state.view    = view;
    DS.state.subview = sv;

    Logger.info('Panels', `update view=${view} subview=${sv}`);

    _updateSubviewButtons(view, sv);
    _updateLeft(view, sv);
    _updateRight(view, sv);
    _updateDrawer(view, sv);
  }

  /* ── Sub-view button highlight ─────────────────────────────────────────── */
  function _updateSubviewButtons(view, subview) {
    // Each view has its own switcher container; only touch buttons inside it
    const containerIds = {
      units: 'view-switcher-v2',
    };
    const containerId = containerIds[view];
    if (!containerId) return;

    const container = getEl(containerId, 'Panels');
    if (!container) return;

    container.querySelectorAll('.vs-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.subview === subview);
    });
  }

  /* ── Left panel dispatch ───────────────────────────────────────────────── */
  function _updateLeft(view, subview) {
    const el = getEl('left-content', 'Panels');
    if (!el) return;

    try {
      if (view === 'collab') {
        LeftV1.render(el, subview);
      } else if (view === 'units') {
        LeftV2.render(el, subview);
      } else {
        // overview, bridging, methods: no left panel content
        el.innerHTML = '';
      }
    } catch (e) {
      Logger.error('Panels', `left panel render failed for ${view}/${subview}`, e);
    }
  }

  /* ── Right panel dispatch ──────────────────────────────────────────────── */
  function _updateRight(view, subview) {
    // Switch active rp-view container
    const viewMap = { collab: 'rp-collab', units: 'rp-units', bridging: 'rp-bridging' };
    document.querySelectorAll('.rp-view').forEach(el => {
      el.classList.toggle('active', el.id === (viewMap[view] || ''));
    });

    // Reset the panel for this view (shows default placeholder/overview)
    try {
      if (view === 'collab') {
        RightV1.reset(subview);
      } else if (view === 'units') {
        RightV2.reset(subview);
      }
      // bridging: right panel managed by ViewCluster click handler
    } catch (e) {
      Logger.error('Panels', `right panel reset failed for ${view}/${subview}`, e);
    }
  }

  /* ── Drawer dispatch ───────────────────────────────────────────────────── */
  function _updateDrawer(view, subview) {
    try {
      Drawer.update(view, subview);
    } catch (e) {
      Logger.error('Panels', `drawer update failed for ${view}/${subview}`, e);
    }
  }

  /* ── showScholarCard: called by views when a scholar node is clicked ────── */
  function showScholarCard(id) {
    const view = DS.state.view;
    Logger.info('Panels', `showScholarCard id=${id} view=${view}`);
    try {
      if (view === 'collab') {
        RightV1.showScholar(id);
      }
    } catch (e) {
      Logger.error('Panels', `showScholarCard failed for ${id}`, e);
    }
  }

  /* ── showUnitCard: called by view2 when a unit node is clicked ──────────── */
  function showUnitCard(unitId) {
    Logger.info('Panels', `showUnitCard unitId=${unitId}`);
    try {
      RightV2.showUnit(unitId);
    } catch (e) {
      Logger.error('Panels', `showUnitCard failed for ${unitId}`, e);
    }
  }

  return { update, showScholarCard, showUnitCard };
})();
