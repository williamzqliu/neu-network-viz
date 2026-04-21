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

  /* ── reset: hide panel and clear card content ────────────────────────── */
  function reset(subview) {
    Logger.info('RightV1', `reset subview=${subview}`);
    const card = getEl('rv1-card', 'RightV1');
    if (card) card.style.display = 'none';
    if (typeof hideRightPanel === 'function') hideRightPanel();
  }

  /* ── showScholar: render full scholar card ───────────────────────────── */
  // opts.card / opts.placeholder: alternate DOM targets (used by RightV3)
  // opts.isV3: true → replace footer button with back-navigation
  function showScholar(id, opts = {}) {
    Logger.info('RightV1', `showScholar id=${id}`);

    const s = DS.scholarMap.get(id);
    const det = (typeof SCHOLAR_DETAIL !== 'undefined') ? (SCHOLAR_DETAIL[id] || {}) : {};
    if (!s) {
      Logger.warn('RightV1', `scholar not found: ${id}`);
      return;
    }

    const placeholder = opts.placeholder || document.getElementById('rv1-placeholder');
    const card        = opts.card        || getEl('rv1-card',        'RightV1');
    if (!card) return;

    if (placeholder) placeholder.style.display = 'none';
    card.style.display = 'flex';
    card.style.opacity = '0';
    if (typeof showRightPanel === 'function') showRightPanel();

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
    // Gate ring rendering on multi_affil flag — consistent with canvas node rendering.
    // Avoids spurious rings caused by name-string mismatches between scholars and scholar_detail.
    const rings = s.multi_affil ? secondaryDepts.length : 0;
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

    // Isolated reason label map
    const ISOLATED_REASON_LABEL = {
      'external_main':      'This scholar\'s collaborations are primarily with researchers outside Northeastern.',
      'new_faculty':        'This scholar recently joined Northeastern and has not yet established internal collaborations.',
      'practice_based':     'This scholar\'s work is primarily practice-based rather than co-authored research.',
      'teaching_based':     'This scholar\'s role is primarily teaching-focused with limited research output.',
      'source_unavailable': 'Collaboration data for this scholar is unavailable from current sources.',
    };

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
      // hidden-node class and collab-hidden-tag disabled per user testing
      // to restore: `<div class="collab-row${vis ? '' : ' hidden-node'}" ...>` + hidden tag span
      return `<div class="collab-row" data-sid="${x.id}">
    <div class="collab-left">
      <div class="collab-dot" style="${dotStyle}"></div>
      <span class="collab-name">${nb.name}</span>
    </div>
    <span class="collab-weight">${x.weight} collabs</span>
  </div>`;
    }).join('');

    // Research interests
    const fields = det.fields || [];
    const fieldsHtml = fields.slice(0, 3).map((f, fi) => {
      const sfTags = (f.subfields || []).slice(0, 5).map(sf => {
        const sfId = `rv1-sf_${id}_${fi}_${sf.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;
        return `<span class="rv1-sf-tag" id="${sfId}" data-subfield="${sf.replace(/"/g, '&quot;')}">${sf}</span>`;
      }).join('');
      const topicTags = (f.topics || []).slice(0, 5).map(t => {
        const tId = `rv1-tp_${id}_${fi}_${t.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;
        return `<span class="rv1-topic-tag" id="${tId}" data-topic="${t.replace(/"/g, '&quot;')}">${t}</span>`;
      }).join('');
      return `<div class="rv1-field-block">
        <div class="rv1-field-name rv1-field-toggle open">${f.field}</div>
        ${sfTags    ? `<div class="rv1-sf-list">${sfTags}</div>`       : ''}
        ${topicTags ? `<div class="rv1-topic-list">${topicTags}</div>` : ''}
      </div>`;
    }).join('');

    card.innerHTML = `
  <div class="rv1-scroll-body">
    <div class="rp-header">
      ${avatarSvg}
      <div class="rp-name">${s.name}</div>
      ${qBadge}
    </div>

    <div class="rp-role">${[
      s.role || (s.admin_role ? s.admin_role.split(';').map(r => r.trim()).join(' · ') : ''),
      s.status ? `<em>${s.status === 'current' ? 'Active' : s.status}</em>` : ''
    ].filter(Boolean).join(' · ')}</div>

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

    ${nbrCount === 0
      ? (() => {
          const reason = det.isolated_reason;
          const label  = (reason && ISOLATED_REASON_LABEL[reason]) || 'No recorded collaborations at Northeastern found in current data.';
          return `<div class="rp-collabs-header">NO COLLABORATORS AT NEU</div>
    <div class="rp-isolated-reason">${label}</div>`;
        })()
      : `<div class="rp-collabs-header"><span style="color:var(--gold);font-weight:900">${nbrCount}</span> COLLABORATORS AT NEU</div>
    <div class="rp-collabs-box${nbrs.length > 5 ? '' : ' no-border'}" id="rv1-collabs-${id}">${collabRows}</div>`
    }

    <div class="rp-ego-header" style="display:flex;align-items:center;gap:5px">EGO NETWORK<span class="info-icon" data-tip="Highlight collaboration neighborhood on the map.">?</span></div>
    <div class="rv1-ego-toggle" id="rv1-ego-toggle-${id}">
      <button class="rv1-ego-btn active" data-hops="0">DIRECT</button>
      <button class="rv1-ego-btn${nbrCount === 0 ? ' rv1-ego-btn--off' : ''}" data-hops="1" ${nbrCount === 0 ? 'disabled' : ''}>1-HOP</button>
      <button class="rv1-ego-btn${nbrCount === 0 ? ' rv1-ego-btn--off' : ''}" data-hops="2" ${nbrCount === 0 ? 'disabled' : ''}>2-HOP</button>
    </div>

    <div class="rp-interests-header">RESEARCH INTERESTS</div>
    ${fieldsHtml
      ? `<div class="rv1-fields" id="rv1-fields-${id}">${fieldsHtml}</div>`
      : `<div class="rp-isolated-reason">Insufficient publication data to infer research interests.</div>`
    }
  </div>

  <div class="rv1-sticky-footer">
    ${opts.isV3 && DS.state.v3SourceView === 'v1'
      ? `<button class="rp-explore-btn rv1-back-btn">← Back to University Network</button>`
      : ''
    }
    <div class="rp-data-note">
      Scholar data sourced from OpenAlex and ORCID.<br>
      Records may be incomplete or misattributed.
    </div>
  </div>
`;

    // Bind collab row clicks — use Search.selectScholar to auto-unlock filters if scholar is hidden
    card.querySelectorAll('.collab-row[data-sid]').forEach(row => {
      onTap(row, () => { Search.selectScholar(row.dataset.sid); });
    });



    // Bind ego network toggle buttons
    const egoToggle = card.querySelector('.rv1-ego-toggle');
    if (egoToggle) {
      egoToggle.querySelectorAll('.rv1-ego-btn').forEach(btn => {
        onTap(btn, () => {
          const hops = parseInt(btn.dataset.hops);
          const isActive = btn.classList.contains('active');
          egoToggle.querySelectorAll('.rv1-ego-btn').forEach(b => b.classList.remove('active'));
          if (hops === 0 || (isActive && hops !== 0)) {
            // DIRECT clicked, or toggling off 1-hop/2-hop → reset to default state
            egoToggle.querySelector('[data-hops="0"]').classList.add('active');
            View1.clearEgoNetwork && View1.clearEgoNetwork();
            View1.panTo && View1.panTo(id);
          } else {
            btn.classList.add('active');
            View1.setEgoNetwork && View1.setEgoNetwork(id, hops);
          }
        });
      });
    }

    // Bind field collapse toggles
    card.querySelectorAll('.rv1-field-toggle').forEach(el => {
      onTap(el, e => { e.preventDefault(); toggleField(el); });
    });

    // Bind subfield tag clicks
    card.querySelectorAll('.rv1-sf-tag').forEach(tag => {
      onTap(tag, e => { e.preventDefault(); e.stopPropagation(); toggleSubfield(tag.id, tag.dataset.subfield, e); });
    });

    // Bind topic tag clicks
    card.querySelectorAll('.rv1-topic-tag').forEach(tag => {
      onTap(tag, e => { e.preventDefault(); e.stopPropagation(); toggleTopic(tag.id, tag.dataset.topic, e); });
    });

    const backBtn = card.querySelector('.rv1-back-btn');
    if (backBtn) {
      onTap(backBtn, () => { goToCollabMap(); });
    }

    // Fade in content
    requestAnimationFrame(() => requestAnimationFrame(() => { card.style.opacity = ''; }));
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

  /* ── Field / subfield / topic interaction ───────────────────────────── */
  function toggleField(el) {
    el.classList.toggle('open');
    const isOpen = el.classList.contains('open');
    let sib = el.nextElementSibling;
    while (sib) {
      sib.style.display = isOpen ? '' : 'none';
      sib = sib.nextElementSibling;
    }
  }

  function _applyHighlight() {
    const selSfTags    = [...document.querySelectorAll('.rv1-sf-tag.selected')];
    const selTopicTags = [...document.querySelectorAll('.rv1-topic-tag.selected')];

    if (selSfTags.length === 0 && selTopicTags.length === 0) {
      DS.state.topicHighlight = null;
      DS.state.topicConnected = null;
      const selId = DS.state.selectedId;
      View1.highlightTopic && View1.highlightTopic(null);
      if (selId) View1.panTo && View1.panTo(selId);
      return;
    }

    const selectedSubfields = selSfTags.map(t => t.dataset.subfield);
    const selectedTopics    = selTopicTags.map(t => t.dataset.topic);
    const selId = DS.state.selectedId;
    const connectedIds = new Set((DS.adjacency.get(selId) || []).map(x => x.id));

    const matchUnconnected = [];
    const matchConnected   = [];

    SCHOLARS.forEach(s => {
      if (s.id === selId) return;
      const det = (typeof SCHOLAR_DETAIL !== 'undefined') ? SCHOLAR_DETAIL[s.id] : null;
      if (!det?.fields) return;
      const scholarSubfields = det.fields.flatMap(f => f.subfields || []);
      const scholarTopics    = det.fields.flatMap(f => f.topics    || []);
      if (selectedSubfields.every(sf => scholarSubfields.includes(sf)) &&
          selectedTopics.every(t => scholarTopics.includes(t))) {
        if (connectedIds.has(s.id)) matchConnected.push(s.id);
        else                         matchUnconnected.push(s.id);
      }
    });

    View1.highlightTopic && View1.highlightTopic(matchUnconnected, matchConnected, { keepPanel: true });
  }

  function toggleSubfield(btnId, subfield, event) {
    event.stopPropagation();
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.toggle('selected');
    _applyHighlight();
  }

  function toggleTopic(btnId, topic, event) {
    event.stopPropagation();
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.toggle('selected');
    _applyHighlight();
  }

  return { reset, showScholar, toggleField, toggleSubfield, toggleTopic };
})();
