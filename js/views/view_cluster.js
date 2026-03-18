/* view_cluster.js — Research Clusters View (Three.js 3D) */
'use strict';

const ViewCluster = (() => {

  // ── Three.js scene objects ────────────────────────────────────────────────
  let renderer, scene, camera, container;
  let animFrameId = null;
  let initialized = false;

  // ── Interaction state ─────────────────────────────────────────────────────
  let isDragging = false, isRightDrag = false;
  let prevMouse = { x: 0, y: 0 };
  let spherical = { theta: 0.4, phi: 0.7, radius: 2400 };
  let panOffset = { x: 0, y: 200 };
  let touchState = null;
  let mouseDownPos = { x: 0, y: 0 };

  // ── Scene objects ─────────────────────────────────────────────────────────
  let nodeMeshes = [];
  let edgeLines = [];
  let labelSprites = [];
  let raycaster, mouse;
  let hoveredMesh = null, selectedMesh = null;

  // ── Colors ────────────────────────────────────────────────────────────────
  const DOMAIN_HEX = {
    CS: '#4FC3F7',
    Engineering: '#FF6B6B',
    LifeSci: '#69F0AE',
    Medicine: '#B9F573',
    Social: '#FF9A3C',
    Business: '#FFD740',
    Periphery: '#90A4AE',
  };

  const BRIDGE_HEX = '#FFD700';
  const PARTIAL_HEX = '#C9A84C';
  const BG_COLOR = 0x080A0F;

  const DOMAIN_MAP = {
    cluster_56: 'CS', cluster_57: 'CS', cluster_59: 'CS', cluster_70: 'CS', cluster_75: 'CS',
    cluster_63: 'Engineering', cluster_64: 'Engineering', cluster_67: 'Engineering',
    cluster_71: 'Engineering', cluster_74: 'Engineering', cluster_76: 'Engineering',
    cluster_66: 'LifeSci', cluster_72: 'LifeSci', cluster_73: 'LifeSci', cluster_62: 'LifeSci',
    cluster_60: 'Medicine', cluster_68: 'Medicine', cluster_69: 'Medicine',
    cluster_78: 'Medicine', cluster_79: 'Medicine',
    cluster_58: 'Social', cluster_61: 'Social',
    cluster_65: 'Business', cluster_77: 'Business',
    cluster_small: 'Periphery',
  };

  function getDomainHex(id) {
    return DOMAIN_HEX[DOMAIN_MAP[id] || 'Periphery'];
  }

  // ── Size helpers ──────────────────────────────────────────────────────────
  function communityRadius(size) {
    return 18 + Math.sqrt(Math.max(size, 20)) * 3.2;
  }
  function peripheralRadius(size) {
    return 14 + Math.sqrt(Math.max(size, 19)) * 1.8;
  }
  function bridgeRadius(n) {
    const h = Math.min(n.h_index || 0, 80);
    const b = Math.min((100 - (n.bridge_percentile || 5)) / 100, 1);
    return 8 + b * 7 + (h / 80) * 5;
  }

  // ── Bipyramid geometry (two cones base-to-base) ──────────────────────────
  function makeBipyramidGeometry(r, h, segments) {
    // Top apex: (0, h, 0), Bottom apex: (0, -h, 0)
    // Equatorial ring at y=0 with `segments` vertices
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const indices = [];

    // Equatorial vertices
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      normals.push(Math.cos(angle), 0, Math.sin(angle));
    }
    // Top apex index = segments
    positions.push(0, h, 0);
    normals.push(0, 1, 0);
    // Bottom apex index = segments + 1
    positions.push(0, -h, 0);
    normals.push(0, -1, 0);

    const top = segments;
    const bot = segments + 1;

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      // Upper face
      indices.push(i, next, top);
      // Lower face
      indices.push(next, i, bot);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // ── Build scene ───────────────────────────────────────────────────────────
  function buildScene() {
    const d = CLUSTER_NODES;
    const allData = [];
    d.community_nodes.forEach(n => allData.push({ ...n, _type: 'community' }));
    d.bridge_nodes.forEach(n => allData.push({ ...n, _type: 'bridge' }));
    d.partial_bridge_nodes.forEach(n => allData.push({ ...n, _type: 'partial_bridge' }));
    d.peripheral_nodes.forEach(n => allData.push({ ...n, _type: 'peripheral' }));

    const nodeMap = new Map();

    // Nodes
    allData.forEach(n => {
      let r, colorHex, emissiveInt, opacity;

      if (n._type === 'community') {
        r = communityRadius(n.size);
        colorHex = getDomainHex(n.id);
        emissiveInt = 0.18;
        opacity = 0.88;
      } else if (n._type === 'bridge') {
        r = bridgeRadius(n);
        colorHex = BRIDGE_HEX;
        emissiveInt = 0.35;
        opacity = 0.92;
      } else if (n._type === 'partial_bridge') {
        r = bridgeRadius(n) * 0.65;
        colorHex = PARTIAL_HEX;
        emissiveInt = 0.12;
        opacity = 0.38;
      } else {
        r = peripheralRadius(n.size);
        colorHex = DOMAIN_HEX.Periphery;
        emissiveInt = 0.22;
        opacity = 0.82;
      }

      const color = new THREE.Color(colorHex);

      // Geometry by type
      let geo;
      if (n._type === 'bridge' || n._type === 'partial_bridge') {
        // True bipyramid: two cones sharing a common equatorial base
        geo = makeBipyramidGeometry(r, r * 1.6, 4);
      } else {
        geo = new THREE.SphereGeometry(r, 32, 32);
      }

      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: emissiveInt,
        roughness: 0.4, metalness: 0.1,
        transparent: true, opacity,
      });

      const mesh = new THREE.Mesh(geo, mat);

      // Bridge scholars elevated on positive Z axis, staggered heights
      let zPos = 0;
      if (n._type === 'bridge') {
        const bridgeIdx = CLUSTER_NODES.bridge_nodes.findIndex(b => b.id === n.id);
        zPos = 100 + (bridgeIdx % 5) * 90;  // 100–460px, wider stagger
      } else if (n._type === 'partial_bridge') {
        const pbIdx = CLUSTER_NODES.partial_bridge_nodes.findIndex(b => b.id === n.id);
        zPos = 50 + (pbIdx % 4) * 50;  // 50–200px
      }

      mesh.position.set((n.x || 0) * 2.4, -(n.y || 0) * 2.4, zPos);
      mesh.userData = { data: n, baseOpacity: opacity, baseEmissive: emissiveInt };
      scene.add(mesh);

      // Glow
      const glow = makeGlowSprite(r * 2.8, color);
      glow.position.copy(mesh.position);
      scene.add(glow);

      nodeMeshes.push({ mesh, glow, data: n });
      nodeMap.set(n.id, mesh);
    });

    // ── Bridge scholar repositioning ─────────────────────────────────────
    // Build inward-direction map: average direction from each cluster toward its neighbors
    const clusterInward = new Map();
    CLUSTER_EDGES.forEach(e => {
      const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
      if (!s || !t) return;
      if (!clusterInward.has(e.source)) clusterInward.set(e.source, new THREE.Vector3());
      if (!clusterInward.has(e.target)) clusterInward.set(e.target, new THREE.Vector3());
      clusterInward.get(e.source).add(t.position.clone().sub(s.position).normalize());
      clusterInward.get(e.target).add(s.position.clone().sub(t.position).normalize());
    });
    clusterInward.forEach(v => { if (v.length() > 0) v.normalize(); });

    // Boundary circle: max distance of any community node from origin + its radius
    let boundaryR = 0;
    CLUSTER_NODES.community_nodes.forEach(n => {
      const m = nodeMap.get(n.id);
      if (!m) return;
      const r2d = Math.sqrt(m.position.x * m.position.x + m.position.y * m.position.y);
      boundaryR = Math.max(boundaryR, r2d + communityRadius(n.size));
    });

    // Group bridge/partial_bridge nodes by sorted connects key
    const bridgeGroups = new Map();
    [...CLUSTER_NODES.bridge_nodes, ...CLUSTER_NODES.partial_bridge_nodes].forEach(n => {
      const mesh = nodeMap.get(n.id);
      if (!mesh) return;
      const key = (n.connects || []).slice().sort().join(',');
      if (!key) return;
      if (!bridgeGroups.has(key)) bridgeGroups.set(key, []);
      bridgeGroups.get(key).push({ n, mesh });
    });

    bridgeGroups.forEach((group, key) => {
      const connects = group[0].n.connects || [];
      const clMeshes = connects.map(cid => nodeMap.get(cid)).filter(Boolean);
      if (!clMeshes.length) return;

      // Centroid of connected clusters (base anchor)
      const base = new THREE.Vector3();
      clMeshes.forEach(m => base.add(m.position));
      base.divideScalar(clMeshes.length);

      // Spread direction
      let spreadDir = new THREE.Vector3();
      if (connects.length === 1) {
        // Single-connection: place on OUTWARD side (opposite to B's inward/neighbor direction)
        const inward = clusterInward.get(connects[0]);
        if (inward && inward.length() > 0.001) {
          spreadDir.copy(inward).negate();
        } else {
          // No neighbor data: fall back to radial from origin
          spreadDir.set(base.x, base.y, 0);
        }
      } else {
        // Multi-connection: perpendicular to line between first two clusters
        const m1 = nodeMap.get(connects[0]), m2 = nodeMap.get(connects[1]);
        if (m1 && m2) {
          const along = m2.position.clone().sub(m1.position);
          along.z = 0;
          spreadDir.set(-along.y, along.x, 0);
        } else {
          spreadDir.set(-base.y, base.x, 0);
        }
      }
      spreadDir.z = 0;
      if (spreadDir.length() < 0.001) spreadDir.set(1, 0, 0);
      spreadDir.normalize();

      const clNode = connects.length === 1
        ? CLUSTER_NODES.community_nodes.find(c => c.id === connects[0]) : null;
      const clR = clNode ? communityRadius(clNode.size) : 60;

      const total = group.length;
      const arcDeg = Math.min(140, 28 + total * 20);

      group.forEach(({ n, mesh }, i) => {
        const bR = n._type === 'bridge' ? bridgeRadius(n) : bridgeRadius(n) * 0.65;
        const baseDist = connects.length === 1 ? clR + bR + 55 : 95 + bR * 2.8;

        // Multi-connection: alternate both sides of perpendicular (symmetric spread)
        // Single-connection: fan from inward direction
        let angleDeg;
        if (connects.length > 1) {
          const side = (i % 2 === 0) ? 1 : -1;
          const step = Math.floor(i / 2) + (i % 2 === 0 ? 0 : 0);
          angleDeg = side * (Math.floor(i / 2) + 1) * (arcDeg / Math.max(total, 2))
            + (((i * 7 + 3) % 11) - 5) * 1.8;  // ±9° jitter
          if (i === 0) angleDeg = (((3) % 11) - 5) * 1.8; // centre with small jitter
        } else {
          const t = total === 1 ? 0 : (i / (total - 1) - 0.5) * 2;
          angleDeg = t * arcDeg * 0.5 + (((i * 7 + 3) % 11) - 5) * 2.5;
        }

        const a = angleDeg * Math.PI / 180;
        const cosA = Math.cos(a), sinA = Math.sin(a);
        const rotDir = new THREE.Vector3(
          spreadDir.x * cosA - spreadDir.y * sinA,
          spreadDir.x * sinA + spreadDir.y * cosA,
          0
        );

        // Radial jitter
        const distJitter = 1 + ((i * 13 + 5) % 9) * 0.028;
        const dist = baseDist * distJitter;

        let nx = base.x + rotDir.x * dist;
        let ny = base.y + rotDir.y * dist;

        // Clamp to community boundary circle (multi-connection only)
        if (connects.length > 1) {
          const r2d = Math.sqrt(nx * nx + ny * ny);
          if (r2d > boundaryR - bR - 8) {
            const scale = (boundaryR - bR - 8) / r2d;
            nx *= scale; ny *= scale;
          }
        }

        mesh.position.set(nx, ny, mesh.position.z);
        const entry = nodeMeshes.find(e => e.mesh === mesh);
        if (entry) entry.glow.position.copy(mesh.position);
      });
    });

    // Peripheral node repositioning: push outside community boundary circle
    CLUSTER_NODES.peripheral_nodes.forEach(n => {
      const mesh = nodeMap.get(n.id);
      if (!mesh) return;
      const pR = peripheralRadius(n.size);
      const d2 = Math.sqrt(mesh.position.x * mesh.position.x + mesh.position.y * mesh.position.y);
      const minDist = boundaryR + pR + 80;
      if (d2 < minDist) {
        const scale = minDist / (d2 || 1);
        mesh.position.x *= scale;
        mesh.position.y *= scale;
        const entry = nodeMeshes.find(e => e.mesh === mesh);
        if (entry) entry.glow.position.copy(mesh.position);
      }
    });

    // Cluster edges
    CLUSTER_EDGES.forEach(e => {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) return;

      const p0 = s.position.clone();
      const p2 = t.position.clone();
      const ctrl = new THREE.Vector3(
        (p0.x + p2.x) * 0.15,
        (p0.y + p2.y) * 0.15,
        0
      );

      const curve = new THREE.QuadraticBezierCurve3(p0, ctrl, p2);
      const pts = curve.getPoints(40);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);

      const c1 = new THREE.Color(getDomainHex(e.source));
      const c2 = new THREE.Color(getDomainHex(e.target));
      const blended = c1.clone().lerp(c2, 0.5);
      const w = Math.min(e.weight || 1, 200);
      const baseOpacity = 0.10 + (w / 200) * 0.22;

      const mat = new THREE.LineBasicMaterial({
        color: blended, transparent: true, opacity: baseOpacity,
      });
      const line = new THREE.Line(geo, mat);
      line.userData = { srcId: e.source, tgtId: e.target, baseOpacity };
      scene.add(line);
      edgeLines.push(line);
    });

    // Bridge lines
    [...CLUSTER_NODES.bridge_nodes, ...CLUSTER_NODES.partial_bridge_nodes].forEach(b => {
      const bMesh = nodeMap.get(b.id);
      if (!bMesh) return;
      (b.connects || []).forEach(cid => {
        const cMesh = nodeMap.get(cid);
        if (!cMesh) return;

        let p0 = bMesh.position.clone();
        let p2 = cMesh.position.clone();

        // Adjust both endpoints to node surfaces so lines don't pass through meshes
        const clusterR = communityRadius(cMesh.userData.data?.size || 30);
        const bNodeR = b._type === 'bridge' ? bridgeRadius(b) : bridgeRadius(b) * 0.65;
        const dir = p0.clone().sub(p2).normalize();
        p2 = p2.clone().add(dir.clone().multiplyScalar(clusterR));
        p0 = p0.clone().sub(dir.clone().multiplyScalar(bNodeR));

        const ctrl = new THREE.Vector3((p0.x + p2.x) * 0.3, (p0.y + p2.y) * 0.3, Math.max(p0.z, p2.z) * 0.5 + 20);
        const curve = new THREE.QuadraticBezierCurve3(p0, ctrl, p2);
        const pts = curve.getPoints(30);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const baseOpacity = b._type === 'partial_bridge' ? 0.15 : 0.45;
        const mat = new THREE.LineBasicMaterial({
          color: new THREE.Color(b._type === 'partial_bridge' ? PARTIAL_HEX : BRIDGE_HEX),
          transparent: true, opacity: baseOpacity,
        });
        const line = new THREE.Line(geo, mat);
        line.userData = { isBridgeLine: true, bridgeId: b.id, clusterId: cid, baseOpacity };
        scene.add(line);
        edgeLines.push(line);
      });
    });

    // Labels — community: label_line2 only (larger), radially outward from plane center
    //         bridge/peripheral: original radial offset from node center
    allData.forEach(n => {
      const mesh = nodeMap.get(n.id);
      if (!mesh) return;

      const pos = mesh.position.clone();
      // Outward direction in x-y plane (away from plane center / origin)
      const outDir = new THREE.Vector3(pos.x, pos.y, 0);
      if (outDir.length() < 1) outDir.set(1, 0, 0);
      outDir.normalize();

      let sprite;
      if (n._type === 'community') {
        sprite = makeSphereLabelSprite(n.label_line2 || n.label_line1 || '');
        if (!sprite) return;
        const r = communityRadius(n.size);
        sprite.position.set(
          pos.x + outDir.x * (r + 200),
          pos.y + outDir.y * (r + 200),
          pos.z
        );
      } else {
        sprite = makeTextSprite(n);
        if (!sprite) return;
        const r = n._type === 'peripheral' ? peripheralRadius(n.size) : bridgeRadius(n);
        const dir = pos.clone().normalize();
        const offset = r + 28;
        sprite.position.set(
          pos.x + dir.x * offset,
          pos.y + dir.y * offset,
          pos.z + dir.z * offset + (n._type === 'peripheral' ? 40 : 0)
        );
      }

      sprite.userData = { nodeId: n.id };
      scene.add(sprite);
      labelSprites.push(sprite);
    });

    // Field labels — one per domain group, radially outward from group centroid
    const domainCentroids = new Map();
    allData.filter(n => n._type === 'community').forEach(n => {
      const domain = DOMAIN_MAP[n.id] || 'Periphery';
      const mesh = nodeMap.get(n.id);
      if (!mesh) return;
      if (!domainCentroids.has(domain)) domainCentroids.set(domain, { sum: new THREE.Vector3(), count: 0 });
      const entry = domainCentroids.get(domain);
      entry.sum.add(mesh.position);
      entry.count++;
    });

    domainCentroids.forEach((entry, domain) => {
      const cx = entry.sum.x / entry.count;
      const cy = entry.sum.y / entry.count;
      const cz = entry.sum.z / entry.count;
      const sprite = makeFieldSprite(domain);
      if (!sprite) return;
      // Push outward from plane center in x-y, well beyond the group boundary
      const outDir = new THREE.Vector3(cx, cy, 0);
      if (outDir.length() < 1) outDir.set(1, 0, 0);
      outDir.normalize();
      sprite.position.set(cx + outDir.x * 400, cy + outDir.y * 400, cz);
      scene.add(sprite);
      labelSprites.push(sprite);
    });
  }

  // ── Glow sprite ───────────────────────────────────────────────────────────
  function makeGlowSprite(size, color) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    const hex = '#' + color.getHexString();
    grad.addColorStop(0, hex + '77');
    grad.addColorStop(0.35, hex + '22');
    grad.addColorStop(1, hex + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size * 1.4, size * 1.4, 1);
    return sprite;
  }

  // ── Sphere label sprite (label_line2, word-wrapped, no truncation) ──────
  function makeSphereLabelSprite(text) {
    if (!text) return null;

    const fontSize = 18;
    const maxLineW = 180; // max canvas pixels per line (keeps label narrow)
    const fontStr  = `${fontSize}px "DM Sans", sans-serif`;

    // Measure text on a temp canvas for word-wrap
    const tmp = document.createElement('canvas').getContext('2d');
    tmp.font = fontStr;

    const words = text.split(' ');
    const lines  = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (tmp.measureText(test).width > maxLineW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);

    const lineH   = fontSize + 2;
    const padX    = 16;
    const padY    = 10;
    const canvasW = maxLineW + padX * 2;
    const canvasH = lines.length * lineH + padY * 2;

    const c   = document.createElement('canvas');
    c.width   = canvasW;
    c.height  = canvasH;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.font         = fontStr;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = '#FFFFFF';
    ctx.globalAlpha  = 0.92;
    lines.forEach((line, i) => ctx.fillText(line, canvasW / 2, padY + i * lineH));

    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    // Scene-space size: keep ~40px per line tall
    const sceneH = lines.length * 32 + 12;
    const sceneW = sceneH * (canvasW / canvasH);
    sprite.scale.set(sceneW, sceneH, 1);
    return sprite;
  }

  // ── Text sprite ───────────────────────────────────────────────────────────
  function makeTextSprite(n) {
    const line1 = n.label_line1 || n.name || '';
    const line2 = n.label_line2 || '';
    if (!line1) return null;

    const c = document.createElement('canvas');
    c.width = 768; c.height = 112;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    // Line 1 — bold, large
    ctx.font = 'bold 48px "DM Sans", sans-serif';
    ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = 0.95;
    ctx.fillText(trunc(line1, 30), 384, 6);

    // Line 2 — lighter, smaller
    if (line2) {
      ctx.font = '26px "DM Sans", sans-serif';
      ctx.fillStyle = '#AABBDD'; ctx.globalAlpha = 0.78;
      ctx.fillText(trunc(line2, 40), 384, 52);
    }

    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(240, 36, 1);
    return sprite;
  }

  // ── Field label sprite (one per domain group) ───────────────────────────
  const DOMAIN_DISPLAY = {
    CS: 'Computer Science',
    Engineering: 'Engineering',
    LifeSci: 'Life Sciences',
    Medicine: 'Medicine',
    Social: 'Social Sciences',
    Business: 'Business',
    Periphery: 'Other',
  };

  function makeFieldSprite(domain) {
    const label = DOMAIN_DISPLAY[domain] || domain;
    const hex   = DOMAIN_HEX[domain] || '#90A4AE';

    const c = document.createElement('canvas');
    c.width = 768; c.height = 90;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 52px "DM Sans", sans-serif';
    ctx.fillStyle = hex;
    ctx.globalAlpha = 0.92;
    ctx.fillText(label, 384, 45);

    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(480, 42, 0.9);
    return sprite;
  }

  function trunc(s, max) {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  function updateCamera() {
    const { theta, phi, radius } = spherical;
    const sinPhi = Math.sin(phi);
    camera.position.set(
      panOffset.x + radius * sinPhi * Math.sin(theta),
      panOffset.y + radius * Math.cos(phi),
      radius * sinPhi * Math.cos(theta)
    );
    camera.lookAt(panOffset.x, panOffset.y, 0);
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    updateCamera();
    renderer.render(scene, camera);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (initialized) {
      // Already built — just restart render loop and resize
      resize();
      if (!animFrameId) animate();
      return;
    }
    initialized = true;

    container = document.getElementById('vc-container');
    if (!container) { console.error('ViewCluster: #vc-container not found'); return; }

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(BG_COLOR, 1);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG_COLOR, 0.00012);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 8000);
    updateCamera();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const pt1 = new THREE.PointLight(0xffffff, 0.9, 3000);
    pt1.position.set(0, 800, 800);
    scene.add(pt1);
    const pt2 = new THREE.PointLight(0x4466ff, 0.35, 2500);
    pt2.position.set(-700, -400, 300);
    scene.add(pt2);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    buildScene();
    bindEvents();
    animate();
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents() {
    const el = renderer.domElement;
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('click', onClick);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    window.addEventListener('resize', resize);
  }

  function onMouseDown(e) {
    isDragging = true;
    isRightDrag = e.button === 2;
    prevMouse = mouseDownPos = { x: e.clientX, y: e.clientY };
  }

  function onMouseMove(e) {
    if (isDragging) {
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      if (isRightDrag) {
        // Pan — scale by radius for consistent feel at any zoom
        const s = spherical.radius * 0.0012;
        panOffset.x -= dx * s;
        panOffset.y += dy * s;
      } else {
        // Orbit — drag right rotates right, drag up tilts up (phi decreases)
        spherical.theta = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, spherical.theta - dx * 0.010));
        spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi - dy * 0.008));
      }
      prevMouse = { x: e.clientX, y: e.clientY };
    }

    updateMousePos(e.clientX, e.clientY);
    const hit = raycast();
    if (hit !== hoveredMesh) {
      hoveredMesh = hit;
      updateHighlight();
      if (hit) showTooltip(e, hit.userData.data);
      else hideTooltip();
    }
  }

  function onMouseUp() { isDragging = false; }

  function onClick(e) {
    const moved = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y);
    if (moved > 5) return;
    const hit = raycast();
    if (hit) {
      selectedMesh = (selectedMesh === hit) ? null : hit;
      updateHighlight();
      if (selectedMesh) showPanel(selectedMesh.userData.data);
      else clearPanel();
    } else {
      selectedMesh = null;
      updateHighlight();
      clearPanel();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    spherical.radius = Math.max(10, spherical.radius + e.deltaY * 0.8);
  }

  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      isDragging = true; isRightDrag = false;
      prevMouse = mouseDownPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchState = null;
    } else if (e.touches.length === 2) {
      isDragging = false;
      touchState = {
        dist: touchDist(e),
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        radius: spherical.radius,
      };
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - prevMouse.x;
      const dy = e.touches[0].clientY - prevMouse.y;
      spherical.theta = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, spherical.theta - dx * 0.010));
      spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi - dy * 0.008));
      prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && touchState) {
      const nd = touchDist(e);
      spherical.radius = Math.max(10, touchState.radius * touchState.dist / nd);
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const s = spherical.radius * 0.001;
      panOffset.x -= (mx - touchState.midX) * s;
      panOffset.y += (my - touchState.midY) * s;
      touchState.midX = mx; touchState.midY = my;
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length === 0) { isDragging = false; touchState = null; }
  }

  function touchDist(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── Raycasting ────────────────────────────────────────────────────────────
  function updateMousePos(cx, cy) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
  }

  function raycast() {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(nodeMeshes.map(n => n.mesh));
    return hits.length ? hits[0].object : null;
  }

  // ── Highlight ─────────────────────────────────────────────────────────────
  function updateHighlight() {
    const selId = selectedMesh?.userData.data?.id;
    const hovId = hoveredMesh?.userData.data?.id;
    const focusId = selId || hovId;
    const hasHL = !!focusId;

    const connectedIds = new Set();
    const connectedEdgeKeys = new Set();  // 'srcId->tgtId' for direct edges only

    if (focusId) {
      connectedIds.add(focusId);

      // Only direct 1-hop cluster edges
      CLUSTER_EDGES.forEach(e => {
        if (e.source === focusId) {
          connectedIds.add(e.target);
          connectedEdgeKeys.add(`${e.source}->${e.target}`);
        }
        if (e.target === focusId) {
          connectedIds.add(e.source);
          connectedEdgeKeys.add(`${e.source}->${e.target}`);
        }
      });

      // Only direct bridge connections
      [...CLUSTER_NODES.bridge_nodes, ...CLUSTER_NODES.partial_bridge_nodes].forEach(b => {
        if (b.id === focusId) {
          (b.connects || []).forEach(c => {
            connectedIds.add(c);
            connectedEdgeKeys.add(`bridge:${b.id}->${c}`);
          });
        }
        if ((b.connects || []).includes(focusId)) {
          connectedIds.add(b.id);
          connectedEdgeKeys.add(`bridge:${b.id}->${focusId}`);
        }
      });
    }

    nodeMeshes.forEach(({ mesh, glow }) => {
      const id = mesh.userData.data.id;
      const isFocus = id === focusId;
      const isConn = connectedIds.has(id);
      const faded = hasHL && !isFocus && !isConn;
      mesh.material.opacity = faded ? 0.08 : mesh.userData.baseOpacity;
      mesh.material.emissiveIntensity = isFocus
        ? mesh.userData.baseEmissive * 2.8
        : isConn ? mesh.userData.baseEmissive * 1.5
          : mesh.userData.baseEmissive;
      if (glow) glow.material.opacity = faded ? 0.03 : isFocus ? 0.95 : 0.55;
    });

    edgeLines.forEach(line => {
      const { srcId, tgtId, bridgeId, clusterId, baseOpacity } = line.userData;
      let active = false;
      if (srcId && tgtId) {
        active = connectedEdgeKeys.has(`${srcId}->${tgtId}`) || connectedEdgeKeys.has(`${tgtId}->${srcId}`);
      } else if (bridgeId && clusterId) {
        active = connectedEdgeKeys.has(`bridge:${bridgeId}->${clusterId}`) || connectedEdgeKeys.has(`bridge:${bridgeId}->${focusId}`);
      }
      const faded = hasHL && !active;
      line.material.opacity = faded ? 0.015 : active ? Math.min(baseOpacity * 2.8, 0.85) : baseOpacity;
    });

    labelSprites.forEach(s => {
      const id = s.userData.nodeId;
      const faded = hasHL && !connectedIds.has(id);
      s.material.opacity = faded ? 0.05 : connectedIds.has(id) ? 1.0 : 0.72;
    });
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  function showTooltip(e, n) {
    let html = '';
    if (n._type === 'community') {
      html = `<b style="font-family:'Source Serif 4',serif">${n.label_line1}</b>
      <br><span style="color:var(--text3)">${n.label_line2}</span>
      <br><span style="color:var(--text2)">${n.size} scholars</span>`;
    } else if (n._type === 'bridge' || n._type === 'partial_bridge') {
      const tag = n._type === 'bridge' ? 'Interdisciplinary Bridge' : 'Cluster-Adjacent';
      html = `<b style="font-family:'Source Serif 4',serif">${n.name}</b>
      <br><span style="color:var(--text3)">${n.affil || ''}</span>
      <br><span style="color:var(--gold)">${tag} · Top ${(n.bridge_percentile || 0).toFixed(1)}%</span>
      <br><span style="color:var(--text2)">h-index: ${n.h_index || '—'}</span>`;
    } else {
      html = `<b style="font-family:'Source Serif 4',serif">${n.label_line1}</b>
      <br><span style="color:var(--text3)">${n.label_line2}</span>
      <br><span style="color:var(--text2)">${n.size} scholars</span>`;
    }
    Tooltip.show(e, html);
  }
  function hideTooltip() { Tooltip.hide(); }

  // ── Right panel ───────────────────────────────────────────────────────────
  const PANEL_COLORS = {
    CS: '#4FC3F7', Engineering: '#FF6B6B', LifeSci: '#69F0AE',
    Medicine: '#B9F573', Social: '#FF9A3C', Business: '#FFD740', Periphery: '#90A4AE',
  };

  function showPanel(n) {
    const card = document.getElementById('rv-bridging-card');
    if (!card) return;
    card.style.display = 'block';
    card.innerHTML = buildPanelHTML(n);
    drawMiniChart(n);
    if (typeof showRightPanel === 'function') showRightPanel();
  }

  function clearPanel() {
    const card = document.getElementById('rv-bridging-card');
    if (!card) return;
    card.style.display = 'none';
    card.innerHTML = '';
    if (typeof hideRightPanel === 'function') hideRightPanel();
  }

  function buildPanelHTML(n) {
    if (n._type === 'bridge' || n._type === 'partial_bridge') return buildBridgePanel(n);
    if (n._type === 'peripheral') return buildPeripheralPanel(n);
    return buildCommunityPanel(n);
  }

  function buildCommunityPanel(n) {
    const col = PANEL_COLORS[DOMAIN_MAP[n.id] || 'Periphery'];
    const ms = new Set(n.members || []);
    const sch = typeof SCHOLARS !== 'undefined' ? SCHOLARS.filter(s => ms.has(s.id)) : [];
    const coll = [...new Set(sch.map(s => s.college).filter(Boolean))];
    const fields = (n.top_fields || []).slice(0, 3);
    const topics = (n.top_topics || []).slice(0, 4);
    return `
    <div style="border-left:3px solid ${col};padding-left:10px;margin-bottom:12px">
      <div style="font-size:var(--fs-h3);font-weight:600;font-family:'Source Serif 4',serif;color:var(--text)">${n.label_line1}</div>
      <div style="font-size:var(--fs-small);color:var(--text3);margin-top:2px">${n.label_line2}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div class="rp-metric-box"><div class="rp-metric-val">${n.size}</div><div class="rp-metric-lbl">SCHOLARS</div></div>
      <div class="rp-metric-box"><div class="rp-metric-val">${coll.length || '—'}</div><div class="rp-metric-lbl">COLLEGES</div></div>
    </div>
    <div class="rp-section-label">RESEARCH FIELDS</div>
    <div style="margin-bottom:12px">${fields.map(f => `<div style="font-size:var(--fs-small);color:var(--text2);padding:2px 0;border-bottom:1px solid var(--border2)">${f}</div>`).join('')}</div>
    <div class="rp-section-label">TOP TOPICS</div>
    <div style="margin-bottom:14px">${topics.map(t => `<div style="font-size:var(--fs-xs);color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border2)">${t}</div>`).join('')}</div>
    <div class="rp-section-label">COLLEGE BREAKDOWN</div>
    <canvas id="vc-chart" width="240" height="160" style="width:100%;margin-top:6px"></canvas>`;
  }

  function buildBridgePanel(n) {
    const nm = new Map(CLUSTER_NODES.community_nodes.map(c => [c.id, c]));
    const cl = (n.connects || []).map(cid => nm.get(cid)?.label_line1 || cid);
    const tag = n._type === 'bridge' ? 'Interdisciplinary Bridge Scholar' : 'Cluster-Adjacent Scholar';
    return `
    <div style="border-left:3px solid ${BRIDGE_HEX};padding-left:10px;margin-bottom:12px">
      <div style="font-size:var(--fs-h3);font-weight:600;font-family:'Source Serif 4',serif;color:var(--text)">${n.name}</div>
      <div style="font-size:var(--fs-small);color:var(--text3);margin-top:2px">${n.affil || ''}</div>
      <div style="font-size:var(--fs-xs);color:var(--gold);margin-top:4px;font-weight:600">${tag}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div class="rp-metric-box"><div class="rp-metric-val">${n.h_index || '—'}</div><div class="rp-metric-lbl">H-INDEX</div></div>
      <div class="rp-metric-box"><div class="rp-metric-val">${n.degree || '—'}</div><div class="rp-metric-lbl">COLLABORATORS</div></div>
      <div class="rp-metric-box"><div class="rp-metric-val">Top ${(n.bridge_percentile || 0).toFixed(1)}%</div><div class="rp-metric-lbl">BRIDGE SCORE</div></div>
      <div class="rp-metric-box"><div class="rp-metric-val">${Math.round((n.cross_dept_ratio || 0) * 100)}%</div><div class="rp-metric-lbl">CROSS-DEPT</div></div>
    </div>
    <div class="rp-section-label">BRIDGES BETWEEN</div>
    <div>${cl.map(l => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border2)"><div style="width:8px;height:8px;background:${BRIDGE_HEX};border-radius:1px;transform:rotate(45deg);flex-shrink:0"></div><span style="font-size:var(--fs-small);color:var(--text2)">${l}</span></div>`).join('')}</div>`;
  }

  function buildPeripheralPanel(n) {
    const desc = {
      practice_based: 'Faculty whose primary output is creative, clinical, or professional practice rather than research publications.',
      teaching_based: 'Faculty focused on teaching and instruction. Publication output is limited relative to research-active colleagues.',
      external_main: 'Scholars whose collaboration network exists primarily outside Northeastern University.',
      new_faculty: 'Recently joined faculty who have not yet built an extensive internal collaboration network.',
      source_unavailable: 'Scholars for whom publication data is not currently available in our data sources.',
    };
    return `
    <div style="border-left:3px solid #90A4AE;padding-left:10px;margin-bottom:12px">
      <div style="font-size:var(--fs-h3);font-weight:600;font-family:'Source Serif 4',serif;color:var(--text)">${n.label_line1}</div>
      <div style="font-size:var(--fs-small);color:var(--text3);margin-top:2px">${n.label_line2}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div class="rp-metric-box"><div class="rp-metric-val">${n.size}</div><div class="rp-metric-lbl">SCHOLARS</div></div>
      <div class="rp-metric-box"><div class="rp-metric-val">${Math.round(n.size / 2737 * 100)}%</div><div class="rp-metric-lbl">OF FACULTY</div></div>
    </div>
    <div style="font-size:var(--fs-small);color:var(--text3);line-height:1.6;padding:8px;background:var(--s2);border-radius:5px">${desc[n.group] || ''}</div>`;
  }

  function drawMiniChart(n) {
    const c = document.getElementById('vc-chart');
    if (!c || n._type !== 'community') return;
    const ms = new Set(n.members || []);
    const sch = typeof SCHOLARS !== 'undefined' ? SCHOLARS.filter(s => ms.has(s.id)) : [];
    const cnt = {};
    sch.forEach(s => { if (s.college) cnt[s.college] = (cnt[s.college] || 0) + 1; });
    const sorted = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!sorted.length) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    const W = c.offsetWidth, H = c.offsetHeight;
    const pad = { top: 6, right: 8, bottom: 20, left: 110 };
    const bH = Math.floor((H - pad.top - pad.bottom) / sorted.length) - 3;
    const maxV = sorted[0][1];
    ctx.clearRect(0, 0, W, H);
    sorted.forEach(([college, count], i) => {
      const y = pad.top + i * (bH + 3), bw = (count / maxV) * (W - pad.left - pad.right);
      const col = DS?.getColor?.(college) || '#9C9FB2';
      ctx.beginPath(); ctx.roundRect(pad.left, y, bw, bH, 2);
      ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      const sh = DS?.getShort?.(college) || college.replace('College of ', '').replace(' College', '');
      ctx.font = '500 9px "DM Sans",sans-serif'; ctx.fillStyle = '#3D4460';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(sh, pad.left - 5, y + bH / 2);
      ctx.font = '400 8px "DM Sans",sans-serif'; ctx.fillStyle = '#8892AE';
      ctx.textAlign = 'left'; ctx.fillText(count, pad.left + bw + 4, y + bH / 2);
    });
    ctx.font = '400 8px "DM Sans",sans-serif'; ctx.fillStyle = '#8892AE';
    ctx.textAlign = 'center'; ctx.fillText('Scholars', pad.left + (W - pad.left - pad.right) / 2, H - 4);
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    if (!renderer || !container) return;
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function zoomIn() { spherical.radius = Math.max(10, spherical.radius * 0.75); }
  function zoomOut() { spherical.radius = spherical.radius * 1.35; }
  function zoomReset() {
    spherical = { theta: 0.4, phi: 0.6, radius: 1400 };
    panOffset = { x: 0, y: 0 };
    selectedMesh = null; hoveredMesh = null;
    updateHighlight(); clearPanel();
  }
  function destroy() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  }

  return { init, resize, zoomIn, zoomOut, zoomReset, destroy };

})();
