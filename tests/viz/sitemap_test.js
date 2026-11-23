// Site Map board: the model. Run: node tests/viz/sitemap_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/sitemap-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
// made-up menu (Demo data, only for the test)
const menu = { root: 'K', groups: [
  { id: 'view', name: ['View', 'Προβολή'], items: [{ id: 'a', name: ['Alpha', 'Άλφα'], desc: ['First page', 'Πρώτη σελίδα'] }, { id: 'b', name: ['Beta', 'Βήτα'], desc: ['Second', 'Δεύτερη'] }, { id: 'c', name: ['Gamma', 'Γάμμα'] }] },
  { id: 'empty', name: ['Empty', 'Κενό'], items: [] },
  { id: 'build', name: ['Build', 'Κατασκευή'], items: [{ id: 'd', name: ['Delta', 'Δέλτα'], desc: ['Fourth', 'Τέταρτη'] }] } ] };
const m = D.build(menu);
ok(m.available && m.groups.length === 2 && m.totals.pages === 4, 'groups without pages are left out; pages are counted');
ok(m.groups.map((g) => g.id).join() === 'view,build' && m.items.map((i) => i.id).join() === 'a,b,c,d', 'menu order is kept, nothing is sorted');
ok(m.items[1].at - m.items[0].at === D.STEP && m.items[3].at - m.items[2].at === D.STEP + D.HOLD, 'a page every step, with a pause when a group is complete');
ok(m.duration === m.items[3].at + D.STEP + D.END, 'the run ends after the last page plus the final hold');
ok(m.items.every((i) => i.r > 0 && i.r <= 1 && isFinite(i.a)) && new Set(m.items.filter((i) => i.group === 0).map((i) => i.r.toFixed(4))).size === 3, 'every node has its own place inside its group disc');
ok(JSON.stringify(D.build(menu)) === JSON.stringify(m), 'the same menu always gives the same picture');
const s0 = D.at(m, 0), s1 = D.at(m, m.items[1].at), s2 = D.at(m, m.items[3].at + 10), s3 = D.at(m, m.duration);
ok(s0.shown === 0 && s0.current === -1 && s1.shown === 2 && s1.current === 1 && s1.group === 0, 'state from the clock alone: pages out and the newest one');
ok(s2.shown === 4 && s2.group === 1 && s2.perGroup.join() === '3,1' && s3.done && s3.group === -1 && s3.shown === 4, 'per-group progress, and the finished state');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && /4 pages in 2 parts/.test(m.textRows[0][0]) && /Alpha\. First page/.test(m.textRows[1][0]), 'text rows are [en, el] pairs with the page descriptions');
const plain = D.build({ groups: [{ id: 'x', name: 'Menu', items: [{ id: 'p', name: 'Page', desc: 'About' }] }] });
ok(plain.available && plain.textRows[1][0] === 'Menu: Page. About' && plain.textRows[1][1] === 'Menu: Page. About', 'plain strings (menu already in one language) work too');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.items.length === 0 && D.at(e, 100).shown === 0, 'honest empty state');
const walk = (o, bad) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (/^(rank|score|views|visits)$/i.test(k)) bad.push(k); walk(o[k], bad); } return bad; };
ok(walk(m, []).length === 0, 'no rank, score or visit count: the map shows the menu, not how pages are used');
console.log('sitemap: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
