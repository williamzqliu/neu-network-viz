/* search/search.js
 * Header search bar: scholar lookup and topic highlight.
 * Consolidated from v5 search.js + ui.js search logic.
 *
 * Depends on: utils.js, datastore.js
 * Called by: main.js (Search.init on DOMContentLoaded)
 * Calls: View1.selectById(), View1.highlightTopic(), View1.clearTopicHighlight(),
 *        View3.build(), LeftV3.showEgoProfile(), Panels.showScholarCard(), switchView()
 * Module name for Logger: 'Search'
 *
 * DOM targets:
 *   #hd-search          - text input
 *   #hd-search-clear    - clear button (x)
 *   #search-overlay     - dropdown container
 *   #search-results     - results list inside overlay
 *   #search-hint        - hint / error message inside overlay
 *
 * Public methods:
 *   Search.init()
 *   Search.selectScholar(id)
 *   Search.selectTopic(topic, ids)
 *   Search.showHint(msg)
 */

'use strict';

const Search = (() => {

  /* ── init ────────────────────────────────────────────────────────────── */
  function init() {
    const input = getEl('hd-search', 'Search');
    const overlay = getEl('search-overlay', 'Search');
    const clearBtn = getEl('hd-search-clear', 'Search');

    if (!input || !overlay) {
      Logger.error('Search', 'required DOM elements not found');
      return;
    }

    // Input handler
    input.addEventListener('input', function () {
      const q = this.value.trim();
      if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
      if (!q) { overlay.style.display = 'none'; return; }

      const { scholars, topics } = DS.search(q, 8);
      _renderResults(scholars, topics);
      overlay.style.display = (scholars.length || topics.length) ? 'block' : 'none';
    });

    // Keyboard: Escape closes overlay
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') clearSearch();
    });

    // Clear button
    if (clearBtn) {
      onTap(clearBtn, () => clearSearch());
    }

    // Click outside closes overlay
    document.addEventListener('click', e => {
      if (!e.target.closest('#hd-search-wrap') && !e.target.closest('#search-overlay')) {
        overlay.style.display = 'none';
      }
    });

    Logger.info('Search', 'initialized');
  }

  /* ── render results ──────────────────────────────────────────────────── */
  function _renderResults(scholars, topics) {
    const resultsList = getEl('search-results', 'Search');
    const hint = getEl('search-hint', 'Search');
    if (!resultsList) return;

    let html = '';

    if (topics.length) {
      html += `<div class="sr-group-label">Research Topics</div>`;
      html += topics.map(t => {
        const label = t.topic.charAt(0).toUpperCase() + t.topic.slice(1);
        return `<div class="sr-item" data-topic="${t.topic.replace(/"/g, '&quot;')}"
          data-ids="${JSON.stringify(t.ids).replace(/"/g, '&quot;')}">
          <span class="sr-dot sr-dot-topic"></span>
          <span class="sr-name">${label}</span>
          <span class="sr-badge">${t.ids.length} scholars</span>
        </div>`;
      }).join('');
    }

    if (scholars.length) {
      html += `<div class="sr-group-label">Scholars</div>`;
      html += scholars.map(s => {
        const col = DS.getColor(s.college);
        // const vis = DS.state.visibleIds.has(s.id); // hidden tag disabled per user testing
        return `<div class="sr-item" data-id="${s.id}">
  <div class="sr-dot" style="background:${col}"></div>
  <span class="sr-name">${s.name}</span>
  <!-- ${DS.state.visibleIds.has(s.id) ? '' : '<span class="sr-hidden-tag">hidden</span>'} -->
  <span class="sr-college">${DS.getShortName(s.college)}</span>
</div>`;
      }).join('');
    }

    resultsList.innerHTML = html;
    if (hint) hint.style.display = 'none';

    // Bind touch-safe taps on result items
    resultsList.querySelectorAll('.sr-item[data-id]').forEach(item => {
      onTap(item, () => selectScholar(item.dataset.id));
    });
    resultsList.querySelectorAll('.sr-item[data-topic]').forEach(item => {
      onTap(item, () => {
        let ids;
        try { ids = JSON.parse(item.dataset.ids); } catch (e) { ids = []; }
        selectTopic(item.dataset.topic, ids);
      });
    });
  }

  /* ── selectScholar ───────────────────────────────────────────────────── */
  function selectScholar(id) {
    const s = DS.scholarMap.get(id);
    const inputEl = getEl('hd-search', 'Search');
    const overlayEl = getEl('search-overlay', 'Search');

    if (inputEl) inputEl.value = s?.name || '';
    if (overlayEl) overlayEl.style.display = 'none';

    const view = DS.state.view;
    Logger.info('Search', `selectScholar id=${id} view=${view}`);

    // Auto-enable filters if scholar is hidden under current filter
    if (!DS.state.visibleIds.has(id)) {
      const sf = DS.state.statusFilter;
      const tf = DS.state.trackFilter;
      if (!sf.has(s.status)) sf.add(s.status);
      if (s.track && !tf.has(s.track)) tf.add(s.track);
      // Sync left panel button states
      document.querySelectorAll('[data-sf]').forEach(b => b.classList.toggle('active', sf.has(b.dataset.sf)));
      document.querySelectorAll('[data-tf]').forEach(b => b.classList.toggle('active', tf.has(b.dataset.tf)));
      // Enable showIsolated — scholar may have no connections under current filter
      DS.state.showIsolated = true;
      const isoBtn = document.getElementById('lv1-btn-isolated');
      if (isoBtn) isoBtn.classList.add('active');
      View1.build && View1.build();
    }

    // Also enable Unlinked if scholar is visible but isolated (no connections in current view)
    if (DS.state.visibleIds.has(id) && !DS.state.showIsolated) {
      const visNbrs = (DS.adjacency.get(id) || []).filter(x => DS.state.visibleIds.has(x.id));
      if (visNbrs.length === 0) {
        DS.state.showIsolated = true;
        const isoBtn = document.getElementById('lv1-btn-isolated');
        if (isoBtn) isoBtn.classList.add('active');
        View1.build && View1.build();
      }
    }

    if (view !== 'collab') switchView('collab');

    DS.state.selectedId = id;
    View1.selectById && View1.selectById(id);
  }

  /* ── selectTopic ─────────────────────────────────────────────────────── */
  function selectTopic(topic, ids) {
    const inputEl = getEl('hd-search', 'Search');
    const overlayEl = getEl('search-overlay', 'Search');

    if (inputEl) inputEl.value = topic.charAt(0).toUpperCase() + topic.slice(1);
    if (overlayEl) overlayEl.style.display = 'none';

    // Close right panel when switching to topic highlight mode
    if (typeof hideRightPanel === 'function') hideRightPanel();

    Logger.info('Search', `selectTopic topic="${topic}" ids=${ids.length}`);

    // Topic highlight only makes sense on the collaboration map
    if (DS.state.view !== 'collab') switchView('collab');

    // Auto-enable filters so all topic scholars become visible
    const hiddenIds = ids.filter(id => !DS.state.visibleIds.has(id));
    let needBuild = false;
    if (hiddenIds.length) {
      const sf = DS.state.statusFilter;
      const tf = DS.state.trackFilter;
      hiddenIds.forEach(id => {
        const s = DS.scholarMap.get(id);
        if (!s) return;
        if (!sf.has(s.status)) { sf.add(s.status); needBuild = true; }
        if (s.track && !tf.has(s.track)) { tf.add(s.track); needBuild = true; }
      });
      // Sync left panel button states
      document.querySelectorAll('[data-sf]').forEach(b => b.classList.toggle('active', sf.has(b.dataset.sf)));
      document.querySelectorAll('[data-tf]').forEach(b => b.classList.toggle('active', tf.has(b.dataset.tf)));
    }

    // Enable Unlinked if any result scholar is isolated (visible but no connections),
    // OR if there are hidden ids that may become isolated after filter changes —
    // must be set before build() so all nodes are visible before camera adjusts.
    if (!DS.state.showIsolated) {
      const hasIsolated = hiddenIds.length > 0 || ids.some(id => {
        if (!DS.state.visibleIds.has(id)) return false;
        return (DS.adjacency.get(id) || []).filter(x => DS.state.visibleIds.has(x.id)).length === 0;
      });
      if (hasIsolated) {
        DS.state.showIsolated = true;
        const isoBtn = document.getElementById('lv1-btn-isolated');
        if (isoBtn) isoBtn.classList.add('active');
        needBuild = true;
      }
    }

    if (needBuild) View1.build && View1.build();
    View1.highlightTopic && View1.highlightTopic(ids, topic);
  }

  /* ── showHint ────────────────────────────────────────────────────────── */
  function showHint(msg) {
    const overlayEl = getEl('search-overlay', 'Search');
    const hintEl = getEl('search-hint', 'Search');
    const resultsEl = getEl('search-results', 'Search');

    if (hintEl) hintEl.textContent = msg;
    if (hintEl) hintEl.style.display = 'block';
    if (overlayEl) overlayEl.style.display = 'block';
    if (resultsEl) resultsEl.innerHTML = '';

    clearTimeout(showHint._timer);
    showHint._timer = setTimeout(() => {
      if (hintEl) hintEl.style.display = 'none';
      if (overlayEl) overlayEl.style.display = 'none';
    }, 4000);
  }

  return { init, selectScholar, selectTopic, showHint };
})();

/* ── clearSearch: global function bound to clear button + Escape ─────────── */
function clearSearch() {
  const inputEl = document.getElementById('hd-search');
  const overlayEl = document.getElementById('search-overlay');
  const clearBtn = document.getElementById('hd-search-clear');

  if (inputEl) inputEl.value = '';
  if (overlayEl) overlayEl.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';

  View1.clearTopicHighlight && View1.clearTopicHighlight();
  DS.state.topicHighlight = null;
}
