/* drawer/drawer_v1.js
 * Bottom drawer content for University Network (v1).
 * Charts rendered with D3 directly from in-memory data.
 *
 * Sections:
 *   - Collaboration growth timeline (line chart)
 *   - Scholar count by college (horizontal bar chart)
 *   - Key network stats (cards)
 *
 * Depends on: utils.js, datastore.js, D3 (global)
 * Called by: drawer.js
 * Module name for Logger: 'DrawerV1'
 *
 * Public methods:
 *   DrawerV1.render(container, subview)
 */

'use strict';

const DrawerV1 = (() => {

  /* ── render ──────────────────────────────────────────────────────────── */
  function render(container, subview) {
    Logger.info('DrawerV1', `render subview=${subview}`);
    container.innerHTML = _buildLayout(subview);
    // Use rAF x2 so the container has its final dimensions
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const contentH = container.parentElement?.offsetHeight || 240;
      const chartH   = Math.max(110, Math.min(contentH - 120, 320));
      _drawTimeline('#dv1-timeline', chartH);
      _drawCollegeBar('#dv1-college-bar', chartH);
    }));
  }

  /* ── layout skeleton ─────────────────────────────────────────────────── */
  function _buildLayout(subview) {
    const ts     = SUMMARY.timeseries || [];
    const latest = ts[ts.length - 2] || ts[ts.length - 1] || {};

    const scholars = SCHOLARS.length;
    const active   = SCHOLARS.filter(s => s.status === 'current').length;
    const isolated = SCHOLARS.filter(s => s.is_isolated).length;
    const bridges  = SCHOLARS.filter(s => s.is_bridge).length;
    const isolPct  = scholars ? Math.round(isolated / scholars * 100) : 0;

    return `
      <div class="dv1-layout">

        <!-- Stat cards -->
        <div class="dv1-stat-row">
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">TOTAL SCHOLARS</div>
            <div class="dv1-stat-value">${scholars.toLocaleString()}</div>
            <div class="dv1-stat-sub">${active.toLocaleString()} active</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">COLLABORATIONS</div>
            <div class="dv1-stat-value">${EDGES.length.toLocaleString()}</div>
            <div class="dv1-stat-sub">co-authorship pairs</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">ISOLATED</div>
            <div class="dv1-stat-value">${isolated.toLocaleString()}</div>
            <div class="dv1-stat-sub">${isolPct}% of faculty</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">BRIDGE SCHOLARS</div>
            <div class="dv1-stat-value">${bridges.toLocaleString()}</div>
            <div class="dv1-stat-sub">cross-unit connectors</div>
          </div>
        </div>

        <!-- Charts row -->
        <div class="dv1-charts-row">
          <div class="dv1-chart-block dv1-chart-wide">
            <div class="dv1-chart-title">Collaboration Growth (1990–2025)</div>
            <svg id="dv1-timeline" class="dv1-chart-svg" width="100%"></svg>
          </div>
          <div class="dv1-chart-block">
            <div class="dv1-chart-title">Scholars by College</div>
            <svg id="dv1-college-bar" class="dv1-chart-svg" width="100%"></svg>
          </div>
        </div>

      </div>
    `;
  }

  /* ── Timeline chart: active_collab_pairs over years ─────────────────── */
  function _drawTimeline(selector, chartH) {
    const el = document.querySelector(selector);
    if (!el || typeof d3 === 'undefined') return;

    const ts = (SUMMARY.timeseries || []).filter(d => d.year >= 1990 && d.year <= 2025);
    if (!ts.length) return;

    const W   = el.parentElement.clientWidth || 400;
    const H   = chartH || 110;
    const pad = { top: 14, right: 20, bottom: 28, left: 48 };
    const iW  = W - pad.left - pad.right;
    const iH  = H - pad.top  - pad.bottom;

    const svg = d3.select(el).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(ts, d => d.year))
      .range([0, iW]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(ts, d => d.active_collab_pairs) * 1.1])
      .range([iH, 0]);

    // Area fill
    g.append('path')
      .datum(ts)
      .attr('fill', 'var(--red)')
      .attr('fill-opacity', 0.08)
      .attr('d', d3.area()
        .x(d => xScale(d.year))
        .y0(iH)
        .y1(d => yScale(d.active_collab_pairs))
        .curve(d3.curveMonotoneX)
      );

    // Line
    g.append('path')
      .datum(ts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--red)')
      .attr('stroke-width', 1.5)
      .attr('d', d3.line()
        .x(d => xScale(d.year))
        .y(d => yScale(d.active_collab_pairs))
        .curve(d3.curveMonotoneX)
      );

    // New pairs line (secondary)
    g.append('path')
      .datum(ts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--gold)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 2')
      .attr('d', d3.line()
        .x(d => xScale(d.year))
        .y(d => yScale(d.new_collab_pairs))
        .curve(d3.curveMonotoneX)
      );

    // X axis (years, thinned)
    const xAxis = d3.axisBottom(xScale)
      .tickValues([1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025])
      .tickFormat(d3.format('d'))
      .tickSize(3);
    g.append('g')
      .attr('transform', `translate(0,${iH})`)
      .call(xAxis)
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', 'var(--fs-chart-axis)').attr('fill', 'var(--text3)'))
      .call(ax => ax.selectAll('line').attr('stroke', 'var(--border2)'));

    // Y axis
    const yAxis = d3.axisLeft(yScale).ticks(4).tickFormat(d => d >= 1000 ? d / 1000 + 'k' : d).tickSize(3);
    g.append('g')
      .call(yAxis)
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', 'var(--fs-chart-axis)').attr('fill', 'var(--text3)'))
      .call(ax => ax.selectAll('line').attr('stroke', 'var(--border2)'));

    // Legend
    const legend = g.append('g').attr('transform', `translate(${iW - 120}, 2)`);
    legend.append('line').attr('x1', 0).attr('x2', 14).attr('y1', 5).attr('y2', 5)
      .attr('stroke', 'var(--red)').attr('stroke-width', 1.5);
    legend.append('text').attr('x', 18).attr('y', 8)
      .text('Active pairs').attr('font-size', 'var(--fs-chart-anno)').attr('fill', 'var(--text3)');
    legend.append('line').attr('x1', 0).attr('x2', 14).attr('y1', 18).attr('y2', 18)
      .attr('stroke', 'var(--gold)').attr('stroke-width', 1).attr('stroke-dasharray', '3 2');
    legend.append('text').attr('x', 18).attr('y', 21)
      .text('New pairs').attr('font-size', 'var(--fs-chart-anno)').attr('fill', 'var(--text3)');
  }

  /* ── College bar chart ───────────────────────────────────────────────── */
  function _drawCollegeBar(selector, chartH) {
    const el = document.querySelector(selector);
    if (!el || typeof d3 === 'undefined') return;

    const colleges = UNITS
      .filter(u => u.unit_type === 'college' && u.included && u.scholar_count)
      .map(u => ({ name: DS.getShortName(u.unit_name), count: u.scholar_count, color: DS.getColor(u.unit_name) }))
      .sort((a, b) => b.count - a.count);

    if (!colleges.length) return;

    const W   = el.parentElement.clientWidth || 260;
    const H   = chartH || 110;
    const pad = { top: 10, right: 36, bottom: 10, left: 58 };
    const iW  = W - pad.left - pad.right;
    const iH  = H - pad.top  - pad.bottom;

    const svg = d3.select(el).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`);

    const yScale = d3.scaleBand()
      .domain(colleges.map(d => d.name))
      .range([0, iH])
      .padding(0.25);

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(colleges, d => d.count) * 1.05])
      .range([0, iW]);

    // Bars
    g.selectAll('.dv1-bar')
      .data(colleges)
      .join('rect')
      .attr('class', 'dv1-bar')
      .attr('x', 0)
      .attr('y', d => yScale(d.name))
      .attr('width', d => xScale(d.count))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.8)
      .attr('rx', 2);

    // Value labels
    g.selectAll('.dv1-bar-label')
      .data(colleges)
      .join('text')
      .attr('class', 'dv1-bar-label')
      .attr('x', d => xScale(d.count) + 4)
      .attr('y', d => yScale(d.name) + yScale.bandwidth() / 2 + 3)
      .attr('font-size', 'var(--fs-chart-anno)')
      .attr('fill', 'var(--text3)')
      .text(d => d.count);

    // Y axis (college names)
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text')
        .attr('font-size', 'var(--fs-chart-axis)')
        .attr('fill', 'var(--text2)')
        .attr('dx', '-4px'));
  }

  return { render };
})();
