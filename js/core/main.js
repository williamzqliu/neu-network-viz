/* core/main.js
 * Top-level application controller.
 * Handles view switching, tutorial overlay, and DOMContentLoaded init.
 *
 * Depends on: utils.js, datastore.js, panels.js
 * Calls: Panels.update(), View1/2/3, Drawer
 *
 * Global functions exposed for HTML onclick attributes:
 *   switchView(view)
 *   switchSubView(subview)
 *   goToCollabMap()
 *   toggleUnivDrawer()
 *   enterApp()
 *   closeCredits()
 *   v1ZoomIn(), v1ZoomOut(), v1ZoomReset()
 *   toggleLabels(), toggleIsolated(), toggleFreeze()
 */

'use strict';

/* ── View switching ──────────────────────────────────────────────────────── */
function switchView(view) {
  if (view === 'credits') {
    const ol = getEl('credits-overlay', 'switchView');
    if (ol) ol.classList.add('visible');
    return;
  }

  const current = DS.state.view;
  const currentSubview = DS.state.subview;
  const lastV1Subview = current === 'v1' ? currentSubview : (DS.state._lastV1Subview || 'collabmap');
  DS.state._lastV1Subview = lastV1Subview;

  // Already on this view - no-op unless a pending v3 scholar is queued
  if (view === current && view !== 'v3') return;

  Logger.info('Main', `switchView ${current} -> ${view}`);

  // Update nav tab active state immediately (no fade needed for tabs)
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Fade out current view, then switch
  const currentPane = document.getElementById('view-' + current);
  const nextPane = document.getElementById('view-' + view);

  // Remove active from current (triggers fade-out via CSS transition)
  if (currentPane) currentPane.classList.remove('active');

  // After fade-out completes, activate next view and trigger build
  const FADE_MS = 220; // must match CSS transition duration
  setTimeout(() => {
    // Show/hide: set all inactive, then activate target
    document.querySelectorAll('.view').forEach(pane => {
      pane.classList.toggle('active', pane.id === 'view-' + view);
    });

    // Show/hide the v3 switcher (lives outside view-v3)
    const v3sw = document.getElementById('view-switcher-v3');
    if (v3sw) v3sw.style.display = view === 'v3' ? 'flex' : 'none';

    // Determine the default subview for this view
    const subviewDefaults = { v1: lastV1Subview, v2: 'dept', v3: 'ego' };
    const subview = subviewDefaults[view] || '';

    // Update panels (left, right, drawer)
    Panels.update(view, subview);

    // Trigger view-specific build logic
    if (view === 'v1') {
      _restoreV1Display();
    } else if (view === 'v2') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        View2.build('dept');
      }));
    } else if (view === 'v3') {
      if (DS.state._pendingV3Id) {
        const id = DS.state._pendingV3Id;
        DS.state._pendingV3Id = null;
        // v3SourceView already set to 'v1' by the "Open Scholar Profile" button
        requestAnimationFrame(() => requestAnimationFrame(() => {
          View3.build(id, DS.state.egoHops);
        }));
      } else {
        // Navigated via header tab — hide back button in v3 right panel
        DS.state.v3SourceView = 'header';
      }
    }
  }, FADE_MS);
}

/* ── Sub-view switching (within a view) ─────────────────────────────────── */
function switchSubView(subview) {
  const view = DS.state.view;
  Logger.info('Main', `switchSubView view=${view} subview=${subview}`);

  Panels.update(view, subview);

  if (view === 'v1') {
    _handleV1SubView(subview);
  } else if (view === 'v2') {
    // Fade out the SVG canvas, rebuild, fade back in
    const svg = document.getElementById('v2-svg');
    if (svg) svg.style.opacity = '0';
    setTimeout(() => {
      View2.build(subview);
      if (svg) svg.style.opacity = '1';
    }, 200);
  }
  // v3 subviews handled by their own button handlers (setEgoHop, goToCollabMap)
}

/* ── V1 sub-view: toggle between Collaboration Map and Research Clusters ─── */
function _handleV1SubView(subview) {
  const canvas = getEl('v1-canvas', 'Main');
  const vcWrap = getEl('vc-container', 'Main');
  const legend = getEl('canvas-bottom-left', 'Main');
  const overview = getEl('data-overview', 'Main');
  const controls = getEl('canvas-controls', 'Main');

  const FADE_MS = 200;

  if (subview === 'collabmap') {
    // Fade out clusters view
    if (vcWrap) vcWrap.style.opacity = '0';
    setTimeout(() => {
      if (vcWrap) vcWrap.style.display = 'none';
      if (canvas) canvas.style.display = 'block';
      if (legend) legend.style.display = 'flex';
      if (overview) overview.style.display = 'flex';
      if (controls) controls.style.display = 'flex';
      ViewCluster.destroy && ViewCluster.destroy();
      // Fade in canvas and overlays
      requestAnimationFrame(() => {
        if (canvas) canvas.style.opacity = '1';
        if (legend) legend.style.opacity = '1';
        if (overview) overview.style.opacity = '1';
        if (controls) controls.style.opacity = '1';
      });
    }, FADE_MS);
  } else if (subview === 'clusters') {
    // Fade out canvas and overlays
    if (canvas) canvas.style.opacity = '0';
    if (legend) legend.style.opacity = '0';
    if (overview) overview.style.opacity = '0';
    if (controls) controls.style.opacity = '0';
    setTimeout(() => {
      if (canvas) canvas.style.display = 'none';
      if (legend) legend.style.display = 'none';
      if (overview) overview.style.display = 'none';
      if (controls) controls.style.display = 'none';
      if (vcWrap) vcWrap.style.display = 'block';
      if (vcWrap) vcWrap.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ViewCluster.init();
        if (vcWrap) vcWrap.style.opacity = '1';
      }));
    }, FADE_MS);
  }
}

