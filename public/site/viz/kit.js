/* Small helpers for the Data Wall and Data Flow pages: load scripts once, fetch JSON once per visit, and build a titled panel with a
   text list of the same facts (so nothing depends on the picture). */
(function () {
  'use strict';
  const SC = window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const T = (en, el) => (SC.lang === 'el' ? el : en);
  const pair = (p) => (Array.isArray(p) ? p[SC.lang === 'el' ? 1 : 0] : String(p == null ? '' : p));
  const loaded = {};
  const loadScript = (src) => loaded[src] || (loaded[src] = new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete loaded[src]; no(new Error(src)); }; document.head.append(s); }));
  const loadAll = (list) => list.reduce((p, s) => p.then(() => loadScript(s)), Promise.resolve());
  const cache = new Map();
  const getJson = (url) => { if (!cache.has(url)) cache.set(url, fetch(url, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }).catch((e) => { cache.delete(url); throw e; })); return cache.get(url); };
  // never let one failed feed stop a picture: a failed answer is null and the widgets say so themselves
  const tryJson = (url) => getJson(url).catch(() => null);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // panel: title, one-line hint, a host for the widget, a read-out line, and a text list under it
  function panel(parent, title, hint, cls) {
    const box = el('section', 'wl-panel' + (cls ? ' ' + cls : '')), h = el('h2', 'wl-h', title), p = el('p', 'wl-hint', hint), tools = el('div', 'wl-tools'), host = el('div', 'wl-host'), read = el('p', 'wl-read'); read.setAttribute('aria-live', 'polite');
    const det = el('details', 'wl-list'), sum = el('summary', null, T('The same facts as text', 'Τα ίδια στοιχεία ως κείμενο')), ul = el('ul');
    det.append(sum, ul); box.append(h, p, tools, host, read, det); parent.append(box);
    const rows = (model) => { ul.textContent = ''; ((model && model.textRows) || []).slice(0, 300).forEach((r) => ul.append(el('li', null, pair(r)))); };
    const aria = (model) => { if (model && model.ariaLabel) { host.setAttribute('role', 'img'); host.setAttribute('aria-label', pair(model.ariaLabel)); } };
    return { box, host, tools, read, rows, aria, say: (t) => { read.textContent = t || ''; } };
  }
  const note = (host, text) => { host.textContent = ''; const p = el('p', 'wl-empty', text); p.setAttribute('role', 'status'); host.append(p); };
  SC.viz.kit = { T, pair, loadScript, loadAll, getJson, tryJson, el, panel, note };
})();
