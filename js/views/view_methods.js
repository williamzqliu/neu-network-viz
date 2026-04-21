/* views/view_methods.js
 * Methods view — data provenance, analytical choices, and design rationale.
 *
 * Sections:
 *   01  Data Sources
 *   02  Scholar Scope
 *   03  Bridge Score (formula + tier table)
 *   04  Visual Encoding Decisions
 *
 * Depends on: utils.js
 * Called by: main.js (switchView → 'methods')
 * Module name for Logger: 'ViewMethods'
 *
 * Public methods:
 *   ViewMethods.render(container)
 */

'use strict';

const ViewMethods = (() => {

  /* ── render ──────────────────────────────────────────────────────────── */
  function render(container) {
    Logger.info('ViewMethods', 'render');
    container.innerHTML = _buildHTML();
    requestAnimationFrame(() => {
      _drawTierVis();
      _initScrollTopBtn(container);
    });
  }

  /* ── HTML ────────────────────────────────────────────────────────────── */
  function _buildHTML() {
    return `
      <div class="mth-wrap">
        <div class="mth-inner">

          <!-- Header -->
          <div class="mth-header">
            <p class="ov-label">METHODS</p>
            <h1 class="mth-title">How This Tool Was Built</h1>
            <p class="mth-subtitle">
              This page documents the data collection process, analytical decisions,
              and visual encoding choices that underpin the Research Collaboration Network.
            </p>
          </div>

          <!-- ── 01 Data Sources ── -->
          <section class="mth-section">
            <div class="mth-sec-head">
              <span class="mth-sec-num">01</span>
              <h2 class="mth-sec-title">Data Sources</h2>
            </div>
            <div class="mth-sec-body">
              <p class="mth-text">
                Scholar and publication data were collected from two open sources.
                <b>OpenAlex</b> provided co-authorship records, publication counts,
                research topic classifications, and h-index estimates.
                <b>ORCID</b> provided institutional affiliation records used to
                confirm Northeastern University membership.
              </p>
              <p class="mth-text">
                The dataset covers publications from 1990 through 2025, restricted to works
                with at least one Northeastern-affiliated author. Co-authorship edges are
                drawn exclusively between scholars who both appear in the Northeastern roster —
                this is an <em>intra-university</em> network, not a full academic graph.
              </p>
              <div class="mth-chip-row">
                <div class="mth-chip">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="var(--text3)" stroke-width="1.2"/>
                    <line x1="7" y1="3" x2="7" y2="11" stroke="var(--text3)" stroke-width="1"/>
                    <line x1="3" y1="7" x2="11" y2="7" stroke="var(--text3)" stroke-width="1"/>
                  </svg>
                  OpenAlex
                </div>
                <div class="mth-chip">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="var(--text3)" stroke-width="1.2"/>
                    <line x1="7" y1="3" x2="7" y2="11" stroke="var(--text3)" stroke-width="1"/>
                    <line x1="3" y1="7" x2="11" y2="7" stroke="var(--text3)" stroke-width="1"/>
                  </svg>
                  ORCID
                </div>
              </div>
            </div>
          </section>

          <!-- ── 02 Scholar Scope ── -->
          <section class="mth-section">
            <div class="mth-sec-head">
              <span class="mth-sec-num">02</span>
              <h2 class="mth-sec-title">Scholar Scope</h2>
            </div>
            <div class="mth-sec-body">
              <p class="mth-text">
                The network includes faculty and researchers with a formal Northeastern
                affiliation who appear in OpenAlex with at least one publication.
                Scholars with no co-authorship record <em>within the university</em> are
                shown as isolated nodes in the Collaboration Map — they are present in the
                institutional roster but have no edges in this dataset.
              </p>
              <p class="mth-text">
                Appointment tracks (tenure-line, professional, research) are derived from
                institutional data. Status ("current" vs. "former") reflects whether the
                scholar's primary affiliation was active at the time of data collection.
                The year filter in the left panel restricts edges to pairs that co-authored
                at least once within the selected year window.
              </p>
            </div>
          </section>

          <!-- ── 03 Bridge Score ── -->
          <section class="mth-section mth-section--highlight">
            <div class="mth-sec-head">
              <span class="mth-sec-num">03</span>
              <h2 class="mth-sec-title">Bridge Score</h2>
            </div>
            <div class="mth-sec-body">
              <p class="mth-text">
                The gold-ring encoding marks scholars who connect departments and colleges.
                The visual is driven by a per-scholar metric called the <b>bridge score</b>,
                which measures how much of a scholar's collaboration activity crosses
                departmental boundaries, weighted by the breadth of their overall collaboration base.
              </p>

              <div class="mth-formula-block">
                <div class="mth-formula-label">FORMULA</div>
                <div class="mth-formula-eq">
                  Bridge Score
                  <span class="mth-eq-op">=</span>
                  <span class="mth-frac">
                    <span class="mth-frac-n">cross-department partners</span>
                    <span class="mth-frac-bar"></span>
                    <span class="mth-frac-d">total partners</span>
                  </span>
                  <span class="mth-eq-op">×</span>
                  <span class="mth-eq-log">log<sub>10</sub>(total partners)</span>
                </div>
                <div class="mth-formula-decomp">
                  <div class="mth-decomp-item">
                    <div class="mth-decomp-label">Proportion component</div>
                    <div class="mth-decomp-desc">
                      Whether collaborations stay within one department or span across departmental lines
                    </div>
                  </div>
                  <div class="mth-decomp-x">×</div>
                  <div class="mth-decomp-item">
                    <div class="mth-decomp-label">Breadth component</div>
                    <div class="mth-decomp-desc">
                      Whether the scholar collaborates broadly or narrowly
                      (log-transformed to compress right skew)
                    </div>
                  </div>
                </div>
              </div>

              <p class="mth-text">
                The two components were combined intentionally. The proportion of
                cross-department partners captures whether a scholar's collaborations stay
                within their own department or extend across departmental lines. The
                log-transformed count of total partners captures whether the scholar
                collaborates broadly or narrowly.
              </p>
              <p class="mth-text">
                Either component alone would produce misleading rankings. A scholar with
                one cross-department tie and no other collaborations would score&nbsp;1.0
                on the proportion component but is not meaningfully bridging anything.
                A highly connected scholar who collaborates only within a single department
                would score high on the breadth component but would not be a bridge in any
                structural sense. Combining the two ensures that bridge scholars are both
                <em>structurally positioned</em> between communities and
                <em>actively collaborating</em> across departmental lines.
              </p>
              <p class="mth-text">
                Bridge score percentile thresholds are pre-computed across all networked
                scholars. Scholars in the <b>top&nbsp;25%</b> receive the gold outermost ring.
                The specific tier (top 1%, 3%, 5%, 10%, or 25%) is shown in the Scholar
                Profile panel. Thresholds are derived from the actual distribution of bridge
                scores in the dataset rather than from absolute cutoffs, which keeps the
                encoding meaningful as the dataset changes.
              </p>

              <div class="mth-tier-block">
                <div class="mth-tier-label-row">BRIDGE TIERS</div>
                <div class="mth-tier-grid" id="mth-tier-grid">
                  <!-- drawn by _drawTierVis() -->
                </div>
              </div>

            </div>
          </section>

          <!-- ── 04 Visual Encoding Decisions ── -->
          <section class="mth-section">
            <div class="mth-sec-head">
              <span class="mth-sec-num">04</span>
              <h2 class="mth-sec-title">Visual Encoding Decisions</h2>
            </div>
            <div class="mth-sec-body">

              <div class="mth-enc-row">
                <div class="mth-enc-label">Node color</div>
                <div class="mth-enc-text">
                  Encodes college affiliation using a categorical palette. Colors are
                  derived from Northeastern's school identity colors where available,
                  extended with accessible distinguishable hues for units without
                  established color identities.
                </div>
              </div>

              <div class="mth-enc-row">
                <div class="mth-enc-label">Node size</div>
                <div class="mth-enc-text">
                  Encodes the h-index on a square-root scale (range: 3–14&nbsp;px radius).
                  The square-root compression ensures that highly cited scholars are visually
                  prominent without making small-h-index nodes invisible. Scholars
                  without an OpenAlex h-index record are rendered at minimum size.
                </div>
              </div>

              <div class="mth-enc-row">
                <div class="mth-enc-label">Edge thickness</div>
                <div class="mth-enc-text">
                  Encodes co-authorship weight (number of jointly authored works)
                  on a square-root scale. Edges below the minimum threshold set in the
                  left panel are hidden. This threshold prevents visual clutter from
                  sparse, single-paper connections while preserving denser ties.
                </div>
              </div>

              <div class="mth-enc-row">
                <div class="mth-enc-label">Force layout</div>
                <div class="mth-enc-text">
                  The Collaboration Map uses D3's force-directed simulation with charge
                  repulsion, link attraction, and collision detection. Scholars from the
                  same college tend to cluster spatially because shared edges pull them
                  together, but the layout is not deterministic — spatial proximity does
                  not encode affiliation directly.
                </div>
              </div>

            </div>
          </section>

          <!-- Footer -->
          <div class="mth-footer">
            <p class="mth-footer-note">Data sourced from OpenAlex and ORCID · Last updated April 2026</p>
            <button class="mth-footer-btn" onclick="switchView('collab')">Open Collaboration Map →</button>
          </div>

        </div>
      </div>
    `;
  }

  /* ── Back-to-top floating button ────────────────────────────────────── */
  function _initScrollTopBtn(scrollEl) {
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

    const obs = new MutationObserver(() => {
      if (!document.body.contains(scrollEl) || !scrollEl.innerHTML) {
        btn.classList.remove('visible');
        scrollEl.removeEventListener('scroll', onScroll);
        obs.disconnect();
      }
    });
    obs.observe(scrollEl, { childList: true });
  }

  /* ── Bridge tier visualization ───────────────────────────────────────── */
  function _drawTierVis() {
    const grid = document.getElementById('mth-tier-grid');
    if (!grid) return;

    const tiers = [
      { pct: 1,  label: 'Top 1%',  desc: 'Elite cross-unit connectors',
        r: 10, haloR: 8.5, haloW: 2.0, haloA: 0.75 },
      { pct: 3,  label: 'Top 3%',  desc: 'Strong cross-unit connectors',
        r: 10, haloR: 7.0, haloW: 1.8, haloA: 0.60 },
      { pct: 5,  label: 'Top 5%',  desc: 'Active cross-unit collaborators',
        r: 10, haloR: 5.5, haloW: 1.2, haloA: 0.45 },
      { pct: 25, label: 'Top 25%', desc: 'Moderate cross-unit collaborators',
        r: 10, haloR: 4.0, haloW: 0.9, haloA: 0.30 },
    ];

    grid.innerHTML = tiers.map(t => {
      const cx = 28, cy = 28;
      const svgSize = 56;
      const haloCircle = `<circle cx="${cx}" cy="${cy}" r="${t.r + t.haloR}"
        stroke="#A4804A" stroke-width="${t.haloW}" fill="none" opacity="${t.haloA}"/>`;
      const nodeCircle = `<circle cx="${cx}" cy="${cy}" r="${t.r}"
        fill="#A4804A" fill-opacity=".78"/>`;

      return `
        <div class="mth-tier-row">
          <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">
            ${haloCircle}${nodeCircle}
          </svg>
          <div class="mth-tier-text">
            <div class="mth-tier-name">${t.label}</div>
            <div class="mth-tier-desc">${t.desc}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  return { render };
})();