/* ── Restore V1 canvas visibility after switching back from V2/V3 ────────── */
function _restoreV1Display() {
  const subview = DS.state.subview;
  // Re-apply whichever subview was active
  _handleV1SubView(subview === 'clusters' ? 'clusters' : 'collabmap');
}

/* ── Scholar Profile: v3 sub-view switching ────────────────────────────── */
// Called by the two buttons in #view-switcher-v3
function setV3Subview(subview) {
  if (DS.state.view !== 'v3') return;
  DS.state.subview = subview;
  Logger.info('Main', `setV3Subview subview=${subview}`);

  // Highlight active button
  const sw = document.getElementById('view-switcher-v3');
  if (sw) sw.querySelectorAll('.vs-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.subview === subview));

  if (subview === 'collabmap') {
    // Show v1 canvas; keep left/right panels in v3 state
    document.querySelectorAll('.view').forEach(el =>
      el.classList.toggle('active', el.id === 'view-v1'));
    const id = DS.state.selectedId;
    if (id) requestAnimationFrame(() => { View1.focusNode && View1.focusNode(id); });
  } else {
    // ego: restore v3 SVG
    document.querySelectorAll('.view').forEach(el =>
      el.classList.toggle('active', el.id === 'view-v3'));
  }
}

/* ── goToCollabMap: full navigation back to v1 (used by "Back" button) ─── */
function goToCollabMap() {
  const id = DS.state.selectedId;
  Logger.info('Main', `goToCollabMap id=${id}`);
  switchView('v1');
  if (id) {
    requestAnimationFrame(() => { View1.focusNode && View1.focusNode(id); });
  }
}

/* ── Ego network hop depth ───────────────────────────────────────────────── */
function setEgoHop(hops) {
  DS.state.egoHops = hops;
  if (DS.state.selectedId) {
    View3.build(DS.state.selectedId, hops);
  }
}

/* ── University Overview drawer (bottom) ────────────────────────────────── */
function toggleUnivDrawer() {
  DrawerManager.toggle();
}

/* ── Canvas zoom controls (v1) ───────────────────────────────────────────── */
function v1ZoomIn() { View1.zoomIn && View1.zoomIn(); }
function v1ZoomOut() { View1.zoomOut && View1.zoomOut(); }
function v1ZoomReset() { View1.zoomReset && View1.zoomReset(); }

/* ── V1 display toggles (bound to left panel buttons) ───────────────────── */
function toggleLabels() { View1.toggleLabels && View1.toggleLabels(); }
function toggleIsolated() { View1.toggleIsolated && View1.toggleIsolated(); }
function toggleFreeze() { View1.toggleFreeze && View1.toggleFreeze(); }

/* ── Unit mode (v2) ──────────────────────────────────────────────────────── */
function setUnitMode(mode) {
  switchSubView(mode);
}

/* ── Credits overlay ─────────────────────────────────────────────────────── */
function closeCredits() {
  const ol = getEl('credits-overlay', 'Main');
  if (ol) ol.classList.remove('visible');
}

/* ── Tutorial / entry screen ─────────────────────────────────────────────── */
function enterApp() {
  const overlay = getEl('tutorial-overlay', 'Main');
  if (!overlay) return;
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.4s ease';
  setTimeout(() => {
    overlay.style.display = 'none';
    requestAnimationFrame(() => {
      View1.init();
      View1.build();
    });
  }, 400);
}

/* ── DOMContentLoaded init ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  Logger.info('Main', 'DOMContentLoaded - initializing app');

  // Inject dynamic counts into tutorial overlay if present
  const centerCount = UNITS.filter(u => u.unit_type === 'center' && u.included).length;
  const scholarCount = SCHOLARS.length;
  const edgeCount = EDGES.length;

  const elCenters = document.getElementById('tut-center-count');
  const elScholars = document.getElementById('tut-scholar-count');
  const elEdges = document.getElementById('tut-edge-count');
  if (elCenters) elCenters.textContent = centerCount;
  if (elScholars) elScholars.textContent = scholarCount.toLocaleString();
  if (elEdges) elEdges.textContent = edgeCount.toLocaleString();

  // Show app, hide loading spinner
  const loading = document.getElementById('loading');
  const app = document.getElementById('app');
  if (loading) loading.style.display = 'none';
  if (app) app.style.display = 'grid';

  // Initialize search
  Search.init();

  // Initialize resizable drawer
  DrawerManager.init();

  // Set initial panel state (v1 / collabmap) without triggering view build
  // (View1.init() + build() is deferred until enterApp() is called)
  Panels.update('v1', 'collabmap');

  Logger.info('Main', 'app initialized');
});
