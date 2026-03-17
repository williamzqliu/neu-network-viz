/* right/right_v3.js
 * Right panel for Scholar Profile (v3).
 * Shows contextual stats about the ego network currently displayed:
 * hop count, node/edge count, college distribution of neighbors.
 *
 * Depends on: utils.js, datastore.js
 * Called by: panels.js (reset on view switch, showStats after View3.build)
 * Module name for Logger: 'RightV3'
 *
 * DOM targets:
 *   #rv3-placeholder   - default state panel
 *   #rv3-card          - ego network stats (shown after View3.build)
 *
 * Public methods:
 *   RightV3.reset(subview)   - show default placeholder
 *   RightV3.showStats(id)    - show ego network stats for scholar id
 */

'use strict';

const RightV3 = (() => {

  /* ── reset ───────────────────────────────────────────────────────────── */
  function reset(subview) {
    Logger.info('RightV3', `reset subview=${subview}`);
    const placeholder = getEl('rv3-placeholder', 'RightV3');
    const card        = getEl('rv3-card', 'RightV3');
    if (card)        card.style.display        = 'none';
    if (placeholder) placeholder.style.display = '';
  }

  /* ── showStats: render ego network context panel ─────────────────────── */
  function showStats(id) {
    Logger.info('RightV3', `showStats id=${id}`);

    const s = DS.scholarMap.get(id);
    if (!s) {
      Logger.warn('RightV3', `scholar not found: ${id}`);
      return;
    }

    const placeholder = getEl('rv3-placeholder', 'RightV3');
    const card        = getEl('rv3-card', 'RightV3');
    if (!card) return;

    if (placeholder) placeholder.style.display = 'none';
    card.style.display = 'block';

    const hops  = DS.state.egoHops;
    const col   = DS.getColor(s.college);

    // Compute ego network stats
    const nbrs1  = DS.adjacency.get(id) || [];
    const dir1   = new Set(nbrs1.map(x => x.id));
    const egoIds = new Set([id, ...dir1]);

    if (hops === 2) {
      nbrs1.forEach(x => {
        (DS.adjacency.get(x.id) || []).forEach(y => egoIds.add(y.id));
      });
    }

    const nodeCount = egoIds.size;
    const edgeCount = (() => {
      let count = 0;
      egoIds.forEach(sid => {
        (DS.adjacency.get(sid) || []).forEach(nb => {
          if (egoIds.has(nb.id) && sid < nb.id) count++;
        });
      });
      return count;
    })();

    // College distribution of neighbors
    const collegeCounts = new Map();
    egoIds.forEach(sid => {
      if (sid === id) return;
      const nb = DS.scholarMap.get(sid);
      if (!nb) return;
      collegeCounts.set(nb.college, (collegeCounts.get(nb.college) || 0) + 1);
    });

    const sortedColleges = [...collegeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const collegeRows = sortedColleges.map(([college, count]) => {
      const c = DS.getColor(college);
      const short = DS.getShortName(college);
      const pct = Math.round(count / (nodeCount - 1) * 100);
      return `<div class="rv3-college-row">
        <div class="rv3-college-dot" style="background:${c}"></div>
        <span class="rv3-college-name">${short}</span>
        <span class="rv3-college-bar-wrap">
          <span class="rv3-college-bar" style="width:${pct}%;background:${c}"></span>
        </span>
        <span class="rv3-college-count">${count}</span>
      </div>`;
    }).join('');

    // Cross-college neighbors (bridges)
    const crossCollege = [...egoIds]
      .filter(sid => {
        if (sid === id) return false;
        const nb = DS.scholarMap.get(sid);
        return nb && nb.college !== s.college;
      }).length;

    card.innerHTML = `
      <div class="rv3-stats">
        <div class="rv3-stats-title">Ego Network</div>
        <div class="rv3-stats-sub" style="color:${col}">${s.name}</div>

        <div class="rv3-hop-indicator">
          <span class="rv3-hop-badge">${hops}-hop</span>
          network
        </div>

        <div class="metric-grid rv3-metrics">
          <div class="metric-box">
            <div class="metric-label">NODES</div>
            <div class="metric-value">${nodeCount}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">EDGES</div>
            <div class="metric-value">${edgeCount}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">DIRECT COLLABS</div>
            <div class="metric-value">${dir1.size}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">CROSS-COLLEGE</div>
            <div class="metric-value">${crossCollege}</div>
          </div>
        </div>

        <div class="rv3-section-label">COLLEGE DISTRIBUTION</div>
        <div class="rv3-colleges">${collegeRows}</div>
      </div>
    `;
  }

  return { reset, showStats };
})();
