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

  // Already on this view — no-op
  if (view === current) return;

  Logger.info('Main', `switchView ${current} -> ${view}`);

  // Update nav tab active state immediately
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Fade out left panel content immediately
  const leftContent = document.getElementById('left-content');
  if (leftContent) leftContent.style.opacity = '0';

  // Start panel slide immediately — only the slide, not canvas overlay positions
  _slidePanels(view);

  // Fade out current view pane
  const currentPane = document.getElementById('view-' + current);
  if (currentPane) currentPane.classList.remove('active');

  // Clear scrollable view content when leaving — inline pointer-events on
  // SVG/D3 elements can bypass parent pointer-events:none if left in DOM
  if (current === 'overview') {
    const oc = document.getElementById('overview-content');
    if (oc) oc.innerHTML = '';
  }
  if (current === 'methods') {
    const mc = document.getElementById('methods-content');
    if (mc) mc.innerHTML = '';
  }

  const FADE_MS = 220; // must match CSS transition duration
  setTimeout(() => {
    // Activate target view pane
    document.querySelectorAll('.view').forEach(pane => {
      pane.classList.toggle('active', pane.id === 'view-' + view);
    });

    // Determine default subview
    const subviewDefaults = { collab: 'collabmap', units: 'dept', bridging: 'clusters' };
    const subview = subviewDefaults[view] || '';

    // Update panel content + canvas overlay positions (after fade)
    Panels.update(view, subview);
    _applyPanelState(view);

    // Fade in left content after panel slide completes (250ms transition)
    const newVis = PANEL_VISIBILITY[view] || { left: false, right: false };
    if (newVis.left && leftContent) {
      setTimeout(() => { leftContent.style.opacity = ''; }, 100);
    }

    // Trigger view-specific build logic
    if (view === 'collab') {
      _initCollabView();
      ['canvas-search', 'data-overview', 'canvas-bottom-left', 'canvas-controls'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.opacity = '';
      });
    } else if (view === 'bridging') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ViewCluster.init();
      }));
    } else if (view === 'units') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        View2.build('dept');
      }));
    } else if (view === 'overview') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const container = document.getElementById('overview-content');
        if (container) ViewOverview.render(container);
      }));
    } else if (view === 'methods') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const container = document.getElementById('methods-content');
        if (container) ViewMethods.render(container);
      }));
    }
  }, FADE_MS);
}

/* ── Sub-view switching (within Research Units) ──────────────────────────── */
function switchSubView(subview) {
  const view = DS.state.view;
  Logger.info('Main', `switchSubView view=${view} subview=${subview}`);

  Panels.update(view, subview);

  if (view === 'units') {
    // Fade out the SVG canvas, rebuild, fade back in
    const svg = document.getElementById('v2-svg');
    if (svg) svg.style.opacity = '0';
    setTimeout(() => {
      View2.build(subview);
      if (svg) svg.style.opacity = '1';
    }, 200);
  }
}

/* ── Initialize Collaboration Map view ───────────────────────────────────── */
function _initCollabView() {
  View1.init && View1.init();
  View1.build && View1.build();
}

/* ── homeReset: brand click — go to collab map and reset view ────────────── */
function homeReset() {
  clearSearch();
  DS.state.selectedId = null;
  switchView('collab');
  requestAnimationFrame(() => {
    View1.clearTopicHighlight && View1.clearTopicHighlight();
    View1.zoomReset && View1.zoomReset();
  });
}

/* ── goToCollabMap: navigate to Collaboration Map (used by other views) ─── */
function goToCollabMap() {
  const id = DS.state.selectedId;
  Logger.info('Main', `goToCollabMap id=${id}`);
  switchView('collab');
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

/* ── Panel visibility per view ───────────────────────────────────────────── */
const PANEL_VISIBILITY = {
  collab:   { left: true,  right: true  },
  units:    { left: true,  right: true  },
  bridging: { left: false, right: true  },
  overview: { left: false, right: false },
  methods:  { left: false, right: false },
};

// Slide panels immediately on view switch — does NOT move canvas overlay positions
function _slidePanels(view) {
  const vis = PANEL_VISIBILITY[view] || { left: false, right: false };
  const leftEl  = document.getElementById('panel-left');
  const rightEl = document.getElementById('panel-right');
  if (leftEl) leftEl.classList.toggle('slide-out', !vis.left);
  if (rightEl) rightEl.classList.remove('open');
}

function _applyPanelState(view) {
  const vis = PANEL_VISIBILITY[view] || { left: false, right: false };
  const leftEl   = document.getElementById('panel-left');
  const rightEl  = document.getElementById('panel-right');
  const layoutEl = document.getElementById('layout');

  if (leftEl) leftEl.classList.toggle('slide-out', !vis.left);

  // Canvas overlays offset: 14px from left panel right edge when panel shown,
  // plain 14px when left panel is hidden
  if (layoutEl) layoutEl.classList.toggle('no-left-panel', !vis.left);

  // Right panel: hide on view switch; shows via showRightPanel() on node click
  if (rightEl) rightEl.classList.remove('open');
}

function showRightPanel() {
  const el = document.getElementById('panel-right');
  if (el) el.classList.add('open');
}

function hideRightPanel() {
  const el = document.getElementById('panel-right');
  if (el) el.classList.remove('open');
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
  overlay.style.transition = 'opacity 0.2s ease';
  setTimeout(() => {
    overlay.style.display = 'none';
    requestAnimationFrame(() => {
      DS.state.view    = 'overview';
      DS.state.subview = '';

      // Activate overview pane + nav tab
      document.querySelectorAll('.view').forEach(pane => {
        pane.classList.toggle('active', pane.id === 'view-overview');
      });
      document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === 'overview');
      });
      _applyPanelState('overview');

      const container = document.getElementById('overview-content');
      if (container) ViewOverview.render(container);
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

  // Fade in tutorial overlay
  const tutOverlay = document.getElementById('tutorial-overlay');
  if (tutOverlay) requestAnimationFrame(() => { tutOverlay.style.opacity = '1'; });

  // Initialize search
  Search.init();

  // Initialize resizable drawer
  DrawerManager.init();

  // Set initial panel state (overview landing — no panels shown)
  Panels.update('overview', '');
  _applyPanelState('overview');

  // Entrance animation: start left panel slid out, content + canvas overlays hidden
  const leftEl = document.getElementById('panel-left');
  if (leftEl) leftEl.classList.add('slide-out');
  const leftContent = document.getElementById('left-content');
  if (leftContent) leftContent.style.opacity = '0';
  ['data-overview', 'canvas-bottom-left', 'canvas-controls', 'canvas-search'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.opacity = '0';
  });

  Logger.info('Main', 'app initialized');
});
