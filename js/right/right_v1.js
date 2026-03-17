/* right/right_v1.js
 * Right panel for University Network (v1).
 * Shows the default stats overview when no scholar is selected,
 * and a detailed scholar card when a node is clicked.
 *
 * Depends on: utils.js, datastore.js
 * Called by: panels.js (reset on view switch, showScholarCard on node click)
 * Calls: View1.selectById(), View1.highlightTopic(), Search.showHint()
 * Module name for Logger: 'RightV1'
 *
 * DOM targets:
 *   #right-panel-v1        - the v1 right panel container
 *   #rv1-placeholder       - default overview (units list, stats)
 *   #rv1-card              - scholar card (hidden until showScholar called)
 *
 * Public methods:
 *   RightV1.reset(subview)       - show default placeholder
 *   RightV1.showScholar(id)      - render scholar card
 *   RightV1.toggleField(el)      - expand/collapse research field
 *   RightV1.toggleSubfield(...)  - highlight scholars by subfield
 */

'use strict';

const RightV1 = (() => {

  /* ── reset: show placeholder / default overview ──────────────────────── */
  function reset(subview) {
    Logger.info('RightV1', `reset subview=${subview}`);
    const placeholder = getEl('rv1-placeholder', 'RightV1');
    const card = getEl('rv1-card', 'RightV1');
    if (placeholder) placeholder.style.display = '';
    if (card) card.style.display = 'none';
  }

  /* ── showScholar: render full scholar card ───────────────────────────── */
  function showScholar(id) {
    Logger.info('RightV1', `showScholar id=${id}`);

    const s = DS.scholarMap.get(id);
    const det = (typeof SCHOLAR_DETAIL !== 'undefined') ? (SCHOLAR_DETAIL[id] || {}) : {};
    if (!s) {
      Logger.warn('RightV1', `scholar not found: ${id}`);
      return;
    }

    const placeholder = getEl('rv1-placeholder', 'RightV1');
    const card = getEl('rv1-card', 'RightV1');
    if (!card) return;

    if (placeholder) placeholder.style.display = 'none';
    card.style.display = 'flex';

    const col = DS.getColor(s.college);

    const isCurrent = s.status === 'current';
    const depts = det.dept_names || [];
    const ctrs = det.ctr_names || [];
    const mainAffilUnit = s.main_affil_id ? DS.unitMap.get(s.main_affil_id) : null;
    const mainAffil = mainAffilUnit ? mainAffilUnit.unit_type : '';

    // 次要 dept 列表（只有 dept 才产生圆环，center 不算）
    // main_affil 是 dept：排除主隶属 dept，其余 dept 是次要的
    // main_affil 是 ctr（或空）：dept_names 全部都是次要的
    const secondaryDepts = mainAffil === 'department'
      ? depts.filter(d => d !== s.main_affil_name)
      : [...depts];

    // 圆心颜色：main_affil 是 center 时用灰色，否则用学院色
    const CENTER_COLOR = mainAffil === 'center' ? '#B6B8C4' : col;

    // 每个次要 dept 对应的圆环颜色（查所属学院）
    const ringColors = secondaryDepts.map(d => {
      const college = DS.getCollegeForUnit(d);
      return (college ? DS.getColor(college) : null) || col;
    });

    // 圆点半径和圆环间距
    const R = 6;
    const gap = 4;
    const rings = secondaryDepts.length;
    const size = (R + rings * gap + (rings > 0 ? 2 : 0)) * 2 + 4;
    const cx = size / 2;

    let svgParts = '';

    // 外圆环（从外到内：i=rings 最外，对应 ringColors[0]）
    for (let i = rings; i >= 1; i--) {
      const r = R + i * gap;
      const opacity = isCurrent ? (0.8 - (i - 1) * 0.2) : (0.4 - (i - 1) * 0.1);
      const ringColor = ringColors[rings - i];
      svgParts += `<circle cx="${cx}" cy="${cx}" r="${r}"
    fill="none"
    stroke="${ringColor}"
    stroke-opacity="${Math.max(0.1, opacity)}"
    stroke-width="1.5"/>`;
    }

    // 内圆
    if (isCurrent) {
      svgParts += `<circle cx="${cx}" cy="${cx}" r="${R}" fill="${CENTER_COLOR}"/>`;
    } else {
      svgParts += `<circle cx="${cx}" cy="${cx}" r="${R}"
    fill="none"
    stroke="${CENTER_COLOR}"
    stroke-width="1.5"/>`;
    }

    const avatarSvg = `<svg class="rp-avatar-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">${svgParts}</svg>`;

    // Quality badge
    const dq = det.data_quality || s.data_quality || '';
    const qBadge = (dq === 'low' || dq === 'flagged')
      ? `<span class="dq-warn" data-tip="${dq === 'low' ? 'Low confidence data. Verify before use.' : 'Data may contain errors. Use with caution.'}">?</span>`
      : '';

    // Bridge badge
    const topPct = s.top_pct;
    const bridgePerc = s.bridge_percentile != null ? s.bridge_percentile.toFixed(2) : null;
    const bridgeHtml = s.is_bridge && topPct != null
      ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:8px">
       <div class="rp-bridge" style="margin-bottom:0">Top ${topPct} % Bridge Scholar</div>
       <span class="info-icon info-icon--gold"
       data-tip="Bridge scholars link otherwise disconnected research communities.<br><br>
       Score = (cross-dept partners / total partners) × lg(total partners)<br><br>
       This scholar:<br>percentile ${bridgePerc}<br>score ${(s.bridge_score || 0).toFixed(3)}".)>?</span>
     </div>`
      : '';;

    // Affiliations
    const affilHtml = [
      ...depts.map(d => {
        const deptCollege = DS.getCollegeForUnit(d);
        const deptColor = deptCollege ? DS.getColor(deptCollege) : col;
        return `<div class="rp-affil-row" style="border-left-color:${deptColor}">${d}</div>`;
      }),
      ...ctrs.map(c => {
        const ctrCollege = DS.getCollegeForUnit(c);
        const ctrColor = ctrCollege ? DS.getColor(ctrCollege) : 'var(--gold-m)';
        return `<div class="rp-affil-row center-row-affil" style="border-left-color:var(--col-centers)">${c}</div>`;
      }),
    ].join('');

    // At Northeastern
    const startY = det.neu_start_year;
    const endY = det.neu_end_year;
    let atNeu = '—';
    if (startY) { atNeu = endY ? `${startY}–${endY}` : `${startY}<span style="font-size:var(--fs-h1)">–present</span>`; }
    const atNeuNote = startY
      ? `<span class="info-icon" style="margin-left:3px" data-tip="Estimated from available institutional data.">?</span>`
      : '';

    // Works / Citations
    const totalWorks = det.total_works || '—';
    const collabWorks = det.total_collab_works;
    const worksDisplay = collabWorks != null
      ? `${collabWorks.toLocaleString()}<span style="font-size:var(--fs-h1);opacity:0.9"> / ${typeof totalWorks === 'number' ? totalWorks.toLocaleString() : totalWorks}</span>`
      : (typeof totalWorks === 'number' ? totalWorks.toLocaleString() : totalWorks);

    const totalCit = det.total_citations;
    const iciTotal = det.ici_total;
    const citDisplay = (iciTotal != null && totalCit != null)
      ? `${iciTotal.toLocaleString()}<span style="font-size:var(--fs-h1);opacity:0.9"> / ${totalCit.toLocaleString()}</span>`
      : (totalCit != null ? totalCit.toLocaleString() : '—');

    // Collaborators
    const nbrs = (DS.adjacency.get(id) || [])
      .filter(x => DS.scholarMap.has(x.id))
      .sort((a, b) => b.weight - a.weight);

    const nbrCount = nbrs.length;
    const collabRows = nbrs.slice(0, 30).map(x => {
      const nb = DS.scholarMap.get(x.id);
      const nbc = DS.getColor(nb.college);
      const vis = DS.state.visibleIds.has(x.id);
      const dotStyle = nb.status === 'current'
        ? 'background:' + nbc
        : 'background:transparent;border:2px solid ' + nbc;
      return `<div class="collab-row${vis ? '' : ' hidden-node'}" data-sid="${x.id}">
    <div class="collab-left">
      <div class="collab-dot" style="${dotStyle}"></div>
      <span class="collab-name">${nb.name}</span>
      ${vis ? '' : '<span class="collab-hidden-tag">hidden</span>'}
    </div>
    <span class="collab-weight">${x.weight} collabs</span>
  </div>`;
    }).join('');

    // Research interests
    const fields = det.fields || [];
    const fieldsHtml = fields.slice(0, 3).map((f, fi) => {
      const subfields = (f.subfields || []).slice(0, 5);
      const sfTags = subfields.map(sf => {
        const sfId = `rv1-sf_${id}_${fi}_${sf.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;
        return `<span class="subfield-tag" id="${sfId}"
          data-subfield="${sf.replace(/"/g, '&quot;')}">${sf}</span>`;
      }).join('');
      return `<div class="field-block">
        <div class="field-name rv1-field-toggle open">${f.field}
          ${'' /* <span class="rv1-field-count">${f.paper_count} papers</span> */}
        </div>
        <div class="subfield-list">${sfTags}</div>
      </div>`;
    }).join('');

    card.innerHTML = `
  <div class="rv1-scroll-body">
    <div class="rp-header">
      ${avatarSvg}
      <div class="rp-name">${s.name}</div>
      ${qBadge}
    </div>

    <div class="rp-role">${[s.role, s.status ? `<em>${s.status === 'current' ? 'Active' : s.status}</em>` : ''].filter(Boolean).join(' · ')}</div>

    ${bridgeHtml}

    <div class="rp-affil">${affilHtml}</div>

    <div class="metric-grid">
      <div class="metric-box">
        <div class="metric-label">H-INDEX</div>
        <div class="metric-value">${s.h_index ?? '—'}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">AT NEU ${atNeuNote}</div>
        <div class="metric-value" style="margin-top:4px">${atNeu}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">WORKS
          <span class="info-icon" data-tip="NEU collab works / Total">?</span>
        </div>
        <div class="metric-value">${worksDisplay}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">CITATIONS
          <span class="info-icon" data-tip="NEU collab citations / Total">?</span>
        </div>
        <div class="metric-value" style="letter-spacing:-0.025em">${citDisplay}</div>
      </div>
    </div>

    <div class="rp-collabs-header"><span style="color:var(--gold);font-weight:900">${nbrCount}</span> COLLABORATORS AT NEU</div>
    <div class="rp-collabs-box${nbrs.length > 5 ? '' : ' no-border'}" id="rv1-collabs-${id}">${collabRows}</div>

    <div class="rp-interests-header">RESEARCH INTERESTS</div>
    <div class="rv1-fields" id="rv1-fields-${id}">${fieldsHtml}</div>
  </div>

  <div class="rv1-sticky-footer">
    <button class="rp-explore-btn rv1-explore-btn" data-id="${id}">
      Open Scholar Profile
    </button>
    <div class="rp-data-note">
      Scholar data sourced from OpenAlex and ORCID.<br>
      Records may be incomplete or misattributed.
    </div>
  </div>
`;

    // Bind collab row clicks (touch-safe)
    card.querySelectorAll('.collab-row[data-sid]').forEach(row => {
      onTap(row, () => { View1.selectById && View1.selectById(row.dataset.sid); });
    });

    // Bind field expand toggles
    card.querySelectorAll('.rv1-field-toggle').forEach(el => {
      onTap(el, (e) => { e.preventDefault(); toggleField(el); });
    });

    // Bind subfield tag clicks
    card.querySelectorAll('.subfield-tag').forEach(tag => {
      onTap(tag, e => {
        e.preventDefault();
        e.stopPropagation();
        toggleSubfield(tag.id, tag.dataset.subfield, e);
      });
    });

    // Bind "Open Scholar Profile" button
    const exploreBtn = card.querySelector('.rv1-explore-btn');
    if (exploreBtn) {
      onTap(exploreBtn, () => {
        DS.state.v3SourceView = 'v1';
        DS.state._pendingV3Id = id;
        switchView('v3');
      });
    }
  }

  /* ── Default overview for placeholder ───────────────────────────────── */
  function _renderOverview(container, subview) {
    const units = UNITS.filter(u => u.unit_type === 'department' && u.included);
    const scholars = SCHOLARS;
    const active = scholars.filter(s => s.status === 'current').length;

    // Top units by scholar count
    const topUnits = [...UNITS]
      .filter(u => (u.unit_type === 'department' || u.unit_type === 'center') && u.included && u.scholar_count)
      .sort((a, b) => (b.scholar_count || 0) - (a.scholar_count || 0))
      .slice(0, 10);

    const topRows = topUnits.map(u => {
      const col = DS.getColor(u.unit_name);
      return `<div class="rv1-top-row">
        <div class="rv1-top-dot" style="background:${col}"></div>
        <span class="rv1-top-name">${u.unit_name}</span>
        <span class="rv1-top-count">${u.scholar_count}</span>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="rv1-overview">
        <div class="rv1-overview-title">
          ${subview === 'clusters' ? 'Research Clusters' : 'Departments'}
        </div>
        <div class="rv1-overview-hint">Double-click a node to explore internal network</div>

        <div class="rv1-stat-grid">
          <div class="rv1-stat-box">
            <div class="rv1-stat-label">UNITS</div>
            <div class="rv1-stat-value">${units.length}</div>
          </div>
          <div class="rv1-stat-box">
            <div class="rv1-stat-label">SCHOLARS</div>
            <div class="rv1-stat-value">${scholars.length.toLocaleString()}</div>
          </div>
          <div class="rv1-stat-box">
            <div class="rv1-stat-label">AVG H-INDEX</div>
            <div class="rv1-stat-value rv1-stat-red">${_avgHIndex()}</div>
          </div>
          <div class="rv1-stat-box">
            <div class="rv1-stat-label">AVG DENSITY</div>
            <div class="rv1-stat-value rv1-stat-red">${_avgDensity()}</div>
          </div>
        </div>

        <div class="rv1-top-label">TOP UNITS BY SIZE</div>
        <div class="rv1-top-list">${topRows}</div>
      </div>
    `;
  }

  function _avgHIndex() {
    const vals = UNITS.filter(u => u.unit_type === 'department' && u.avg_h_index).map(u => u.avg_h_index);
    if (!vals.length) return '—';
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }

  function _avgDensity() {
    const vals = UNITS.filter(u => u.unit_type === 'department' && u.density != null).map(u => u.density);
    if (!vals.length) return '—';
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3);
  }

  /* ── Field / subfield interaction ───────────────────────────────────── */
  function toggleField(el) {
    el.classList.toggle('open');
    const list = el.nextElementSibling;
    if (list) list.style.display = list.style.display === 'none' ? 'flex' : 'none';
  }

  function toggleSubfield(btnId, subfield, event) {
    event.stopPropagation();
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.toggle('selected');

    const selectedTags = [...document.querySelectorAll('.subfield-tag.selected')];

    if (selectedTags.length === 0) {
      DS.state.topicHighlight = null;
      DS.state.topicConnected = null;
      const selId = DS.state.selectedId;
      View1.highlightTopic && View1.highlightTopic(null);
      if (selId) View1.panTo && View1.panTo(selId);
      return;
    }

    const selectedSubfields = selectedTags.map(t => t.dataset.subfield);
    const selId = DS.state.selectedId;
    const connectedIds = new Set((DS.adjacency.get(selId) || []).map(x => x.id));

    const matchUnconnected = [];
    const matchConnected = [];

    SCHOLARS.forEach(s => {
      if (s.id === selId) return;
      const det = (typeof SCHOLAR_DETAIL !== 'undefined') ? SCHOLAR_DETAIL[s.id] : null;
      if (!det?.fields) return;
      const scholarSubfields = det.fields.flatMap(f => f.subfields || []);
      if (selectedSubfields.every(sf => scholarSubfields.includes(sf))) {
        if (connectedIds.has(s.id)) {
          matchConnected.push(s.id);
        } else {
          matchUnconnected.push(s.id);
        }
      }
    });

    View1.highlightTopic && View1.highlightTopic(matchUnconnected, matchConnected);
  }

  return { reset, showScholar, toggleField, toggleSubfield };
})();
