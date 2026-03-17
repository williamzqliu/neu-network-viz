/* left/left_v3.js
 * Left panel for Scholar Profile (v3).
 * Two states:
 *   empty  - no scholar selected yet; shows prompt
 *   ego    - scholar selected; shows profile summary + hop controls + top collaborators
 *
 * Depends on: utils.js, datastore.js
 * Called by: panels.js (_updateLeft when view = 'v3')
 *            panels.js (showScholarCard -> LeftV3.showEgoProfile)
 * Calls: View3.build(), View3.setHops()
 * Module name for Logger: 'LeftV3'
 *
 * Public methods:
 *   LeftV3.render(container, subview)
 *   LeftV3.showEgoProfile(id)
 */

'use strict';

const LeftV3 = (() => {

  /* ── render (called on view switch, before any scholar is selected) ──── */
  function render(container, subview) {
    Logger.info('LeftV3', `render subview=${subview}`);

    // If a scholar is already selected, keep showing their profile
    if (DS.state.selectedId && subview === 'ego') {
      showEgoProfile(DS.state.selectedId);
      return;
    }

    container.innerHTML = _buildEmpty();
  }

  /* ── showEgoProfile (called after View3.build succeeds) ──────────────── */
  function showEgoProfile(id) {
    const container = getEl('left-content', 'LeftV3');
    if (!container) return;

    const s   = DS.scholarMap.get(id);
    const det = (typeof SCHOLAR_DETAIL !== 'undefined') ? (SCHOLAR_DETAIL[id] || {}) : {};
    if (!s) {
      Logger.warn('LeftV3', `showEgoProfile: scholar not found: ${id}`);
      return;
    }

    Logger.info('LeftV3', `showEgoProfile id=${id} name=${s.name}`);

    const col   = DS.getColor(s.college);
    const hops  = DS.state.egoHops;

    // Affiliations
    const depts = det.dept_names || [];
    const ctrs  = det.ctr_names  || [];
    const affilHtml = [
      ...depts.map(d => `<div class="rp-affil-row">${d}</div>`),
      ...ctrs.map(c  => `<div class="rp-affil-row lv3-center-affil">${c}</div>`),
    ].join('');

    // Bridge badge
    const bridgeHtml = s.is_bridge && s.top_pct != null
      ? `<div class="rp-bridge lv3-bridge">Top ${s.top_pct}% Bridge Scholar</div>` : '';

    // Works / Citations
    const totalWorks  = det.total_works || '—';
    const collabWorks = det.total_collab_works;
    const worksDisplay = collabWorks != null
      ? `${collabWorks} / ${totalWorks}`
      : (typeof totalWorks === 'number' ? totalWorks.toLocaleString() : totalWorks);

    const totalCit = det.total_citations;
    const iciTotal = det.ici_total;
    const citDisplay = (iciTotal != null && totalCit != null)
      ? `${iciTotal} / ${totalCit}`
      : (totalCit != null ? totalCit.toLocaleString() : '—');

    // Top collaborators (sorted by weight)
    const nbrs = (DS.adjacency.get(id) || [])
      .filter(x => DS.scholarMap.has(x.id))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    const collabRows = nbrs.map(x => {
      const nb  = DS.scholarMap.get(x.id);
      const nbc = DS.getColor(nb.college);
      return `<div class="lv3-collab-row" onclick="View3.build('${x.id}', DS.state.egoHops)">
        <div class="lv3-collab-left">
          <div class="lv3-collab-dot" style="background:${nbc}"></div>
          <span class="lv3-collab-name">${nb.name}</span>
        </div>
        <span class="lv3-collab-weight">${x.weight}</span>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="lv3-profile">
        <div class="lv3-name-row">
          <div class="lv3-name-dot" style="background:${col}"></div>
          <div class="lv3-name">${s.name}</div>
        </div>
        <div class="lv3-role">${[s.role, s.status === 'current' ? 'Active' : s.status].filter(Boolean).join(' · ')}</div>
        ${bridgeHtml}
        <div class="rp-affil lv3-affil">${affilHtml}</div>

        <div class="metric-grid lv3-metrics">
          <div class="metric-box"><div class="metric-label">H-INDEX</div><div class="metric-value">${s.h_index ?? '—'}</div></div>
          <div class="metric-box"><div class="metric-label">COLLABS</div><div class="metric-value">${s.degree || 0}</div></div>
          <div class="metric-box"><div class="metric-label">WORKS</div><div class="metric-value lv3-small-val">${worksDisplay}</div></div>
          <div class="metric-box"><div class="metric-label">CITATIONS</div><div class="metric-value lv3-small-val">${citDisplay}</div></div>
        </div>

        <div class="lv3-hop-section">
          <div class="lv3-filter-label">EGO NETWORK DEPTH</div>
          <div class="btn-group">
            <button class="vc-btn${hops === 1 ? ' active' : ''}" id="lv3-hop-1" onclick="setEgoHop(1)">1-hop</button>
            <button class="vc-btn${hops === 2 ? ' active' : ''}" id="lv3-hop-2" onclick="setEgoHop(2)">2-hop</button>
          </div>
        </div>

        <div class="lv3-collabs-header">TOP COLLABORATORS</div>
        <div class="lv3-collabs-list">${collabRows}</div>
      </div>
    `;

    // Bind touch-safe tap for collab rows
    container.querySelectorAll('.lv3-collab-row').forEach((row, i) => {
      const nb = nbrs[i];
      if (!nb) return;
      onTap(row, () => { View3.build(nb.id, DS.state.egoHops); });
    });
  }

  /* ── Empty state ─────────────────────────────────────────────────────── */
  function _buildEmpty() {
    return `
      <div class="lv3-empty">
        <div class="sec-title">SCHOLAR PROFILE</div>
        <div class="lv3-empty-text">
          Select a scholar from the University Network to explore their ego network.
        </div>
      </div>
    `;
  }

  return { render, showEgoProfile };
})();
