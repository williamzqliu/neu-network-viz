/* views/view1.js
 * University Network - canvas rendering with D3 force simulation.
 * Handles node/edge rendering, interaction (click, hover, zoom),
 * topic/legend highlight, isolated scholar zone.
 *
 * Depends on: utils.js, datastore.js, D3
 * Called by: main.js (init, build), panels.js (via Panels.update)
 * Calls: Panels.showScholarCard(), Search.showHint(), RightV1 (via Panels)
 * Module name for Logger: 'View1'
 *
 * Public methods:
 *   View1.init()
 *   View1.build()
 *   View1.render()
 *   View1.selectById(id)
 *   View1.focusNode(id)         -- new: pan + highlight without clearing state
 *   View1.highlightTopic(ids, topicName)
 *   View1.clearTopicHighlight()
 *   View1.toggleLegendFilter(college)
 *   View1.renderLegend()
 *   View1.zoomIn() / zoomOut() / zoomReset()
 *   View1.toggleLabels() / toggleIsolated() / toggleFreeze()
 *   View1.setForceCharge(v) / setForceLink(v)
 *   View1.setColorMode(mode)
 */

'use strict';

const View1 = (() => {
  let canvas, ctx, W, H;
  let simulation, nodes, links;
  let transform = d3.zoomIdentity;
  let hoveredId = null;
  let hoveredEdge = null;
  let zoomBehavior;
  let hlAlpha = 0;
  let hlAlphaTarget = 0;
  let hasInitialZoomed = false;
  let defaultTransform = null;   // saved after first layout, used by zoomReset

  const rScale = d3.scaleSqrt().range([3, 14]);
  const wScale = d3.scaleSqrt().range([0.3, 3.5]);

  /* ── Tooltip element (resolved lazily) ──────────────────────────────── */
  let _tt = null;
  function tt() { return _tt || (_tt = document.getElementById('tooltip')); }

  /* ── init ────────────────────────────────────────────────────────────── */
  function init() {
    Logger.info('View1', 'init');
    canvas = getEl('v1-canvas', 'View1');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    zoomBehavior = d3.zoom()
      .scaleExtent([0.02, 14])
      .on('zoom', e => { transform = e.transform; render(); });

    const sel = d3.select(canvas).call(zoomBehavior);

    // Mouse events
    sel.on('click', onClick);
    sel.on('mousemove', onMouseMove);
    sel.on('mouseleave', () => {
      hoveredId = null;
      hoveredEdge = null;
      _hideTooltip();
      if (!DS.state.selectedId && !DS.state.topicHighlight) animateHL(0);
      render();
    });

    // Touch events
    canvas.addEventListener('touchend', e => {
      if (e.touches.length > 0) return; // multi-touch, skip
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      _handleTap(mx, my);
    }, { passive: false });

    requestAnimationFrame(() => {
      resize();
      window.addEventListener('resize', resize);
    });
  }

  /* ── resize ──────────────────────────────────────────────────────────── */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || canvas.parentElement.clientWidth;
    const cssH = canvas.offsetHeight || canvas.parentElement.clientHeight;
    W = cssW;
    H = cssH;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (simulation) simulation.force('center', d3.forceCenter(W / 2, H / 2));
    render();
  }

  /* ── build ───────────────────────────────────────────────────────────── */
  function build() {
    Logger.info('View1', 'build');
    if (simulation) simulation.stop();

    // If W is not yet set, defer build to next frame when resize() has run
    if (!W || !H) {
      requestAnimationFrame(() => build());
      return;
    }

    const state = DS.state;
    const allNodes = DS.getFilteredScholars();
    const nodeSet = new Set(allNodes.map(s => s.id));
    const allEdges = DS.getFilteredEdges(nodeSet);

    const activeIds = new Set();
    allEdges.forEach(e => { activeIds.add(e.source); activeIds.add(e.target); });
    state.visibleIds = nodeSet;

    const connNodes = allNodes.filter(s => activeIds.has(s.id));
    const isoNodes = allNodes.filter(s => !activeIds.has(s.id));

    // Update overview stats bar
    const ovScholars = document.getElementById('ov-scholars');
    const ovCollabs = document.getElementById('ov-collabs');
    const ovIsolated = document.getElementById('ov-isolated');
    if (ovScholars) ovScholars.textContent = allNodes.length.toLocaleString();
    if (ovCollabs) ovCollabs.textContent = allEdges.length.toLocaleString();
    if (ovIsolated) ovIsolated.textContent = isoNodes.length.toLocaleString();

    _renderIsolatedZone(isoNodes);

    // Build simulation nodes (preserve positions)
    const prevMap = nodes ? new Map(nodes.map(n => [n.id, n])) : new Map();
    nodes = connNodes.map(s => {
      const prev = prevMap.get(s.id);
      return {
        ...s,
        x: prev?.x ?? W / 2 + (Math.random() - 0.5) * 240,
        y: prev?.y ?? H / 2 + (Math.random() - 0.5) * 240,
        fx: prev?.fx ?? null,
        fy: prev?.fy ?? null,
      };
    });

    links = allEdges.map(e => ({ ...e }));

    const maxH = d3.max(nodes, d => d.h_index || 1) || 1;
    const maxW = d3.max(links, d => d.weight) || 1;
    rScale.domain([0, maxH]);
    wScale.domain([1, maxW]);

    // Read force values from sliders (using new v6 IDs)
    const charge = +(document.getElementById('lv1-charge')?.value || -120);
    const linkDist = +(document.getElementById('lv1-linkdist')?.value || 200);

    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id)
        .distance(d => linkDist / Math.sqrt(d.weight || 1))
        .strength(0.45))
      .force('charge', d3.forceManyBody().strength(charge))
      .force('x', d3.forceX(W / 2).strength(0.04))   // gentle pull toward center X
      .force('y', d3.forceY(H / 2).strength(0.04))   // gentle pull toward center Y
      //.force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(d => rScale(d.h_index || 0) + 6))
      .alphaDecay(0.025)
      .on('tick', render)
      .on('end', () => {                    // fire once when simulation cools down
        //hasInitialZoomed = false;           // reset so initialZoom can run
        //initialZoom();                      // auto-fit after layout stabilizes
      });

    if (DS.state.frozen) simulation.stop();

    renderLegend();
  }

  function _showNoResultToast() {
    let toast = document.getElementById('v1-no-result-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'v1-no-result-toast';
      toast.style.cssText = `
      position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
      background:rgba(255,255,255,0.75); border:1px solid rgba(0,0,0,0.08);
      padding:10px 20px; border-radius:8px;
      font-size:var(--fs-h1); color:var(--text3);
      pointer-events:none; z-index:500;
      opacity:0; transition:opacity 0.3s ease;
    `;
      toast.textContent = 'No scholars match all selected subfields.';
      document.body.appendChild(toast);
    }
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 2000);
  }

  /* ── render ──────────────────────────────────────────────────────────── */
  function render() {
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    const state = DS.state;
    const selId = state.selectedId;
    const hovId = hoveredId;
    const focusId = selId || hovId;
    const topicHL = state.topicHighlight;
    const topicConnected = state.topicConnected;

    let nbrs = null;
    if (focusId) {
      nbrs = new Set((DS.adjacency.get(focusId) || []).map(x => x.id));
      nbrs.add(focusId);
    }

    const hasHL = !!(focusId || topicHL);
    const dimmedAlpha = 0.06 + (1 - hlAlpha) * (1 - 0.06);

    // Hull
    if (state.showHull && nodes) {
      const byCollege = d3.group(nodes, d => d.college);
      byCollege.forEach((ns, college) => {
        if (ns.length < 3) return;
        try {
          const hull = d3.polygonHull(ns.map(n => [n.x, n.y]));
          if (!hull) return;
          const col = DS.getColor(college);
          ctx.beginPath();
          hull.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
          ctx.closePath();
          ctx.fillStyle = col + '10';
          ctx.strokeStyle = col + '50';
          ctx.lineWidth = 1.2 / transform.k;
          ctx.fill(); ctx.stroke();
        } catch (_) { }
      });
    }

    // Links
    if (links) {
      const isTopicMode = !!(topicHL || topicConnected);
      links.forEach(link => {
        const s = link.source, t = link.target;
        if (!s?.x || !t?.x) return;

        if (isTopicMode) {
          if (s.id !== selId && t.id !== selId) return;
        }

        const isFocus = focusId && (s.id === focusId || t.id === focusId);
        const isTopHL = topicHL && (topicHL.has(s.id) || topicHL.has(t.id));
        const isFaded = hasHL && !isFocus && !isTopHL;
        const isHovEdge = hoveredEdge === link;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = isHovEdge ? '#A4804A' : '#7A8BAD';
        ctx.lineWidth = (isHovEdge ? 2 : wScale(link.weight || 1) * 0.65) / transform.k;
        ctx.globalAlpha = isFaded
          ? dimmedAlpha * 0.4
          : (isHovEdge ? 0.9 : isFocus ? (isTopicMode ? 0.45 : 0.85) : isTopHL ? 0.55 : 0.2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    // Nodes
    if (nodes) {
      nodes.forEach(node => {
        const r = rScale(node.h_index || 0);
        const col = DS.nodeColor(node);
        const isSel = node.id === selId;
        const isHov = node.id === hovId;
        const isNbr = nbrs && nbrs.has(node.id);
        const isTopMatch = topicHL && topicHL.has(node.id);
        const isTopConnected = topicConnected && topicConnected.has(node.id);
        const isTopicMode = !!(topicHL || topicConnected);
        const isFaded = hasHL && !isSel && (
          isTopicMode
            ? (!isTopMatch && !isTopConnected)
            : !isNbr
        ); const isActive = node.status === 'current';

        if (isSel || isHov) { ctx.shadowColor = col; ctx.shadowBlur = 10 / transform.k; }

ctx.beginPath();
ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
ctx.globalAlpha = isFaded ? dimmedAlpha : isTopConnected ? 0.35 : (isActive ? 0.98 : 0.55);
if (node.status === 'retired' || node.status === 'former') {
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1 / transform.k;
  ctx.stroke();
} else {
  ctx.fillStyle = col;
  ctx.fill();
}

        ctx.strokeStyle = col;
        ctx.lineWidth = isSel ? 2 / transform.k : 0.8 / transform.k;
        ctx.globalAlpha = isFaded ? dimmedAlpha : isTopConnected ? 0.3 : (isActive ? 0.85 : 0.5);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Multi-affil ring
        if (node.multi_affil && !isFaded) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3 / transform.k, 0, Math.PI * 2);
          ctx.strokeStyle = col;
          ctx.lineWidth = 0.7 / transform.k;
          ctx.globalAlpha = isSel ? 0.5 : 0.22;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Bridge halo
        if (node.is_bridge && !isFaded) {
          const topPct = node.top_pct || 25;
          const haloR = topPct <= 1 ? 8 : topPct <= 3 ? 6 : topPct <= 5 ? 5 : 4;
          const haloA = topPct <= 1 ? 0.7 : topPct <= 3 ? 0.55 : topPct <= 5 ? 0.42 : 0.28;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + haloR / transform.k, 0, Math.PI * 2);
          ctx.strokeStyle = '#A4804A';
          ctx.lineWidth = (topPct <= 3 ? 1.2 : 0.8) / transform.k;
          ctx.globalAlpha = haloA;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Topic match ring（未连接符合条件）
        if (isTopMatch && !isSel) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 4 / transform.k, 0, Math.PI * 2);
          ctx.strokeStyle = '#A4804A';
          ctx.lineWidth = 1.2 / transform.k;
          ctx.globalAlpha = 0.7;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // 学者自身标注（topic 模式激活时加方形外框）
        if (isSel && (topicHL || topicConnected)) {
          ctx.beginPath();
          ctx.rect(node.x - r - 4 / transform.k, node.y - r - 4 / transform.k,
            (r + 4 / transform.k) * 2, (r + 4 / transform.k) * 2);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5 / transform.k;
          ctx.globalAlpha = 0.8;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Label
        if (DS.state.showLabels && transform.k > 0.7 && !isFaded) {
          ctx.fillStyle = '#4f5673';
          ctx.font = `${12 / transform.k}px 'DM Sans',sans-serif`;
          ctx.globalAlpha = 0.75;
          ctx.fillText(node.name.split(' ').pop(), node.x + r + 3 / transform.k, node.y);
          ctx.globalAlpha = 1;
        }
      });
    }

    ctx.restore();
  }

  /* ── Hit tests ───────────────────────────────────────────────────────── */
  function _hitTest(mx, my) {
    if (!nodes) return null;
    const [wx, wy] = transform.invert([mx, my]);
    let best = null, bestD = Infinity;
    nodes.forEach(n => {
      const r = rScale(n.h_index || 0) + 4;
      const dx = n.x - wx, dy = n.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 < bestD) { bestD = d2; best = n; }
    });
    return best;
  }

  function _edgeHitTest(mx, my) {
    if (!links) return null;
    const [wx, wy] = transform.invert([mx, my]);
    const threshold = 4 / transform.k;
    let best = null, bestD = Infinity;
    links.forEach(link => {
      const s = link.source, t = link.target;
      if (!s?.x || !t?.x) return;
      const dx = t.x - s.x, dy = t.y - s.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) return;
      const tp = Math.max(0, Math.min(1, ((wx - s.x) * dx + (wy - s.y) * dy) / len2));
      const px = s.x + tp * dx - wx;
      const py = s.y + tp * dy - wy;
      const d = Math.sqrt(px * px + py * py);
      if (d < threshold && d < bestD) { bestD = d; best = link; }
    });
    return best;
  }

  /* ── Click / tap handler (shared logic) ─────────────────────────────── */
  function _handleTap(mx, my) {
    const n = _hitTest(mx, my);
    if (n) {
      DS.state.selectedId = n.id;
      DS.state.topicHighlight = null;
      DS.state.topicConnected = null;
      hoveredEdge = null;
      _hideBadge();
      animateHL(1);
      render();
      Panels.showScholarCard(n.id);
    } else {
      if (DS.state.selectedId) {
        const selId = DS.state.selectedId;
        const rawE = _edgeHitTest(mx, my);
        if (rawE && (rawE.source.id === selId || rawE.target.id === selId)) return;
        DS.state.selectedId = null;
        DS.state.topicHighlight = null;
        DS.state.topicConnected = null;
        hoveredEdge = null;
        _hideBadge();
        animateHL(0);
        render();
        RightV1.reset && RightV1.reset(DS.state.subview);
        clearSearch();
        return;
      }
      const e = DS.state.showEdgeClick ? _edgeHitTest(mx, my) : null;
      if (e) {
        DS.state.selectedId = null;
        DS.state.topicHighlight = new Set([e.source.id, e.target.id]);
        DS.state.topicConnected = null;
        const w = e.weight || 1;
        _showBadge(
          `${e.source.name} · ${e.target.name} · ${w} shared work${w > 1 ? 's' : ''}`,
          'var(--gold)'
        );
        animateHL(1);
        render();
        RightV1.reset && RightV1.reset(DS.state.subview);
      } else {
        DS.state.selectedId = null;
        DS.state.topicHighlight = null;
        DS.state.topicConnected = null;
        hoveredEdge = null;
        _hideBadge();
        animateHL(0);
        render();
        RightV1.reset && RightV1.reset(DS.state.subview);
        clearSearch();
      }
    }
  }

  function onClick(event) {
    const [mx, my] = d3.pointer(event);
    _handleTap(mx, my);
  }

  function onMouseMove(event) {
    if (InputMode.isTouch()) return;
    const [mx, my] = d3.pointer(event);
    const n = _hitTest(mx, my);
    if (n) {
      hoveredId = n.id;
      hoveredEdge = null;
      canvas.style.cursor = 'pointer';
      _showTooltip(event, n);
      if (!DS.state.selectedId && !DS.state.topicHighlight) animateHL(1);
    } else {
      const rawE = _edgeHitTest(mx, my);
      const selId = DS.state.selectedId;
      const e = rawE && selId
        ? ((rawE.source.id === selId || rawE.target.id === selId) ? rawE : null)
        : (DS.state.showEdgeClick ? rawE : null);
      hoveredEdge = e || null;
      hoveredId = null;
      canvas.style.cursor = e ? 'pointer' : 'default';
      if (e) {
        _showEdgeTooltip(event, e);
        if (!DS.state.selectedId && !DS.state.topicHighlight) animateHL(1);
      } else {
        _hideTooltip();
        if (!DS.state.selectedId && !DS.state.topicHighlight) animateHL(0);
      }
    }
    render();
  }

  function onClick(event) {
    const [mx, my] = d3.pointer(event);
    _handleTap(mx, my);
  }

  /* ── Public selection / highlight ────────────────────────────────────── */
  function selectById(id) {
    if (!DS.state.visibleIds.has(id)) {
      Search.showHint(`"${DS.scholarMap.get(id)?.name}" is currently hidden by active filters.`);
      return;
    }
    DS.state.selectedId = id;
    DS.state.topicHighlight = null;
    animateHL(1);
    render();
    Panels.showScholarCard(id);
    panTo(id);
  }

  // New in v6: pan to scholar + show highlight ring, without clearing state
  // Called by goToCollabMap() when returning from Scholar Profile
  function focusNode(id) {
    Logger.info('View1', `focusNode id=${id}`);
    DS.state.selectedId = id;
    animateHL(1);
    render();
    panTo(id);
  }

  function panTo(id) {
    const n = nodes && nodes.find(x => x.id === id);
    if (!n?.x) return;
    const scale = Math.max(transform.k, 1.5);
    const t = d3.zoomIdentity
      .translate(W / 2 - n.x * scale, H / 2 - n.y * scale)
      .scale(scale);
    d3.select(canvas).transition().duration(550).call(zoomBehavior.transform, t);
  }

  function fitToNodes(ids) {
    const targets = (nodes || []).filter(n => ids.includes(n.id) && n.x != null);
    if (!targets.length) return;
    const xs = targets.map(n => n.x);
    const ys = targets.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 80;
    const scX = (W - pad * 2) / (maxX - minX || 1);
    const scY = (H - pad * 2) / (maxY - minY || 1);
    const sc = Math.min(scX, scY, 1.8);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const t = d3.zoomIdentity.translate(W / 2 - cx * sc, H / 2 - cy * sc).scale(sc);
    d3.select(canvas).transition().duration(800).call(zoomBehavior.transform, t);
  }

  function highlightTopic(ids, connectedIds) {
    DS.state.topicHighlight = ids ? new Set(ids) : null;
    DS.state.topicConnected = connectedIds ? new Set(connectedIds) : null;
    render();

    if (ids === null) {
      _hideBadge();
      if (!DS.state.selectedId) {
        animateHL(0);
      } else {
        animateHL(1);
        render();
      }
      return;
    }

    // 有 subfield 选中
    animateHL(1);

    if (ids.length === 0 && (!connectedIds || connectedIds.length === 0)) {
      // 完全没有结果
      _showNoResultToast();
      const selId = DS.state.selectedId;
      if (selId) {
        const egoIds = [selId, ...(DS.adjacency.get(selId) || []).map(x => x.id)];
        fitToNodes(egoIds);
      }
      _showBadge('0 unconnected · 0 connected', 'var(--gold)');
    } else if (ids.length === 0) {
      // 只有 connected，没有 unconnected，camera 回到主学者
      const selId = DS.state.selectedId;
      if (selId) {
        const egoIds = [selId, ...(DS.adjacency.get(selId) || []).map(x => x.id)];
        fitToNodes(egoIds);
      }
      _showBadge(`0 unconnected · ${connectedIds.length} connected`, 'var(--gold)');
    } else {
      // 有 unconnected，camera 飞到他们
      _showBadge(`${ids.length} unconnected · ${connectedIds ? connectedIds.length : 0} connected`, 'var(--gold)');
      fitToNodes(ids);
    }
  }

  function clearTopicHighlight() {
    DS.state.topicHighlight = null;
    DS.state.legendFilter = new Set();
    DS.state.selectedId = null;
    animateHL(0);
    render();
    renderLegend();
    _hideBadge();
    const inputEl = document.getElementById('hd-search');
    const clearBtn = document.getElementById('hd-search-clear');
    if (inputEl) inputEl.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
  }

  /* ── Legend ──────────────────────────────────────────────────────────── */
  function renderLegend() {
    const grid = document.getElementById('legend-grid');
    if (!grid) return;
    const mode = DS.state.colorMode;

    if (mode === 'college') {
      const colleges = [...new Set(SCHOLARS.map(s => s.college).filter(Boolean))]
        .sort((a, b) => {
          if (a === 'Other') return 1;
          if (b === 'Other') return -1;
          return a.localeCompare(b);
        });
      grid.innerHTML = colleges.map(c => {
        const isActive = DS.state.legendFilter && DS.state.legendFilter.has(c);
        return `<div class="legend-item${isActive ? ' legend-active' : ''}"
  data-college="${c.replace(/"/g, '&quot;')}">
  <div class="legend-dot" style="background:${DS.getColor(c)}"></div>
  ${DS.getShortName(c)}
  ${c === 'Other' ? `<span class="info-icon" data-tip="Scholars whose primary affiliation is not mapped to a specific college — typically research centers or other affiliated units.">?</span>` : ''}
</div>`;
      }).join('');
      // Bind taps
      grid.querySelectorAll('.legend-item[data-college]').forEach(item => {
        onTap(item, () => toggleLegendFilter(item.dataset.college));
      });
    } else if (mode === 'track') {
      grid.innerHTML = Object.entries(DS.TRACK_COLORS)
        .filter(([k]) => k !== 'unknown')
        .map(([k, v]) => `<div class="legend-item">
          <div class="legend-dot" style="background:${v}"></div>
          ${k.replace('_', ' ')}
        </div>`).join('');
    } else if (mode === 'bridge') {
      grid.innerHTML = `
        <div class="legend-item"><div class="legend-dot" style="background:rgb(30,100,200)"></div>Low bridge</div>
        <div class="legend-item"><div class="legend-dot" style="background:rgb(200,20,30)"></div>High bridge</div>`;
    } else {
      grid.innerHTML = `<div class="legend-item" style="color:var(--text3);font-size:var(--fs-xs)">120 communities</div>`;
    }
  }

  function toggleLegendFilter(college) {
    if (!DS.state.legendFilter) DS.state.legendFilter = new Set();
    const lf = DS.state.legendFilter;

    lf.has(college) ? lf.delete(college) : lf.add(college);

    if (lf.size === 0) {
      DS.state.topicHighlight = null;
      clearTopicHighlight();
    } else {
      const ids = SCHOLARS.filter(s => lf.has(s.college)).map(s => s.id);
      DS.state.topicHighlight = new Set(ids);
      const label = [...lf].join(', ');
      const col = lf.size === 1 ? DS.getColor([...lf][0]) : 'var(--gold)';
      _showBadge(`${label} · ${ids.length} scholars`, col);
      animateHL(1);
      fitToNodes(ids);
    }

    render();
    renderLegend();
  }

  /* ── Isolated zone ───────────────────────────────────────────────────── */
  function _renderIsolatedZone(isoNodes) {
    const zone = document.getElementById('isolated-zone');
    if (!zone) return;

    if (!DS.state.showIsolated || isoNodes.length === 0) {
      zone.style.display = 'none';
      return;
    }

    zone.style.display = 'block';
    const countEl = document.getElementById('iso-count');
    const list = document.getElementById('iso-list');
    if (countEl) countEl.textContent = isoNodes.length;
    if (list) {
      list.innerHTML = isoNodes
        .sort((a, b) => (b.h_index || 0) - (a.h_index || 0))
        .slice(0, 80)
        .map(s => {
          const col = DS.getColor(s.college);
          return `<div class="iso-chip" data-sid="${s.id}">
            <div class="iso-chip-dot" style="background:${col}"></div>
            ${s.name.split(' ').pop()}
          </div>`;
        }).join('');

      list.querySelectorAll('.iso-chip').forEach(chip => {
        onTap(chip, () => selectById(chip.dataset.sid));
      });
    }
  }

  /* ── Zoom controls ───────────────────────────────────────────────────── */
  function zoomIn() { d3.select(canvas).transition().call(zoomBehavior.scaleBy, 1.4); }
  function zoomOut() { d3.select(canvas).transition().call(zoomBehavior.scaleBy, 0.7); }
  function zoomReset() {
    DS.state.selectedId = null;
    DS.state.topicHighlight = null;
    DS.state.legendFilter = new Set();
    hoveredEdge = null;
    animateHL(0);
    renderLegend();
    _hideBadge();
    clearSearch();
    RightV1.reset && RightV1.reset(DS.state.subview);

    //const homeT = defaultTransform ?? d3.zoomIdentity.translate(W / 2, H / 2).scale(0.85);  // use saved home position
    const homeT = d3.zoomIdentity;
    d3.select(canvas).transition().duration(500).call(zoomBehavior.transform, homeT);
  }

  /* ── Toggle functions ────────────────────────────────────────────────── */
  function toggleLabels() {
    DS.state.showLabels = !DS.state.showLabels;
    const btn = document.getElementById('lv1-btn-labels');
    if (btn) btn.classList.toggle('active', DS.state.showLabels);
    render();
  }

  function toggleIsolated() {
    DS.state.showIsolated = !DS.state.showIsolated;
    const btn = document.getElementById('lv1-btn-isolated');
    if (btn) btn.classList.toggle('active', DS.state.showIsolated);
    build();
  }

  function toggleFreeze() {
    DS.state.frozen = !DS.state.frozen;
    const btn = document.getElementById('lv1-btn-freeze');
    if (btn) btn.classList.toggle('active', DS.state.frozen);
    if (simulation) DS.state.frozen ? simulation.stop() : simulation.alpha(0.3).restart();
  }

  /* ── Force controls ──────────────────────────────────────────────────── */
  function setForceCharge(v) {
    if (simulation) simulation.force('charge', d3.forceManyBody().strength(+v)).alpha(0.3).restart();
  }

  function setForceLink(v) {
    if (simulation) {
      simulation.force('link').distance(d => +v / Math.sqrt(d.weight || 1));
      simulation.alpha(0.3).restart();
    }
  }

  function setColorMode(mode) {
    DS.state.colorMode = mode;
    renderLegend();
    render();
  }

  /* ── Highlight animation ─────────────────────────────────────────────── */
  function animateHL(target) {
    hlAlphaTarget = target;
    const step = () => {
      const diff = hlAlphaTarget - hlAlpha;
      if (Math.abs(diff) < 0.01) { hlAlpha = hlAlphaTarget; render(); return; }
      hlAlpha += diff * 0.18;
      render();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── Topic badge (top of canvas) ─────────────────────────────────────── */
  function _showBadge(text, borderColor) {
    const badge = document.getElementById('topic-badge');
    const badgeText = document.getElementById('topic-badge-text');
    if (!badge) return;
    if (badgeText) badgeText.textContent = text;
    badge.style.borderLeftColor = borderColor || 'var(--gold)';
    badge.classList.add('visible');
  }

  function _hideBadge() {
    const badge = document.getElementById('topic-badge');
    if (badge) {
      badge.classList.remove('visible');
      badge.style.borderLeftColor = 'var(--gold)';
    }
  }

  /* ── Tooltip (mouse only) ────────────────────────────────────────────── */
  function _showTooltip(ev, d) {
    const el = tt();
    if (!el) return;
    const bridgeStr = d.is_bridge
      ? ` · <span style="color:var(--gold)">Top ${d.top_pct}% bridge</span>` : '';
    el.innerHTML = `<b style="font-family:'Source Serif 4',serif">${d.name}</b>
      <br><span style="color:var(--text3)">${d.main_affil_name || ''}</span>
      <br><span style="color:var(--text2)">h=${d.h_index || '—'} · ${d.degree || 0} collabs${bridgeStr}</span>`;
    el.style.left = (ev.clientX + 14) + 'px';
    el.style.top = (ev.clientY - 34) + 'px';
    el.classList.add('visible');
  }

  function _showEdgeTooltip(ev, e) {
    const el = tt();
    if (!el) return;
    const w = e.weight || 1;
    el.innerHTML = `
      <b style="font-family:'Source Serif 4',serif;display:block">${e.source.name}</b>
      <b style="font-family:'Source Serif 4',serif;display:block">${e.target.name}</b>
      <span style="color:var(--text2)">${w} shared work${w > 1 ? 's' : ''}</span>`;
    el.style.left = (ev.clientX + 14) + 'px';
    el.style.top = (ev.clientY - 34) + 'px';
    el.classList.add('visible');
  }

  function _hideTooltip() {
    const el = tt();
    if (el) el.classList.remove('visible');
  }

  /* ── Initial auto-zoom after first build ─────────────────────────────── */
  function initialZoom() {
    if (hasInitialZoomed) return;
    hasInitialZoomed = true;
    if (nodes && nodes.length) {
      const cx = d3.mean(nodes.filter(n => isFinite(n.x)), n => n.x) ?? W / 2;  // fallback if nodes not yet positioned
      const cy = d3.mean(nodes.filter(n => isFinite(n.y)), n => n.y) ?? H / 2;  // fallback if nodes not yet positioned
      const t = d3.zoomIdentity
        .translate(W / 2 - cx * 0.85, H / 2 - cy * 0.85)
        .scale(0.85);
      defaultTransform = t;   // save as home position for zoomReset
      d3.select(canvas).transition().duration(600).call(zoomBehavior.transform, t);  // smooth initial zoom
    }
  }

  return {
    init, build, resize, render, initialZoom,
    selectById, focusNode, panTo,
    highlightTopic, clearTopicHighlight,
    toggleLegendFilter, renderLegend,
    zoomIn, zoomOut, zoomReset,
    toggleLabels, toggleIsolated, toggleFreeze,
    setForceCharge, setForceLink, setColorMode,
  };
})();
