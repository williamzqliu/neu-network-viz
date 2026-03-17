/* drawer/drawer_v3.js
 * Bottom drawer content for Scholar Profile (v3).
 * Shows the selected scholar's collaboration timeline and
 * comparison of their metrics against their college average.
 * Falls back to a university overview when no scholar is selected.
 *
 * Depends on: utils.js, datastore.js, D3
 * Called by: drawer.js
 * Module name for Logger: 'DrawerV3'
 *
 * Public methods:
 *   DrawerV3.render(container, subview)
 */

'use strict';

const DrawerV3 = (() => {

  function render(container, subview) {
    Logger.info('DrawerV3', `render subview=${subview}`);

    const id = DS.state.selectedId;
    if (!id) {
      _renderNoSelection(container);
      return;
    }

    const s = DS.scholarMap.get(id);
    if (!s) {
      _renderNoSelection(container);
      return;
    }

    container.innerHTML = _buildLayout(s, id);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const chartH = Math.max(100, Math.min((container.parentElement?.offsetHeight || 240) - 120, 320));
      _drawCollabTimeline('#dv3-collab-timeline', id, chartH);
      _drawMetricComparison('#dv3-metric-compare', s, chartH);
    }));
  }

  /* ── No scholar selected fallback ────────────────────────────────────── */
  function _renderNoSelection(container) {
    container.innerHTML = `
      <div class="dv3-empty">
        <div class="dv3-empty-text">Select a scholar from the University Network to see their profile overview here.</div>
      </div>
    `;
  }

  /* ── Layout ──────────────────────────────────────────────────────────── */
  function _buildLayout(s, id) {
    const det    = (typeof SCHOLAR_DETAIL !== 'undefined') ? (SCHOLAR_DETAIL[id] || {}) : {};
    const col    = DS.getColor(s.college);
    const hops   = DS.state.egoHops;
    const deg    = s.degree || 0;

    // College average h-index
    const collegeUnits = UNITS.filter(u => u.unit_name === s.college && u.avg_h_index);
    const collegeAvgH  = collegeUnits.length
      ? (collegeUnits.reduce((sum, u) => sum + u.avg_h_index, 0) / collegeUnits.length).toFixed(1)
      : '—';

    return `
      <div class="dv3-layout">
        <div class="dv1-stat-row">
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">SCHOLAR</div>
            <div class="dv1-stat-value dv3-scholar-name" style="color:${col}">${s.name}</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">H-INDEX</div>
            <div class="dv1-stat-value">${s.h_index ?? '—'}</div>
            <div class="dv1-stat-sub">college avg: ${collegeAvgH}</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">COLLABORATORS</div>
            <div class="dv1-stat-value">${deg}</div>
            <div class="dv1-stat-sub">at Northeastern</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">TOTAL WORKS</div>
            <div class="dv1-stat-value">${det.total_works ?? '—'}</div>
            <div class="dv1-stat-sub">${det.total_collab_works != null ? det.total_collab_works + ' intra-NEU' : ''}</div>
          </div>
        </div>
        <div class="dv1-charts-row">
          <div class="dv1-chart-block dv1-chart-wide">
            <div class="dv1-chart-title">Collaboration Activity by Year</div>
            <svg id="dv3-collab-timeline" width="100%" height="110"></svg>
          </div>
          <div class="dv1-chart-block">
            <div class="dv1-chart-title">vs. College Average</div>
            <svg id="dv3-metric-compare" width="100%" height="110"></svg>
          </div>
        </div>
      </div>
    `;
  }

  /* ── Scholar collaboration timeline ──────────────────────────────────── */
  function _drawCollabTimeline(selector, id, chartH) {
    const el = document.querySelector(selector);
    if (!el || typeof d3 === 'undefined') return;

    // Build year -> collaboration count from adjacency edge years
    const yearCounts = {};
    (DS.adjacency.get(id) || []).forEach(nb => {
      (nb.years || []).forEach(y => {
        if (y >= 1990 && y <= 2025) yearCounts[y] = (yearCounts[y] || 0) + 1;
      });
    });

    const years = d3.range(1990, 2026);
    const data  = years.map(y => ({ year: y, count: yearCounts[y] || 0 }));

    if (data.every(d => d.count === 0)) {
      d3.select(el).append('text')
        .attr('x', 10).attr('y', 50)
        .attr('font-size', '10px').attr('fill', 'var(--text3)')
        .text('No collaboration year data available.');
      return;
    }

    const W   = el.parentElement.clientWidth || 380;
    const H   = chartH || 110;
    const pad = { top: 10, right: 14, bottom: 24, left: 28 };
    const iW  = W - pad.left - pad.right;
    const iH  = H - pad.top  - pad.bottom;

    const svg = d3.select(el).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`);

    const xScale = d3.scaleBand().domain(years).range([0, iW]).padding(0.1);
    const yScale = d3.scaleLinear().domain([0, d3.max(data, d => d.count) || 1]).range([iH, 0]);

    const col = DS.getColor(DS.scholarMap.get(id)?.college);

    g.selectAll('.year-bar')
      .data(data)
      .join('rect')
      .attr('x', d => xScale(d.year))
      .attr('y', d => yScale(d.count))
      .attr('width', xScale.bandwidth())
      .attr('height', d => iH - yScale(d.count))
      .attr('fill', col)
      .attr('fill-opacity', 0.75)
      .attr('rx', 1);

    // X axis (thinned)
    g.append('g')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(xScale)
        .tickValues([1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025])
        .tickFormat(d3.format('d'))
        .tickSize(3))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', '9px').attr('fill', 'var(--text3)'))
      .call(ax => ax.selectAll('line').attr('stroke', 'var(--border2)'));

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(3).tickSize(3))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', '9px').attr('fill', 'var(--text3)'))
      .call(ax => ax.selectAll('line').attr('stroke', 'var(--border2)'));
  }

  /* ── Metric comparison vs college average ────────────────────────────── */
  function _drawMetricComparison(selector, s, chartH) {
    const el = document.querySelector(selector);
    if (!el || typeof d3 === 'undefined') return;

    // Find college-level unit for averages
    const collegeUnit = UNITS.find(u => u.unit_name === s.college && u.unit_type === 'college');
    if (!collegeUnit) return;

    const metrics = [
      {
        label:    'H-Index',
        scholar:  s.h_index || 0,
        college:  collegeUnit.avg_h_index || 0,
        maxVal:   Math.max((s.h_index || 0) * 1.2, (collegeUnit.avg_h_index || 0) * 1.2, 10),
      },
      {
        label:    'Collabs',
        scholar:  s.degree || 0,
        college:  (() => {
          // avg degree for this college's scholars
          const collegScholars = SCHOLARS.filter(sc => sc.college === s.college && sc.degree);
          return collegScholars.length
            ? collegScholars.reduce((sum, sc) => sum + sc.degree, 0) / collegScholars.length
            : 0;
        })(),
        maxVal:   Math.max((s.degree || 0) * 1.2, 10),
      },
    ];

    const W   = el.parentElement.clientWidth || 200;
    const H   = chartH || 110;
    const pad = { top: 10, right: 16, bottom: 8, left: 60 };
    const iW  = W - pad.left - pad.right;
    const iH  = H - pad.top  - pad.bottom;

    const svg = d3.select(el).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`);

    const yScale = d3.scaleBand().domain(metrics.map(d => d.label)).range([0, iH]).padding(0.3);
    const col    = DS.getColor(s.college);

    metrics.forEach(d => {
      const y    = yScale(d.label);
      const bh   = yScale.bandwidth();
      const halfH = bh / 2 - 1;
      const xMax  = d.maxVal || 1;

      // College avg bar (background)
      g.append('rect')
        .attr('x', 0).attr('y', y + halfH)
        .attr('width', Math.max(0, iW * (d.college / xMax)))
        .attr('height', halfH)
        .attr('fill', 'var(--border)')
        .attr('rx', 1);

      // Scholar bar (foreground)
      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', Math.max(0, iW * (d.scholar / xMax)))
        .attr('height', halfH)
        .attr('fill', col)
        .attr('fill-opacity', 0.85)
        .attr('rx', 1);

      // Values
      g.append('text')
        .attr('x', iW * (d.scholar / xMax) + 4)
        .attr('y', y + halfH / 2 + 3)
        .attr('font-size', '9px').attr('fill', 'var(--text)')
        .text(d.scholar.toFixed ? d.scholar.toFixed(0) : d.scholar);
    });

    // Y axis labels
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', '9px').attr('fill', 'var(--text2)').attr('dx', '-4px'));

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${pad.left}, ${iH + pad.top + 4})`);
    legend.append('rect').attr('width', 8).attr('height', 4).attr('fill', col).attr('fill-opacity', 0.85).attr('rx', 1);
    legend.append('text').attr('x', 11).attr('y', 4).attr('font-size', '8px').attr('fill', 'var(--text3)').text('Scholar');
    legend.append('rect').attr('x', 60).attr('width', 8).attr('height', 4).attr('fill', 'var(--border)').attr('rx', 1);
    legend.append('text').attr('x', 71).attr('y', 4).attr('font-size', '8px').attr('fill', 'var(--text3)').text('College avg');
  }

  return { render };
})();
