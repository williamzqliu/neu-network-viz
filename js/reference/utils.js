/* core/utils.js
 * Shared utilities: Logger, InputMode detection, touch-safe event binding,
 * and DOM helpers. Must be loaded before all other modules.
 *
 * Usage:
 *   Logger.info('ModuleName', 'message', optionalValue)
 *   Logger.warn('ModuleName', 'message')
 *   Logger.error('ModuleName', 'message', errorObj)
 *   onTap(element, handler)
 *   getEl('some-id')   -- returns element or logs error if missing
 */

'use strict';

/* ── Logger ─────────────────────────────────────────────────────────────────
 * Set DEBUG = false before exhibition to suppress info-level logs.
 * warn() and error() always print regardless of DEBUG flag.
 */
const Logger = (() => {
  const DEBUG = true;

  function info(module, ...args) {
    if (DEBUG) console.log(`[${module}]`, ...args);
  }

  function warn(module, ...args) {
    console.warn(`[${module}]`, ...args);
  }

  function error(module, msg, err) {
    console.error(`[${module}] ${msg}`, err != null ? err : '');
  }

  return { info, warn, error };
})();


/* ── InputMode ───────────────────────────────────────────────────────────────
 * Detects whether the primary input is touch or mouse.
 * isTouch is set once on load; also updates if the user switches input type
 * (e.g. a touchscreen laptop where the user switches to mouse).
 *
 * Used by:
 *   - Tooltip show/hide logic (left/right panels, views)
 *   - Double-tap vs dblclick detection (view2 unit nodes)
 *   - Drag behavior hints
 */
const InputMode = (() => {
  let _isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // Update if user switches input type mid-session
  window.addEventListener('pointerdown', e => {
    _isTouch = (e.pointerType === 'touch');
  }, { passive: true });

  function isTouch() { return _isTouch; }

  return { isTouch };
})();


/* ── onTap ───────────────────────────────────────────────────────────────────
 * Attaches a click handler that works for both mouse and touch without
 * the 300ms delay on touch devices.
 *
 * Used everywhere instead of bare addEventListener('click').
 *
 * element  : DOM element
 * handler  : function(event)
 */
function onTap(element, handler) {
  if (!element) {
    Logger.warn('onTap', 'called with null element - handler not attached');
    return;
  }
  element.addEventListener('click', handler);
  element.addEventListener('touchend', e => {
    e.preventDefault();
    handler(e);
  }, { passive: false });
}


/* ── getEl ───────────────────────────────────────────────────────────────────
 * document.getElementById with a mandatory error log if the element is
 * missing. Avoids silent null dereferences throughout the codebase.
 *
 * id      : string
 * module  : string - caller module name shown in the log
 * returns : HTMLElement | null
 */
function getEl(id, module) {
  const el = document.getElementById(id);
  if (!el) {
    Logger.error(module || 'getEl', `element not found: #${id}`);
  }
  return el;
}


/* ── formatNumber ────────────────────────────────────────────────────────────
 * Compact number formatting for stat displays.
 * 1234 -> '1,234'   12345 -> '12.3k'   1234567 -> '1.2M'
 */
function formatNumber(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000)    return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString();
}


/* ── clamp ───────────────────────────────────────────────────────────────────
 * Clamps value between min and max.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
