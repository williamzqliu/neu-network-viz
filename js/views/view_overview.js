/* views/view_overview.js
 * Overview view — landing page and encoding guide.
 *
 * Sections:
 *   1. Hero (title, stats, CTA; first screen of the app)
 *   2. Encoding guide (cards: color, size, bridge ring, lines)
 *   3. Using the map (three steps)
 *   4. View navigation cards
 *
 * Depends on: utils.js, datastore.js, D3 (global)
 * Called by: main.js (switchView → 'overview')
 * Module name for Logger: 'ViewOverview'
 *
 * Public methods:
 *   ViewOverview.render(container)
 */

'use strict';

const ViewOverview = (() => {

  /* ── render ──────────────────────────────────────────────────────────── */
  function render(container) {
    Logger.info('ViewOverview', 'render');

    const scholars = SCHOLARS.length;
    const edges    = EDGES.length;
    const bridges  = SCHOLARS.filter(s => s.is_bridge).length;

    container.innerHTML = _buildHTML(scholars, edges, bridges);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      _drawColorVis();
      _drawSizeVis();
      _drawBridgeVis();
      _drawEdgeVis();
      _initScrollReveal(container);
      _initScrollTopBtn(container);
    }));
  }

  /* ── HTML skeleton ───────────────────────────────────────────────────── */
  function _buildHTML(scholars, edges, bridges) {
    return `
      <div class="ov-wrap">

        <!-- ── 1. Hero ── -->
        <div class="ov-hero">
          <div class="ov-hero-inner">
            <p class="ov-label">NORTHEASTERN UNIVERSITY</p>
            <h1 class="ov-title">Research Collaboration Network</h1>
            <p class="ov-desc">
              See who publishes with whom across Northeastern’s colleges,
              departments, and research centers.
            </p>
            <p class="ov-desktop-note">
              Open this page on a desktop to use the interactive views.
            </p>
            <div class="ov-stats">
              <div class="ov-stat">
                <span class="ov-stat-n">${scholars.toLocaleString()}</span>
                <span class="ov-stat-l">Scholars</span>
              </div>
              <div class="ov-stat-sep"></div>
              <div class="ov-stat">
                <span class="ov-stat-n">${edges.toLocaleString()}</span>
                <span class="ov-stat-l">Collaboration Pairs</span>
              </div>
              <div class="ov-stat-sep"></div>
              <div class="ov-stat">
                <span class="ov-stat-n">${bridges.toLocaleString()}</span>
                <span class="ov-stat-l">Bridge Scholars</span>
              </div>
            </div>
            <div class="ov-cta-row">
              <button class="ov-cta-btn" onclick="switchView('collab')">Open Collaboration Map</button>
            </div>
          </div>
        </div>

        <!-- ── 2. Encoding guide ── -->
        <div class="ov-section ov-reveal">
          <div class="ov-sec-label">HOW TO READ THE MAP</div>

          <div class="ov-enc-grid">

            <div class="ov-enc-card">
              <div class="ov-enc-vis" id="ov-vis-color">
                <!-- drawn by _drawColorVis() -->
              </div>
              <div class="ov-enc-body">
                <div class="ov-enc-rule">
                  <span class="ov-enc-channel">Color</span>
                  <span class="ov-enc-arrow">→</span>
                  <span class="ov-enc-meaning">College affiliation</span>
                </div>
                <p class="ov-enc-desc">
                  Each circle is one scholar, colored by primary college.
                  Hover over a circle to see the scholar’s college and department.
                </p>
              </div>
            </div>

            <div class="ov-enc-card">
              <div class="ov-enc-vis" id="ov-vis-size">
                <!-- drawn by _drawSizeVis() -->
              </div>
              <div class="ov-enc-body">
                <div class="ov-enc-rule">
                  <span class="ov-enc-channel">Size</span>
                  <span class="ov-enc-arrow">→</span>
                  <span class="ov-enc-meaning">h-index</span>
                </div>
                <p class="ov-enc-desc">
                  A larger circle means a higher <span class="ov-nowrap">h-index</span>,
                  a measure based on publications and citations.
                </p>
              </div>
            </div>

            <div class="ov-enc-card">
              <div class="ov-enc-vis" id="ov-vis-bridge">
                <!-- drawn by _drawBridgeVis() -->
              </div>
              <div class="ov-enc-body">
                <div class="ov-enc-rule">
                  <span class="ov-enc-channel">Gold ring</span>
                  <span class="ov-enc-arrow">→</span>
                  <span class="ov-enc-meaning">Bridge scholar</span>
                </div>
                <p class="ov-enc-desc">
                  A gold ring marks scholars in the top&nbsp;25% by bridge score,
                  which rises with the share of collaborators outside their own
                  department. Larger, darker rings mark the top 5%, 3%, and 1%.
                  The formula is on the Methods page.
                </p>
              </div>
            </div>

            <div class="ov-enc-card">
              <div class="ov-enc-vis" id="ov-vis-edge">
                <!-- drawn by _drawEdgeVis() -->
              </div>
              <div class="ov-enc-body">
                <div class="ov-enc-rule">
                  <span class="ov-enc-channel">Line thickness</span>
                  <span class="ov-enc-arrow">→</span>
                  <span class="ov-enc-meaning">Joint publications</span>
                </div>
                <p class="ov-enc-desc">
                  A line joins two scholars who have published together.
                  Thicker lines mean more joint publications.
                </p>
              </div>
            </div>

          </div>
        </div>

        <!-- ── 3. Using the map ── -->
        <div class="ov-section ov-section--walk ov-reveal">
          <div class="ov-sec-label">USING THE MAP</div>
          <div class="ov-walk-steps">

            <div class="ov-walk-step">
              <div class="ov-walk-num">1</div>
              <div class="ov-walk-body">
                <div class="ov-walk-title">Click a scholar</div>
                <p class="ov-walk-desc">
                  Their profile opens on the right, with affiliation,
                  <span class="ov-nowrap">h-index</span>, citations, and
                  collaborators ranked by tie strength.
                </p>
              </div>
            </div>

            <div class="ov-walk-step">
              <div class="ov-walk-num">2</div>
              <div class="ov-walk-body">
                <div class="ov-walk-title">Click a topic tag</div>
                <p class="ov-walk-desc">
                  Every scholar who shares that topic is highlighted on the map.
                </p>
              </div>
            </div>

            <div class="ov-walk-step">
              <div class="ov-walk-num">3</div>
              <div class="ov-walk-body">
                <div class="ov-walk-title">Filter the map</div>
                <p class="ov-walk-desc">
                  The left panel filters by college, department, year range,
                  and appointment track.
                </p>
              </div>
            </div>

          </div>
        </div>

        <!-- ── 4. View navigation cards ── -->
        <div class="ov-section ov-section--views ov-reveal">
          <div class="ov-sec-label">EXPLORE</div>
          <div class="ov-view-cards">

            <div class="ov-view-card" onclick="switchView('collab')">
              <svg class="ov-view-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="3.5" fill="var(--red)" opacity=".85"/>
                <circle cx="7"  cy="10" r="2.5" fill="var(--red)" opacity=".5"/>
                <circle cx="25" cy="10" r="2.5" fill="var(--red)" opacity=".5"/>
                <circle cx="7"  cy="22" r="2.5" fill="var(--red)" opacity=".5"/>
                <circle cx="25" cy="22" r="2.5" fill="var(--red)" opacity=".5"/>
                <line x1="16" y1="16" x2="7"  y2="10" stroke="var(--red)" stroke-width="1.2" opacity=".35"/>
                <line x1="16" y1="16" x2="25" y2="10" stroke="var(--red)" stroke-width="1.2" opacity=".35"/>
                <line x1="16" y1="16" x2="7"  y2="22" stroke="var(--red)" stroke-width="1.2" opacity=".35"/>
                <line x1="16" y1="16" x2="25" y2="22" stroke="var(--red)" stroke-width="1.2" opacity=".35"/>
              </svg>
              <div class="ov-view-name">Collaboration Map</div>
              <p class="ov-view-desc">
                Search for or select a scholar to see their
                <span class="ov-nowrap">1-Hop</span> and
                <span class="ov-nowrap">2-Hop</span> collaborators.
              </p>
              <div class="ov-view-cta">Open →</div>
            </div>

            <div class="ov-view-card" onclick="switchView('bridging')">
              <svg class="ov-view-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="6"  cy="11" r="2" fill="var(--text3)" opacity=".5"/>
                <circle cx="26" cy="11" r="2" fill="var(--text3)" opacity=".5"/>
                <circle cx="6"  cy="21" r="2" fill="var(--text3)" opacity=".5"/>
                <circle cx="26" cy="21" r="2" fill="var(--text3)" opacity=".5"/>
                <line x1="16" y1="16" x2="6"  y2="11" stroke="var(--gold)" stroke-width="1.1" opacity=".5"/>
                <line x1="16" y1="16" x2="26" y2="11" stroke="var(--gold)" stroke-width="1.1" opacity=".5"/>
                <line x1="16" y1="16" x2="6"  y2="21" stroke="var(--gold)" stroke-width="1.1" opacity=".5"/>
                <line x1="16" y1="16" x2="26" y2="21" stroke="var(--gold)" stroke-width="1.1" opacity=".5"/>
                <circle cx="16" cy="16" r="8" stroke="var(--gold)" stroke-width="1.2" fill="none" opacity=".45"/>
                <circle cx="16" cy="16" r="4" fill="var(--gold)" opacity=".85"/>
              </svg>
              <div class="ov-view-name">Bridging Scholars</div>
              <p class="ov-view-desc">
                This 3D view shows network communities and the bridge scholars
                who connect them.
              </p>
              <div class="ov-view-cta">Open →</div>
            </div>

            <div class="ov-view-card" onclick="switchView('units')">
              <svg class="ov-view-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <polygon points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5"
                         fill="var(--red)" fill-opacity=".1"
                         stroke="var(--red)" stroke-width="1.4" opacity=".65"/>
                <circle cx="16" cy="16" r="2.5" fill="var(--red)" opacity=".7"/>
                <line x1="16" y1="13.5" x2="16" y2="3"   stroke="var(--red)" stroke-width=".8" opacity=".4"/>
                <line x1="16" y1="18.5" x2="16" y2="29"  stroke="var(--red)" stroke-width=".8" opacity=".4"/>
                <line x1="13.8" y1="14.7" x2="5"  y2="9.5"  stroke="var(--red)" stroke-width=".8" opacity=".4"/>
                <line x1="18.2" y1="14.7" x2="27" y2="9.5"  stroke="var(--red)" stroke-width=".8" opacity=".4"/>
              </svg>
              <div class="ov-view-name">Research Units</div>
              <p class="ov-view-desc">
                Departments and research centers appear as tiles. Select one to
                see which units it collaborates with most, or double-click to
                open its internal network.
              </p>
              <div class="ov-view-cta">Open →</div>
            </div>

          </div>
        </div>

        <div class="ov-footer">
          <p class="ov-footer-note">Data sourced from OpenAlex and ORCID · Last updated April 2026</p>
        </div>

      </div>
    `;
  }

  /* ── Encoding visualizations ─────────────────────────────────────────── */

  function _drawColorVis() {
    const el = document.getElementById('ov-vis-color');
    if (!el) return;

    const nodes = [
      { x: 28, y: 30, r: 7,  color: '#E29191' },  // Eng
      { x: 56, y: 18, r: 6,  color: '#8DAED2' },  // Khoury
      { x: 78, y: 36, r: 8,  color: '#AECF91' },  // Sci
      { x: 46, y: 50, r: 5,  color: '#FFC672' },  // DMSB
      { x: 18, y: 52, r: 6,  color: '#beb5da' },  // CAMD
      { x: 64, y: 54, r: 5,  color: '#ed8355' },  // CSSH
    ];
    const links = [[0,1],[1,2],[0,4],[2,3],[3,4],[1,5],[2,5]];

    const lines = links.map(([a,b]) =>
      `<line x1="${nodes[a].x}" y1="${nodes[a].y}" x2="${nodes[b].x}" y2="${nodes[b].y}"
             stroke="var(--border)" stroke-width="1.2"/>`
    ).join('');
    const circles = nodes.map(n =>
      `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.color}" fill-opacity=".85"/>`
    ).join('');

    el.innerHTML = `<svg width="100" height="72" viewBox="0 0 100 72">${lines}${circles}</svg>`;
  }

  function _drawSizeVis() {
    const el = document.getElementById('ov-vis-size');
    if (!el) return;

    el.innerHTML = `
      <svg width="100" height="72" viewBox="0 0 100 72">
        <text x="50" y="9" text-anchor="middle" font-size="6.5" fill="var(--text3)"
              font-family="DM Sans, sans-serif" font-weight="600" letter-spacing=".06em">H-INDEX</text>
        <circle cx="18" cy="38" r="4"  fill="var(--red)" fill-opacity=".55"/>
        <circle cx="45" cy="36" r="8"  fill="var(--red)" fill-opacity=".68"/>
        <circle cx="80" cy="32" r="14" fill="var(--red)" fill-opacity=".80"/>
        <text x="18" y="57" text-anchor="middle" font-size="6.5" fill="var(--text3)" font-family="DM Sans, sans-serif">low</text>
        <text x="45" y="57" text-anchor="middle" font-size="6.5" fill="var(--text3)" font-family="DM Sans, sans-serif">mid</text>
        <text x="80" y="57" text-anchor="middle" font-size="6.5" fill="var(--text3)" font-family="DM Sans, sans-serif">high</text>
      </svg>
    `;
  }

  function _drawBridgeVis() {
    const el = document.getElementById('ov-vis-bridge');
    if (!el) return;

    el.innerHTML = `
      <svg width="100" height="72" viewBox="0 0 100 72">
        <!-- peripheral nodes -->
        <circle cx="14" cy="16" r="3.5" fill="var(--text3)" fill-opacity=".4"/>
        <circle cx="86" cy="16" r="3.5" fill="var(--text3)" fill-opacity=".4"/>
        <circle cx="14" cy="56" r="3.5" fill="var(--text3)" fill-opacity=".4"/>
        <circle cx="86" cy="56" r="3.5" fill="var(--text3)" fill-opacity=".4"/>
        <!-- edges from bridge node -->
        <line x1="50" y1="36" x2="14" y2="16" stroke="var(--gold)" stroke-width="1" opacity=".4"/>
        <line x1="50" y1="36" x2="86" y2="16" stroke="var(--gold)" stroke-width="1" opacity=".4"/>
        <line x1="50" y1="36" x2="14" y2="56" stroke="var(--gold)" stroke-width="1" opacity=".4"/>
        <line x1="50" y1="36" x2="86" y2="56" stroke="var(--gold)" stroke-width="1" opacity=".4"/>
        <!-- bridge outer ring (top 25% style) -->
        <circle cx="50" cy="36" r="18" stroke="#A4804A" stroke-width="1.2" fill="none" opacity=".35"/>
        <!-- bridge inner ring (top 5% style) -->
        <circle cx="50" cy="36" r="13" stroke="#A4804A" stroke-width="1.4" fill="none" opacity=".55"/>
        <!-- bridge node -->
        <circle cx="50" cy="36" r="7.5" fill="#A4804A" fill-opacity=".88"/>
        <text x="50" y="67" text-anchor="middle" font-size="6.5" fill="var(--gold)"
              font-family="DM Sans, sans-serif" font-weight="600">TOP 5% BRIDGE</text>
      </svg>
    `;
  }

  function _drawEdgeVis() {
    const el = document.getElementById('ov-vis-edge');
    if (!el) return;

    el.innerHTML = `
      <svg width="100" height="72" viewBox="0 0 100 72">
        <!-- thin edge -->
        <circle cx="12" cy="19" r="3.5" fill="var(--red)"  fill-opacity=".65"/>
        <circle cx="55" cy="19" r="3.5" fill="#8DAED2" fill-opacity=".7"/>
        <line x1="15.5" y1="19" x2="51.5" y2="19" stroke="var(--border)" stroke-width="1.2"/>
        <text x="34" y="32" text-anchor="middle" font-size="6.5" fill="var(--text3)"
              font-family="DM Sans, sans-serif">1–2 papers</text>
        <!-- thick edge -->
        <circle cx="12" cy="54" r="3.5" fill="var(--red)"  fill-opacity=".65"/>
        <circle cx="55" cy="54" r="3.5" fill="#8DAED2" fill-opacity=".7"/>
        <line x1="15.5" y1="54" x2="51.5" y2="54" stroke="#b0b8ca" stroke-width="5"/>
        <text x="34" y="66" text-anchor="middle" font-size="6.5" fill="var(--text3)"
              font-family="DM Sans, sans-serif">many papers</text>
        <!-- arrow label -->
        <text x="78" y="36" text-anchor="middle" font-size="6.5" fill="var(--text3)"
              font-family="DM Sans, sans-serif" transform="rotate(90,78,36)">STRENGTH</text>
      </svg>
    `;
  }

  /* ── Back-to-top floating button ────────────────────────────────────── */
  function _initScrollTopBtn(scrollEl) {
    // Reuse or create the shared button
    let btn = document.getElementById('scroll-top-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'scroll-top-btn';
      btn.className = 'scroll-top-btn';
      btn.title = 'Back to top';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="2,9 7,4 12,9"/>
      </svg>`;
      document.body.appendChild(btn);
    }

    btn.onclick = () => { scrollEl.scrollTo({ top: 0, behavior: 'smooth' }); };

    const onScroll = () => {
      btn.classList.toggle('visible', scrollEl.scrollTop > 200);
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Clean up when the container is cleared (view switch)
    const obs = new MutationObserver(() => {
      if (!document.body.contains(scrollEl) || !scrollEl.innerHTML) {
        btn.classList.remove('visible');
        scrollEl.removeEventListener('scroll', onScroll);
        obs.disconnect();
      }
    });
    obs.observe(scrollEl, { childList: true });
  }

  /* ── Scroll-reveal via IntersectionObserver ──────────────────────────── */
  function _initScrollReveal(container) {
    const items = container.querySelectorAll('.ov-reveal');
    if (!items.length || typeof IntersectionObserver === 'undefined') {
      items.forEach(el => el.classList.add('ov-revealed'));
      return;
    }

    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('ov-revealed');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });

    items.forEach(el => obs.observe(el));
  }

  return { render };
})();
