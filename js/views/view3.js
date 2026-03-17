/* views/view3.js
 * Scholar Profile - ego network SVG rendering.
 * Updated for v6: uses DS.state.egoHops, LeftV3, RightV3, Panels.
 */
/* view3.js — Individual View (Ego Network) */
'use strict';

const View3 = (() => {

  let svg = null, g = null, zoom = null;
  let simulation = null;
  let currentId = null;
  let currentHops = 1;

  function initSVG() {
    const el = document.getElementById('v3-svg');
    if (!el) return;
    svg = d3.select(el);
    svg.selectAll('*').remove();
    zoom = d3.zoom().scaleExtent([0.1, 12])
      .on('zoom', e => g && g.attr('transform', e.transform));
    svg.call(zoom);
    g = svg.append('g');
  }

  function build(centerId, hops) {
    if (hops == null) hops = currentHops;
    currentId = centerId;
    currentHops = hops;
    DS.state.egoHops = hops;

    const ph = document.getElementById('v3-placeholder');
    const svgEl = document.getElementById('v3-svg');
    if (ph) ph.style.display = 'none';
    if (svgEl) svgEl.style.display = 'block';

    if (!centerId) return;

    // Double rAF: first frame triggers layout, second frame has correct dimensions
    requestAnimationFrame(() => requestAnimationFrame(() => _doBuild(centerId)));
  }

  function _doBuild(centerId) {
    const svgEl = document.getElementById('v3-svg');
    if (!svgEl) return;

    if (!svg || svg.node() !== svgEl) initSVG();
    if (simulation) { simulation.stop(); simulation = null; }
    g.selectAll('*').remove();

    const center = DS.scholarMap.get(centerId);
    if (!center) return;

    // Use canvas-area as size reference — always has correct dimensions
    const canvasArea = document.getElementById('canvas-area');
    const W = (canvasArea ? canvasArea.clientWidth : svgEl.clientWidth) || 800;
    const H = (canvasArea ? canvasArea.clientHeight : svgEl.clientHeight) || 600;

    const nbrs1 = DS.adjacency.get(centerId) || [];
    const dir1 = new Set(nbrs1.map(x => x.id));
    const egoIds = new Set([centerId, ...dir1]);

    if (currentHops === 2) {
      nbrs1.forEach(x => {
        (DS.adjacency.get(x.id) || []).forEach(y => egoIds.add(y.id));
      });
    }

    const egoNodes = [...egoIds]
      .map(id => DS.scholarMap.get(id))
      .filter(Boolean)
      .map(s => ({
        ...s,
        hop: s.id === centerId ? 0 : dir1.has(s.id) ? 1 : 2,
        x: s.id === centerId ? W / 2 : W / 2 + (Math.random() - 0.5) * 320,
        y: s.id === centerId ? H / 2 : H / 2 + (Math.random() - 0.5) * 320,
      }));

    const egoEdges = [];
    egoIds.forEach(sid => {
      (DS.adjacency.get(sid) || []).forEach(nb => {
        if (egoIds.has(nb.id) && sid < nb.id) {
          egoEdges.push({ source: sid, target: nb.id, weight: nb.weight || 1 });
        }
      });
    });

    const maxH = d3.max(egoNodes, d => d.h_index || 1) || 1;
    const maxW = d3.max(egoEdges, e => e.weight) || 1;
    const rScale = d3.scaleSqrt().domain([0, maxH]).range([4, 20]).clamp(true);
    const wScale = d3.scaleSqrt().domain([1, maxW]).range([0.5, 4]).clamp(true);

    // Hop rings
    const ringR = currentHops === 1 ? [170] : [140, 270];
    ringR.forEach((r, i) => {
      g.append('circle').attr('cx', W / 2).attr('cy', H / 2).attr('r', r)
        .attr('fill', 'none').attr('stroke', DS.getColor(center.college))
        .attr('stroke-width', 0.5).attr('stroke-dasharray', '4 3').attr('stroke-opacity', 0.12);
      g.append('text').attr('x', W / 2 + r + 6).attr('y', H / 2)
        .attr('font-size', '9px').attr('fill', 'var(--text3)')
        .attr('font-family', 'DM Sans, sans-serif').attr('dominant-baseline', 'middle')
        .text(`${i + 1}-hop`);
    });

    // Links
    const linkSel = g.append('g').selectAll('line').data(egoEdges).join('line')
      .attr('stroke', d => {
        const src = egoNodes.find(n => n.id === d.source);
        return src?.hop === 0 ? DS.getColor(center.college) : '#9BA8C2';
      })
      .attr('stroke-width', d => wScale(d.weight))
      .attr('stroke-opacity', d => {
        const src = egoNodes.find(n => n.id === d.source);
        return src?.hop === 0 ? 0.35 : 0.18;
      });

    // Nodes
    const nodeSel = g.append('g').selectAll('g').data(egoNodes, d => d.id).join('g')
      .attr('class', 'ego-node').style('cursor', 'pointer')
      .on('click', (ev, d) => {
        ev.stopPropagation();
        if (d.id !== centerId) {
          build(d.id, currentHops);
          LeftV3.showEgoProfile(d.id);
        }
      })
      .on('mouseover', (ev, d) => showTooltip(ev, d))
      .on('mousemove', ev => moveTooltip(ev))
      .on('mouseout', () => hideTooltip());

    nodeSel.append('circle')
      .attr('r', d => rScale(d.h_index || 0))
      .attr('fill', d => DS.nodeColor(d))
      .attr('fill-opacity', d => d.id === centerId ? 1.0 : d.hop === 1 ? 0.82 : 0.45)
      .attr('stroke', d => DS.nodeColor(d))
      .attr('stroke-width', d => d.id === centerId ? 2.5 : 0.8)
      .attr('stroke-opacity', 0.8);

    nodeSel.filter(d => d.id === centerId).append('circle')
      .attr('r', d => rScale(d.h_index || 0) + 5).attr('fill', 'none')
      .attr('stroke', d => DS.getColor(d.college))
      .attr('stroke-width', 1.5).attr('stroke-opacity', 0.5);

    nodeSel.filter(d => d.is_bridge).append('circle')
      .attr('r', d => rScale(d.h_index || 0) + 3.5).attr('fill', 'none')
      .attr('stroke', 'var(--gold)').attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5).attr('stroke-dasharray', '3 2');

    nodeSel.append('text')
      .attr('x', d => rScale(d.h_index || 0) + 5)
      .attr('dominant-baseline', 'middle')
      .attr('font-size', d => d.id === centerId ? '11px' : '9px')
      .attr('font-weight', d => d.id === centerId ? '600' : '400')
      .attr('font-family', 'DM Sans, sans-serif')
      .attr('fill', d => d.id === centerId ? 'var(--text)' : 'var(--text2)')
      .text(d => d.id === centerId ? d.name : d.name.split(' ').pop());

    simulation = d3.forceSimulation(egoNodes)
      .force('link', d3.forceLink(egoEdges).id(d => d.id)
        .distance(d => {
          const src = egoNodes.find(n => n.id === (d.source.id || d.source));
          return src?.hop === 0 ? 80 : 130;
        }).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(d => rScale(d.h_index || 0) + 8))
      .on('tick', () => {
        const cn = egoNodes.find(n => n.id === centerId);
        if (cn) { cn.fx = W / 2; cn.fy = H / 2; }
        linkSel
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
      });

    const cn = egoNodes.find(n => n.id === centerId);
    if (cn) { cn.fx = W / 2; cn.fy = H / 2; }

    DS.state.selectedId = centerId;
    LeftV3.showEgoProfile(centerId);
    RightV3.showStats && RightV3.showStats(centerId);
    const v3sw = document.getElementById('view-switcher-v3');
    if (v3sw) v3sw.querySelectorAll('.vs-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.subview === 'ego'));
  }

  function setHops(hops) {
    if (!currentId) return;
    build(currentId, hops);
  }

  function reset() {
    currentId = null;
    const ph = document.getElementById('v3-placeholder');
    const svgEl = document.getElementById('v3-svg');
    if (ph) ph.style.display = 'flex';
    if (svgEl) svgEl.style.display = 'none';
    if (simulation) { simulation.stop(); simulation = null; }
  }

  function showTooltip(ev, d) {
    const bridge = d.is_bridge ? ` · <span style="color:var(--gold)">Top ${d.top_pct}% bridge</span>` : '';
    Tooltip.show(ev, `<b style="font-family:'Source Serif 4',serif">${d.name}</b>
    <br><span style="color:var(--text3)">${d.main_affil_name || ''}</span>
    <br><span style="color:var(--text2)">h=${d.h_index || '—'} · ${d.degree || 0} collabs${bridge}</span>`);
  }
  function moveTooltip(ev) { Tooltip.move(ev); }
  function hideTooltip() { Tooltip.hide(); }

  return { build, setHops, reset };
})();
