/* drawer/drawer_manager.js
 * Resizable bottom drawer ("University Overview").
 * Supports:
 *   - Drag handle to freely resize
 *   - Three snap positions: collapsed / default / fullscreen
 *   - Double-click handle to toggle default ↔ fullscreen
 *   - Ctrl buttons: default height, full height, collapse
 *   - Touch drag support
 *
 * State:
 *   'collapsed'  — only handle bar visible (30px)
 *   'open'       — default expanded (~260px)
 *   'max'        — fills canvas area to header bottom
 *
 * Depends on: utils.js, datastore.js, drawer.js
 * Called by: index.html (onclick), main.js (toggleUnivDrawer)
 * Module name for Logger: 'DrawerManager'
 *
 * Public methods:
 *   DrawerManager.toggle()         — collapsed ↔ open
 *   DrawerManager.snapDefault()    — open at default height
 *   DrawerManager.snapMax()        — expand to full canvas height
 *   DrawerManager.close()          — collapse to handle only
 *   DrawerManager.isOpen()         — returns bool
 */

'use strict';

const DrawerManager = (() => {

  const COLLAPSED_H  = 35;    // handle bar only (px)
  const DEFAULT_H    = 260;   // default open height (px)
  const MIN_DRAG_H   = 80;    // minimum draggable height (px)

  let _state        = 'collapsed'; // 'collapsed' | 'open' | 'max'
  let _lastOpenH    = DEFAULT_H;   // remember user's drag height

  /* ── init: called once on DOMContentLoaded ───────────────────────────── */
  function init() {
    const handle = document.getElementById('drawer-resize-handle');
    if (!handle) return;

    // Click handle to toggle (but not if dragging)
    let _clickAllowed = true;
    handle.addEventListener('click', () => {
      if (!_clickAllowed) { _clickAllowed = true; return; }
      toggle();
    });

    // Double-click: snap between default and max
    handle.addEventListener('dblclick', e => {
      e.preventDefault();
      if (_state === 'max') snapDefault();
      else snapMax();
    });

    // Mouse drag
    handle.addEventListener('mousedown', e => {
      if (e.target.closest('.drawer-ctrl-btn')) return;
      e.preventDefault();
      _clickAllowed = false;
      _startDrag(e.clientY, () => { _clickAllowed = true; });
    });

    // Touch drag
    handle.addEventListener('touchstart', e => {
      if (e.target.closest('.drawer-ctrl-btn')) return;
      e.preventDefault();
      _clickAllowed = false;
      _startDrag(e.touches[0].clientY, () => { _clickAllowed = true; });
    }, { passive: false });

    // // ResizeObserver: re-render charts when drawer height changes
    // const drawerEl = document.getElementById('univ-drawer');
    // if (drawerEl && typeof ResizeObserver !== 'undefined') {
    //   let _roTimer = null;
    //   const ro = new ResizeObserver(() => {
    //     clearTimeout(_roTimer);
    //     _roTimer = setTimeout(() => {
    //       if (_state !== 'collapsed') {
    //         _renderIfNeeded();
    //       }
    //     }, 350);
    //   });
    //   ro.observe(drawerEl);
    // }

    Logger.info('DrawerManager', 'initialized');
  }

  /* ── toggle ──────────────────────────────────────────────────────────── */
  function toggle() {
    if (_state === 'collapsed') {
      snapMax();
    } else {
      close();
    }
  }

  /* ── snap positions ──────────────────────────────────────────────────── */
  function snapDefault() {
    _setHeight(_lastOpenH, true);
    _setOpen(true);
    _state = 'open';
    _updateBtnIcon();
    _renderIfNeeded();
  }

  function snapMax() {
    const maxH = _canvasHeight();
    _setHeight(maxH, true);
    _setOpen(true);
    _state = 'max';
    _updateBtnIcon();
    setTimeout(() => _renderIfNeeded(), 280);
  }

  function close() {
    // Save current height before closing (only if it was a meaningful height)
    const el = document.getElementById('univ-drawer');
    if (el && el.offsetHeight > COLLAPSED_H + 20) {
      _lastOpenH = el.offsetHeight;
    }
    _setHeight(COLLAPSED_H, true);
    _setOpen(false);
    _state = 'collapsed';
    _updateBtnIcon();
  }

  function isOpen() {
    return _state !== 'collapsed';
  }

  /* ── drag logic ──────────────────────────────────────────────────────── */
  function _startDrag(startY, onEndCallback) {
    const el     = document.getElementById('univ-drawer');
    if (!el) return;

    const startH  = el.offsetHeight;
    const canvasH = _canvasHeight();

    // Disable CSS transition during drag for smoothness
    el.style.transition = 'none';

    let hasMoved = false;

    function onMove(clientY) {
      const delta = startY - clientY;  // drag up = positive = taller
      const newH  = clamp(startH + delta, COLLAPSED_H, canvasH);
      el.style.height = newH + 'px';
      if (Math.abs(delta) > 4) hasMoved = true;

      // Show content once clearly open
      if (newH > COLLAPSED_H + 20) {
        _setOpen(true);
        if (_state === 'collapsed') {
          _state = 'open';
          _renderIfNeeded();
        }
      } else {
        _setOpen(false);
        _state = 'collapsed';
      }
    }

    function onEnd(clientY) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend',  onTouchEnd);

      // Restore transition
      el.style.transition = '';

      if (onEndCallback) onEndCallback();

      if (!hasMoved) return;

      const finalH = el.offsetHeight;

      // Snap to collapsed if dragged too low
      if (finalH <= COLLAPSED_H + 30) {
        close();
        return;
      }

      // Snap to max if within 60px of top
      if (finalH >= canvasH - 60) {
        snapMax();
        return;
      }

      // Save as new default height, trigger re-render with new size
      _lastOpenH = finalH;
      _state = 'open';
      _updateBtnIcon();
      _renderIfNeeded();
    }

    function onMouseMove(e) { onMove(e.clientY); }
    function onMouseUp(e)   { onEnd(e.clientY); }
    function onTouchMove(e) { e.preventDefault(); onMove(e.touches[0].clientY); }
    function onTouchEnd(e)  { onEnd(e.changedTouches[0].clientY); }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend',  onTouchEnd);
  }

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function _setHeight(h, animate) {
    const el = document.getElementById('univ-drawer');
    if (!el) return;
    if (!animate) el.style.transition = 'none';
    el.style.height = h + 'px';
    // Update CSS variable so canvas controls can reposition themselves
    const ca = document.getElementById('canvas-area');
    if (ca) ca.style.setProperty('--drawer-h', h + 'px');
    if (!animate) {
      void el.offsetHeight;
      el.style.transition = '';
    }
  }

  function _setOpen(open) {
    const el = document.getElementById('univ-drawer');
    if (el) el.classList.toggle('is-open', open);
  }

  function _canvasHeight() {
    // Full height of the canvas area (from top of canvas-area element)
    const ca = document.getElementById('canvas-area');
    return ca ? ca.offsetHeight : window.innerHeight - 54;
  }

  function _updateBtnIcon() {
    // Rotate the chevron in the handle button based on open/closed state
    const btn = document.getElementById('univ-drawer-btn');
    if (!btn) return;
    const svg = btn.querySelector('svg');
    if (!svg) return;

    if (_state === 'collapsed') {
      svg.style.transform = 'rotate(180deg)'; // arrow pointing up = "open"
    } else if (_state === 'max') {
      svg.style.transform = 'rotate(0deg)';   // arrow pointing up = "can collapse"
    } else {
      svg.style.transform = 'rotate(0deg)';
    }
  }

  function _renderIfNeeded() {
    // Trigger Drawer.update so charts get rendered if not already
    try {
      Drawer.update(DS.state.view, DS.state.subview);
    } catch (e) {
      Logger.error('DrawerManager', 'render trigger failed', e);
    }
  }

  /* ── Drawer.update override: check open state before rendering ────────── */
  // Patch Drawer.toggle to use DrawerManager instead
  // (main.js already calls Drawer.toggle → we override that below)

  return { init, toggle, snapDefault, snapMax, close, isOpen };
})();

/* ── Override toggleUnivDrawer to use DrawerManager ─────────────────────── */
// Redefine the global so HTML onclick and main.js both hit DrawerManager
function toggleUnivDrawer() {
  DrawerManager.toggle();
}
