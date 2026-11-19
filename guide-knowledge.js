'use strict';
/* What Kleanthis knows about the site, for "Guide me" (bot.js guideBlock).
 * Nothing is written here by hand: it is read from the site's own reviewed texts, so the guide cannot drift from the pages.
 *   - public/site/explain/<group>.js : for each page, one line on what it is for and the steps of using it (English and Greek)
 *   - public/site/shell.js           : the menu (page ids and their names), read with a pattern, never run
 * The explainer files are plain data wrapped in a small function. They are run once, at start, in an empty sandbox (node:vm)
 * that holds nothing but an object to collect the data: no require, no process, no network.
 *   - public/site/project.js         : the project's knowledge base (mission, schools, roles, steps, rules), the same file the
 *                                      page "About the project" shows; read in the same kind of sandbox
 * createGuideKnowledge({ root }) -> { page(id, lang), map(lang), project(lang), ids } */
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

  let proj = null;       // SC.PROJECT from public/site/project.js
  try {
    const SC = {};
    vm.runInContext(fs.readFileSync(path.join(root, 'public', 'site', 'project.js'), 'utf8'), vm.createContext({ window: { SC }, SC }), { timeout: 500, filename: 'project.js' });
    if (SC.PROJECT && SC.PROJECT.mission && Array.isArray(SC.PROJECT.roles)) proj = SC.PROJECT;
  } catch (e) { log('Guide knowledge: project text not read (' + e.message + ')'); }

  const L = (pair, lang) => String((pair && (lang === 'el' ? pair[1] : pair[0])) || (pair && pair[0]) || '');
  return {
    ids: () => Object.keys(pages),
    // everything the site says about one page, as plain lines
    page(id, lang) {
      const p = pages[id];
      if (!p) return '';
      return [L(p.lead, lang)].concat(p.steps.map((s, i) => (i + 1) + '. ' + L(s.h, lang) + ': ' + L(s.s, lang) + (s.c ? ' ' + L(s.c, lang) : ''))).join('\n');
    },
    // what the project says about itself, as plain lines (empty when the file could not be read)
    project(lang) {
      if (!proj) return '';
      const P = proj, both = (x) => L(x.name, lang) + ': ' + L(x.does, lang);
      return [
        'Name: ' + L(P.name, lang) + '. ' + L(P.platform, lang),
        'Mission: ' + L(P.mission.title, lang) + '. ' + L(P.mission.tag, lang) + ' ' + L(P.mission.what, lang) + ' ' + L(P.mission.why, lang) + ' ' + L(P.mission.created, lang) + ' ' + L(P.mission.vision, lang) + ' ' + L(P.mission.promise, lang) + ' Motto: ' + L(P.mission.motto, lang),
        'Schools: ' + P.schools.map((s) => L(s.name, lang) + ' (' + L(s.city, lang) + ')').join('; ') + '.',
        'People: ' + P.people.map((p) => L(p, lang)).join(' '),
        'The five roles in a team:\n' + P.roles.map((r) => '- ' + both(r)).join('\n'),
        'The five steps of the work:\n' + P.steps.map((s, i) => (i + 1) + '. ' + both(s)).join('\n'),
        'What students learn: ' + (P.learn || []).map(both).join(' '),
        'Using AI: ' + L(P.responsible.motto, lang) + ' ' + P.responsible.rules.map(both).join(' '),
        'Where it leads:\n' + P.goals.map((g) => '- ' + both(g)).join('\n'),
        'Start: ' + L(P.launch.when, lang) + ' ' + P.launch.steps.map((s, i) => (i + 1) + ') ' + L(s, lang)).join(', ') + '.',
        'Keep in mind: ' + P.honest.map((p) => L(p, lang)).join(' '),
      ].join('\n');
    },
    // one line per page in the menu: its id, its name and what it is for
    map(lang) {
      return Object.keys(names).filter((id) => pages[id]).map((id) => 'nav:' + id + ' = ' + L(names[id], lang) + ': ' + L(pages[id].lead, lang)).join('\n');
    },
  };
}

module.exports = { createGuideKnowledge };
