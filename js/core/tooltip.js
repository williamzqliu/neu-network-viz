const INFO_ICON_SVG = `<svg viewBox="0 0 14 14" width="100%" height="100%" style="display:block">
  <circle cx="7" cy="7" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <path d="M5.5 5.2C5.5 4.3 6.1 3.7 7 3.7s1.5.6 1.5 1.4c0 .7-.4 1.1-1 1.5C7 6.9 6.8 7.2 6.8 7.7" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/>
  <circle cx="6.85" cy="9.5" r="0.75" fill="currentColor"/>
</svg>`;

function _refreshInfoIcons(root) {
    (root || document).querySelectorAll('.info-icon').forEach(el => {
        if (el.dataset.iconified) return;
        el.innerHTML = INFO_ICON_SVG;
        el.dataset.iconified = '1';
    });
}

const Tooltip = (() => {
    const GAP = 10; // px between element and tooltip

    function _el() { return document.getElementById('tooltip'); }

    function _calcMaxWidth(text) {
        // aim for roughly square: width ≈ sqrt(charCount * charArea)
        const chars = text.replace(/<[^>]+>/g, '').length;
        return Math.max(60, Math.min(210, Math.ceil(Math.sqrt(chars) * 24)));
    }

    function _position(tt, anchorRect) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        tt.style.maxWidth = _calcMaxWidth(tt.textContent) + 'px';

        // reset to measure natural size
        tt.style.left = '0px';
        tt.style.top = '0px';
        tt.style.transform = '';
        const tw = tt.offsetWidth;
        const th = tt.offsetHeight;

        // prefer above, fallback below
        let top = anchorRect.top - th - GAP;
        if (top < 4) top = anchorRect.bottom + GAP;

        // center horizontally on anchor, clamp to viewport
        let left = anchorRect.left + anchorRect.width / 2 - tw / 2;
        left = Math.max(6, Math.min(left, vw - tw - 6));
        top = Math.max(6, Math.min(top, vh - th - 6));

        tt.style.left = left + 'px';
        tt.style.top = top + 'px';
    }

    // ── data-tip delegation ───────────────────────────────────────────────────
    document.addEventListener('mouseover', e => {
        const el = e.target.closest('[data-tip]');
        if (!el) return;
        const tt = _el(); if (!tt) return;
        tt.innerHTML = el.dataset.tip;
        tt.classList.add('visible');
        _position(tt, el.getBoundingClientRect());
    });

    document.addEventListener('mouseout', e => {
        const el = e.target.closest('[data-tip]');
        if (!el) return;

        if (!el.contains(e.relatedTarget)) hide();
    });

    // ── public API for canvas/dynamic tooltips ────────────────────────────────
    function show(ev, html) {
        const tt = _el(); if (!tt) return;
        tt.innerHTML = html;
        tt.classList.add('visible');
        const fakeRect = { top: ev.clientY, bottom: ev.clientY, left: ev.clientX, width: 0 };
        _position(tt, fakeRect);
    }

    function move(ev) {
        const tt = _el(); if (!tt) return;
        const fakeRect = { top: ev.clientY, bottom: ev.clientY, left: ev.clientX, width: 0 };
        _position(tt, fakeRect);
    }

    function hide() {
        _el()?.classList.remove('visible');
    }

    const _observer = new MutationObserver(() => _refreshInfoIcons(document));
    _observer.observe(document.body, { childList: true, subtree: true });

    return { show, move, hide };
})();