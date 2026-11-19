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
  'warnings', 'submitted', 'studio', 'about'];
const BEFORE_COUNT = 34;   // 33, and the page "About the project" (explain/about.js)
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

/* ---------- the project's knowledge base (public/site/project.js), which the page "About the project" and the assistant share ---------- */
{
  const SCp = {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'site', 'project.js'), 'utf8'), vm.createContext({ window: { SC: SCp }, SC: SCp }), { timeout: 500 });
  const P = SCp.PROJECT;
  ok(P && P.mission && P.mission.created && P.mission.vision && P.schools.length === 4 && P.roles.length === 5 && P.steps.length === 5 && P.learn.length === 6 && P.responsible.rules.length === 4 && P.launch.steps.length === 4, 'project: mission and vision, four schools, five roles, five steps, six things learned, four rules for AI, four launch steps');
  const walk = (v, where) => {
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string') {
      ok(v[0].trim().length > 1 && v[1].trim().length > 1, 'project ' + where + ': neither language is empty');
      ok(GREEK.test(v[1]) || /^(International School of Paphos|STEAM)$/.test(v[1]), 'project ' + where + ': the Greek has Greek letters');
      ok(!GREEK.test(v[0]), 'project ' + where + ': the English has no Greek letters');
      ok(!/[<>]/.test(v[0] + v[1]), 'project ' + where + ': no markup');
      ok(!/\d{2,}|\d[.,]\d|%/.test(v[0] + v[1]), 'project ' + where + ': no figures (the numbers drawn on the slides are examples, not results)');
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, where + '[' + i + ']'));
    if (v && typeof v === 'object') return Object.keys(v).forEach((k) => { if (k !== 'icon') walk(v[k], where + '.' + k); });
  };
  walk(P, 'P');
  const k2 = createGuideKnowledge({ root: ROOT });
  const en = k2.project('en'), el = k2.project('el');
  ok(/City Storyteller/.test(en) && /AI informs\. People decide\./.test(en) && /International School of Paphos/.test(en) && /Kleanthis/.test(en), 'project: the assistant is given the roles, the rule for AI, the schools and its own name');
  ok(/Why the platform was created/.test(en) && /The vision:/.test(en) && /Present evidence/.test(en), 'project: and why the platform was created, the vision and the five steps');
  ok(/Αφηγητής της πόλης/.test(el) && /Κλεάνθης/.test(el) && /Το όραμα/.test(el), 'project: and the same in Greek');
  ok(en.length < 7000 && el.length < 8000, 'project: short enough to give with every question (' + en.length + ', ' + el.length + ')');
  ok(/nav:about = About the project/.test(k2.map('en')), 'project: the page is on the guide\'s map of the site');
  const pageSrc = fs.readFileSync(path.join(ROOT, 'public', 'site', 'pages', 'about.js'), 'utf8');
  ok(!/innerHTML|insertAdjacentHTML/.test(pageSrc), 'project: the page never puts text in as markup');
  // the spoken welcome: why, vision, mission, in about thirty seconds
  const gsrc = fs.readFileSync(path.join(ROOT, 'public', 'site', 'guide.js'), 'utf8');
  const m = /const hello = T\('((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'\);/.exec(gsrc);
  ok(m && /was created so that/.test(m[1]) && /Our vision:/.test(m[1]) && /Your mission:/.test(m[1]), 'welcome: he first says why the platform was created, the vision and the mission');
  ok(m && /δημιουργήθηκε/.test(m[2]) && /Το όραμά μας/.test(m[2]) && /Η αποστολή σου/.test(m[2]), 'welcome: and the same in Greek');
  const home = fs.readFileSync(path.join(ROOT, 'public', 'site', 'pages', 'home.js'), 'utf8'), shellSrc = fs.readFileSync(path.join(ROOT, 'public', 'site', 'shell.js'), 'utf8');
  ok(/hm-mission/.test(home) && /SC\.missionLines\(P\)/.test(home) && home.indexOf('mission, head, route') > 0, 'home: the mission card stands before the heading and uses the project text');
  ok(/wl-mission/.test(shellSrc) && /SC\.missionLines\(P\)/.test(shellSrc), 'welcome screen: it states the purpose, the vision and the mission from the same text');
  ok(P.mission.yours && /HELLO_ASKED \|\| 1000/.test(gsrc), 'hello: Kleanthis pops up one second after the platform opens');
  ok(m && m[1].split(/\s+/).length <= 85 && m[2].split(/\s+/).length <= 85, 'welcome: short enough to say in about thirty seconds (' + (m && m[1].split(/\s+/).length) + ' and ' + (m && m[2].split(/\s+/).length) + ' words)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
