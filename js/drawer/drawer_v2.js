/* drawer/drawer_v2.js
 * Bottom drawer content for Unit Collaboration (v2).
 * Charts adapt to current subview: dept / center / compare.
 *
 * Sections:
 *   dept/center: SoS distribution pie + top units bar + avg density bar
 *   compare:     side-by-side stat comparison + cross-edge breakdown
 *
 * Depends on: utils.js, datastore.js, D3
 * Called by: drawer.js
 * Module name for Logger: 'DrawerV2'
 *
 * Public methods:
 *   DrawerV2.render(container, subview)
 */

'use strict';

const DrawerV2 = (() => {

  function render(container, subview) {
    Logger.info('DrawerV2', `render subview=${subview}`);
    if (subview === 'compare') {
      container.innerHTML = _buildCompare();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const chartH = Math.max(110, Math.min((container.parentElement?.offsetHeight || 240) - 120, 320));
        _drawCompareChart('#dv2-compare-chart', chartH);
      }));
    } else {
      const isDept = subview !== 'center';
      container.innerHTML = _buildOverview(isDept);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const chartH = Math.max(110, Math.min((container.parentElement?.offsetHeight || 240) - 120, 320));
        _drawSosPie('#dv2-sos-pie', isDept, chartH);
        _drawTopUnitsBar('#dv2-top-bar', isDept, chartH);
      }));
    }
  }

  /* ── dept / center overview ──────────────────────────────────────────── */
  function _buildOverview(isDept) {
    const units  = UNITS.filter(u => u.unit_type === (isDept ? 'department' : 'center') && u.included && u.scholar_count);
    const total  = units.reduce((s, u) => s + (u.scholar_count || 0), 0);
    const avgH   = units.length ? (units.reduce((s, u) => s + (u.avg_h_index || 0), 0) / units.length).toFixed(1) : '—';
    const avgD   = units.length ? (units.reduce((s, u) => s + (u.density || 0), 0) / units.length).toFixed(3) : '—';

    return `
      <div class="dv2-layout">
        <div class="dv1-stat-row">
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">UNIT TYPE</div>
            <div class="dv1-stat-value">${isDept ? 'Depts' : 'Centers'}</div>
            <div class="dv1-stat-sub">${units.length} units</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">TOTAL SCHOLARS</div>
            <div class="dv1-stat-value">${total.toLocaleString()}</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">AVG H-INDEX</div>
            <div class="dv1-stat-value">${avgH}</div>
          </div>
          <div class="dv1-stat-card">
            <div class="dv1-stat-label">AVG DENSITY</div>
            <div class="dv1-stat-value">${avgD}</div>
          </div>
        </div>
        <div class="dv1-charts-row">
          <div class="dv1-chart-block">
            <div class="dv1-chart-title">SoS Classification</div>
            <svg id="dv2-sos-pie" width="100%" height="110"></svg>
          </div>
          <div class="dv1-chart-block dv1-chart-wide">
            <div class="dv1-chart-title">Top 10 Units by Scholar Count</div>
            <svg id="dv2-top-bar" width="100%" height="110"></svg>
          </div>
        </div>
      </div>
    `;
  }

  /* ── compare layout ──────────────────────────────────────────────────── */
  function _buildCompare() {
    const depts   = UNITS.filter(u => u.unit_type === 'department' && u.included && u.scholar_count);
    const centers = UNITS.filter(u => u.unit_type === 'center'     && u.included && u.scholar_count);

    const stat = (arr, fn) => arr.length ? fn(arr) : '—';
    const avg  = (arr, k) => stat(arr, a => (a.reduce((s, u) => s + (u[k] || 0), 0) / a.length).toFixed(k === 'density' ? 3 : 1));

    return `
      <div class="dv2-layout">
        <div class="dv1-stat-row">
          <div class="dv1-stat-card"><div class="dv1-stat-label">DEPARTMENTS</div><div class="dv1-stat-value">${depts.length}</div></div>
          <div class="dv1-stat-card"><div class="dv1-stat-label">CENTERS</div><div class="dv1-stat-value">${centers.length}</div></div>
          <div class="dv1-stat-card"><div class="dv1-stat-label">DEPT AVG H-INDEX</div><div class="dv1-stat-value">${avg(depts, 'avg_h_index')}</div></div>
          <div class="dv1-stat-card"><div class="dv1-stat-label">CENTER AVG H-INDEX</div><div class="dv1-stat-value">${avg(centers, 'avg_h_index')}</div></div>
        </div>
        <div class="dv1-charts-row">
          <div class="dv1-chart-block dv1-chart-wide">
            <div class="dv1-chart-title">Scholar Count: Departments vs Research Centers</div>
            <svg id="dv2-compare-chart" width="100%" height="110"></svg>
          </div>
        </div>
      </div>
    `;
  }

  /* ── SoS pie chart ───────────────────────────────────────────────────── */
  function _drawSosPie(selector, isDept, chartH) {
    const el = document.querySelector(selector);
    if (!el || typeof d3 === 'undefined') return;

    const units  = UNITS.filter(u => u.unit_type === (isDept ? 'department' : 'center') && u.included);
    const counts = { Superstar: 0, 'Team-of-Teams': 0, Greenfield: 0, Unclassified: 0 };
    units.forEach(u => {
      const k = u.sos_type || 'Unclassified';
      if (counts[k] !== undefined) counts[k]++;
      else counts['Unclassified']++;
    });

    const colors = { Superstar: '#C8102E', 'Team-of-Teams': '#A4804A', Greenfield: '#2E8B57', Unclassified: '#9C9FB2' };
    const data   = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => ({ key: k, value: v, color: colors[k] }));

    const W = el.parentElement.clientWidth || 180;
    const H = chartH || 110;
    const r = Math.min(W, H) / 2 - 10;

    const svg = d3.select(el).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${r + 14},${H / 2})`);

    const pie  = d3.pie().value(d => d.value).sort(null);
    const arc  = d3.arc().innerRadius(r * 0.4).outerRadius(r);

    g.selectAll('.slice')
      .data(pie(data))
      .join('path')
      .attr('class', 'slice')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('fill-opacity', 0.85)
      .attr('stroke', 'var(--bg)')
      .attr('stroke-width', 1.5);

    // Legend to the right
    const legend = svg.append('g').attr('transform', `translate(${r * 2 + 22}, 14)`);
    data.forEach((d, i) => {
      const row = legend.append('g').attr('transform', `translate(0,${i * 18})`);
      row.append('rect').attr('width', 8).attr('height', 8).attr('y', -1).attr('fill', d.color).attr('rx', 1);
      row.append('text').attr('x', 12).attr('y', 7).attr('font-size', '8.5px').attr('fill', 'var(--text2)')
        .text(`${d.key} (${d.value})`);
    });
  }

  /* ── Top units bar chart ─────────────────────────────────────────────── */
  function _drawTopUnitsBar(selector, isDept, chartH) {
    const el = document.querySelector(selector);
    if (!el || typeof d3 === 'undefined') return;

    const units = UNITS
      .filter(u => u.unit_type === (isDept ? 'department' : 'center') && u.included && u.scholar_count)
      .sort((a, b) => (b.scholar_count || 0) - (a.scholar_count || 0))
      .slice(0, 10)
      .map(u => ({
        name:  DS.getShortName(u.unit_name),
        count: u.scholar_count,
        color: isDept ? DS.getColor(u.unit_name) : '#A4804A',
      }));

    if (!units.length) return;

    const W   = el.parentElement.clientWidth || 320;
    const H   = chartH || 110;
    const pad = { top: 8, right: 36, bottom: 8, left: 76 };
    const iW  = W - pad.left - pad.right;
    const iH  = H - pad.top  - pad.bottom;

    const svg = d3.select(el).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`);

    const yScale = d3.scaleBand().domain(units.map(d => d.name)).range([0, iH]).padding(0.22);
    const xScale = d3.scaleLinear().domain([0, d3.max(units, d => d.count) * 1.08]).range([0, iW]);

    g.selectAll('rect')
      .data(units)
      .join('rect')
      .attr('y', d => yScale(d.name))
      .attr('height', yScale.bandwidth())
      .attr('width', d => xScale(d.count))
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.8)
      .attr('rx', 2);

    g.selectAll('.bar-label')
      .data(units)
      .join('text')
      .attr('x', d => xScale(d.count) + 4)
      .attr('y', d => yScale(d.name) + yScale.bandwidth() / 2 + 3)
      .attr('font-size', '8px')
      .attr('fill', 'var(--text3)')
      .text(d => d.count);

    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', '8.5px').attr('fill', 'var(--text2)').attr('dx', '-4px'));
  }

  /* ── Compare grouped bar chart ───────────────────────────────────────── */
  function _drawCompareChart(selector, chartH) {
    const el = document.querySelector(selector);
    if (!el || typeof d3 === 'undefined') return;

    const depts   = UNITS.filter(u => u.unit_type === 'department' && u.included && u.scholar_count)
      .sort((a, b) => b.scholar_count - a.scholar_count).slice(0, 8);
    const centers = UNITS.filter(u => u.unit_type === 'center'     && u.included && u.scholar_count)
      .sort((a, b) => b.scholar_count - a.scholar_count).slice(0, 8);

    const W   = el.parentElement.clientWidth || 500;
    const H   = chartH || 110;
    const pad = { top: 8, right: 16, bottom: 24, left: 44 };
    const iW  = W - pad.left - pad.right;
    const iH  = H - pad.top  - pad.bottom;

    const svg = d3.select(el).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`);

    const categories = ['Departments', 'Research Centers'];
    const xScale = d3.scaleBand().domain(categories).range([0, iW]).padding(0.4);

    const maxCount = Math.max(
      d3.max(depts,   u => u.scholar_count) || 0,
      d3.max(centers, u => u.scholar_count) || 0,
    );
    const yScale = d3.scaleLinear().domain([0, maxCount * 1.1]).range([iH, 0]);

    // Distribution as mini bar-in-bar using average + max + min
    const statBars = [
      {
        label: 'Departments',
        avg:   depts.length ? d3.mean(depts, u => u.scholar_count) : 0,
        max:   d3.max(depts,   u => u.scholar_count) || 0,
        min:   d3.min(depts,   u => u.scholar_count) || 0,
        color: 'var(--red)',
      },
      {
        label: 'Research Centers',
        avg:   centers.length ? d3.mean(centers, u => u.scholar_count) : 0,
        max:   d3.max(centers,   u => u.scholar_count) || 0,
        min:   d3.min(centers,   u => u.scholar_count) || 0,
        color: '#A4804A',
      },
    ];

    // Range bar (min to max)
    statBars.forEach(d => {
      const bx = xScale(d.label) + xScale.bandwidth() / 2 - 4;
      g.append('rect')
        .attr('x', bx)
        .attr('y', yScale(d.max))
        .attr('width', 8)
        .attr('height', Math.max(1, yScale(d.min) - yScale(d.max)))
        .attr('fill', d.color)
        .attr('fill-opacity', 0.18);

      // Avg line
      g.append('rect')
        .attr('x', bx)
        .attr('y', yScale(d.avg) - 1.5)
        .attr('width', 8)
        .attr('height', 3)
        .attr('fill', d.color)
        .attr('rx', 1);
    });

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', '9px').attr('fill', 'var(--text2)'));

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(4).tickSize(3))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', '9px').attr('fill', 'var(--text3)'))
      .call(ax => ax.selectAll('line').attr('stroke', 'var(--border2)'));

    // Legend
    g.append('text').attr('x', iW - 80).attr('y', 10)
      .attr('font-size', '8px').attr('fill', 'var(--text3)')
      .text('bar = range, line = avg');
  }

  return { render };
})();
