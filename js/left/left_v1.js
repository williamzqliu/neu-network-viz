/* left/left_v1.js
 * Left panel for University Network (v1).
 * Renders scholar filters, research unit tree, collaboration filters,
 * display options, and advanced layout controls.
 *
 * Depends on: utils.js, datastore.js
 * Called by: panels.js (_updateLeft when view = 'v1')
 * Calls: View1.build(), View1.setForceCharge(), View1.setForceLink(),
 *        View1.setColorMode(), View1.render()
 *
 * Module name for Logger: 'LeftV1'
 * DOM container: #left-content (passed in by Panels)
 *
 * Public methods:
 *   LeftV1.render(container, subview)
 *   LeftV1.setStatus(v)
 *   LeftV1.setTrack(v)
 *   LeftV1.setColorMode(v)
 *   LeftV1.toggleSection(headerEl, listId)
 *   LeftV1.toggleAdvanced(el)
 *   LeftV1.resetScholars()
 *   LeftV1.resetUnits()
 *   LeftV1.resetCollabFilter()
 *   LeftV1.resetDisplay()
 */

'use strict';

const LeftV1 = (() => {

  /* ── render ──────────────────────────────────────────────────────────── */
  function render(container, subview) {
    Logger.info('LeftV1', `render subview=${subview}`);
    container.innerHTML = _buildHTML();
    _bindEvents(container);
  }

  /* ── HTML builder ────────────────────────────────────────────────────── */
  function _buildHTML() {
    const s = DS.state;

    const colleges = UNITS
      .filter(u => u.unit_type === 'college' && u.included)
      .sort((a, b) => a.unit_name.localeCompare(b.unit_name));

    const centers = UNITS
      .filter(u => u.unit_type === 'center' && u.included)
      .sort((a, b) => a.unit_name.localeCompare(b.unit_name));

    const collegeTree = colleges.map(col => {
      const depts = (DS.collegeDepts.get(col.unit_id) || [])
        .sort((a, b) => a.unit_name.localeCompare(b.unit_name));
      const deptCount = depts.length;
      const colColor = DS.getColor(col.unit_name);
      const memberCount = col.scholar_count || col.active_count || '';

      const deptRows = depts.map(d => {
        const mc = d.scholar_count || d.active_count || '';
        const faded = s.hiddenUnits.has(d.unit_id) ? ' faded' : '';
        return `<div class="lv1-dept-row${faded}" data-uid="${d.unit_id}" title="${d.unit_name}">
          <span class="lv1-dept-name">${d.unit_name}</span>
          <span class="lv1-dept-members">${mc ? mc + ' MEMBERS' : ''}</span>
        </div>`;
      }).join('');

      return `
        <div class="lv1-college-row" data-uid="${col.unit_id}" data-college="${col.unit_name}">
          <div class="lv1-college-left">
            <div class="lv1-college-dot" style="background:${colColor}"></div>
            <span class="lv1-college-name">${col.unit_name}</span>
          </div>
          ${deptCount ? `<span class="lv1-college-depts">${deptCount} DEPTS</span>
            <span class="lv1-college-chevron">▶</span>` : ''}
        </div>
        ${deptCount ? `<div class="lv1-dept-list" style="display:none">${deptRows}</div>` : ''}
      `;
    }).join('');

    const centerRows = centers.map(c => {
      const mc = c.scholar_count || c.active_count || '';
      const faded = s.hiddenUnits.has(c.unit_id) ? ' faded' : '';
      return `<div class="lv1-center-row${faded}" data-uid="${c.unit_id}" title="${c.unit_name}">
        <span class="lv1-center-name">${c.unit_name}</span>
        <span class="lv1-center-members">${mc ? mc + ' MEMBERS' : ''}</span>
      </div>`;
    }).join('');

    return `
      <!-- SCHOLARS -->
      <div class="lv1-section">
        <div class="sec-header">
          <div class="sec-title">SCHOLARS</div>
          <button class="sec-reset" onclick="LeftV1.resetScholars()">Reset</button>
        </div>
        <div class="lv1-filter-group">
          <div class="lv1-filter-label">STATUS</div>
          <div class="btn-group">
            <button class="filter-btn${s.statusFilter === 'all' ? ' active' : ''}" data-sf="all"        onclick="LeftV1.setStatus('all')">All</button>
            <button class="filter-btn${s.statusFilter === 'current' ? ' active' : ''}" data-sf="current"    onclick="LeftV1.setStatus('current')">Active</button>
            <button class="filter-btn${s.statusFilter === 'former' ? ' active' : ''}" data-sf="former"     onclick="LeftV1.setStatus('former')">Former</button>
            <button class="filter-btn${s.statusFilter === 'no_retired' ? ' active' : ''}" data-sf="no_retired" onclick="LeftV1.setStatus('no_retired')">Retired</button>
          </div>
        </div>
        <div class="lv1-filter-group">
          <div class="lv1-filter-label">TRACK</div>
          <div class="btn-group">
            <button class="filter-btn${s.trackFilter === 'all' ? ' active' : ''}" onclick="LeftV1.setTrack('all')">All</button>
            <button class="filter-btn${s.trackFilter === 'teaching_clinical' ? ' active' : ''}" onclick="LeftV1.setTrack('teaching_clinical')">Teaching</button>
            <button class="filter-btn${s.trackFilter === 'teaching_clinical' ? ' active' : ''}" onclick="LeftV1.setTrack('teaching_clinical')">Clinical</button>
            <button class="filter-btn${s.trackFilter === 'research_faculty' ? ' active' : ''}" onclick="LeftV1.setTrack('research_faculty')">Research Faculty</button>
            <button class="filter-btn${s.trackFilter === 'research_other' ? ' active' : ''}" onclick="LeftV1.setTrack('research_other')">Research Other</button>
          </div>
        </div>
      </div>

      <!-- RESEARCH UNITS -->
      <div class="lv1-section">
        <div class="sec-header">
          <div class="sec-title">
            RESEARCH UNITS
            <span class="info-icon" data-tip="Filter by department or research center. Click a college to expand its departments.">?</span>
          </div>
          <button class="sec-reset" onclick="LeftV1.resetUnits()">Reset</button>
        </div>
        <div class="lv1-units-section">
          <div class="lv1-units-header" onclick="LeftV1.toggleSection(this,'lv1-colleges-list')">
            <span>Colleges (${colleges.length})</span>
            <span class="lv1-chevron open">▶</span>
          </div>
          <div id="lv1-colleges-list">${collegeTree}</div>
        </div>
        <div class="lv1-units-section">
          <div class="lv1-units-header" onclick="LeftV1.toggleSection(this,'lv1-centers-list')">
            <span>Research Centers (${centers.length})</span>
            <span class="lv1-chevron">▶</span>
          </div>
          <div id="lv1-centers-list" style="display:none">${centerRows}</div>
        </div>
      </div>

      <!-- COLLABORATION FILTER -->
      <div class="lv1-section">
        <div class="sec-header">
          <div class="sec-title">COLLABORATION FILTER</div>
          <button class="sec-reset" onclick="LeftV1.resetCollabFilter()">Reset</button>
        </div>
        <div class="slider-row">
          <div class="slider-label-row">
            <span class="slider-label">
              YEAR RANGE
              <span class="info-icon" data-tip="Filter collaborations by the year they occurred">?</span>
            </span>
            <span class="slider-val" id="lv1-year-val">${s.yearFrom}–${s.yearTo}</span>
          </div>
          <input type="range" id="lv1-yearfrom" min="1980" max="2026" value="${s.yearFrom}" step="1">
          <input type="range" id="lv1-yearto"   min="1980" max="2026" value="${s.yearTo}"   step="1" style="margin-top:3px">
        </div>
        <div class="slider-row">
          <div class="slider-label-row">
            <span class="slider-label">
              MINIMUM COLLABS
              <span class="info-icon" data-tip="Minimum number of shared publications between two scholars to show an edge">?</span>
            </span>
            <span class="slider-val" id="lv1-thresh-val">${s.threshold}</span>
          </div>
          <input type="range" id="lv1-thresh" min="1" max="20" value="${s.threshold}" step="1">
        </div>
      </div>

      <!-- DISPLAY -->
      <div class="lv1-section">
        <div class="sec-header">
          <div class="sec-title">DISPLAY</div>
          <button class="sec-reset" onclick="LeftV1.resetDisplay()">Reset</button>
        </div>
        <div class="lv1-filter-group">
          <div class="lv1-filter-label">NODE</div>
<div class="btn-group">
  <button class="vc-btn${s.showLabels ? ' active' : ''}" id="lv1-btn-labels"   onclick="toggleLabels()">Labels</button>
  <button class="vc-btn${s.showIsolated ? ' active' : ''}" id="lv1-btn-isolated" onclick="toggleIsolated()">Show Isolated</button>
  <button class="vc-btn${s.frozen ? ' active' : ''}" id="lv1-btn-freeze"   onclick="toggleFreeze()">Freeze</button>
  <button class="vc-btn${s.showEdgeClick ? ' active' : ''}" id="lv1-btn-edgeclick" onclick="LeftV1.toggleEdgeClick()">Edge Links</button>
</div>
        </div>
        <div class="colored-by-row">
          <span class="colored-by-label">COLORED BY</span>
          <span class="info-icon" data-tip="Change node color encoding">?</span>
          <button class="cb-btn${s.colorMode === 'college' ? ' active' : ''}" onclick="LeftV1.setColorMode('college')">College</button>
          <button class="cb-btn${s.colorMode === 'track' ? ' active' : ''}" onclick="LeftV1.setColorMode('track')">Track</button>
          <button class="cb-btn${s.colorMode === 'bridge' ? ' active' : ''}" onclick="LeftV1.setColorMode('bridge')">Bridge Role</button>
          <button class="cb-btn${s.colorMode === 'community' ? ' active' : ''}" onclick="LeftV1.setColorMode('community')">Leiden Community</button>
        </div>

        <!-- Advanced layout -->
        <div class="lv1-advanced-toggle" onclick="LeftV1.toggleAdvanced(this)">
          ▸ ADVANCED LAYOUT
        </div>
        <div id="lv1-advanced-layout" style="display:none">
          <div class="slider-row">
            <div class="slider-label-row">
              <span class="slider-label">REPULSION</span>
              <span class="slider-val" id="lv1-charge-val">−120</span>
            </div>
            <input type="range" id="lv1-charge" min="-500" max="-20" value="-120" step="10">
          </div>
          <div class="slider-row">
            <div class="slider-label-row">
              <span class="slider-label">LINK DISTANCE</span>
              <span class="slider-val" id="lv1-linkdist-val">200</span>
            </div>
            <input type="range" id="lv1-linkdist" min="20" max="200" value="200" step="5">
          </div>
        </div>
      </div>
    `;
  }

  /* ── Event binding ───────────────────────────────────────────────────── */
  function _bindEvents(container) {
    // Year range sliders
    const yf = container.querySelector('#lv1-yearfrom');
    const yt = container.querySelector('#lv1-yearto');
    const yv = container.querySelector('#lv1-year-val');
    if (yf && yt) {
      const updateYear = () => {
        DS.state.yearFrom = Math.min(+yf.value, +yt.value);
        DS.state.yearTo = Math.max(+yf.value, +yt.value);
        if (yv) yv.textContent = `${DS.state.yearFrom}–${DS.state.yearTo}`;
        View1.build();
      };
      yf.oninput = updateYear;
      yt.oninput = updateYear;
    }

    // Threshold slider
    const th = container.querySelector('#lv1-thresh');
    const tv = container.querySelector('#lv1-thresh-val');
    if (th) th.oninput = function () {
      DS.state.threshold = +this.value;
      if (tv) tv.textContent = this.value;
      View1.build();
    };

    // Force charge slider
    const ch = container.querySelector('#lv1-charge');
    const cv = container.querySelector('#lv1-charge-val');
    if (ch) ch.oninput = function () {
      if (cv) cv.textContent = '−' + Math.abs(this.value);
      View1.setForceCharge && View1.setForceCharge(+this.value);
    };

    // Force link distance slider
    const ld = container.querySelector('#lv1-linkdist');
    const lv = container.querySelector('#lv1-linkdist-val');
    if (ld) ld.oninput = function () {
      if (lv) lv.textContent = this.value;
      View1.setForceLink && View1.setForceLink(+this.value);
    };

    // College row expand/collapse
    container.querySelectorAll('.lv1-college-row').forEach(row => {
      const chevron = row.querySelector('.lv1-college-chevron');
      if (!chevron) return;
      onTap(row, () => {
        const deptList = row.nextElementSibling;
        if (!deptList || !deptList.classList.contains('lv1-dept-list')) return;
        const isOpen = deptList.style.display !== 'none';
        deptList.style.display = isOpen ? 'none' : 'block';
        chevron.classList.toggle('open', !isOpen);
      });
    });

    // Dept row click - toggle unit filter
    container.querySelectorAll('.lv1-dept-row').forEach(row => {
      onTap(row, e => {
        e.stopPropagation();
        _toggleUnit(row);
      });
    });

    // Center row click - toggle unit filter
    container.querySelectorAll('.lv1-center-row').forEach(row => {
      onTap(row, () => { _toggleUnit(row); });
    });
  }

  function _toggleUnit(row) {
    const uid = row.dataset.uid;
    if (!uid) return;
    if (DS.state.hiddenUnits.has(uid)) {
      DS.state.hiddenUnits.delete(uid);
      row.classList.remove('faded');
    } else {
      DS.state.hiddenUnits.add(uid);
      row.classList.add('faded');
    }
    View1.build();
  }

  /* ── Public setters (called from HTML onclick) ───────────────────────── */
  function setStatus(v) {
    DS.state.statusFilter = v;
    document.querySelectorAll('[data-sf]').forEach(b => {
      b.classList.toggle('active', b.dataset.sf === v);
    });
    View1.build();
  }

  function setTrack(v) {
    DS.state.trackFilter = v;
    View1.build();
    // Re-render panel so track buttons reflect new state
    const container = getEl('left-content', 'LeftV1');
    if (container) render(container, DS.state.subview);
  }

  function setColorMode(v) {
    DS.state.colorMode = v;
    document.querySelectorAll('.cb-btn').forEach(b => {
      const label = b.textContent.toLowerCase().replace(/\s+/g, '');
      b.classList.toggle('active', label === v.replace(/\s+/g, ''));
    });
    View1.setColorMode && View1.setColorMode(v);
  }

  /* ── Toggle helpers (called from HTML onclick) ───────────────────────── */
  function toggleSection(headerEl, listId) {
    const list = document.getElementById(listId);
    const chevron = headerEl.querySelector('.lv1-chevron');
    if (!list) { Logger.warn('LeftV1', `toggleSection: list #${listId} not found`); return; }
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.classList.toggle('open', !isOpen);
  }

  function toggleAdvanced(el) {
    const box = document.getElementById('lv1-advanced-layout');
    if (!box) return;
    const isOpen = box.style.display !== 'none';
    box.style.display = isOpen ? 'none' : 'block';
    el.textContent = (isOpen ? '▸' : '▾') + ' ADVANCED LAYOUT';
  }

  /* ── Reset functions ─────────────────────────────────────────────────── */
  function resetScholars() {
    DS.state.statusFilter = 'current';
    DS.state.trackFilter = 'all';
    View1.build();
    const container = getEl('left-content', 'LeftV1');
    if (container) render(container, DS.state.subview);
  }

  function resetUnits() {
    DS.state.hiddenUnits.clear();
    View1.build();
    const container = getEl('left-content', 'LeftV1');
    if (container) render(container, DS.state.subview);
  }

  function resetCollabFilter() {
    DS.state.yearFrom = 1990;
    DS.state.yearTo = 2026;
    DS.state.threshold = 1;
    View1.build();
    const container = getEl('left-content', 'LeftV1');
    if (container) render(container, DS.state.subview);
  }

  function resetDisplay() {
    DS.state.colorMode = 'college';
    DS.state.showLabels = true;
    DS.state.showEdgeClick = false;
    View1.setColorMode && View1.setColorMode('college');
    View1.render && View1.render();
    const container = getEl('left-content', 'LeftV1');
    if (container) render(container, DS.state.subview);
  }

  function toggleEdgeClick() {
  DS.state.showEdgeClick = !DS.state.showEdgeClick;
  const btn = document.getElementById('lv1-btn-edgeclick');
  if (btn) btn.classList.toggle('active', DS.state.showEdgeClick);
  View1.render && View1.render();
}

  return {
    render,
    setStatus, setTrack, setColorMode, toggleEdgeClick,
    toggleSection, toggleAdvanced,
    resetScholars, resetUnits, resetCollabFilter, resetDisplay,
  };
})();
