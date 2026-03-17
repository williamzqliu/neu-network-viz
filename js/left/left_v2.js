/* left/left_v2.js
 * Left panel for Unit Collaboration (v2).
 * Shows view mode hint and interaction instructions.
 * Mode switching (Departments / Research Centers / Compare) is
 * handled by the in-canvas switcher buttons; this panel just confirms
 * the current mode and provides help text.
 *
 * Depends on: utils.js, datastore.js
 * Called by: panels.js (_updateLeft when view = 'v2')
 * Module name for Logger: 'LeftV2'
 *
 * Public methods:
 *   LeftV2.render(container, subview)
 */

'use strict';

const LeftV2 = (() => {

  /* ── render ──────────────────────────────────────────────────────────── */
  function render(container, subview) {
    Logger.info('LeftV2', `render subview=${subview}`);
    container.innerHTML = _buildHTML(subview);
  }

  /* ── HTML builder ────────────────────────────────────────────────────── */
  function _buildHTML(subview) {
    const modeLabel = {
      dept:    'Departments',
      center:  'Research Centers',
      compare: 'Compare',
    }[subview] || 'Departments';

    const hint = subview === 'compare'
      ? `<div class="lv2-hint-row"><b class="lv2-hint-key">Click</b> a node to highlight connections</div>
         <div class="lv2-hint-row"><b class="lv2-hint-key">Double-click</b> to explore internal network</div>`
      : `<div class="lv2-hint-row"><b class="lv2-hint-key">Click</b> a node to highlight connections</div>
         <div class="lv2-hint-row"><b class="lv2-hint-key">Double-click</b> to explore internal network</div>`;

    return `
      <div class="lv2-section">
        <div class="sec-title">UNIT COLLABORATION</div>
        <div class="lv2-mode-badge">${modeLabel}</div>
        <div class="lv2-hint-box">${hint}</div>
      </div>
    `;
  }

  return { render };
})();
