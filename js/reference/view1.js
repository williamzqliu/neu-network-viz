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
  let selectedEdge = null;
  let zoomBehavior;
  let hlAlpha = 0;
  let hlAlphaTarget = 0;
  let hasInitialZoomed = false;
  let defaultTransform = null;   // saved after first layout, used by zoomReset

  let _isoArr = [];    // unpositioned isolated scholars (stored during build)
  let _isoNodes = [];  // positioned isolated scholars (set by _layoutIsoNodes)
  const ISO_R = 5.5;   // render radius for isolated nodes on canvas
  let _top10BridgeIds = new Set(); // top 10 bridge scholars by score (for bold label)
  let _bridgeP75 = 0;             // 75th-percentile bridge score threshold

  // Layout cache: avoids re-running force simulation for identical filter states
  const _layoutCache = new Map(); // cacheKey → { isoNodes, nodePositions: Map<id,{x,y}> }
  function _cacheKey() {
    const s = DS.state;
    const sf = s.statusFilter instanceof Set ? [...s.statusFilter].sort().join(',') : s.statusFilter;
    const tf = s.trackFilter  instanceof Set ? [...s.trackFilter].sort().join(',')  : s.trackFilter;
    return `${sf}|${tf}|${s.yearFrom}|${s.yearTo}|${s.threshold}|${W}|${H}`;
  }

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
    if (DS.state.showIsolated && _isoArr.length) _layoutIsoNodes(_isoArr);
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

    // Store iso scholars for ring layout; hide legacy DOM zone
    _isoArr = isoNodes;
    _isoNodes = [];
    const isoZone = document.getElementById('isolated-zone');
    if (isoZone) isoZone.style.display = 'none';

    // Restore from layout cache if available
    const cacheKey = _cacheKey();
    const cached = _layoutCache.get(cacheKey);
    if (cached) {
      _isoNodes = cached.isoNodes;  // iso nodes appear immediately from cache
    }

    // Build simulation nodes (prefer: current pos → cached pos → random)
    const prevMap = nodes ? new Map(nodes.map(n => [n.id, n])) : new Map();
    nodes = connNodes.map(s => {
      const prev = prevMap.get(s.id);
      const cp   = cached?.nodePositions?.get(s.id);
      return {
        ...s,
        x: prev?.x ?? cp?.x ?? W / 2 + (Math.random() - 0.5) * 240,
        y: prev?.y ?? cp?.y ?? H / 2 + (Math.random() - 0.5) * 240,
        fx: prev?.fx ?? null,
        fy: prev?.fy ?? null,
      };
    });

    // Pre-compute iso positions immediately so Show Isolated is always instant.
    // Uses current (possibly unsettled) node positions for a rough layout;
    // simulation 'end' will recompute with settled positions.
    if (!cached && _isoArr.length) _layoutIsoNodes(_isoArr);

    // Pre-compute bridge label tiers (top 10 bold; p75 threshold for font size)
    const bridgeSorted = [...nodes, ..._isoNodes]
      .filter(n => n.bridge_score > 0)
      .sort((a, b) => b.bridge_score - a.bridge_score);
    _top10BridgeIds = new Set(bridgeSorted.slice(0, 10).map(n => n.id));
    _bridgeP75 = bridgeSorted.length
      ? bridgeSorted[Math.floor(bridgeSorted.length * 0.25)].bridge_score
      : 0;

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
        _layoutIsoNodes(_isoArr);  // always pre-compute; render() will decide whether to show
        // Save positions to cache so next load with same filters is instant
        _layoutCache.set(_cacheKey(), {
          isoNodes: _isoNodes,
          nodePositions: new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }])),
        });
        render();
        // Pre-warm cache for retired/former in background (only when viewing 'all')
        if (DS.state.statusFilter instanceof Set && DS.state.statusFilter.size === 3) {
          setTimeout(() => _prewarmCache('retired'), 200);
          setTimeout(() => _prewarmCache('former'),  200);
        }
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

        if (isTopicMode && !selectedEdge) {
          const sHL = topicHL && topicHL.has(s.id);
          const tHL = topicHL && topicHL.has(t.id);
          if (s.id !== selId && t.id !== selId && !(sHL && tHL)) return;
        }

        const isFocus = focusId && (s.id === focusId || t.id === focusId);
        const isTopHL = !!(topicHL && topicHL.has(s.id) && topicHL.has(t.id));
        const isFaded = hasHL && !isFocus && !isTopHL;
        const isHovEdge = hoveredEdge === link || selectedEdge === link;

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
  ctx.globalAlpha = isFaded ? dimmedAlpha : 0.4;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.25 / transform.k;
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

        // Bridge halo (suppressed when topic match ring will also be drawn)
        if (node.is_bridge && !isFaded && !isTopMatch) {
          const topPct = node.top_pct || 25;
          const haloR = topPct <= 1 ? 3.5 : topPct <= 3 ? 3 : topPct <= 5 ? 2.5 : 2;
          const haloA = topPct <= 1 ? 0.7 : topPct <= 3 ? 0.55 : topPct <= 5 ? 0.42 : 0.28;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 1.3 + haloR / transform.k, 0, Math.PI * 2);
          ctx.strokeStyle = '#A4804A';
          ctx.lineWidth = (topPct <= 3 ? 1.2 : 0.8) / transform.k;
          ctx.globalAlpha = haloA;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Topic match ring（未连接符合条件）
        if (isTopMatch && !isSel) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 1.3 + 2.5 / transform.k, 0, Math.PI * 2);
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
          const isBridgeMode = DS.state.colorMode === 'bridge';
          if (isBridgeMode && !(node.bridge_score > 0)) {
            // no label for zero-score nodes in bridge mode
          } else {
            const isTop10 = isBridgeMode && _top10BridgeIds.has(node.id);
            const isTop25 = isBridgeMode && (node.bridge_score >= _bridgeP75);
            const weight = isTop10 ? '700' : '400';
            const fontSize = (isTop10 ? 14 : isBridgeMode && !isTop25 ? 10 : 12) / transform.k;
            const alpha = isBridgeMode && !isTop25 ? 0.6 : isTop10 ? 0.9 : 0.75;
            ctx.fillStyle = '#3D4460';
            ctx.font = `${weight} ${fontSize}px 'DM Sans',sans-serif`;
            ctx.globalAlpha = alpha;
            const label = isBridgeMode
              ? node.bridge_score.toFixed(3)
              : node.name.split(' ').pop();
            ctx.fillText(label, node.x + r + 3 / transform.k, node.y);
            ctx.globalAlpha = 1;
          }
        }
      });
    }

    // Isolated nodes — ring layout, rendered after main nodes
    // Hidden when threshold >= 1 (they have 0 collabs and would always be filtered)
    if (DS.state.showIsolated && DS.state.threshold < 1 && _isoNodes.length) {
      _isoNodes.forEach(node => {
        if (node.x == null) return;
        const col = DS.nodeColor(node);

        // Iso nodes have no neighbors — fade all of them when anything else is focused,
        // except the iso node that is itself selected
        const isSel = node.id === selId;
        const isHov = node.id === hovId;
        const isTopMatch = topicHL && topicHL.has(node.id);
        const isFaded = hasHL && !isSel && !isHov && !isTopMatch;

        if (isSel || isHov) { ctx.shadowColor = col; ctx.shadowBlur = 8 / transform.k; }

        ctx.beginPath();
        ctx.arc(node.x, node.y, ISO_R, 0, Math.PI * 2);
        if (node.status === 'retired' || node.status === 'former') {
          ctx.globalAlpha = isFaded ? dimmedAlpha : 0.4;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.25 / transform.k;
          ctx.stroke();
        } else {
          ctx.globalAlpha = isFaded ? dimmedAlpha : 0.5;
          ctx.fillStyle = col;
          ctx.fill();
          ctx.globalAlpha = isFaded ? dimmedAlpha * 0.6 : 0.3;
          ctx.strokeStyle = col;
          ctx.lineWidth = 0.8 / transform.k;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Label — only when zoomed in enough (iso nodes are small, avoid clutter)
        if (DS.state.showLabels && transform.k > 0.7 && !isFaded) {
          ctx.fillStyle = '#4f5673';
          ctx.font = `${12 / transform.k}px 'DM Sans',sans-serif`;
          ctx.globalAlpha = 0.7;
          ctx.fillText(node.name.split(' ').pop(), node.x + ISO_R + 3 / transform.k, node.y + ISO_R * 0.4);
          ctx.globalAlpha = 1;
        }
      });
    }

    ctx.restore();
  }

  /* ── Hit tests ───────────────────────────────────────────────────────── */
  function _hitTest(mx, my) {
    if (!nodes && !_isoNodes.length) return null;
    const [wx, wy] = transform.invert([mx, my]);
    let best = null, bestD = Infinity;
    (nodes || []).forEach(n => {
      const r = rScale(n.h_index || 0) + 4;
      const dx = n.x - wx, dy = n.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 < bestD) { bestD = d2; best = n; }
    });
    if (DS.state.showIsolated && DS.state.threshold < 1) {
      _isoNodes.forEach(n => {
        const r = ISO_R + 4;
        const dx = n.x - wx, dy = n.y - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r && d2 < bestD) { bestD = d2; best = n; }
      });
    }
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
      selectedEdge = null;
      DS.state.selectedId = n.id;
      hoveredEdge = null;

      if (DS.state.colorMode === 'community' && n.community_id != null) {
        // Highlight all scholars in the same Leiden community
        const cid = n.community_id;
        const memberIds = new Set(SCHOLARS.filter(s => s.community_id === cid).map(s => s.id));
        DS.state.topicHighlight = memberIds;
        DS.state.topicConnected = null;
        _showBadge(`Community ${cid} · ${memberIds.size} scholars`, DS.nodeColor(n));
      } else {
        DS.state.topicHighlight = null;
        DS.state.topicConnected = null;
        _hideBadge();
      }

      animateHL(1);
      render();
      Panels.showScholarCard(n.id);
    } else {
      if (DS.state.selectedId) {
        const selId = DS.state.selectedId;
        const rawE = _edgeHitTest(mx, my);
        if (rawE && (rawE.source.id === selId || rawE.target.id === selId)) return;
        selectedEdge = null;
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
        selectedEdge = e;
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
        selectedEdge = null;
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
    let n = nodes && nodes.find(x => x.id === id);
    if (!n) n = _isoNodes.find(x => x.id === id);
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
    DS.state.unitFilter = new Set();
    DS.state.selectedId = null;
    animateHL(0);
    render();
    renderLegend();
    _hideBadge();
    const inputEl = document.getElementById('hd-search');
    const clearBtn = document.getElementById('hd-search-clear');
    if (inputEl) inputEl.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    LeftV1.syncLegendState && LeftV1.syncLegendState();
  }

  /* ── Legend ──────────────────────────────────────────────────────────── */
  function renderLegend() {
    const grid = document.getElementById('legend-grid');
    if (!grid) return;
    const mode = DS.state.colorMode;

    if (mode === 'college') {
      const _legendOrder = [
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
        'Other',
      ];
      const colleges = [...new Set(SCHOLARS.map(s => s.college).filter(Boolean))]
        .sort((a, b) => {
          const ai = _legendOrder.indexOf(a);
          const bi = _legendOrder.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      grid.innerHTML = colleges.map(c => {
        const isActive = DS.state.legendFilter && DS.state.legendFilter.has(c);
        return `<div class="legend-item${isActive ? ' legend-active' : ''}"
  data-college="${c.replace(/"/g, '&quot;')}">
  <div class="legend-dot" style="background:${DS.getColor(c)}"></div>
  ${DS.getShortName(c)}
  ${c === 'Other' ? `<span class="info-icon" data-tip="Scholars whose primary affiliation is not mapped to a specific college, typically research centers or other affiliated units.">?</span>` : ''}
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
        <div class="legend-item"><div class="legend-dot" style="background:#B8BDC9"></div>No bridge score</div>
        <div class="legend-item" style="grid-column:1/-1;flex-direction:column;align-items:flex-start;gap:3px">
          <div style="display:flex;align-items:center;gap:7px">
            <div style="width:90px;height:7px;border-radius:3px;background:linear-gradient(to right,#B8BDC9,#E0001E);flex-shrink:0"></div>
            <span>bridge score</span>
          </div>
          <div style="display:flex;justify-content:space-between;width:90px;font-size:10px;color:var(--text3)">
            <span>Low</span><span>High</span>
          </div>
        </div>`;
    } else if (mode === 'community') {
      const sel = DS.state.selectedId ? DS.scholarMap.get(DS.state.selectedId) : null;
      if (sel && sel.community_id != null && DS.state.topicHighlight) {
        const col = DS.nodeColor(sel);
        grid.innerHTML = `<div class="legend-item" style="grid-column:1/-1">
          <div class="legend-dot" style="background:${col}"></div>
          Community ${sel.community_id} · ${DS.state.topicHighlight.size} scholars
        </div>`;
      } else {
        grid.innerHTML = `<div class="legend-item" style="grid-column:1/-1;white-space:normal;color:var(--text3)">Click any node to highlight its community</div>`;
      }
    }
  }

  /* ── Shared highlight engine ─────────────────────────────────────────── */
  function _applyUnitHighlight() {
    const lf = DS.state.legendFilter;
    const uf = DS.state.unitFilter;
    const hasFilter = lf.size > 0 || uf.size > 0;

    if (!hasFilter) {
      DS.state.topicHighlight = null;
      animateHL(0);
      _hideBadge();
      render();
      renderLegend();
      LeftV1.syncLegendState && LeftV1.syncLegendState();
      return;
    }

    const ids = SCHOLARS
      .filter(s => {
        if (lf.has(s.college)) return true;
        for (const uid of uf) {
          const unit = DS.unitMap.get(uid);
          if (!unit) continue;
          if (unit.unit_type === 'center') {
            const detail = SCHOLAR_DETAIL && SCHOLAR_DETAIL[s.id];
            if (detail && detail.ctr_names && detail.ctr_names.includes(unit.unit_name)) return true;
          } else {
            if (s.main_affil_id === uid) return true;
          }
        }
        return false;
      })
      .map(s => s.id);
    DS.state.topicHighlight = new Set(ids);

    // Badge label: college short names + any extra units not covered by a selected college
    const extraUf = [...uf].filter(uid => {
      const u = DS.unitMap.get(uid);
      if (!u) return false;
      if (u.unit_type === 'department' && u.parent_unit_id) {
        const parent = DS.unitMap.get(u.parent_unit_id);
        return !(parent && lf.has(parent.unit_name));
      }
      return true; // centers are always "extra"
    });
    const parts = [];
    if (lf.size > 0) parts.push([...lf].map(c => DS.getShortName(c)).join(', '));
    if (extraUf.length > 0) parts.push(`+${extraUf.length} unit${extraUf.length !== 1 ? 's' : ''}`);
    const col = (lf.size === 1 && extraUf.length === 0) ? DS.getColor([...lf][0]) : 'var(--gold)';
    _showBadge(`${parts.join(' ')} · ${ids.length} scholars`, col);

    animateHL(1);
    fitToNodes(ids);
    render();
    renderLegend();
    LeftV1.syncLegendState && LeftV1.syncLegendState();
  }

  function toggleLegendFilter(college) {
    const lf = DS.state.legendFilter;
    const uf = DS.state.unitFilter;

    // Find this college's dept IDs to sync unitFilter
    const colUnit = UNITS.find(u => u.unit_name === college && u.unit_type === 'college');
    const deptIds = colUnit ? (DS.collegeDepts.get(colUnit.unit_id) || []).map(d => d.unit_id) : [];

    if (lf.has(college)) {
      lf.delete(college);
      deptIds.forEach(id => uf.delete(id));
    } else {
      lf.add(college);
      deptIds.forEach(id => uf.add(id));
    }

    _applyUnitHighlight();
  }

  function toggleUnitFilter(unitId) {
    const uf = DS.state.unitFilter;
    const lf = DS.state.legendFilter;

    uf.has(unitId) ? uf.delete(unitId) : uf.add(unitId);

    // Sync parent college's legendFilter based on whether all its depts are selected
    const unit = DS.unitMap.get(unitId);
    if (unit && unit.unit_type === 'department' && unit.parent_unit_id) {
      const parentCollege = DS.unitMap.get(unit.parent_unit_id);
      if (parentCollege) {
        const allDeptIds = (DS.collegeDepts.get(unit.parent_unit_id) || []).map(d => d.unit_id);
        const allSelected = allDeptIds.length > 0 && allDeptIds.every(id => uf.has(id));
        allSelected ? lf.add(parentCollege.unit_name) : lf.delete(parentCollege.unit_name);
      }
    }

    _applyUnitHighlight();
  }

  /* ── Isolated node scatter layout (annular zone + collision detection) ── */
  /* ── Background cache pre-warmer ─────────────────────────────────────── */
  function _prewarmCache(statusFilter) {
    const s = DS.state;
    const tf = s.trackFilter instanceof Set ? [...s.trackFilter].sort().join(',') : s.trackFilter;
    const key = `${statusFilter}|${tf}|${s.yearFrom}|${s.yearTo}|${s.threshold}|${W}|${H}`;
    if (_layoutCache.has(key)) return; // already cached

    // Compute filtered scholars for the target status
    const tfSet = s.trackFilter instanceof Set ? s.trackFilter : null;
    const allScholars = SCHOLARS.filter(sc => {
      if (sc.status !== statusFilter) return false;
      if (tfSet && tfSet.size < 3 && sc.track && !tfSet.has(sc.track)) return false;
      return true;
    });
    const nodeSet = new Set(allScholars.map(sc => sc.id));
    const allEdges = DS.getFilteredEdges(nodeSet);
    const activeIds = new Set();
    allEdges.forEach(e => { activeIds.add(e.source); activeIds.add(e.target); });

    const bgConn = allScholars.filter(sc => activeIds.has(sc.id));
    const bgIso  = allScholars.filter(sc => !activeIds.has(sc.id));

    if (!bgConn.length && !bgIso.length) return;

    const bgNodes = bgConn.map(sc => ({
      ...sc,
      x: W / 2 + (Math.random() - 0.5) * 240,
      y: H / 2 + (Math.random() - 0.5) * 240,
    }));
    const bgLinks = allEdges.map(e => ({ ...e }));

    const bgMaxH = d3.max(bgNodes, d => d.h_index || 1) || 1;
    const bgRScale = d3.scaleSqrt().range([3, 14]).domain([0, bgMaxH]);

    // Run simulation without rendering; higher alphaDecay for faster convergence
    const bgSim = d3.forceSimulation(bgNodes)
      .force('link', d3.forceLink(bgLinks).id(d => d.id).distance(200).strength(0.45))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('x', d3.forceX(W / 2).strength(0.04))
      .force('y', d3.forceY(H / 2).strength(0.04))
      .force('collide', d3.forceCollide(d => bgRScale(d.h_index || 0) + 6))
      .alphaDecay(0.05)   // faster than main sim (0.025) to reduce background CPU
      .stop();

    // Run synchronously in idle chunks to avoid blocking UI
    const totalTicks = Math.ceil(Math.log(0.001) / Math.log(1 - 0.05));
    let tick = 0;
    function runChunk() {
      const end = Math.min(tick + 30, totalTicks);
      while (tick < end) { bgSim.tick(); tick++; }
      if (tick < totalTicks) {
        requestIdleCallback ? requestIdleCallback(runChunk) : setTimeout(runChunk, 16);
      } else {
        // Compute iso layout using settled bgNodes centroid
        const bgCx = d3.mean(bgNodes, n => n.x) ?? W / 2;
        const bgCy = d3.mean(bgNodes, n => n.y) ?? H / 2;
        let bgNetR = 0;
        bgNodes.forEach(n => {
          const d = Math.sqrt((n.x - bgCx) ** 2 + (n.y - bgCy) ** 2);
          if (d > bgNetR) bgNetR = d;
        });
        const INNER_R = bgNetR + 70, BAND_W = 420, MIN_D = ISO_R * 2 + 14;
        const MIN_D2 = MIN_D * MIN_D;
        let seed = 42;
        const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const bgIsoNodes = [];
        bgIso.forEach(sc => {
          let placed = false;
          for (let t = 0; t < 60 && !placed; t++) {
            const r = INNER_R + rand() * BAND_W, angle = rand() * Math.PI * 2;
            const x = bgCx + Math.cos(angle) * r, y = bgCy + Math.sin(angle) * r;
            let ok = true;
            for (let j = bgIsoNodes.length - 1; j >= 0 && ok; j--) {
              const dx = bgIsoNodes[j].x - x, dy = bgIsoNodes[j].y - y;
              if (dx * dx + dy * dy < MIN_D2) ok = false;
            }
            if (ok) { bgIsoNodes.push({ ...sc, x, y }); placed = true; }
          }
          if (!placed) {
            bgIsoNodes.push({ ...sc,
              x: bgCx + Math.cos(rand() * Math.PI * 2) * (INNER_R + BAND_W + rand() * 80),
              y: bgCy + Math.sin(rand() * Math.PI * 2) * (INNER_R + BAND_W + rand() * 80),
            });
          }
        });

        _layoutCache.set(key, {
          isoNodes: bgIsoNodes,
          nodePositions: new Map(bgNodes.map(n => [n.id, { x: n.x, y: n.y }])),
        });
      }
    }
    requestIdleCallback ? requestIdleCallback(runChunk) : setTimeout(runChunk, 500);
  }

  function _layoutIsoNodes(isoArr) {
    if (!isoArr || !isoArr.length || !W || !H) { _isoNodes = []; return; }

    // Compute actual centroid + bounding radius of settled connected nodes
    let netR = 0, netCx = W / 2, netCy = H / 2;
    if (nodes && nodes.length > 0) {
      netCx = d3.mean(nodes, n => n.x) ?? W / 2;
      netCy = d3.mean(nodes, n => n.y) ?? H / 2;
      nodes.forEach(n => {
        const d = Math.sqrt((n.x - netCx) ** 2 + (n.y - netCy) ** 2);
        if (d > netR) netR = d;
      });
    }

    const INNER_R = netR + 70;        // inner edge of scatter zone (gap from network)
    const BAND_W  = 420;              // radial width; wider = sparser, more natural
    const MIN_D   = ISO_R * 2 + 14;  // minimum center-to-center distance (collision radius)
    const MIN_D2  = MIN_D * MIN_D;
    const TRIES   = 60;               // attempts per node before overflow fallback

    // Seeded LCG — same input always produces same layout (deterministic)
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    const positioned = [];

    isoArr.forEach(scholar => {
      let placed = false;

      for (let t = 0; t < TRIES && !placed; t++) {
        const r     = INNER_R + rand() * BAND_W;
        const angle = rand() * Math.PI * 2;
        const x     = netCx + Math.cos(angle) * r;
        const y     = netCy + Math.sin(angle) * r;

        // Check collision against all previously placed nodes
        // (iterate backwards for early exit near recently placed nodes)
        let ok = true;
        for (let j = positioned.length - 1; j >= 0 && ok; j--) {
          const dx = positioned[j].x - x, dy = positioned[j].y - y;
          if (dx * dx + dy * dy < MIN_D2) ok = false;
        }
        if (ok) { positioned.push({ ...scholar, x, y }); placed = true; }
      }

      // Overflow fallback: place beyond band, no collision check
      if (!placed) {
        const r     = INNER_R + BAND_W + rand() * 80;
        const angle = rand() * Math.PI * 2;
        positioned.push({ ...scholar, x: netCx + Math.cos(angle) * r, y: netCy + Math.sin(angle) * r });
      }
    });

    _isoNodes = positioned;
  }

  /* ── Zoom controls ───────────────────────────────────────────────────── */
  function zoomIn() { d3.select(canvas).transition().call(zoomBehavior.scaleBy, 1.4); }
  function zoomOut() { d3.select(canvas).transition().call(zoomBehavior.scaleBy, 0.7); }
  function zoomReset() {
    DS.state.selectedId = null;
    DS.state.topicHighlight = null;
    DS.state.legendFilter = new Set();
    hoveredEdge = null;
    selectedEdge = null;
    animateHL(0);
    renderLegend();
    LeftV1.syncLegendState && LeftV1.syncLegendState();
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
    render();
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
    const prev = DS.state.colorMode;
    DS.state.colorMode = mode;
    // Clear community highlight when entering or leaving community mode
    if (prev === 'community' || mode === 'community') {
      DS.state.topicHighlight = null;
      DS.state.topicConnected = null;
      animateHL(DS.state.selectedId ? 1 : 0);
      _hideBadge();
    }
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
    toggleLegendFilter, toggleUnitFilter, renderLegend,
    zoomIn, zoomOut, zoomReset,
    toggleLabels, toggleIsolated,
    setForceCharge, setForceLink, setColorMode,
  };
})();
