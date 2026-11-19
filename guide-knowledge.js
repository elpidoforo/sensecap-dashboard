'use strict';
/* What Kleanthis knows about the site, for "Guide me" (bot.js guideBlock).
 * Nothing is written here by hand: it is read from the site's own reviewed texts, so the guide cannot drift from the pages.
 *   - public/site/explain/<group>.js : for each page, one line on what it is for and the steps of using it (English and Greek)
 *   - public/site/shell.js           : the menu (page ids and their names), read with a pattern, never run
 * The explainer files are plain data wrapped in a small function. They are run once, at start, in an empty sandbox (node:vm)
 * that holds nothing but an object to collect the data: no require, no process, no network.
 * createGuideKnowledge({ root }) -> { page(id, lang), map(lang), ids } */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createGuideKnowledge({ root, log = () => {} }) {
  const pages = {};      // id -> { lead:[en,el], steps:[{ h:[en,el], s:[en,el], c:[en,el]|null }] }
  const names = {};      // id -> [en, el]
  const dir = path.join(root, 'public', 'site', 'explain');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'scenes.js'); } catch (e) { log('Guide knowledge: no explainers (' + e.message + ')'); }
  for (const f of files) {
    try {
      const SC = { EXPLAIN: {} };
      const box = vm.createContext({ window: { SC }, SC });
      vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), box, { timeout: 500, filename: f });
      for (const [id, def] of Object.entries((box.window.SC && box.window.SC.EXPLAIN) || SC.EXPLAIN || {})) {
        if (!def || !Array.isArray(def.lead) || !Array.isArray(def.steps)) continue;
        pages[id] = { lead: def.lead, steps: def.steps.filter((s) => s && Array.isArray(s.h) && Array.isArray(s.s)).map((s) => ({ h: s.h, s: s.s, c: Array.isArray(s.c) ? s.c : null })) };
      }
    } catch (e) { log('Guide knowledge: ' + f + ' skipped (' + e.message + ')'); }
  }
  try {
    const shell = fs.readFileSync(path.join(root, 'public', 'site', 'shell.js'), 'utf8');
    const re = /\['([a-z0-9-]{2,24})',\s*'[a-z0-9-]+',\s*'([^'\\]{2,60})',\s*'([^'\\]{2,80})'\]/g;
    let m;
    while ((m = re.exec(shell))) if (!names[m[1]]) names[m[1]] = [m[2], m[3]];
  } catch (e) { log('Guide knowledge: menu not read (' + e.message + ')'); }

  const L = (pair, lang) => String((pair && (lang === 'el' ? pair[1] : pair[0])) || (pair && pair[0]) || '');
  return {
    ids: () => Object.keys(pages),
    // everything the site says about one page, as plain lines
    page(id, lang) {
      const p = pages[id];
      if (!p) return '';
      return [L(p.lead, lang)].concat(p.steps.map((s, i) => (i + 1) + '. ' + L(s.h, lang) + ': ' + L(s.s, lang) + (s.c ? ' ' + L(s.c, lang) : ''))).join('\n');
    },
    // one line per page in the menu: its id, its name and what it is for
    map(lang) {
      return Object.keys(names).filter((id) => pages[id]).map((id) => 'nav:' + id + ' = ' + L(names[id], lang) + ': ' + L(pages[id].lead, lang)).join('\n');
    },
  };
}

module.exports = { createGuideKnowledge };
