/* right/right_v2.js
 * Right panel for Unit Collaboration (v2).
 * Shows overview stats when no unit is selected,
 * and a detailed unit card when a node is clicked.
 *
 * Depends on: utils.js, datastore.js
 * Called by: panels.js (reset on view switch, showUnitCard on node click)
 * Calls: View2.drillUnit()
 * Module name for Logger: 'RightV2'
 *
 * DOM targets:
 *   #rv2-placeholder   - overview panel (shown by default)
 *   #rv2-card          - unit detail card (shown on node click)
 *
 * Public methods:
 *   RightV2.reset(subview)     - show default overview
 *   RightV2.showUnit(unitId)   - render unit card
 */

'use strict';

const RightV2 = (() => {

  /* ── reset: show overview for current subview ────────────────────────── */
  function reset(subview) {
    Logger.info('RightV2', `reset subview=${subview}`);
    const placeholder = getEl('rv2-placeholder', 'RightV2');
    const card        = getEl('rv2-card', 'RightV2');
    if (card)        card.style.display        = 'none';
    if (placeholder) {
      placeholder.style.display = '';
      _renderOverview(placeholder, subview);
    }
  }

  /* ── showUnit: render full unit card ─────────────────────────────────── */
  function showUnit(unitId) {
    Logger.info('RightV2', `showUnit unitId=${unitId}`);

    const unit = DS.unitMap.get(unitId);
    if (!unit) {
      Logger.warn('RightV2', `unit not found: ${unitId}`);
      return;
    }

    const placeholder = getEl('rv2-placeholder', 'RightV2');
    const card        = getEl('rv2-card', 'RightV2');
    if (!card) return;

    if (placeholder) placeholder.style.display = 'none';
    card.style.display = 'block';

    const col    = _getUnitColor(unit);
    const isDept = unit.unit_type === 'department';
    const td     = (typeof TOPIC_DIVERSITY !== 'undefined')
      ? TOPIC_DIVERSITY.find(t => t.unit_id === unit.unit_id) : null;

    // Cross-unit partners (from CROSS_UNIT_EDGES)
    const partners = (typeof CROSS_UNIT_EDGES !== 'undefined')
      ? CROSS_UNIT_EDGES
          .filter(e => e.unit_a === unit.unit_id || e.unit_b === unit.unit_id)
          .map(e => ({
            id:     e.unit_a === unit.unit_id ? e.unit_b : e.unit_a,
            name:   e.unit_a === unit.unit_id ? e.name_b : e.name_a,
            weight: e.weight,
          }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 8)
      : [];

    const topTopics = (unit.top_topics || []).slice(0, 4);

    const sosHtml = !isDept && unit.sos_type
      ? `<div class="rv2-sos-badge" style="color:${_sosBadgeColor(unit.sos_type)}">
           ${unit.sos_type}${unit.sos_top_scholar ? ` · Led by ${unit.sos_top_scholar}` : ''}
         </div>` : '';

    const idrHtml = td
      ? `<div class="rv2-section-label">INTERDISCIPLINARITY</div>
         <div class="rv2-idr">
           <div class="rv2-idr-row">
             <span>Score</span>
             <span class="rv2-idr-score">${td.interdisciplinary_score.toFixed(2)}</span>
           </div>
           <div class="rv2-idr-bar">
             <div class="rv2-idr-fill" style="width:${Math.min(100, td.interdisciplinary_score / 4 * 100)}%;background:${col}"></div>
           </div>
           <div class="rv2-idr-sub">${td.n_fields} fields · ${td.n_domains} domains</div>
         </div>` : '';

    const topicsHtml = topTopics.length
      ? `<div class="rv2-section-label">TOP TOPICS</div>
         <div class="rv2-topics">
           ${topTopics.map(t => `<div class="rv2-topic-row">${t}</div>`).join('')}
         </div>` : '';

    const partnersHtml = partners.length
      ? `<div class="rv2-section-label">TOP COLLABORATING UNITS</div>
         <div class="rv2-partners">
           ${partners.map(p => {
             const pu = DS.unitMap.get(p.id);
             const pc = pu ? _getUnitColor(pu) : '#9C9FB2';
             return `<div class="rv2-partner-row">
               <div class="rv2-partner-dot" style="background:${pc}"></div>
               <span class="rv2-partner-name">${p.name}</span>
               <span class="rv2-partner-weight">${p.weight}</span>
             </div>`;
           }).join('')}
         </div>` : '';

    card.innerHTML = `
      <div class="rv2-unit-card">
        <div class="rv2-unit-header" style="border-left-color:${col}">
          <div class="rv2-unit-name">${unit.unit_name}</div>
          <div class="rv2-unit-sub">${isDept ? 'Department' : 'Research Center'} · ${unit.top_field || ''}</div>
        </div>

        ${sosHtml}

        <div class="metric-grid rv2-metrics">
          <div class="metric-box"><div class="metric-label">SCHOLARS</div><div class="metric-value">${unit.scholar_count || '—'}</div></div>
          <div class="metric-box"><div class="metric-label">ACTIVE</div><div class="metric-value">${unit.active_count || '—'}</div></div>
          <div class="metric-box"><div class="metric-label">AVG H-INDEX</div><div class="metric-value">${(unit.avg_h_index || 0).toFixed(1)}</div></div>
          <div class="metric-box"><div class="metric-label">DENSITY</div><div class="metric-value">${(unit.density || 0).toFixed(3)}</div></div>
        </div>

        ${idrHtml}
        ${topicsHtml}
        ${partnersHtml}

        <button class="rp-explore-btn rv2-explore-btn" data-uid="${unit.unit_id}">
          Explore Internal Network →
        </button>
      </div>
    `;

    // Bind explore button (touch-safe)
    const exploreBtn = card.querySelector('.rv2-explore-btn');
    if (exploreBtn) {
      onTap(exploreBtn, () => {
        View2.drillUnit && View2.drillUnit(unit.unit_id);
      });
    }
  }

  /* ── Overview panel ──────────────────────────────────────────────────── */
  function _renderOverview(container, subview) {
    if (subview === 'compare') {
      _renderCompareOverview(container);
      return;
    }

    const isDept   = subview !== 'center';
    const units    = UNITS.filter(u =>
      u.unit_type === (isDept ? 'department' : 'center') && u.included
    ).sort((a, b) => (b.scholar_count || 0) - (a.scholar_count || 0));

    const totalScholars = units.reduce((s, u) => s + (u.scholar_count || 0), 0);
    const avgDensity    = units.length
      ? (units.reduce((s, u) => s + (u.density || 0), 0) / units.length).toFixed(3) : '—';
    const avgH          = units.length
      ? (units.reduce((s, u) => s + (u.avg_h_index || 0), 0) / units.length).toFixed(1) : '—';

    const sosLegend = !isDept ? `
      <div class="rv2-section-label">SoS CLASSIFICATION</div>
      <div class="rv2-sos-legend">
        ${_buildSosLegend()}
      </div>` : '';

    const topRows = units.slice(0, 12).map(u => {
      const col = _getUnitColor(u);
      return `<div class="rv2-top-row" data-uid="${u.unit_id}">
        <div class="rv2-top-dot" style="background:${col}"></div>
        <span class="rv2-top-name">${u.unit_name}</span>
        <span class="rv2-top-count">${u.scholar_count || 0}</span>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="rv2-overview">
        <div class="rv2-overview-title">${isDept ? 'Departments' : 'Research Centers'}</div>
        <div class="rv2-overview-hint">Double-click a node to explore internal network</div>

        <div class="metric-grid rv2-stat-grid">
          <div class="metric-box"><div class="metric-label">UNITS</div><div class="metric-value">${units.length}</div></div>
          <div class="metric-box"><div class="metric-label">SCHOLARS</div><div class="metric-value">${totalScholars.toLocaleString()}</div></div>
          <div class="metric-box"><div class="metric-label">AVG H-INDEX</div><div class="metric-value rv2-stat-red">${avgH}</div></div>
          <div class="metric-box"><div class="metric-label">AVG DENSITY</div><div class="metric-value rv2-stat-red">${avgDensity}</div></div>
        </div>

        ${sosLegend}

        <div class="rv2-section-label">TOP UNITS BY SIZE</div>
        <div class="rv2-top-list">${topRows}</div>
      </div>
    `;

    // Bind top row double-click to drill
    container.querySelectorAll('.rv2-top-row').forEach(row => {
      row.addEventListener('dblclick', () => {
        View2.drillUnit && View2.drillUnit(row.dataset.uid);
      });
    });
  }

  function _renderCompareOverview(container) {
    const depts   = UNITS.filter(u => u.unit_type === 'department' && u.included);
    const centers = UNITS.filter(u => u.unit_type === 'center'     && u.included);

    const avgHDept   = depts.length   ? (depts.reduce((s, u)   => s + (u.avg_h_index || 0), 0) / depts.length).toFixed(1)   : '—';
    const avgHCtr    = centers.length ? (centers.reduce((s, u) => s + (u.avg_h_index || 0), 0) / centers.length).toFixed(1) : '—';
    const avgDDept   = depts.length   ? (depts.reduce((s, u)   => s + (u.density || 0), 0) / depts.length).toFixed(3)       : '—';
    const avgDCtr    = centers.length ? (centers.reduce((s, u) => s + (u.density || 0), 0) / centers.length).toFixed(3)     : '—';

    // Count cross edges
    const crossEdges = typeof CROSS_UNIT_EDGES !== 'undefined' ? CROSS_UNIT_EDGES : [];
    const deptIds  = new Set(depts.map(u => u.unit_id));
    const ctrIds   = new Set(centers.map(u => u.unit_id));
    const deptEdges = crossEdges.filter(e => deptIds.has(e.unit_a) || deptIds.has(e.unit_b)).length;
    const ctrEdges  = crossEdges.filter(e => ctrIds.has(e.unit_a)  || ctrIds.has(e.unit_b)).length;

    container.innerHTML = `
      <div class="rv2-compare-overview">
        <div class="rv2-overview-title">Compare Overview</div>
        <div class="rv2-overview-hint">Double-click any node to explore its internal network. Click to highlight connections.</div>

        <div class="rv2-compare-grid">
          <div class="rv2-compare-col-label">DEPARTMENTS</div>
          <div class="rv2-compare-col-label">CENTERS</div>

          <div class="rv2-compare-stat"><div class="metric-label">COUNT</div><div class="metric-value rv2-stat-red">${depts.length}</div></div>
          <div class="rv2-compare-stat"><div class="metric-label">COUNT</div><div class="metric-value rv2-stat-red">${centers.length}</div></div>

          <div class="rv2-compare-stat"><div class="metric-label">AVG H-INDEX</div><div class="metric-value rv2-stat-red">${avgHDept}</div></div>
          <div class="rv2-compare-stat"><div class="metric-label">AVG H-INDEX</div><div class="metric-value rv2-stat-red">${avgHCtr}</div></div>

          <div class="rv2-compare-stat"><div class="metric-label">AVG DENSITY</div><div class="metric-value rv2-stat-red">${avgDDept}</div></div>
          <div class="rv2-compare-stat"><div class="metric-label">AVG DENSITY</div><div class="metric-value rv2-stat-red">${avgDCtr}</div></div>

          <div class="rv2-compare-stat"><div class="metric-label">CROSS EDGES</div><div class="metric-value rv2-stat-red">${deptEdges}</div></div>
          <div class="rv2-compare-stat"><div class="metric-label">CROSS EDGES</div><div class="metric-value rv2-stat-red">${ctrEdges}</div></div>
        </div>

        <div class="rv2-section-label">LEGEND</div>
        <div class="rv2-compare-legend">
          <div>Flat hexagon = Department</div>
          <div>Pointy hexagon = Research Center</div>
          <div>Node size = scholar count</div>
          <div>Edge weight = collaboration intensity</div>
        </div>
      </div>
    `;
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function _getUnitColor(unit) {
    if (!unit) return '#9C9FB2';
    // Use parent college color for departments
    if (unit.unit_type === 'department' && unit.parent_unit_id) {
      const parent = DS.unitMap.get(unit.parent_unit_id);
      if (parent) return DS.getColor(parent.unit_name);
    }
    // For centers, use SoS-based color
    return _sosBadgeColor(unit.sos_type);
  }

  function _sosBadgeColor(sos) {
    const map = {
      'Superstar':     '#C8102E',
      'Team-of-Teams': '#A4804A',
      'Greenfield':    '#2E8B57',
      'Unclassified':  '#9C9FB2',
    };
    return map[sos] || '#9C9FB2';
  }

  function _buildSosLegend() {
    return [
      { type: 'Superstar',     color: '#C8102E', desc: 'High output, low collaboration' },
      { type: 'Team-of-Teams', color: '#A4804A', desc: 'Dense internal network' },
      { type: 'Greenfield',    color: '#2E8B57', desc: 'Sparse but growing' },
      { type: 'Unclassified',  color: '#9C9FB2', desc: 'Insufficient data' },
    ].map(t => `
      <div class="rv2-sos-row">
        <div class="rv2-sos-dot" style="background:${t.color}"></div>
        <span class="rv2-sos-type">${t.type}</span>
        <span class="rv2-sos-desc">${t.desc}</span>
      </div>`).join('');
  }

  return { reset, showUnit };
})();
