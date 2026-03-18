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

    const _collegeOrder = [
      'Bouve College of Health Sciences',
      'College of Arts, Media and Design',
      'College of Engineering',
      'College of Professional Studies',
      'College of Science',
      'College of Social Sciences & Humanities',
      "D'Amore-McKim School of Business",
      'Khoury College of Computer Sciences',
      'School of Law',
      'Mills College at Northeastern',
      'Northeastern University London',
    ];
    const colleges = UNITS
      .filter(u => u.unit_type === 'college' && u.included)
      .sort((a, b) => {
        const ai = _collegeOrder.indexOf(a.unit_name);
        const bi = _collegeOrder.indexOf(b.unit_name);
        if (ai === -1 && bi === -1) return a.unit_name.localeCompare(b.unit_name);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

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
        const active = s.unitFilter && s.unitFilter.has(d.unit_id) ? ' active' : '';
        return `<div class="lv1-dept-row${active}" data-uid="${d.unit_id}" title="${d.unit_name}" style="border-left-color:${colColor}">
          <span class="lv1-dept-name">${d.unit_name}</span>
        </div>`;
      }).join('');

      return `
        <div class="lv1-college-row" data-uid="${col.unit_id}" data-college="${col.unit_name}">
          <div class="lv1-college-left">
            <div class="lv1-college-dot" style="background:${colColor}"></div>
            <span class="lv1-college-name">${col.unit_name}</span>
          </div>
          ${deptCount ? `<div class="lv1-college-expand">
            <span class="lv1-college-depts">(${deptCount})</span>
            <span class="lv1-college-chevron">▶</span>
          </div>` : ''}
        </div>
        ${deptCount ? `<div class="lv1-dept-list lv1-collapsible">${deptRows}</div>` : ''}
      `;
    }).join('');

    const centerRows = centers.map(c => {
      const active = s.unitFilter && s.unitFilter.has(c.unit_id) ? ' active' : '';
      const empty = (c.active_count || c.scholar_count || 0) === 0 ? ' empty' : '';
      return `<div class="lv1-center-row${active}${empty}" data-uid="${c.unit_id}" title="${c.unit_name}">
        <span class="lv1-center-name">${c.unit_name}</span>
      </div>`;
    }).join('');

    return `
      <!-- SCHOLARS -->
      <div class="lv1-section">
        <div class="sec-header">
          <div class="sec-title">SCHOLARS</div>
          <button class="sec-reset" onclick="LeftV1.resetScholars()"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 6A4 4 0 1 1 8.5 2.8"/><polyline points="9,1 8.5,3.2 6.3,2.7"/></svg>Reset</button>
        </div>
        <div class="lv1-filter-group">
          <div class="lv1-filter-label" style="font-size:13px">STATUS</div>
          <div class="btn-group">
            <button class="filter-btn addon-btn${s.statusFilter.has('current') ? ' active' : ''}" data-sf="current" onclick="LeftV1.setStatus('current')">Active</button>
            <button class="filter-btn addon-btn${s.statusFilter.has('former') ? ' active' : ''}" data-sf="former" onclick="LeftV1.setStatus('former')">Former</button>
            <button class="filter-btn addon-btn${s.statusFilter.has('retired') ? ' active' : ''}" data-sf="retired" onclick="LeftV1.setStatus('retired')">Retired</button>
            <span class="btn-group-break"></span>
            <button class="filter-btn addon-btn${s.showIsolated ? ' active' : ''}" id="lv1-btn-isolated" data-sf="isolated" onclick="toggleIsolated()">Unlinked</button>
          </div>
        </div>
        <div class="lv1-filter-group">
          <div class="lv1-filter-label" style="font-size:13px">TRACK</div>
          <div class="btn-group">
            <button class="filter-btn addon-btn${s.trackFilter.has('research_faculty') ? ' active' : ''}" data-tf="research_faculty" onclick="LeftV1.setTrack('research_faculty')">Research Faculty</button>
            <button class="filter-btn addon-btn${s.trackFilter.has('research_other') ? ' active' : ''}" data-tf="research_other" onclick="LeftV1.setTrack('research_other')">Research Other</button>
            <button class="filter-btn addon-btn${s.trackFilter.has('teaching_clinical') ? ' active' : ''}" data-tf="teaching_clinical" onclick="LeftV1.setTrack('teaching_clinical')">Teaching / Clinical</button>
          </div>
        </div>
      </div>

      <!-- RESEARCH UNITS -->
      <div class="lv1-section">
        <div class="sec-header">
          <div class="sec-title">
            RESEARCH UNITS
            <span class="info-icon" data-tip="Manually curated. Some units are merged and non-research centers are excluded.">?</span>
          </div>
          <button class="sec-reset" onclick="LeftV1.resetUnits()"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 6A4 4 0 1 1 8.5 2.8"/><polyline points="9,1 8.5,3.2 6.3,2.7"/></svg>Reset</button>
        </div>
        <div class="lv1-units-section">
          <div class="lv1-units-header" onclick="LeftV1.toggleSection(this,'lv1-colleges-list')">
            <span>Colleges (${colleges.length})</span>
            <span class="lv1-chevron open">▶</span>
          </div>
          <div id="lv1-colleges-list" class="lv1-collapsible open">${collegeTree}</div>
        </div>
        <div class="lv1-units-section">
          <div class="lv1-units-header" onclick="LeftV1.toggleSection(this,'lv1-centers-list')">
            <div class="lv1-units-header-left">
              <div class="lv1-college-dot" style="background:var(--col-centers)"></div>
              <span>Research Centers (${centers.length})</span>
            </div>
            <span class="lv1-chevron">▶</span>
          </div>
          <div id="lv1-centers-list" class="lv1-collapsible">${centerRows}</div>
        </div>
      </div>

      <!-- COLLABORATION FILTER -->
      <div class="lv1-section">
        <div class="sec-header">
          <div class="sec-title">COLLABORATION FILTER</div>
          <button class="sec-reset" onclick="LeftV1.resetCollabFilter()"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 6A4 4 0 1 1 8.5 2.8"/><polyline points="9,1 8.5,3.2 6.3,2.7"/></svg>Reset</button>
        </div>
        <div class="slider-row">
          <div class="slider-label-row">
            <span class="slider-label">
              YEAR RANGE
              <span class="info-icon" data-tip="Filter collaborations by year of publication.</br></br><em>Drag a handle to adjust. Click a handle to enter single-year mode. Click the track to restore range mode.</em>">?</span>
            </span>
            <span class="slider-val" id="lv1-year-val">${s._yearSingleMode ? s.yearFrom : s.yearFrom + '–' + s.yearTo}</span>
          </div>
          <div class="crs-wrap" id="lv1-year-crs"></div>
        </div>
        <div class="slider-row">
          <div class="slider-label-row">
            <span class="slider-label">
              MINIMUM COLLABS
              <span class="info-icon" data-tip="Minimum number of shared publications between two scholars to show an edge.">?</span>
            </span>
            <span class="slider-val" id="lv1-thresh-val">${s.threshold}</span>
          </div>
          <div class="crs-wrap" id="lv1-thresh-crs"></div>
        </div>
      </div>

      <!-- DISPLAY -->
      <div class="lv1-section">
        <div class="sec-header">
          <div class="sec-title">DISPLAY</div>
          <button class="sec-reset" onclick="LeftV1.resetDisplay()"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 6A4 4 0 1 1 8.5 2.8"/><polyline points="9,1 8.5,3.2 6.3,2.7"/></svg>Reset</button>
        </div>
        <div class="lv1-filter-group">
          <div class="lv1-filter-label">NETWORK</div>
<div class="btn-group">
  <button class="vc-btn${s.showLabels ? ' active' : ''}" id="lv1-btn-labels"   onclick="toggleLabels()">Labels</button>
  <button class="vc-btn${s.showEdgeClick ? ' active' : ''}" id="lv1-btn-edgeclick" onclick="LeftV1.toggleEdgeClick()">Link Select</button>
</div>
        </div>
        <div class="lv1-filter-group">
          <div class="lv1-filter-label">COLORED BY
            <span class="info-icon" data-tip="<b>College</b> colors each scholar by their primary college affiliation.</br></br><b>Bridge Role</b> colors scholars by their bridge score, which measures how strongly a scholar connects otherwise separate research communities.</br></br><b>Community</b> colors scholars by their Leiden community. The Leiden algorithm detects groups of scholars who collaborate densely with each other but sparsely with the rest of the network.">?</span>
          </div>
<div class="btn-group">
  <button class="cb-btn${s.colorMode === 'college' ? ' active' : ''}" data-cm="college" onclick="LeftV1.setColorMode('college')">College</button>
  <button class="cb-btn${s.colorMode === 'bridge' ? ' active' : ''}" data-cm="bridge" onclick="LeftV1.setColorMode('bridge')">Bridge Role</button>
  <button class="cb-btn${s.colorMode === 'community' ? ' active' : ''}" data-cm="community" onclick="LeftV1.setColorMode('community')">Community</button>
</div>
        </div>

      </div>
    `;
  }

  /* ── Custom dual-handle year range slider ────────────────────────────── */
  function _initYearSlider(container) {
    const wrap = container.querySelector('#lv1-year-crs');
    const valEl = container.querySelector('#lv1-year-val');
    if (!wrap) return;

    const MIN = 1980, MAX = 2026;
    let fromVal = DS.state.yearFrom;
    let toVal = DS.state.yearTo;
    let singleMode = DS.state._yearSingleMode || false;
    let blockTrackClick = false;

    const valToPct = v => (v - MIN) / (MAX - MIN) * 100;
    const pctToVal = p => Math.round(MIN + p / 100 * (MAX - MIN));

    function updateDisplay() {
      const handles = wrap.querySelectorAll('.crs-handle');
      const fill = wrap.querySelector('.crs-fill');
      const track = wrap.querySelector('.crs-track');
      handles[0].style.left = valToPct(fromVal) + '%';
      if (singleMode) {
        handles[1].style.display = 'none';
        fill.style.left = '0'; fill.style.width = '0';
        track.classList.add('crs-single');
        if (valEl) valEl.textContent = `${fromVal}`;
      } else {
        handles[1].style.left = valToPct(toVal) + '%';
        handles[1].style.display = '';
        fill.style.left = valToPct(fromVal) + '%';
        fill.style.width = (valToPct(toVal) - valToPct(fromVal)) + '%';
        track.classList.remove('crs-single');
        if (valEl) valEl.textContent = `${fromVal}–${toVal}`;
      }
    }

    function commit() {
      DS.state.yearFrom = fromVal;
      DS.state.yearTo = singleMode ? fromVal + 1 : toVal;
      DS.state._yearSingleMode = singleMode;
      updateDisplay();
      View1.build();
    }

    wrap.innerHTML = `
      <div class="crs-track"><div class="crs-fill"></div></div>
      <div class="crs-handle"></div>
      <div class="crs-handle"></div>`;

    const track = wrap.querySelector('.crs-track');
    const handles = wrap.querySelectorAll('.crs-handle');

    handles.forEach((handle, idx) => {
      const isTo = idx === 1;
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        blockTrackClick = true;
        const startX = e.clientX;
        let moved = false;

        const onMove = mv => {
          if (Math.abs(mv.clientX - startX) > 3) moved = true;
          const rect = track.getBoundingClientRect();
          const p = Math.max(0, Math.min(100, (mv.clientX - rect.left) / rect.width * 100));
          const v = pctToVal(p);
          if (isTo) {
            toVal = Math.max(fromVal + 1, Math.min(MAX, v));
          } else {
            fromVal = singleMode
              ? Math.max(MIN, Math.min(MAX, v))
              : Math.max(MIN, Math.min(toVal - 1, v));
          }
          updateDisplay();
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          setTimeout(() => { blockTrackClick = false; }, 0);
          if (!moved && !singleMode) {
            // Click on handle: collapse to single mode
            if (isTo) {
              singleMode = true;
            } else {
              fromVal = toVal;
              singleMode = true;
            }
          }
          commit();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });

    // Click on track: restore second handle (single → range)
    track.addEventListener('click', e => {
      if (blockTrackClick || !singleMode) return;
      const rect = track.getBoundingClientRect();
      const p = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
      const v = pctToVal(p);
      if (v > fromVal) { toVal = v; }
      else if (v < fromVal) { toVal = fromVal; fromVal = v; }
      else { toVal = Math.min(MAX, fromVal + 1); }
      singleMode = false;
      commit();
    });

    updateDisplay();
  }

  /* ── Single-handle threshold slider ─────────────────────────────────── */
  function _initThreshSlider(container) {
    const wrap = container.querySelector('#lv1-thresh-crs');
    const valEl = container.querySelector('#lv1-thresh-val');
    if (!wrap) return;

    const MIN = 0, MAX = 20;
    let val = DS.state.threshold;

    const valToPct = v => (v - MIN) / (MAX - MIN) * 100;
    const pctToVal = p => Math.round(MIN + p / 100 * (MAX - MIN));

    wrap.innerHTML = `
      <div class="crs-track"><div class="crs-fill"></div></div>
      <div class="crs-handle"></div>`;

    const track = wrap.querySelector('.crs-track');
    const fill  = wrap.querySelector('.crs-fill');
    const handle = wrap.querySelector('.crs-handle');

    function updateDisplay() {
      handle.style.left = valToPct(val) + '%';
      fill.style.left = '0';
      fill.style.width = valToPct(val) + '%';
      if (valEl) valEl.textContent = val;
    }

    function commit() {
      DS.state.threshold = val;
      updateDisplay();
      View1.build();
    }

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const onMove = mv => {
        const rect = track.getBoundingClientRect();
        const p = Math.max(0, Math.min(100, (mv.clientX - rect.left) / rect.width * 100));
        val = pctToVal(p);
        updateDisplay();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        commit();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    updateDisplay();
  }

  /* ── Event binding ───────────────────────────────────────────────────── */
  function _bindEvents(container) {
    // Year range custom slider
    _initYearSlider(container);

    // Threshold slider
    _initThreshSlider(container);

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

    // Sync initial legend state
    _syncCollegeLegendState(container);

    // College row expand/collapse
    container.querySelectorAll('.lv1-college-row').forEach(row => {
      const chevron = row.querySelector('.lv1-college-chevron');
      const left    = row.querySelector('.lv1-college-left');
      const expand  = row.querySelector('.lv1-college-expand');

      // Left area (dot + name): toggle legend filter
      if (left) {
        onTap(left, e => {
          e.stopPropagation();
          const college = row.dataset.college;
          if (college && View1.toggleLegendFilter) {
            View1.toggleLegendFilter(college);
            _syncCollegeLegendState(container);
          }
        });
      }

      // Right area (count + chevron): expand/collapse dept list
      if (expand && chevron) {
        onTap(expand, e => {
          e.stopPropagation();
          const deptList = row.nextElementSibling;
          if (!deptList || !deptList.classList.contains('lv1-dept-list')) return;
          const isOpen = deptList.classList.contains('open');
          deptList.classList.toggle('open', !isOpen);
          chevron.classList.toggle('open', !isOpen);
        });
      }
    });

    // Dept row click - highlight scholars in this dept
    container.querySelectorAll('.lv1-dept-row').forEach(row => {
      onTap(row, e => {
        e.stopPropagation();
        const uid = row.dataset.uid;
        if (uid && View1.toggleUnitFilter) View1.toggleUnitFilter(uid);
      });
    });

    // Center row click - highlight scholars in this center
    container.querySelectorAll('.lv1-center-row').forEach(row => {
      onTap(row, e => {
        e.stopPropagation();
        const uid = row.dataset.uid;
        if (uid && View1.toggleUnitFilter) View1.toggleUnitFilter(uid);
      });
    });
  }

  function _syncCollegeLegendState(container) {
    const lf = DS.state.legendFilter;
    const uf = DS.state.unitFilter;
    container.querySelectorAll('.lv1-college-row').forEach(row => {
      const left = row.querySelector('.lv1-college-left');
      if (!left) return;
      left.classList.toggle('active', !!(lf && lf.has(row.dataset.college)));
    });
    container.querySelectorAll('.lv1-dept-row').forEach(row => {
      row.classList.toggle('active', !!(uf && uf.has(row.dataset.uid)));
    });
    container.querySelectorAll('.lv1-center-row').forEach(row => {
      row.classList.toggle('active', !!(uf && uf.has(row.dataset.uid)));
    });
  }

  function syncLegendState() {
    const container = getEl('left-content', 'LeftV1');
    if (container) _syncCollegeLegendState(container);
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
    const sf = DS.state.statusFilter;
    // When Unlinked is active, allow statusFilter to reach 0 (isolated nodes still show)
    if (sf.has(v) && sf.size === 1 && !DS.state.showIsolated) return;
    sf.has(v) ? sf.delete(v) : sf.add(v);
    document.querySelectorAll('[data-sf]').forEach(b => {
      if (b.dataset.sf === 'isolated') {
        b.classList.toggle('active', DS.state.showIsolated);
      } else {
        b.classList.toggle('active', sf.has(b.dataset.sf));
      }
    });
    View1.build();
  }

  function setTrack(v) {
    const tf = DS.state.trackFilter;
    if (tf.has(v) && tf.size === 1) return; // keep at least one selected
    tf.has(v) ? tf.delete(v) : tf.add(v);
    document.querySelectorAll('[data-tf]').forEach(b => {
      b.classList.toggle('active', tf.has(b.dataset.tf));
    });
    View1.build();
  }

  function setColorMode(v) {
    DS.state.colorMode = v;
    document.querySelectorAll('[data-cm]').forEach(b => {
      b.classList.toggle('active', b.dataset.cm === v);
    });
    View1.setColorMode && View1.setColorMode(v);
  }

  /* ── Toggle helpers (called from HTML onclick) ───────────────────────── */
  function toggleSection(headerEl, listId) {
    const list = document.getElementById(listId);
    const chevron = headerEl.querySelector('.lv1-chevron');
    if (!list) { Logger.warn('LeftV1', `toggleSection: list #${listId} not found`); return; }
    const isOpen = list.classList.contains('open');
    list.classList.toggle('open', !isOpen);
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
    DS.state.statusFilter = new Set(['current']);
    DS.state.trackFilter  = new Set(['research_faculty']);
    View1.build();
    const container = getEl('left-content', 'LeftV1');
    if (container) render(container, DS.state.subview);
  }

  function resetUnits() {
    DS.state.unitFilter = new Set();
    DS.state.legendFilter = new Set();
    View1.clearTopicHighlight && View1.clearTopicHighlight();
  }

  function resetCollabFilter() {
    DS.state.yearFrom = 1980;
    DS.state.yearTo = 2026;
    DS.state._yearSingleMode = false;
    DS.state.threshold = 0;
    View1.build();
    const container = getEl('left-content', 'LeftV1');
    if (container) render(container, DS.state.subview);
  }

  function resetDisplay() {
    DS.state.colorMode = 'college';
    DS.state.showLabels = true;
    DS.state.showEdgeClick = false;
    DS.state.showIsolated = false;
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
    toggleSection, toggleAdvanced, syncLegendState,
    resetScholars, resetUnits, resetCollabFilter, resetDisplay,
  };
})();
