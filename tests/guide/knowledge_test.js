'use strict';
/* What Kleanthis knows about each page (guide-knowledge.js reading public/site/explain/*.js).
   Checks the 25 pages described in public/site/explain/more.js: every one has a lead and 3 to 5 steps in English and Greek,
   within the length limits; the pages that had a description before are still there and are not redefined; and none of the
   new ids is in the GROUP map of public/site/explain.js, so no page gets an animated strip it did not have.
   No server, no browser. Run: node tests/guide/knowledge_test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const { createGuideKnowledge } = require(path.join(ROOT, 'guide-knowledge.js'));

let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };

const NEW = ['approvals', 'ask', 'askmap', 'beforeafter', 'brief', 'bubbles', 'changed', 'claims', 'episode', 'experiment', 'forecast', 'league',
  'lessonbuilder', 'lessons', 'methods', 'notebook', 'opsmap', 'radar', 'school360', 'settings', 'timemachine', 'vent', 'versus', 'watch', 'workshop'];
const BEFORE = ['home', 'board', 'city3d', 'alerts', 'layers', 'weather', 'explore', 'library', 'join', 'schools', 'districts', 'guides', 'council', 'mirror',
  'whatif', 'reports', 'map', 'vehicles', 'desk', 'projects', 'start', 'stack', 'health', 'fieldwork', 'city', 'research', 'archive', 'feeds', 'helpers',
  'warnings', 'submitted', 'studio'];
const BEFORE_COUNT = 33;
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const LEAD_MAX = 220, LINE_MAX = 240, HEAD_MAX = 40;

/* ---------- the files themselves, read the same way the server reads them ---------- */
const dir = path.join(ROOT, 'public', 'site', 'explain');
const read = (f) => { const SC = { EXPLAIN: {} }; vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), vm.createContext({ window: { SC }, SC }), { timeout: 500, filename: f }); return SC.EXPLAIN; };
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'scenes.js');
ok(files.includes('more.js'), 'more.js is among the explainer files');
const more = read('more.js');
const others = {};
files.filter((f) => f !== 'more.js').forEach((f) => Object.assign(others, read(f)));

ok(JSON.stringify(Object.keys(more).sort()) === JSON.stringify(NEW.slice().sort()), 'more.js describes exactly the 25 pages (' + Object.keys(more).length + ')');
ok(Object.keys(others).length === BEFORE_COUNT, 'the other files still describe ' + BEFORE_COUNT + ' pages (' + Object.keys(others).length + ')');
BEFORE.forEach((id) => ok(others[id] && Array.isArray(others[id].steps) && others[id].steps.length >= 3, 'still described elsewhere: ' + id));
NEW.forEach((id) => ok(!others[id], 'not described twice: ' + id));

/* ---------- every string of the new entries ---------- */
const pair = (p, where, max) => {
  ok(Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string', where + ': an English and a Greek string');
  if (!Array.isArray(p) || typeof p[0] !== 'string' || typeof p[1] !== 'string') return;
  ok(p[0].trim().length > 1 && p[1].trim().length > 1, where + ': neither is empty');
  ok(p[0] !== p[1], where + ': the Greek is not a copy of the English');
  ok(GREEK.test(p[1]), where + ': the Greek has Greek letters');
  ok(!GREEK.test(p[0]), where + ': the English has no Greek letters');
  ok(p[0].length < max && p[1].length < max, where + ': under ' + max + ' characters (' + p[0].length + ', ' + p[1].length + ')');
  ok(!/[<>]/.test(p[0] + p[1]), where + ': no markup');
};
const scenesSrc = fs.readFileSync(path.join(dir, 'scenes.js'), 'utf8');
NEW.forEach((id) => {
  const def = more[id];
  if (!def) return;
  pair(def.lead, id + ' lead', LEAD_MAX);
  ok(Array.isArray(def.steps) && def.steps.length >= 3 && def.steps.length <= 5, id + ': 3 to 5 steps (' + (def.steps || []).length + ')');
  (def.steps || []).forEach((st, i) => {
    const w = id + ' step ' + (i + 1);
    pair(st.h, w + ' heading', HEAD_MAX);
    ok(st.h && st.h[0].split(/\s+/).length <= 4, w + ': the English heading is at most four words');
    pair(st.s, w + ' what to do', LINE_MAX);
    if (st.c !== undefined) pair(st.c, w + ' what to notice', LINE_MAX);
    if (st.scene !== undefined) ok(typeof st.scene === 'string' && new RegExp('\\b' + st.scene + ':').test(scenesSrc), w + ': its scene exists in scenes.js (' + st.scene + ')');
  });
  ok((def.steps || []).some((st) => st.c), id + ': at least one step says what to notice or a limit');
});

/* ---------- what the server hands to the guide ---------- */
const lines = [];
const know = createGuideKnowledge({ root: ROOT, log: (m) => lines.push(m) });
ok(lines.length === 0, 'no explainer file was skipped (' + lines.join('; ') + ')');
const ids = know.ids();
ok(ids.length === BEFORE_COUNT + NEW.length, 'the guide knows ' + (BEFORE_COUNT + NEW.length) + ' pages (' + ids.length + ')');
ok(ids.filter((id) => !NEW.includes(id)).length === BEFORE_COUNT, 'the pages known before are unchanged in count');
NEW.forEach((id) => {
  const en = know.page(id, 'en'), el = know.page(id, 'el');
  ok(en && en.split('\n').length >= 4 && en.split('\n').length <= 6, id + ': a lead and 3 to 5 numbered lines in English');
  ok(el && el.split('\n').length === en.split('\n').length && GREEK.test(el.split('\n')[0]), id + ': the same in Greek');
  ok(en !== el, id + ': the two languages differ');
});
ok(know.page('layers', 'en').startsWith(others.layers.lead[0]), 'a page described before reads as before (layers)');
const map = know.map('en');
ok(/^nav:versus = City vs city: /m.test(map) && /^nav:workshop = Workshop: /m.test(map), 'the site map carries the new pages by their menu names');
ok(!/^nav:episode = /m.test(map), 'a page that is not in the menu (episode) is not offered as a menu link');

/* ---------- no page gets a strip it did not have ---------- */
const explain = fs.readFileSync(path.join(ROOT, 'public', 'site', 'explain.js'), 'utf8');
const g = explain.match(/const GROUP = \{([\s\S]*?)\};/);
ok(Boolean(g), 'the GROUP map of explain.js was found');
const groupIds = g ? (g[1].match(/([a-z0-9]+)\s*:/g) || []).map((x) => x.replace(/\s*:$/, '')) : [];
ok(groupIds.length >= 30, 'the GROUP map was read (' + groupIds.length + ' ids)');
NEW.forEach((id) => ok(!groupIds.includes(id), 'not in the GROUP map: ' + id));
ok(g && !/['"]more['"]/.test(g[1]), 'no page loads more.js in the browser');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
