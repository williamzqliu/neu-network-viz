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
    const sosLegend = subview === 'center' ? `
      <div class="sec-header" style="margin-top:14px">SoS TYPE</div>
      <div class="lv2-sos-legend">
        <div class="lv2-sos-row"><span class="lv2-sos-dot" style="background:#C8102E"></span><span class="lv2-sos-label">Superstar</span><span class="lv2-sos-desc">high output, individual</span></div>
        <div class="lv2-sos-row"><span class="lv2-sos-dot" style="background:#A4804A"></span><span class="lv2-sos-label">Team-of-Teams</span><span class="lv2-sos-desc">dense network</span></div>
        <div class="lv2-sos-row"><span class="lv2-sos-dot" style="background:#2E8B57"></span><span class="lv2-sos-label">Greenfield</span><span class="lv2-sos-desc">sparse, growing</span></div>
        <div class="lv2-sos-row"><span class="lv2-sos-dot" style="background:#9C9FB2"></span><span class="lv2-sos-label">Unclassified</span><span class="lv2-sos-desc">insufficient data</span></div>
      </div>` : '';

    return `
      <div class="lv2-section">
        <div class="sec-title">UNIT COLLABORATION</div>
        <div class="lv2-switcher">
          <button class="vs-btn${subview === 'dept'    ? ' active' : ''}" data-subview="dept"    onclick="setUnitMode('dept')">Departments</button>
          <button class="vs-btn${subview === 'center'  ? ' active' : ''}" data-subview="center"  onclick="setUnitMode('center')">Research Centers</button>
          <button class="vs-btn" data-subview="compare" disabled style="opacity:0.35;cursor:not-allowed">Compare</button>
        </div>
        ${sosLegend}
        <div class="lv2-hint-box" style="margin-top:14px">
          <div class="lv2-hint-row"><b class="lv2-hint-key">Click</b> a unit to see details</div>
          <div class="lv2-hint-row"><b class="lv2-hint-key">Double-click</b> to explore internal network</div>
        </div>
      </div>
    `;
  }

  return { render };
})();
