/* Explainer strips: a small animated "how this page works" strip under the title of every student page.
   SC.explain.mount(root, pageId) is called by the shell for each page; it returns a cleanup function. A page without content gets nothing.
   Content (plain data, English and Greek) lives in /site/explain/<group>.js as SC.EXPLAIN[pageId] = { lead, steps: [{ scene, h, s, c? }] };
   the pictures are in /site/explain/scenes.js (SC.EXPLAIN_SCENES, text-free SVG) and scenes.css. Groups are loaded when first needed.
   First visit to a page: the strip is open. After that it folds to one slim bar ("Watch how it works"), remembered per page in this browser.
   Steps advance by themselves (a CSS progress bar drives the timing, so pause, hover and a hidden tab all work); with reduced motion
   nothing moves by itself and the cards are the controls. On a phone the cards are a swipe strip. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const GROUP = {
    home: 'today', board: 'today', city3d: 'today', alerts: 'today',
    layers: 'record', weather: 'record', explore: 'record', library: 'record',
    join: 'schools', schools: 'schools', districts: 'schools', guides: 'schools',
    council: 'think', mirror: 'think', whatif: 'think', reports: 'think',
    map: 'field', vehicles: 'field', trip: 'field', desk: 'field', projects: 'field', start: 'field',
    research: 'sources', archive: 'sources', feeds: 'sources', helpers: 'sources', warnings: 'sources', submitted: 'sources',
    studio: 'studio',
  };
  const BUILD = '1', KEY = 'sc.explain.v1:', STEP_MS = 5600;
  const t = (p) => SC.t(p[0], p[1]);
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src + '?v=' + BUILD; s.onload = resolve; s.onerror = () => { s.remove(); delete loaded[src]; reject(new Error('Could not load ' + src)); };
      document.head.append(s);
    });
    return loaded[src];
  }
  function loadFor(id) {
    SC.css('/site/explain.css'); SC.css('/site/explain/scenes.css');
    return Promise.all([loadScript('/site/explain/scenes.js').catch(() => null), loadScript('/site/explain/' + GROUP[id] + '.js')]);   // the pictures are optional, the words are not
  }

  const ICON = {
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
  };
  function ic(name) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: name === 'play' ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
    s.innerHTML = ICON[name];   // static strings only
    return s;
  }

  function build(id, def, state) {
    const el = SC.el, steps = def.steps, N = steps.length;
    const scenes = SC.EXPLAIN_SCENES || {};
    let cur = 0, paused = reduced(), off = false;
    const lead = t(def.lead);

    const items = steps.map((st, i) => {
      const scene = el('span', { class: 'ex-scene', 'aria-hidden': 'true' });
      if (scenes[st.scene]) scene.innerHTML = scenes[st.scene];   // our own static markup
      const num = el('span', { class: 'ex-n' }, el('span', { class: 'ex-nn' }, String(i + 1)), el('span', { class: 'ex-nc' }, ic('check')));
      const card = el('button', { class: 'ex-card', type: 'button', onclick: () => { paused = true; go(i, true); sync(); } },
        num, el('span', { class: 'ex-box' }, scene, el('b', null, t(st.h)), el('small', null, t(st.s))));
      return el('li', { class: 'ex-s' }, card);
    });
    const list = el('ol', { class: 'ex-steps', style: { '--n': String(N) } }, el('li', { class: 'ex-line', 'aria-hidden': 'true' }, el('i')), items);
    const dots = el('div', { class: 'ex-dots', 'aria-hidden': 'true' }, steps.map(() => el('i')));
    // folded: the step names as a quick overview; pressing one opens the strip at that step
    const mini = el('ol', { class: 'ex-mini' }, steps.map((st, i) => el('li', null, el('button', { class: 'ex-mi', type: 'button', onclick: () => { paused = true; setView('open', i); } }, el('i', null, String(i + 1)), t(st.h)))));
    const bar = el('span', { class: 'ex-bar', 'aria-hidden': 'true' }, el('i'));
    const ctext = el('span', { class: 'ex-ct' });
    const pp = el('button', { class: 'ex-pp', type: 'button', onclick: () => { paused = !paused; sync(); } });
    const hide = el('button', { class: 'ex-hide', type: 'button', onclick: () => setView('slim') }, SC.t('Fold up', 'Μάζεμα'), ic('chev'));
    const show = el('button', { class: 'ex-show', type: 'button', 'aria-expanded': 'false', onclick: () => setView('open') }, ic('play'), SC.t('Watch how it works', 'Δες πώς δουλεύει'));
    const full = el('div', { class: 'ex-full' },
      el('p', { class: 'sr-only' }, lead),
      list, dots,
      el('div', { class: 'ex-cap' }, pp, ctext, bar, hide));
    const slim = el('div', { class: 'ex-slim' }, show, mini);
    const root = el('section', { class: 'ex', 'aria-label': SC.t('How this page works', 'Πώς λειτουργεί αυτή η σελίδα'), 'data-ex': id }, full, slim);

    function setView(v, at) {
      state.view = v;
      try { SC.store.set(KEY + id, v); } catch (e) { /* no storage */ }
      sync();
      if (v === 'open') { go(at || 0, true); const b = items[0].querySelector('button'); if (b && document.activeElement === show) b.focus({ preventScroll: true }); }
      else if (document.activeElement && full.contains(document.activeElement)) show.focus({ preventScroll: true });
    }
    function go(i, user) {
      cur = ((i % N) + N) % N;
      items.forEach((li, k) => {
        li.classList.toggle('on', k === cur); li.classList.toggle('done', k < cur);
        const b = li.firstChild; b.setAttribute('aria-current', k === cur ? 'step' : 'false');
        b.setAttribute('aria-label', SC.t('Step ' + (k + 1) + ' of ' + N + ': ', 'Βήμα ' + (k + 1) + ' από ' + N + ': ') + t(steps[k].h));
      });
      list.style.setProperty('--i', String(cur));
      Array.from(dots.children).forEach((d, k) => d.classList.toggle('on', k === cur));
      const st = steps[cur];
      ctext.replaceChildren(el('b', null, SC.t('Step ' + (cur + 1) + ' of ' + N + '. ', 'Βήμα ' + (cur + 1) + ' από ' + N + '. ')), t(st.c || st.s));
      // phones: keep the active card in view inside the swipe strip (never scroll the page)
      if (list.scrollWidth > list.clientWidth + 4) {
        const li = items[cur];
        try { list.scrollTo({ left: li.offsetLeft - (list.clientWidth - li.clientWidth) / 2, behavior: user && !reduced() ? 'smooth' : 'auto' }); } catch (e) { list.scrollLeft = li.offsetLeft - (list.clientWidth - li.clientWidth) / 2; }
      }
      // restart the progress bar for the new step
      const fill = bar.firstChild; fill.style.animation = 'none'; void fill.offsetWidth; fill.style.animation = '';
    }
    function sync() {
      root.classList.toggle('ex--slim', state.view === 'slim');
      root.classList.toggle('ex--paused', paused || off);
      root.classList.toggle('ex--still', reduced());
      show.setAttribute('aria-expanded', state.view === 'open' ? 'true' : 'false');
      full.hidden = state.view === 'slim'; slim.hidden = state.view !== 'slim';
      pp.replaceChildren(ic(paused ? 'play' : 'pause'));
      pp.setAttribute('aria-label', paused ? SC.t('Play the steps', 'Αναπαραγωγή των βημάτων') : SC.t('Pause the steps', 'Παύση των βημάτων'));
      pp.hidden = reduced();
    }
    // the progress bar finishing moves to the next step (pause, hover and a hidden tab all stop the animation, so they stop this too)
    bar.firstChild.addEventListener('animationend', () => { if (!paused && !off) { go(cur + 1, false); } });
    root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') root.classList.add('ex--hover'); });
    root.addEventListener('pointerleave', () => root.classList.remove('ex--hover'));
    root.addEventListener('focusin', () => root.classList.add('ex--hover'));
    root.addEventListener('focusout', () => root.classList.remove('ex--hover'));
    list.addEventListener('touchstart', () => { paused = true; sync(); }, { passive: true });   // a swipe means the student is steering
    root.style.setProperty('--ms', STEP_MS + 'ms');
    go(0, false); sync();
    return { root, setOff: (v) => { off = v; sync(); } };
  }

  SC.explain = {
    mount(page, id) {
      if (!Object.hasOwn(GROUP, id)) return null;
      let dead = false, obs = null, io = null, strip = null;
      const place = () => {
        if (dead || !strip) return;
        const head = page.querySelector('.sc-head') || page.querySelector('.page-head');   // the page title block, wherever the page keeps it
        if (head) { if (strip.previousElementSibling !== head) head.after(strip); } else if (page.firstElementChild !== strip) page.prepend(strip);
      };
      loadFor(id).then(() => {
        const def = SC.EXPLAIN && SC.EXPLAIN[id];
        if (dead || !def || !Array.isArray(def.steps) || def.steps.length < 2) return;
        let stored = null; try { stored = SC.store.get(KEY + id); } catch (e) { /* none */ }
        const state = { view: stored === 'slim' ? 'slim' : 'open' };
        if (!stored) { try { SC.store.set(KEY + id, 'slim'); } catch (e) { /* none */ } }   // seen: from the next visit it starts folded
        const b = build(id, def, state);
        strip = b.root;
        place();
        obs = new MutationObserver(place);   // a page that draws its title late, or redraws, keeps the strip right under it
        obs.observe(page, { childList: true, subtree: true });
        if ('IntersectionObserver' in window) { io = new IntersectionObserver((es) => b.setOff(!es[0].isIntersecting), { threshold: 0.2 }); io.observe(strip); }
      }).catch(() => { /* no strip is better than a broken page */ });
      return () => { dead = true; if (obs) obs.disconnect(); if (io) io.disconnect(); if (strip) strip.remove(); };
    },
  };
})();
