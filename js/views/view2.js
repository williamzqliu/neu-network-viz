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

  // ── Overview: dept or center — both use hex grid layout ───────────────────
  function buildOverview(type) {
    const isDept = type === 'dept';
    const crossKey = isDept ? 'cross_dept' : 'cross_center';
    const relevantEdges = CROSS_UNIT_EDGES.filter(e => e.cross_type === crossKey);
    const maxW = d3.max(relevantEdges, e => e.weight) || 1;
    const wScale = d3.scaleSqrt().domain([1, maxW]).range([0.5, 5]);

    if (isDept) {
      // All included departments → hex grid layout
      const depts = UNITS.filter(u => u.unit_type === 'department' && u.included);
      buildDeptHexGrid(depts, relevantEdges, wScale);
      clearRightPanel();
      return;
    }

    // ── Center mode: hex grid layout ──────────────────────────────────────
    const centers = UNITS.filter(u => u.unit_type === 'center' && u.included);
    buildCenterHexGrid(centers, relevantEdges, wScale);
    clearRightPanel();
  }

  // ── Dept hex grid layout ──────────────────────────────────────────────────
  function buildDeptHexGrid(depts, relevantEdges, wScale) {
    const HEX_R     = 36;
    const COL_PITCH = HEX_R * 1.5;
    const ROW_PITCH = HEX_R * Math.sqrt(3);

    // Hardcoded tile map: [q, r, collegeAbbrev] — flat-top, even-q offset
    // Validated: contiguous per college, no shared edges between colleges
    const RAW_TILES = [
      // CAMD (6 tiles — 6 departments)
      [2,0,'CAMD'],[2,1,'CAMD'],[3,0,'CAMD'],[3,1,'CAMD'],[4,0,'CAMD'],[4,1,'CAMD'],
      // SCI (7 tiles — 7 departments)
      [6,0,'SCI'],[6,1,'SCI'],[7,0,'SCI'],[7,1,'SCI'],[8,0,'SCI'],[8,1,'SCI'],[9,0,'SCI'],
      // Bouve (8 tiles — 8 departments)
      [11,1,'Bouve'],[11,2,'Bouve'],[11,3,'Bouve'],
      [12,1,'Bouve'],[12,2,'Bouve'],[12,3,'Bouve'],
      [13,1,'Bouve'],[13,2,'Bouve'],
      // CSSH (10 tiles — 10 departments)
      [1,4,'CSSH'],[1,5,'CSSH'],[1,6,'CSSH'],
      [2,4,'CSSH'],[2,5,'CSSH'],[2,6,'CSSH'],
      [3,4,'CSSH'],[3,5,'CSSH'],
      [4,4,'CSSH'],[4,5,'CSSH'],
      // DMSB (7 tiles — 7 departments)
      [6,4,'DMSB'],[6,5,'DMSB'],
      [7,4,'DMSB'],[7,5,'DMSB'],
      [8,4,'DMSB'],[8,5,'DMSB'],
      [9,4,'DMSB'],
      // Eng (5 tiles — 5 departments)
      [6,8,'Eng'],[7,8,'Eng'],[8,8,'Eng'],
      [7,9,'Eng'],[8,9,'Eng'],
      // Single-tile colleges (isolated)
      [0,2,'CPS'],
      [10,-1,'Khoury'],
      [14,4,'Law'],
      [0,9,'Mills'],
      [14,9,'London'],
    ];

    // College unit_name → tile abbreviation
    const COLLEGE_TO_ABBREV = {
      'Bouve College of Health Sciences':        'Bouve',
      'College of Arts, Media and Design':       'CAMD',
      'College of Engineering':                  'Eng',
      'College of Professional Studies':         'CPS',
      'College of Science':                      'SCI',
      'College of Social Sciences & Humanities': 'CSSH',
      "D'Amore-McKim School of Business":        'DMSB',
      'Khoury College of Computer Sciences':     'Khoury',
      'School of Law':                           'Law',
      'Mills College at Northeastern':           'Mills',
      'Northeastern University London':          'London',
    };

    const collegeUnits    = UNITS.filter(u => u.unit_type === 'college' && u.included);
    const abbrevToCollege = new Map(
      collegeUnits
        .filter(c => COLLEGE_TO_ABBREV[c.unit_name])
        .map(c => [COLLEGE_TO_ABBREV[c.unit_name], c])
    );
    // college unit_id → abbrev (for dept lookup)
    const collegeIdToAbbrev = new Map(
      collegeUnits
        .filter(c => COLLEGE_TO_ABBREV[c.unit_name])
        .map(c => [c.unit_id, COLLEGE_TO_ABBREV[c.unit_name]])
    );

    // Group tiles by abbrev, sort within each group by (r, q)
    const tilesByAbbrev = new Map();
    RAW_TILES.forEach(([q, r, abbrev]) => {
      if (!tilesByAbbrev.has(abbrev)) tilesByAbbrev.set(abbrev, []);
      tilesByAbbrev.get(abbrev).push({ q, r });
    });
    tilesByAbbrev.forEach(tiles => tiles.sort((a, b) => a.r !== b.r ? a.r - b.r : a.q - b.q));

    // Group depts by college abbrev, sort alphabetically within each group
    const deptsByAbbrev = new Map();
    depts.forEach(d => {
      const abbrev = collegeIdToAbbrev.get(d.parent_unit_id);
      if (!abbrev) return;
      if (!deptsByAbbrev.has(abbrev)) deptsByAbbrev.set(abbrev, []);
      deptsByAbbrev.get(abbrev).push(d);
    });
    deptsByAbbrev.forEach(ds => ds.sort((a, b) => a.unit_name.localeCompare(b.unit_name)));

    // Assign each tile to its department node
    const ordered = [];
    RAW_TILES.forEach(([q, r, abbrev]) => {
      // Mills and London: the college unit itself acts as the department node
      if (abbrev === 'Mills' || abbrev === 'London') {
        const college = abbrevToCollege.get(abbrev);
        if (college) ordered.push({ ...college, _tileQ: q, _tileR: r, _abbrev: abbrev });
        return;
      }
      const tiles    = tilesByAbbrev.get(abbrev) || [];
      const tileIdx  = tiles.findIndex(t => t.q === q && t.r === r);
      const ds       = deptsByAbbrev.get(abbrev) || [];
      if (tileIdx < 0 || tileIdx >= ds.length) return;
      ordered.push({ ...ds[tileIdx], _tileQ: q, _tileR: r, _abbrev: abbrev });
    });

    // Compute pixel positions (flat-top hex, even-q offset)
    ordered.forEach(d => {
      d.x = d._tileQ * COL_PITCH;
      d.y = d._tileR * ROW_PITCH + (d._tileQ % 2 === 1 ? ROW_PITCH / 2 : 0);
    });

    // Center grid in viewport
    if (ordered.length === 0) return;
    const xs = ordered.map(d => d.x), ys = ordered.map(d => d.y);
    const gridCx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const gridCy = (Math.min(...ys) + Math.max(...ys)) / 2;
    ordered.forEach(d => { d.x += W / 2 - gridCx; d.y += H / 2 - gridCy; });

    const nodeMap = new Map(ordered.map(n => [n.unit_id, n]));
    const links = relevantEdges
      .filter(e => nodeMap.has(e.unit_a) && nodeMap.has(e.unit_b))
      .map(e => ({ ...e, source: e.unit_a, target: e.unit_b }));

    // Precompute group outlines; draw fill layer before nodes, stroke layer after
    const _deptGroups = d3.group(ordered, d => d._abbrev);
    const _deptOutlines = new Map();
    _deptGroups.forEach((groupNodes, abbrev) => {
      const college = abbrevToCollege.get(abbrev);
      const color = college ? DS.getColor(college.unit_name) : '#9C9FB2';
      const path  = _hexGroupOutlinePath(groupNodes, HEX_R, false, 6);
      if (path) _deptOutlines.set(abbrev, { path, color, groupNodes });
    });

    // Fill layer — behind links and nodes
    const hullFill = g.append('g').attr('pointer-events', 'none');
    _deptOutlines.forEach(({ path, color }) => {
      hullFill.append('path').attr('d', path)
        .attr('fill', color + '22').attr('stroke', 'none');
    });

    // Connection links
    const linkSel = g.append('g').attr('class', 'unit-links')
      .selectAll('line').data(links).join('line')
      .attr('class', 'unit-link')
      .attr('x1', d => nodeMap.get(d.unit_a).x).attr('y1', d => nodeMap.get(d.unit_a).y)
      .attr('x2', d => nodeMap.get(d.unit_b).x).attr('y2', d => nodeMap.get(d.unit_b).y)
      .attr('stroke', '#9BA8C2').attr('stroke-opacity', 0.55)
      .attr('stroke-width', d => wScale(d.weight));

    // Hex nodes
    const nodeSel = g.append('g').attr('class', 'unit-nodes')
      .selectAll('g').data(ordered, d => d.unit_id).join('g')
      .attr('class', 'unit-hex')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .on('click', (ev, d) => { ev.stopPropagation(); selectUnit(d, links, nodeSel, linkSel); })
      .on('dblclick', (ev, d) => { ev.stopPropagation(); drillIntoUnit(d); })
      .on('mouseover', (ev, d) => showUnitTooltip(ev, d))
      .on('mousemove', moveTooltip)
      .on('mouseout', hideTooltip);

    nodeSel.append('path')
      .attr('d', hexPath(HEX_R, false))   // flat-topped
      .attr('fill', d => getUnitColor(d) + 'CC')
      .attr('stroke', d => getUnitColor(d))
      .attr('stroke-width', 1.5).attr('cursor', 'pointer');

    // Two-line text labels
    nodeSel.each(function(d) {
      const lines = _hexLabel(d.unit_name);
      const lh = 9;
      const startY = -(lines.length - 1) * lh / 2;
      lines.forEach((line, i) => {
        d3.select(this).append('text')
          .attr('y', startY + i * lh)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('font-size', '7.5px').attr('font-family', 'DM Sans, sans-serif')
          .attr('fill', '#2A3050').attr('pointer-events', 'none')
          .text(line);
      });
    });

    // Stroke layer — on top of nodes
    const hullStroke = g.append('g').attr('class', 'college-hulls').attr('pointer-events', 'none');
    _deptOutlines.forEach(({ path, color, groupNodes }, abbrev) => {
      const college = abbrevToCollege.get(abbrev);
      hullStroke.append('path').attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', color + 'CC')
        .attr('stroke-width', 3)
        .attr('stroke-linejoin', 'round');
      const labelX = d3.mean(groupNodes, d => d.x);
      const labelY = Math.min(...groupNodes.map(d => d.y)) - HEX_R - 6;
      hullStroke.append('text')
        .attr('x', labelX).attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('font-size', '8px').attr('font-weight', '700')
        .attr('letter-spacing', '.07em')
        .attr('font-family', 'DM Sans, sans-serif')
        .attr('fill', color)
        .text(_abbrevCollege(college?.unit_name || ''));
    });
  }

  // ── Center hex grid layout ────────────────────────────────────────────────
  function buildCenterHexGrid(centers, relevantEdges, wScale) {
    const HEX_R     = 32;
    const COL_PITCH = HEX_R * Math.sqrt(3);  // pointy-top: horizontal pitch = r√3
    const ROW_PITCH = HEX_R * 1.5;           // pointy-top: vertical pitch = 1.5r

    // Hardcoded tile map: [q, r, sosAbbrev] — pointy-top odd-r offset grid positions
    // Superstar=top-center, Team-of-Teams=left-mid, Greenfield=right-mid, Unc=bottom
    const RAW_TILES = [
      // Superstar (4)
      [5,0,'SS'],[5,1,'SS'],[6,0,'SS'],[6,1,'SS'],
      // Team-of-Teams (10)
      [1,3,'ToT'],[1,4,'ToT'],[1,5,'ToT'],
      [2,3,'ToT'],[2,4,'ToT'],[2,5,'ToT'],
      [3,3,'ToT'],[3,4,'ToT'],
      [4,3,'ToT'],[4,4,'ToT'],
      // Greenfield (14)
      [8,2,'GF'],[8,3,'GF'],[8,4,'GF'],[8,5,'GF'],
      [9,2,'GF'],[9,3,'GF'],[9,4,'GF'],[9,5,'GF'],
      [10,2,'GF'],[10,3,'GF'],[10,4,'GF'],
      [11,2,'GF'],[11,3,'GF'],[11,4,'GF'],
      // Unclassified (36) — cols 0-11, rows 7-9
      ...[...Array(12)].flatMap((_, q) => [[q,7,'Unc'],[q,8,'Unc'],[q,9,'Unc']]),
    ];

    // sos_type string → tile abbreviation
    const SOS_TO_ABBREV = {
      'Superstar':     'SS',
      'Team-of-Teams': 'ToT',
      'Greenfield':    'GF',
      'Unclassified':  'Unc',
    };

    // Group tiles by abbrev, sorted (r, q)
    const tilesByAbbrev = new Map();
    RAW_TILES.forEach(([q, r, abbrev]) => {
      if (!tilesByAbbrev.has(abbrev)) tilesByAbbrev.set(abbrev, []);
      tilesByAbbrev.get(abbrev).push({ q, r });
    });
    tilesByAbbrev.forEach(tiles => tiles.sort((a, b) => a.r !== b.r ? a.r - b.r : a.q - b.q));

    // Group centers by sos abbrev, sorted alphabetically
    const centersByAbbrev = new Map();
    centers.forEach(c => {
      const abbrev = SOS_TO_ABBREV[c.sos_type] || 'Unc';
      if (!centersByAbbrev.has(abbrev)) centersByAbbrev.set(abbrev, []);
      centersByAbbrev.get(abbrev).push(c);
    });
    centersByAbbrev.forEach(cs => cs.sort((a, b) => a.unit_name.localeCompare(b.unit_name)));

    // Assign each tile to a center node
    const ordered = [];
    RAW_TILES.forEach(([q, r, abbrev]) => {
      const tiles   = tilesByAbbrev.get(abbrev) || [];
      const tileIdx = tiles.findIndex(t => t.q === q && t.r === r);
      const cs      = centersByAbbrev.get(abbrev) || [];
      if (tileIdx < 0 || tileIdx >= cs.length) return;
      ordered.push({ ...cs[tileIdx], _tileQ: q, _tileR: r, _abbrev: abbrev });
    });

    // Pixel positions — pointy-top odd-r offset: odd rows stagger right by COL_PITCH/2
    ordered.forEach(d => {
      d.x = d._tileQ * COL_PITCH + (d._tileR % 2 === 1 ? COL_PITCH / 2 : 0);
      d.y = d._tileR * ROW_PITCH;
    });

    if (ordered.length === 0) return;
    const xs = ordered.map(d => d.x), ys = ordered.map(d => d.y);
    const gridCx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const gridCy = (Math.min(...ys) + Math.max(...ys)) / 2;
    ordered.forEach(d => { d.x += W / 2 - gridCx; d.y += H / 2 - gridCy; });

    const nodeMap = new Map(ordered.map(n => [n.unit_id, n]));
    const links = relevantEdges
      .filter(e => nodeMap.has(e.unit_a) && nodeMap.has(e.unit_b))
      .map(e => ({ ...e, source: e.unit_a, target: e.unit_b }));

    // sosGroups collected here; outlines drawn after nodes
    const sosGroups = d3.group(ordered, d => d._abbrev);

    // Connection links
    const linkSel = g.append('g').attr('class', 'unit-links')
      .selectAll('line').data(links).join('line')
      .attr('class', 'unit-link')
      .attr('x1', d => nodeMap.get(d.unit_a).x).attr('y1', d => nodeMap.get(d.unit_a).y)
      .attr('x2', d => nodeMap.get(d.unit_b).x).attr('y2', d => nodeMap.get(d.unit_b).y)
      .attr('stroke', '#9BA8C2').attr('stroke-opacity', 0.55)
      .attr('stroke-width', d => wScale(d.weight));

    // Hex nodes (pointy-top)
    const nodeSel = g.append('g').attr('class', 'unit-nodes')
      .selectAll('g').data(ordered, d => d.unit_id).join('g')
      .attr('class', 'unit-hex')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .on('click', (ev, d) => { ev.stopPropagation(); selectUnit(d, links, nodeSel, linkSel); })
      .on('dblclick', (ev, d) => { ev.stopPropagation(); drillIntoUnit(d); })
      .on('mouseover', (ev, d) => showUnitTooltip(ev, d))
      .on('mousemove', moveTooltip)
      .on('mouseout', hideTooltip);

    nodeSel.append('path')
      .attr('d', hexPath(HEX_R, true))   // pointy-top
      .attr('fill', d => sosBadgeColor(d.sos_type) + 'CC')
      .attr('stroke', d => sosBadgeColor(d.sos_type))
      .attr('stroke-width', 1.5).attr('cursor', 'pointer');

    // Two-line text labels
    nodeSel.each(function(d) {
      const lines = _hexLabel(d.unit_name);
      const lh = 9;
      const startY = -(lines.length - 1) * lh / 2;
      lines.forEach((line, i) => {
        d3.select(this).append('text')
          .attr('y', startY + i * lh)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('font-size', '7.5px').attr('font-family', 'DM Sans, sans-serif')
          .attr('fill', '#2A3050').attr('pointer-events', 'none')
          .text(line);
      });
    });

    // Draw SoS group outlines after nodes so stroke appears on top
    const sosHullLayer = g.append('g').attr('class', 'sos-hulls').attr('pointer-events', 'none');
    sosGroups.forEach((groupNodes, abbrev) => {
      const sosType = Object.keys(SOS_TO_ABBREV).find(k => SOS_TO_ABBREV[k] === abbrev) || abbrev;
      const color   = sosBadgeColor(sosType);
      const outlinePath = _hexGroupOutlinePath(groupNodes, HEX_R, true, 5);
      if (!outlinePath) return;
      sosHullLayer.append('path')
        .attr('d', outlinePath)
        .attr('fill', 'none')
        .attr('stroke', color + 'BB')
        .attr('stroke-width', 1.5)
        .attr('stroke-linejoin', 'round');
      const labelX = d3.mean(groupNodes, d => d.x);
      const isUnc = abbrev === 'Unc';
      const labelY = isUnc
        ? Math.max(...groupNodes.map(d => d.y)) + HEX_R + 14
        : Math.min(...groupNodes.map(d => d.y)) - HEX_R - 18;
      sosHullLayer.append('text')
        .attr('x', labelX).attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('font-size', '8px').attr('font-weight', '700')
        .attr('letter-spacing', '.07em')
        .attr('font-family', 'DM Sans, sans-serif')
        .attr('fill', color)
        .text(sosType === 'Team-of-Teams' ? 'TEAM-OF-TEAMS'
          : sosType === 'Unclassified' ? 'UNCLASSIFIED'
          : sosType.toUpperCase());
    });
  }

  function _hexLabel(name) {
    const words = name
      .replace(/\b(of|and|&|the|for)\b/gi, '').replace(/\s+/g, ' ').trim()
      .split(' ').filter(Boolean);
    if (words.length === 0) return [name.slice(0, 12)];
    if (words.length === 1) return [words[0].slice(0, 12)];
    if (words.length === 2) {
      if (words.join(' ').length <= 12) return [words.join(' ')];
      return words.map(w => w.slice(0, 10));
    }
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' ').slice(0, 14), words.slice(mid).join(' ').slice(0, 14)];
  }

  // Traces the exact boundary of a group of hex tiles.
  // gap > 0 expands the outline outward by that many px using proper polygon offset.
  // pointy=false: flat-top even-q offset  (odd columns down)
  // pointy=true:  pointy-top odd-r offset (odd rows right)
  function _hexGroupOutlinePath(groupNodes, HEX_R, pointy, gap) {
    const ao = pointy ? 30 : 0;
    const tileSet = new Set(groupNodes.map(d => `${d._tileQ},${d._tileR}`));

    // Flat-top even-q: 6 neighbor offsets [even-q, odd-q] per edge i
    const NBR_FT = [
      [[1, 0],  [1, 1]],
      [[0, 1],  [0, 1]],
      [[-1, 0], [-1, 1]],
      [[-1,-1], [-1, 0]],
      [[0, -1], [0, -1]],
      [[1, -1], [1, 0]],
    ];
    // Pointy-top odd-r: 6 neighbor offsets [even-r, odd-r] per edge i
    // Edge 0→lower-right, 1→lower-left, 2→left, 3→upper-left, 4→upper-right, 5→right
    const NBR_PT = [
      [[ 0, +1], [+1, +1]],
      [[-1, +1], [ 0, +1]],
      [[-1,  0], [-1,  0]],
      [[-1, -1], [ 0, -1]],
      [[ 0, -1], [+1, -1]],
      [[+1,  0], [+1,  0]],
    ];
    const NBR = pointy ? NBR_PT : NBR_FT;

    const vKey = (x, y) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
    const nextMap  = new Map();
    const pointMap = new Map();
    groupNodes.forEach(d => {
      const q = d._tileQ, r = d._tileR;
      // pointy-top uses row parity; flat-top uses column parity
      const par = pointy ? ((r % 2) + 2) % 2 : ((q % 2) + 2) % 2;
      for (let i = 0; i < 6; i++) {
        const [dq, dr] = NBR[i][par];
        if (tileSet.has(`${q + dq},${r + dr}`)) continue;
        const a0 = (i * 60 + ao) * Math.PI / 180;
        const a1 = ((i + 1) * 60 + ao) * Math.PI / 180;
        const v0 = [d.x + HEX_R * Math.cos(a0), d.y + HEX_R * Math.sin(a0)];
        const v1 = [d.x + HEX_R * Math.cos(a1), d.y + HEX_R * Math.sin(a1)];
        const k0 = vKey(v0[0], v0[1]);
        const k1 = vKey(v1[0], v1[1]);
        nextMap.set(k0, k1);
        pointMap.set(k0, v0);
        pointMap.set(k1, v1);
      }
    });
    if (nextMap.size === 0) return null;
    const start = nextMap.keys().next().value;
    const pts = [pointMap.get(start)];
    let cur = nextMap.get(start);
    let guard = 0;
    while (cur !== start && guard++ < nextMap.size) {
      pts.push(pointMap.get(cur));
      cur = nextMap.get(cur);
    }
    if (pts.length < 3) return null;
    const finalPts = (gap > 0) ? _offsetPts(pts, gap) : pts;
    return 'M' + finalPts.map(p => p.join(',')).join('L') + 'Z';
  }

  // Offsets a closed polygon outward by d px using line-line intersection at each vertex.
  // Assumes clockwise winding (as produced by _hexGroupOutlinePath in SVG coords).
  function _offsetPts(pts, d) {
    const n = pts.length;
    return pts.map((b, i) => {
      const a  = pts[(i - 1 + n) % n];
      const c  = pts[(i + 1) % n];
      const ab = [b[0]-a[0], b[1]-a[1]]; const abL = Math.hypot(ab[0], ab[1]);
      const bc = [c[0]-b[0], c[1]-b[1]]; const bcL = Math.hypot(bc[0], bc[1]);
      if (abL < 1e-9 || bcL < 1e-9) return [...b];
      // Right-hand outward normals for CW polygon
      const n1 = [ ab[1]/abL, -ab[0]/abL];
      const n2 = [ bc[1]/bcL, -bc[0]/bcL];
      // Offset lines: (b + n1*d) along ab, and (b + n2*d) along bc
      const p1x = b[0]+n1[0]*d, p1y = b[1]+n1[1]*d;
      const p2x = b[0]+n2[0]*d, p2y = b[1]+n2[1]*d;
      const denom = ab[0]/abL * bc[1]/bcL - ab[1]/abL * bc[0]/bcL;
      if (Math.abs(denom) < 1e-9) return [p1x + (p2x-p1x)*0.5, p1y + (p2y-p1y)*0.5];
      const t = ((p2x-p1x) * bc[1]/bcL - (p2y-p1y) * bc[0]/bcL) / denom;
      return [p1x + t*ab[0]/abL, p1y + t*ab[1]/abL];
    });
  }

  function _abbrevCollege(name) {
    const map = {
      'Bouve College of Health Sciences':           'BOUVE',
      'College of Arts, Media and Design':          'CAMD',
      'College of Engineering':                     'ENG',
      'College of Professional Studies':            'CPS',
      'College of Science':                         'COS',
      'College of Social Sciences & Humanities':    'CSSH',
      "D'Amore-McKim School of Business":           'DMSB',
      'Khoury College of Computer Sciences':        'KHOURY',
      'School of Law':                              'LAW',
      'Mills College at Northeastern':              'MILLS',
      'Northeastern University London':             'NU LONDON',
    };
    return map[name] || name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 6);
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

    clearRightPanel();
  }

  // ── Drill into unit internal co-authorship graph ──────────────────────────
  function drillIntoUnit(unit) {
    currentUnitId = unit.unit_id;
    viewMode = 'internal';
    if (simulation) { simulation.stop(); simulation = null; }
    g.selectAll('*').remove();

    // Find all scholars in this unit — match primary AND secondary affiliations
    const unitScholars = SCHOLARS.filter(s => {
      if (s.main_affil_id === unit.unit_id) return true;
      const det = (typeof SCHOLAR_DETAIL !== 'undefined') && SCHOLAR_DETAIL[s.id];
      if (!det) return false;
      return unit.unit_type === 'center'
        ? det.ctr_names?.includes(unit.unit_name)
        : det.dept_names?.includes(unit.unit_name);
    });
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
      .attr('pointer-events', 'none')
      .text(d => d.name.split(' ').pop());

    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(60).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(W2 / 2, H2 / 2))
      .force('x', d3.forceX(W2 / 2).strength(0.07))
      .force('y', d3.forceY(H2 / 2).strength(0.07))
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
      .attr('fill', d => {
        const c = d.unit_type === 'center' ? sosBadgeColor(d.sos_type) : getUnitColor(d);
        return c + (neighborIds.has(d.unit_id) ? 'EE' : '33');
      })
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
        if (!d) return '#99999999';
        const c = d.unit_type === 'center' ? sosBadgeColor(d.sos_type) : getUnitColor(d);
        return c + 'CC';
      })
      .attr('stroke-opacity', 1);
    g.selectAll('.unit-link')
      .attr('stroke-opacity', 0.55).attr('stroke-width', 1);
    clearRightPanel();
  }

  // ── Right panel: single unit profile ─────────────────────────────────────
  function _renderRightShowUnit(unitId) {
    const card = document.getElementById('rv2-card');
    const ph = document.getElementById('rv2-placeholder');
    if (!card) return;

    const unit = DS.unitMap.get(unitId);
    if (!unit) return;

    ph.style.display = 'none';
    card.style.display = 'block';
    if (typeof showRightPanel === 'function') showRightPanel();

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
        <div class="metric-box"><div class="metric-label">ICI TOTAL</div><div class="metric-value">${unit.ici_total != null ? unit.ici_total.toLocaleString() : '—'}</div></div>
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
    if (typeof showRightPanel === 'function') showRightPanel();

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
    if (ph) ph.style.display = '';
    if (typeof hideRightPanel === 'function') hideRightPanel();
  }

  function syncSwitcherBtns() {
    document.querySelectorAll('.lv2-switcher .vs-btn').forEach(b =>
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

  function backToOverview() {
    const restoreId = currentUnitId;   // save before build() resets it to null
    build(currentMode);
    if (restoreId) {
      const unit = DS.unitMap.get(restoreId);
      if (!unit) return;
      const nodeSel = g.selectAll('.unit-hex');
      const linkSel = g.selectAll('.unit-link');
      selectUnit(unit, linkSel.data(), nodeSel, linkSel);
    }
  }

  return { build, drillUnit, backToOverview };
})();

// Global mode switcher
function setUnitMode(mode) {
  View2.build(mode);
}
