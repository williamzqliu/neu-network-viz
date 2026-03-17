/* core/datastore.js
 * Central data store: color maps, fast lookups, adjacency list, filter state.
 * All modules access data through DS. No rendering logic here.
 *
 * Depends on: utils.js (Logger)
 * Globals consumed: SCHOLARS, EDGES, UNITS, SUMMARY (from data/*.js)
 */

'use strict';

const DS = (() => {

  /* ── Color maps ──────────────────────────────────────────────────────────
   * Used by: all views, left panels, legend, search results
   */
  const COLORS = {
    'Bouve College of Health Sciences': '#3AB18F',
    'College of Arts, Media and Design': '#9486C0',
    'College of Engineering': '#e27c7c',
    'College of Professional Studies': '#E28EBC',
    'College of Science': '#98C26F',
    'College of Social Sciences & Humanities': '#ff996d',
    "D'Amore-McKim School of Business": '#fcc77e',
    'Khoury College of Computer Sciences': '#6D93BE',
    'Mills College at Northeastern': '#6FD8DB',
    'Northeastern University London': '#CACD83',
    'School of Law': '#AD8473',
    'Other': '#9C9FB2',
  };

  /* Used by: legend-box (view1 canvas bottom-left), right panel affil rows */
  const COLLEGE_SHORT = {
    'Bouve College of Health Sciences': 'Bouve',
    'College of Arts, Media and Design': 'CAMD',
    'College of Engineering': 'COE',
    'College of Professional Studies': 'CPS',
    'College of Science': 'COS',
    'College of Social Sciences & Humanities': 'CSSH',
    "D'Amore-McKim School of Business": 'DMSB',
    'Khoury College of Computer Sciences': 'Khoury',
    'Mills College at Northeastern': 'Mills',
    'Northeastern University London': 'NU London',
    'School of Law': 'Law',
    'Other': 'Other',
  };

  /* Used by: view1 node coloring (colorMode = 'track') */
  const TRACK_COLORS = {
    'research_faculty': '#C8102E',
    'research_other': '#A4804A',
    'teaching_clinical': '#1B8FAD',
    'lecturer': '#7B4FBF',
    'admin_only': '#888888',
    'unknown': '#CCCCCC',
  };

  /* ── Fast lookup maps ────────────────────────────────────────────────────
   * Used by: all views and panels that need O(1) scholar/unit lookups
   */
  const scholarMap = new Map(SCHOLARS.map(s => [s.id, s]));
  const unitMap = new Map(UNITS.map(u => [u.unit_id, u]));

  Logger.info('DataStore', `loaded ${scholarMap.size} scholars, ${unitMap.size} units`);

  /* ── Adjacency list ──────────────────────────────────────────────────────
   * Used by: view1 (force layout), view3 (ego network), right_v1 (collaborators)
   * Format: Map<scholarId, Array<{id, weight, years}>>
   */
  const adjacency = new Map();
  EDGES.forEach(e => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    if (!adjacency.has(e.target)) adjacency.set(e.target, []);
    adjacency.get(e.source).push({ id: e.target, weight: e.weight, years: e.years });
    adjacency.get(e.target).push({ id: e.source, weight: e.weight, years: e.years });
  });

  Logger.info('DataStore', `built adjacency list from ${EDGES.length} edges`);

  /* ── Topic index ─────────────────────────────────────────────────────────
   * Used by: search (search.js), right_v1 subfield highlight
   * Format: { topicString: [scholarId, ...] }
   */
  const topicIndex = SUMMARY.topic_index || {};

  /* ── College -> departments map ──────────────────────────────────────────
   * Used by: left_v1 (college tree expand/collapse)
   * Format: Map<collegeUnitId, Unit[]>
   */
  const collegeDepts = new Map();
  UNITS.forEach(u => {
    if (u.unit_type === 'department' && u.parent_unit_id) {
      if (!collegeDepts.has(u.parent_unit_id)) collegeDepts.set(u.parent_unit_id, []);
      collegeDepts.get(u.parent_unit_id).push(u);
    }
  });

  /* ── Application state ───────────────────────────────────────────────────
   * Single source of truth for all filter/display settings.
   * Panels read from state; views rebuild when state changes.
   *
   * Used by: left_v1 (filters), view1 (build/render), view3 (hop depth),
   *          search (visibleIds check), panels.js (subview routing)
   */
  const state = {
    // --- Active view routing ---
    view: 'v1',          // 'v1' | 'v2' | 'v3'
    subview: 'collabmap',   // v1: 'collabmap'|'clusters'  v2: 'dept'|'center'|'compare'  v3: 'ego'|'collabmap'

    // --- Scholar filters (v1) ---
    yearFrom: 1990,
    yearTo: 2026,
    threshold: 1,
    statusFilter: 'current',     // 'all' | 'current' | 'no_retired' | 'former'
    trackFilter: 'all',         // 'all' | 'research_faculty' | 'research_other' | 'teaching_clinical'
    hiddenUnits: new Set(),     // unit_ids currently hidden by left panel filter

    // --- Display settings (v1) ---
    colorMode: 'college',     // 'college' | 'track' | 'community' | 'bridge'
    showLabels: true,
    showIsolated: false,
    frozen: false,

    // --- Selection state ---
    selectedId: null,          // currently selected scholar id (used by v1, v3)
    visibleIds: new Set(),     // scholars currently rendered in v1 canvas

    // --- Topic / highlight state ---
    topicHighlight: null,          // Set<scholarId> | null - topic-based highlight
    topicConnected: null,          // Set<scholarId> | null - connected scholars in topic mode
    showEdgeClick: false,         // enable edge click highlight

    // --- V3 state ---
    egoHops: 1,             // 1 | 2
    v3SourceView: 'v1',          // which view launched v3 (for back-navigation)
  };

  /* ── Color helpers ───────────────────────────────────────────────────────
   * Used by: every view and panel that renders scholar/unit colors
   */
  function getColor(college) {
    return COLORS[college] || '#999';
  }

  function getShortName(college) {
    return COLLEGE_SHORT[college]
      || (college || '').replace('College of ', '').replace(' College', '');
  }

  function nodeColor(s) {
    switch (state.colorMode) {
      case 'college':
        return getColor(s.college);
      case 'track':
        return TRACK_COLORS[s.track] || '#999';
      case 'community': {
        const cid = s.community_id;
        if (!cid) return '#aaaaaa';
        const h = (parseInt(cid) * 2654435761 >>> 0) % 360;
        return `hsl(${h},52%,50%)`;
      }
      case 'bridge': {
        const bs = s.bridge_score || 0;
        const t = Math.min(1, bs * 25);
        return `rgb(${Math.round(30 + t * 170)},${Math.round(100 - t * 80)},${Math.round(200 - t * 170)})`;
      }
      default:
        return getColor(s.college);
    }
  }

  /* ── Data filters ────────────────────────────────────────────────────────
   * Used by: view1.build(), view_cluster
   */
  function getFilteredScholars() {
    return SCHOLARS.filter(s => {
      if (state.statusFilter === 'current' && s.status !== 'current') return false;
      if (state.statusFilter === 'no_retired' && s.status === 'retired') return false;
      if (state.statusFilter === 'former' && s.status !== 'former') return false;
      if (state.trackFilter !== 'all' && s.track !== state.trackFilter) return false;
      if (state.hiddenUnits.size > 0) {
        const mainId = s.main_affil_id;
        if (mainId && state.hiddenUnits.has(mainId)) return false;
      }
      return true;
    });
  }

  function getFilteredEdges(scholarSet) {
    return EDGES.filter(e => {
      if (!scholarSet.has(e.source) || !scholarSet.has(e.target)) return false;
      if ((e.weight || 0) < state.threshold) return false;
      if (!e.years || e.years.length === 0) return true;
      return e.years.some(y => y >= state.yearFrom && y <= state.yearTo);
    });
  }

  /* ── Search ──────────────────────────────────────────────────────────────
   * Used by: search/search.js
   */
  function search(query, limit = 12) {
    const q = query.trim().toLowerCase();
    if (!q) return { scholars: [], topics: [] };
    const scholars = SCHOLARS.filter(s => s.name.toLowerCase().includes(q)).slice(0, limit);
    const topics = [];
    for (const [topic, ids] of Object.entries(topicIndex)) {
      if (topic.includes(q)) {
        topics.push({ topic, ids });
        if (topics.length >= 5) break;
      }
    }
    return { scholars, topics };
  }

  function getCollegeForUnit(unitName) {
    for (const u of UNITS) {
      if (u.unit_name === unitName) {
        if (u.unit_type === 'college') return u.unit_name;
        if (u.parent_unit_id) {
          const parent = unitMap.get(u.parent_unit_id);
          if (parent) return parent.unit_name;
        }
        return null;
      }
    }
    return null;
  }

  return {
    COLORS, COLLEGE_SHORT, TRACK_COLORS,
    scholarMap, unitMap, adjacency, topicIndex, collegeDepts,
    state,
    getColor, getShortName, nodeColor, getCollegeForUnit,
    getFilteredScholars, getFilteredEdges,
    search,
  };
})();