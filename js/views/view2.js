/* view2.js — Unit Collaboration View */
'use strict';

const View2 = (() => {

  // ── State ─────────────────────────────────────────────────────────────────
  let svg, g, W, H;
  let simulation = null;
  let currentMode = 'dept';    // 'dept' | 'center' | 'compare'
  let currentUnitId = null;      // when drilling into a unit's internal graph
  let viewMode = 'overview'; // 'overview' | 'internal'

  // ── Hex generators ────────────────────────────────────────────────────────
  function hexPath(r, pointy) {
    return d3.range(6).map(i => {
      const a = (i * 60 + (pointy ? 30 : 0)) * Math.PI / 180;
      return [r * Math.cos(a), r * Math.sin(a)];
    }).reduce((acc, p, i) => acc + (i ? 'L' : 'M') + p.join(','), '') + 'Z';
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    const wrap = document.getElementById('v2-wrap');
    if (!wrap) return;
    W = wrap.clientWidth;
    H = wrap.clientHeight;

    svg = d3.select('#v2-svg')
      .attr('width', W).attr('height', H);
    svg.selectAll('*').remove();

    const zoom = d3.zoom().scaleExtent([0.05, 12])
      .on('zoom', e => g && g.attr('transform', e.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('click', e => { if (e.target === svg.node()) clearSelect(); });

    g = svg.append('g');

    window.addEventListener('resize', () => {
      const wrap = document.getElementById('v2-wrap');
      if (!wrap || !svg) return;
      W = wrap.clientWidth; H = wrap.clientHeight;
      svg.attr('width', W).attr('height', H);
      if (simulation) simulation.force('center', d3.forceCenter(W / 2, H / 2));
    });
  }

  // ── Main build dispatcher ─────────────────────────────────────────────────
  function build(mode) {
    if (!svg) init();
    if (mode) currentMode = mode;
    viewMode = 'overview';
    currentUnitId = null;
    if (simulation) { simulation.stop(); simulation = null; }
    g.selectAll('*').remove();
    clearRightPanel();

    if (currentMode === 'compare') buildCompare();
    else buildOverview(currentMode);

    syncSwitcherBtns();
  }

  // ── Overview: dept or center network ─────────────────────────────────────
  function buildOverview(type) {
    const isDept = type === 'dept';
    const unitType = isDept ? 'department' : 'center';
    const crossKey = isDept ? 'cross_dept' : 'cross_center';

    const relevantEdges = CROSS_UNIT_EDGES.filter(e => e.cross_type === crossKey);
    const activeIds = new Set();
    relevantEdges.forEach(e => { activeIds.add(e.unit_a); activeIds.add(e.unit_b); });

    const validUnits = UNITS.filter(u =>
      u.unit_type === unitType && u.included && activeIds.has(u.unit_id));

    const maxM = d3.max(validUnits, u => u.scholar_count || 1) || 1;
    const rScale = d3.scaleSqrt().domain([1, maxM]).range([isDept ? 14 : 10, isDept ? 42 : 32]);
    const maxW = d3.max(relevantEdges, e => e.weight) || 1;
    const wScale = d3.scaleSqrt().domain([1, maxW]).range([0.5, 5]);

    const nodes = validUnits.map(u => ({
      ...u,
      r: rScale(u.scholar_count || 1),
      x: W / 2 + (Math.random() - 0.5) * 400,
      y: H / 2 + (Math.random() - 0.5) * 400,
    }));
    const nodeSet = new Set(nodes.map(u => u.unit_id));
    const links = relevantEdges
      .filter(e => nodeSet.has(e.unit_a) && nodeSet.has(e.unit_b))
      .map(e => ({ ...e, source: e.unit_a, target: e.unit_b }));

    // Links
    const linkSel = g.append('g').attr('class', 'unit-links')
      .selectAll('line').data(links).join('line')
      .attr('class', 'unit-link')
      .attr('stroke', '#9BA8C2')
      .attr('stroke-opacity', 0.25)
      .attr('stroke-width', d => wScale(d.weight));

    // Nodes
    const nodeSel = g.append('g').attr('class', 'unit-nodes')
      .selectAll('g').data(nodes, d => d.unit_id).join('g')
      .attr('class', 'unit-hex')
      .call(d3.drag()
        .on('start', (ev, d) => { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on('end', (ev, d) => { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on('click', (ev, d) => { ev.stopPropagation(); selectUnit(d, links, nodeSel, linkSel); })
      .on('dblclick', (ev, d) => { ev.stopPropagation(); drillIntoUnit(d); })
      .on('mouseover', (ev, d) => showUnitTooltip(ev, d))
      .on('mousemove', moveTooltip)
      .on('mouseout', hideTooltip);

    nodeSel.append('path')
      .attr('d', d => hexPath(d.r, !isDept))
      .attr('fill', d => getUnitColor(d) + 'CC')
      .attr('stroke', d => getUnitColor(d))
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer');

    // SoS badge (centers only)
    if (!isDept) {
      nodeSel.filter(d => d.sos_type && d.sos_type !== 'Unclassified')
        .append('text')
        .attr('y', d => -d.r - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', '7px')
        .attr('font-family', 'DM Sans, sans-serif')
        .attr('fill', d => sosBadgeColor(d.sos_type))
        .attr('pointer-events', 'none')
        .text(d => d.sos_type);
    }

    nodeSel.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', d => Math.max(6.5, Math.min(10, d.r / 2.8)) + 'px')
      .attr('font-family', 'DM Sans, sans-serif')
      .attr('fill', '#2A3050')
      .attr('pointer-events', 'none')
      .text(d => abbrev(d.unit_name, d.r));

    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.unit_id)
        .distance(d => 60 + 100 / Math.sqrt((d.weight || 1) / 50 + 1))
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(d => d.r + 8))
      .on('tick', () => {
        linkSel
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
      });

    _renderRightDeptCenter(type === 'dept' ? 'dept' : 'center');
  }

  // ── Compare mode: side-by-side force layouts ──────────────────────────────
  function buildCompare() {
    const deptEdges = CROSS_UNIT_EDGES.filter(e => e.cross_type === 'cross_dept');
    const ctrEdges = CROSS_UNIT_EDGES.filter(e => e.cross_type === 'cross_center');

    const deptIds = new Set(); deptEdges.forEach(e => { deptIds.add(e.unit_a); deptIds.add(e.unit_b); });
    const ctrIds = new Set(); ctrEdges.forEach(e => { ctrIds.add(e.unit_a); ctrIds.add(e.unit_b); });

    const depts = UNITS.filter(u => u.unit_type === 'department' && u.included && deptIds.has(u.unit_id));
    const centers = UNITS.filter(u => u.unit_type === 'center' && u.included && ctrIds.has(u.unit_id));

    const maxM = Math.max(d3.max(depts, u => u.scholar_count || 1) || 1,
      d3.max(centers, u => u.scholar_count || 1) || 1);
    const rDept = d3.scaleSqrt().domain([1, maxM]).range([10, 34]);
    const rCtr = d3.scaleSqrt().domain([1, maxM]).range([8, 26]);
    const wScale = d3.scaleSqrt().domain([1, d3.max([...deptEdges, ...ctrEdges], e => e.weight) || 1]).range([0.4, 4]);

    // Assign positions
    depts.forEach(u => { u.x = W * 0.25 + (Math.random() - 0.5) * W * 0.35; u.y = H / 2 + (Math.random() - 0.5) * H * 0.75; u.r = rDept(u.scholar_count || 1); });
    centers.forEach(u => { u.x = W * 0.75 + (Math.random() - 0.5) * W * 0.35; u.y = H / 2 + (Math.random() - 0.5) * H * 0.75; u.r = rCtr(u.scholar_count || 1); });

    // Divider + headers
    g.append('line')
      .attr('x1', W / 2).attr('y1', 32).attr('x2', W / 2).attr('y2', H - 16)
      .attr('stroke', 'var(--border)').attr('stroke-dasharray', '5 4').attr('stroke-width', 1);
    g.append('text').attr('x', W * 0.25).attr('y', 22).attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('font-weight', '600').attr('letter-spacing', '.08em')
      .attr('font-family', 'DM Sans, sans-serif').attr('fill', 'var(--text3)').text('DEPARTMENTS ⬡');
    g.append('text').attr('x', W * 0.75).attr('y', 22).attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('font-weight', '600').attr('letter-spacing', '.08em')
      .attr('font-family', 'DM Sans, sans-serif').attr('fill', 'var(--text3)').text('RESEARCH CENTERS ⬢');

    // Links
    const deptLinkSel = g.append('g')
      .selectAll('line').data(deptEdges.filter(e => deptIds.has(e.unit_a) && deptIds.has(e.unit_b))
        .map(e => ({ ...e, source: e.unit_a, target: e.unit_b }))).join('line')
      .attr('stroke', '#9BA8C2').attr('stroke-opacity', 0.2).attr('stroke-width', d => wScale(d.weight));

    const ctrLinkSel = g.append('g')
      .selectAll('line').data(ctrEdges.filter(e => ctrIds.has(e.unit_a) && ctrIds.has(e.unit_b))
        .map(e => ({ ...e, source: e.unit_a, target: e.unit_b }))).join('line')
      .attr('stroke', '#9BA8C2').attr('stroke-opacity', 0.2).attr('stroke-width', d => wScale(d.weight));

    // All nodes
    const allNodes = [
      ...depts.map(u => ({ ...u, _side: 'dept' })),
      ...centers.map(u => ({ ...u, _side: 'center' })),
    ];

    const nodeSel = g.append('g').selectAll('g').data(allNodes, d => d.unit_id).join('g')
      .attr('class', 'unit-hex')
      .call(d3.drag()
        .on('start', (ev, d) => { d.fx = d.x; d.fy = d.y; })
        .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on('end', (ev, d) => { d.fx = null; d.fy = null; }))
      .on('click', (ev, d) => { ev.stopPropagation(); selectUnit(d, [], nodeSel, null); })
      .on('dblclick', (ev, d) => { ev.stopPropagation(); drillIntoUnit(d); })
      .on('mouseover', (ev, d) => showUnitTooltip(ev, d))
      .on('mousemove', moveTooltip)
      .on('mouseout', hideTooltip);

    nodeSel.append('path')
      .attr('d', d => hexPath(d.r, d._side === 'center'))
      .attr('fill', d => getUnitColor(d) + 'BB')
      .attr('stroke', d => getUnitColor(d)).attr('stroke-width', 1.2).attr('cursor', 'pointer');

    nodeSel.filter(d => d._side === 'center' && d.sos_type && d.sos_type !== 'Unclassified')
      .append('text')
      .attr('y', d => -d.r - 5).attr('text-anchor', 'middle')
      .attr('font-size', '7px').attr('font-family', 'DM Sans, sans-serif')
      .attr('fill', d => sosBadgeColor(d.sos_type)).attr('pointer-events', 'none')
      .text(d => d.sos_type);

    nodeSel.append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('font-size', d => Math.max(6, d.r / 3) + 'px')
      .attr('font-family', 'DM Sans, sans-serif').attr('fill', '#2A3050').attr('pointer-events', 'none')
      .text(d => abbrev(d.unit_name, d.r));

    // Separate simulations for each half
    const deptLinks = deptEdges.filter(e => deptIds.has(e.unit_a) && deptIds.has(e.unit_b))
      .map(e => ({ ...e, source: e.unit_a, target: e.unit_b }));
    const ctrLinks = ctrEdges.filter(e => ctrIds.has(e.unit_a) && ctrIds.has(e.unit_b))
      .map(e => ({ ...e, source: e.unit_a, target: e.unit_b }));

    function tick() {
      deptLinkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      ctrLinkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    }

    const simDept = d3.forceSimulation(depts)
      .force('link', d3.forceLink(deptLinks).id(d => d.unit_id).distance(60).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(W * 0.25, H / 2))
      .force('collide', d3.forceCollide(d => d.r + 6))
      .on('tick', tick);

    const simCtr = d3.forceSimulation(centers)
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(W * 0.75, H / 2))
      .force('collide', d3.forceCollide(d => d.r + 6))
      .on('tick', tick);

    simulation = simDept;

    _renderRightCompare('compare');
  }

  // ── Drill into unit internal co-authorship graph ──────────────────────────
  function drillIntoUnit(unit) {
    currentUnitId = unit.unit_id;
    viewMode = 'internal';
    if (simulation) { simulation.stop(); simulation = null; }
    g.selectAll('*').remove();

    // Find all scholars in this unit
    const unitScholars = SCHOLARS.filter(s => s.main_affil_id === unit.unit_id);
    const unitIds = new Set(unitScholars.map(s => s.id));

    // Internal edges: both ends in this unit
    const internalEdges = EDGES.filter(e => unitIds.has(e.source) && unitIds.has(e.target));

    const W2 = W, H2 = H;
    const maxH = d3.max(unitScholars, s => s.h_index || 0) || 1;
    const maxW = d3.max(internalEdges, e => e.weight) || 1;
    const rScale = d3.scaleSqrt().domain([0, maxH]).range([4, 18]);
    const wScale = d3.scaleSqrt().domain([1, maxW]).range([0.5, 4]);

    const nodes = unitScholars.map(s => ({
      ...s,
      x: W2 / 2 + (Math.random() - 0.5) * 300,
      y: H2 / 2 + (Math.random() - 0.5) * 300,
    }));
    const links = internalEdges.map(e => ({ ...e }));

    // Back button
    g.append('foreignObject').attr('x', 12).attr('y', 12).attr('width', 140).attr('height', 28)
      .append('xhtml:button')
      .attr('class', 'v2-back-btn')
      .style('cssText', 'font-family:DM Sans,sans-serif;font-size:var(--fs-xs);padding:4px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;white-space:nowrap')
      .text('← Back to Overview')
      .on('click', () => build(currentMode));

    // Unit name label
    g.append('text')
      .attr('x', W2 / 2).attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px').attr('font-weight', '600')
      .attr('font-family', 'DM Sans, sans-serif')
      .attr('fill', 'var(--text)')
      .text(unit.unit_name);

    // Links
    const linkSel = g.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', '#9BA8C2').attr('stroke-opacity', 0.3)
      .attr('stroke-width', d => wScale(d.weight || 1));

    // Nodes
    const nodeSel = g.append('g')
      .selectAll('g').data(nodes, d => d.id).join('g')
      .attr('class', 'ego-node')
      .style('cursor', 'pointer')
      .on('click', (ev, d) => {
        ev.stopPropagation();
        DS.state.selectedId = d.id;
        Panels.showScholarCard(d.id);
      })
      .on('mouseover', (ev, d) => showScholarTooltip(ev, d))
      .on('mousemove', moveTooltip)
      .on('mouseout', hideTooltip);

    nodeSel.append('circle')
      .attr('r', d => rScale(d.h_index || 0))
      .attr('fill', d => DS.nodeColor(d))
      .attr('fill-opacity', d => d.status === 'current' ? 0.85 : 0.4)
      .attr('stroke', d => DS.nodeColor(d))
      .attr('stroke-width', 0.8);

    nodeSel.append('text')
      .attr('x', d => rScale(d.h_index || 0) + 4)
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '8.5px')
      .attr('font-family', 'DM Sans, sans-serif')
      .attr('fill', 'var(--text2)')
      .text(d => d.name.split(' ').pop());

    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(60).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(W2 / 2, H2 / 2))
      .force('collide', d3.forceCollide(d => rScale(d.h_index || 0) + 5))
      .on('tick', () => {
        linkSel
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
      });

    // Right panel: unit internal profile
    renderUnitInternalPanel(unit, unitScholars, internalEdges);
    syncSwitcherBtns();
  }

  // ── Select a unit (single-click highlight) ────────────────────────────────
  function selectUnit(unit, links, nodeSel, linkSel) {
    const id = unit.unit_id;
    const neighborIds = new Set([id]);
    links.forEach(e => {
      if (e.unit_a === id) neighborIds.add(e.unit_b);
      if (e.unit_b === id) neighborIds.add(e.unit_a);
    });

    nodeSel
      .select('path')
      .attr('fill', d => neighborIds.has(d.unit_id) ? getUnitColor(d) + 'EE' : getUnitColor(d) + '33')
      .attr('stroke-opacity', d => neighborIds.has(d.unit_id) ? 1 : 0.2);

    if (linkSel) {
      linkSel
        .attr('stroke-opacity', d =>
          (d.unit_a === id || d.target?.unit_id === id || d.unit_b === id) ? 0.7 : 0.05)
        .attr('stroke-width', d =>
          (d.unit_a === id || d.unit_b === id) ? 3 : 0.5);
    }

    _renderRightShowUnit(unit.unit_id);
  }

  function clearSelect() {
    g.selectAll('.unit-hex path')
      .attr('fill', function () {
        const p = d3.select(this.parentNode);
        const d = p.datum();
        return d ? getUnitColor(d) + 'CC' : '#99999999';
      })
      .attr('stroke-opacity', 1);
    g.selectAll('.unit-link')
      .attr('stroke-opacity', 0.25).attr('stroke-width', 1);
    if (currentMode === 'compare') _renderRightCompare('compare');
    else _renderRightDeptCenter(currentMode);
  }

  // ── Right panel: overview ─────────────────────────────────────────────────
  function _renderRightDeptCenter(type) {
    const card = document.getElementById('rv2-card');
    const ph = document.getElementById('rv2-placeholder');
    if (!card) return;
    ph.style.display = 'none';
    card.style.display = 'block';

    const isDept = type === 'dept';
    const units = UNITS.filter(u => u.unit_type === (isDept ? 'department' : 'center') && u.included)
      .sort((a, b) => (b.scholar_count || 0) - (a.scholar_count || 0));

    const totalScholars = units.reduce((s, u) => s + (u.scholar_count || 0), 0);
    const avgDensity = (units.reduce((s, u) => s + (u.density || 0), 0) / units.length).toFixed(3);
    const avgH = (units.reduce((s, u) => s + (u.avg_h_index || 0), 0) / units.length).toFixed(1);

    card.innerHTML = `
    <div style="padding:14px 14px 0">
      <div style="font-size:var(--fs-h3);font-weight:600;font-family:'Source Serif 4',serif;color:var(--text);margin-bottom:4px">
        ${isDept ? 'Departments' : 'Research Centers'}
      </div>
      <div style="font-size:var(--fs-xs);color:var(--text3);margin-bottom:12px">
        ${isDept ? 'Double-click a node to explore internal network' : 'Double-click a node to explore internal network'}
      </div>

      <div class="metric-grid" style="margin-bottom:14px">
        <div class="metric-box">
          <div class="metric-label">UNITS</div>
          <div class="metric-value">${units.length}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">SCHOLARS</div>
          <div class="metric-value">${totalScholars}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">AVG H-INDEX</div>
          <div class="metric-value">${avgH}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">AVG DENSITY</div>
          <div class="metric-value">${avgDensity}</div>
        </div>
      </div>

      ${!isDept ? `
      <div class="rp-section-label" style="margin-bottom:6px">SoS CLASSIFICATION</div>
      <div style="margin-bottom:14px">
        ${buildSosLegend()}
      </div>` : ''}

      <div class="rp-section-label" style="margin-bottom:6px">TOP UNITS BY SIZE</div>
      <div style="margin-bottom:12px">
        ${units.slice(0, 12).map(u => `
          <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--border2);cursor:pointer"
               ondblclick="View2.drillUnit('${u.unit_id}')">
            <div style="width:8px;height:8px;border-radius:1px;background:${getUnitColor(u)};flex-shrink:0"></div>
            <span style="font-size:var(--fs-xs);color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.unit_name}</span>
            <span style="font-size:var(--fs-xs);color:var(--text3)">${u.scholar_count}</span>
          </div>`).join('')}
      </div>
    </div>`;
  }

  function buildSosLegend() {
    const types = [
      { type: 'Superstar', color: '#C8102E', desc: 'High output, low collaboration' },
      { type: 'Team-of-Teams', color: '#A4804A', desc: 'Dense internal network' },
      { type: 'Greenfield', color: '#2E8B57', desc: 'Sparse but growing' },
      { type: 'Unclassified', color: '#9C9FB2', desc: 'Insufficient data' },
    ];
    return types.map(t => `
      <div style="display:flex;align-items:center;gap:6px;padding:2px 0">
        <div style="width:8px;height:8px;border-radius:50%;background:${t.color};flex-shrink:0"></div>
        <span style="font-size:var(--fs-xs);color:var(--text2)">${t.type}</span>
        <span style="font-size:var(--fs-xs);color:var(--text3)">${t.desc}</span>
      </div>`).join('');
  }

  // ── Right panel: single unit profile ─────────────────────────────────────
  function _renderRightShowUnit(unitId) {
    const card = document.getElementById('rv2-card');
    const ph = document.getElementById('rv2-placeholder');
    if (!card) return;
    ph.style.display = 'none';
    card.style.display = 'block';

    const col = getUnitColor(unit);
    const isDept = unit.unit_type === 'department';
    const td = TOPIC_DIVERSITY?.find(t => t.unit_id === unit.unit_id);

    // Cross-unit partners
    const partners = CROSS_UNIT_EDGES
      .filter(e => e.unit_a === unit.unit_id || e.unit_b === unit.unit_id)
      .map(e => ({
        id: e.unit_a === unit.unit_id ? e.unit_b : e.unit_a,
        name: e.unit_a === unit.unit_id ? e.name_b : e.name_a,
        weight: e.weight,
        type: e.cross_type,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);

    const topTopics = (unit.top_topics || []).slice(0, 4);
    const sosHtml = !isDept && unit.sos_type
      ? `<div style="font-size:var(--fs-xs);color:${sosBadgeColor(unit.sos_type)};font-weight:600;margin-bottom:8px">
           ⬡ ${unit.sos_type}${unit.sos_top_scholar ? ` · Led by ${unit.sos_top_scholar}` : ''}
         </div>` : '';

    card.innerHTML = `
    <div style="padding:14px 14px 0">
      <div style="border-left:3px solid ${col};padding-left:10px;margin-bottom:12px">
        <div style="font-size:var(--fs-h3);font-weight:600;font-family:'Source Serif 4',serif;color:var(--text)">${unit.unit_name}</div>
        <div style="font-size:var(--fs-xs);color:var(--text3);margin-top:2px">${isDept ? 'Department' : 'Research Center'} · ${unit.top_field || ''}</div>
      </div>

      ${sosHtml}

      <div class="metric-grid" style="margin-bottom:14px">
        <div class="metric-box"><div class="metric-label">SCHOLARS</div><div class="metric-value">${unit.scholar_count || '—'}</div></div>
        <div class="metric-box"><div class="metric-label">ACTIVE</div><div class="metric-value">${unit.active_count || '—'}</div></div>
        <div class="metric-box"><div class="metric-label">AVG H-INDEX</div><div class="metric-value">${(unit.avg_h_index || 0).toFixed(1)}</div></div>
        <div class="metric-box"><div class="metric-label">DENSITY</div><div class="metric-value">${(unit.density || 0).toFixed(3)}</div></div>
        ${!isDept ? `<div class="metric-box"><div class="metric-label">INT. EDGES</div><div class="metric-value">${unit.internal_edges || '—'}</div></div>` : ''}
        <div class="metric-box"><div class="metric-label">ICI TOTAL</div><div class="metric-value">${unit.ici_total ? (unit.ici_total / 1000).toFixed(1) + 'K' : '—'}</div></div>
      </div>

      ${td ? `
      <div class="rp-section-label" style="margin-bottom:6px">INTERDISCIPLINARITY</div>
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);margin-bottom:3px">
          <span style="color:var(--text2)">Score</span>
          <span style="color:var(--text);font-weight:600">${td.interdisciplinary_score.toFixed(2)}</span>
        </div>
        <div style="background:var(--border2);border-radius:3px;height:5px;margin-bottom:6px">
          <div style="width:${Math.min(100, td.interdisciplinary_score / 4 * 100)}%;height:100%;background:${col};border-radius:3px"></div>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text3)">${td.n_fields} fields · ${td.n_domains} domains</div>
      </div>` : ''}

      ${topTopics.length ? `
      <div class="rp-section-label" style="margin-bottom:6px">TOP TOPICS</div>
      <div style="margin-bottom:12px">
        ${topTopics.map(t => `<div style="font-size:var(--fs-xs);color:var(--text2);padding:2px 0;border-bottom:1px solid var(--border2)">${t}</div>`).join('')}
      </div>` : ''}

      <div class="rp-section-label" style="margin-bottom:6px">TOP COLLABORATING UNITS</div>
      <div style="margin-bottom:12px">
        ${partners.map(p => {
      const pu = DS.unitMap.get(p.id);
      const pc = pu ? getUnitColor(pu) : '#9C9FB2';
      return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--border2)">
            <div style="width:7px;height:7px;border-radius:1px;background:${pc};flex-shrink:0"></div>
            <span style="font-size:var(--fs-xs);color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>
            <span style="font-size:var(--fs-xs);color:var(--text3)">${p.weight}</span>
          </div>`;
    }).join('')}
      </div>

      <button class="rp-explore-btn" onclick="View2.drillUnit('${unit.unit_id}')">
        Explore Internal Network →
      </button>
    </div>`;
  }

  // ── Right panel: unit internal graph ─────────────────────────────────────
  function renderUnitInternalPanel(unit, scholars, edges) {
    const card = document.getElementById('rv2-card');
    const ph = document.getElementById('rv2-placeholder');
    if (!card) return;
    ph.style.display = 'none';
    card.style.display = 'block';

    const col = getUnitColor(unit);
    const active = scholars.filter(s => s.status === 'current').length;
    const bridges = scholars.filter(s => s.is_bridge).length;
    const isolated = scholars.filter(s => s.is_isolated).length;
    const avgH = scholars.length
      ? (scholars.reduce((s, x) => s + (x.h_index || 0), 0) / scholars.length).toFixed(1) : '—';
    const td = TOPIC_DIVERSITY?.find(t => t.unit_id === unit.unit_id);

    // h-index distribution buckets
    const hBuckets = [0, 5, 10, 20, 40, Infinity];
    const hLabels = ['0–4', '5–9', '10–19', '20–39', '40+'];
    const hCounts = hLabels.map((_, i) =>
      scholars.filter(s => (s.h_index || 0) >= hBuckets[i] && (s.h_index || 0) < hBuckets[i + 1]).length);
    const hMax = Math.max(...hCounts) || 1;

    card.innerHTML = `
    <div style="padding:14px 14px 0">
      <div style="border-left:3px solid ${col};padding-left:10px;margin-bottom:12px">
        <div style="font-size:var(--fs-h3);font-weight:600;font-family:'Source Serif 4',serif;color:var(--text)">${unit.unit_name}</div>
        <div style="font-size:var(--fs-xs);color:var(--text3);margin-top:2px">Internal Collaboration Network</div>
      </div>

      <div class="metric-grid" style="margin-bottom:14px">
        <div class="metric-box"><div class="metric-label">SCHOLARS</div><div class="metric-value">${scholars.length}</div></div>
        <div class="metric-box"><div class="metric-label">ACTIVE</div><div class="metric-value">${active}</div></div>
        <div class="metric-box"><div class="metric-label">INTERNAL EDGES</div><div class="metric-value">${edges.length}</div></div>
        <div class="metric-box"><div class="metric-label">AVG H-INDEX</div><div class="metric-value">${avgH}</div></div>
        <div class="metric-box"><div class="metric-label">DENSITY</div><div class="metric-value">${(unit.density || 0).toFixed(3)}</div></div>
        <div class="metric-box"><div class="metric-label">BRIDGE SCHOLARS</div><div class="metric-value">${bridges}</div></div>
      </div>

      <div class="rp-section-label" style="margin-bottom:6px">H-INDEX DISTRIBUTION</div>
      <div style="margin-bottom:14px">
        ${hLabels.map((label, i) => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="font-size:var(--fs-xs);color:var(--text3);width:28px;text-align:right">${label}</span>
            <div style="flex:1;background:var(--border2);border-radius:2px;height:8px">
              <div style="width:${hCounts[i] / hMax * 100}%;height:100%;background:${col};border-radius:2px;opacity:0.8"></div>
            </div>
            <span style="font-size:var(--fs-xs);color:var(--text3);width:20px">${hCounts[i]}</span>
          </div>`).join('')}
      </div>

      ${td ? `
      <div class="rp-section-label" style="margin-bottom:6px">INTERDISCIPLINARITY</div>
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);margin-bottom:3px">
          <span style="color:var(--text2)">Interdisciplinary Score</span>
          <span style="color:var(--text);font-weight:600">${td.interdisciplinary_score.toFixed(2)}</span>
        </div>
        <div style="background:var(--border2);border-radius:3px;height:5px;margin-bottom:4px">
          <div style="width:${Math.min(100, td.interdisciplinary_score / 4 * 100)}%;height:100%;background:${col};border-radius:3px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);margin-bottom:3px">
          <span style="color:var(--text2)">Avg Internal Diversity</span>
          <span style="color:var(--text);font-weight:600">${td.avg_diversity_internal.toFixed(2)}</span>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text3)">${td.n_fields} fields · ${td.n_domains} domains</div>
      </div>` : ''}

      ${isolated > 0 ? `
      <div style="font-size:var(--fs-xs);color:var(--text3);padding:6px 8px;background:var(--s2);border-radius:5px;margin-bottom:10px">
        ${isolated} scholar${isolated > 1 ? 's' : ''} with no internal connections
      </div>` : ''}

      <button class="rp-explore-btn" onclick="View2.backToOverview()">
        ← Back to Overview
      </button>
    </div>`;
  }

  // ── Right panel: compare mode ─────────────────────────────────────────────
  function _renderRightCompare() {
    const card = document.getElementById('rv2-card');
    const ph = document.getElementById('rv2-placeholder');
    if (!card) return;
    ph.style.display = 'none';
    card.style.display = 'block';

    const depts = UNITS.filter(u => u.unit_type === 'department' && u.included);
    const centers = UNITS.filter(u => u.unit_type === 'center' && u.included);

    const avgHDept = (depts.reduce((s, u) => s + (u.avg_h_index || 0), 0) / depts.length).toFixed(1);
    const avgHCtr = (centers.reduce((s, u) => s + (u.avg_h_index || 0), 0) / centers.length).toFixed(1);
    const avgDDept = (depts.reduce((s, u) => s + (u.density || 0), 0) / depts.length).toFixed(3);
    const avgDCtr = (centers.reduce((s, u) => s + (u.density || 0), 0) / centers.length).toFixed(3);

    const deptEdgeCnt = CROSS_UNIT_EDGES.filter(e => e.cross_type === 'cross_dept').length;
    const ctrEdgeCnt = CROSS_UNIT_EDGES.filter(e => e.cross_type === 'cross_center').length;

    card.innerHTML = `
    <div style="padding:14px 14px 0">
      <div style="font-size:var(--fs-h3);font-weight:600;font-family:'Source Serif 4',serif;color:var(--text);margin-bottom:12px">
        Compare Overview
      </div>

      <div style="font-size:var(--fs-xs);color:var(--text3);margin-bottom:10px">
        Double-click any node to explore its internal network. Click to highlight connections.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:14px">
        <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text3);padding-bottom:3px">DEPARTMENTS</div>
        <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text3);padding-bottom:3px">CENTERS</div>

        <div class="metric-box"><div class="metric-label">COUNT</div><div class="metric-value">${depts.length}</div></div>
        <div class="metric-box"><div class="metric-label">COUNT</div><div class="metric-value">${centers.length}</div></div>

        <div class="metric-box"><div class="metric-label">AVG H-INDEX</div><div class="metric-value">${avgHDept}</div></div>
        <div class="metric-box"><div class="metric-label">AVG H-INDEX</div><div class="metric-value">${avgHCtr}</div></div>

        <div class="metric-box"><div class="metric-label">AVG DENSITY</div><div class="metric-value">${avgDDept}</div></div>
        <div class="metric-box"><div class="metric-label">AVG DENSITY</div><div class="metric-value">${avgDCtr}</div></div>

        <div class="metric-box"><div class="metric-label">CROSS EDGES</div><div class="metric-value">${deptEdgeCnt}</div></div>
        <div class="metric-box"><div class="metric-label">CROSS EDGES</div><div class="metric-value">${ctrEdgeCnt}</div></div>
      </div>

      <div class="rp-section-label" style="margin-bottom:6px">LEGEND</div>
      <div style="font-size:var(--fs-xs);color:var(--text2);line-height:2;margin-bottom:10px">
        <div>⬡ Flat hexagon = Department</div>
        <div>⬢ Pointy hexagon = Research Center</div>
        <div style="margin-top:4px">Node size ∝ scholar count</div>
        <div>Edge weight ∝ collaboration intensity</div>
      </div>
    </div>`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getUnitColor(unit) {
    if (unit.unit_type === 'college') return DS.getColor(unit.unit_name);
    const parent = DS.unitMap.get(unit.parent_unit_id);
    if (parent) return DS.getColor(parent.unit_name);
    // Centers without parent: use top field approximation
    const fieldColorMap = {
      'Medicine': DS.getColor('Bouve College of Health Sciences'),
      'Engineering': DS.getColor('College of Engineering'),
      'Computer Science': DS.getColor('Khoury College of Computer Sciences'),
      'Biochemistry, Genetics and Molecular Biology': DS.getColor('College of Science'),
      'Sociology & Political Science': DS.getColor('College of Social Sciences & Humanities'),
      'Business, Management and Accounting': DS.getColor("D'Amore-McKim School of Business"),
    };
    return fieldColorMap[unit.top_field] || '#9C9FB2';
  }

  function sosBadgeColor(type) {
    return type === 'Superstar' ? '#C8102E'
      : type === 'Team-of-Teams' ? '#A4804A'
        : type === 'Greenfield' ? '#2E8B57'
          : '#8892AE';
  }

  function abbrev(name, r) {
    const max = Math.max(4, Math.floor(r / 3.2));
    const words = name.split(' ');
    if (words.length > 1 && name.length > max) {
      // Try acronym for long names
      if (max < 8) return words.map(w => w[0]).join('').toUpperCase().slice(0, 5);
    }
    return name.length > max ? name.slice(0, max - 1) + '…' : name;
  }

  function clearRightPanel() {
    const card = document.getElementById('rv2-card');
    const ph = document.getElementById('rv2-placeholder');
    if (!card) return;
    card.style.display = 'none';
    card.innerHTML = '';
    ph.style.display = '';
  }

  function syncSwitcherBtns() {
    document.querySelectorAll('#view-switcher-v2 .vs-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.subview === currentMode));
    // Show/hide back indicator
    const backBtn = document.getElementById('v2-back-indicator');
    if (backBtn) backBtn.style.display = viewMode === 'internal' ? 'flex' : 'none';
  }

  // Tooltip
  function showUnitTooltip(ev, d) {
    const sos = d.sos_type && d.sos_type !== 'Unclassified'
      ? ` · <span style="color:${sosBadgeColor(d.sos_type)}">${d.sos_type}</span>` : '';
    Tooltip.show(ev, `<b style="font-family:'Source Serif 4',serif">${d.unit_name}</b>
    <br><span style="color:var(--text3)">${d.unit_type}${sos}</span>
    <br><span style="color:var(--text2)">${d.scholar_count || '—'} scholars · h̄=${(d.avg_h_index || 0).toFixed(1)} · density=${(d.density || 0).toFixed(3)}</span>`);
  }
  function showScholarTooltip(ev, d) {
    Tooltip.show(ev, `<b style="font-family:'Source Serif 4',serif">${d.name}</b>
    <br><span style="color:var(--text3)">${d.main_affil_name || ''}</span>
    <br><span style="color:var(--text2)">h=${d.h_index || '—'} · ${d.degree || 0} collabs</span>`);
  }
  function moveTooltip(ev) { Tooltip.move(ev); }
  function hideTooltip() { Tooltip.hide(); }

  // ── Public API ────────────────────────────────────────────────────────────
  function drillUnit(unitId) {
    const unit = DS.unitMap.get(unitId);
    if (unit) drillIntoUnit(unit);
  }

  function backToOverview() { build(currentMode); }

  return { build, drillUnit, backToOverview };
})();

// Global mode switcher
function setUnitMode(mode) {
  document.querySelectorAll('#view-switcher-v2 .vs-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));
  View2.build(mode);
}
