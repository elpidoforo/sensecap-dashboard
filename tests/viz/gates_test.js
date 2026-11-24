// Data Gates board: the model. Run: node tests/viz/gates_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/gates-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
const G = (id, status, kind) => ({ id, n: ['Gate ' + id, 'Πύλη ' + id], kind: kind || 'meta', status });
// made-up report (Demo data, only for the test)
const h = { at: Date.UTC(2026, 10, 24, 5, 7), note: ['The checks only report.', 'Οι έλεγχοι μόνο αναφέρουν.'],
  sources: [
    { id: 'm1', name: 'Model one', nameEl: 'Μοντέλο ένα', group: 'model', state: 'live', gates: [G('arrives', 'pass', 'time'), G('licence', 'warn')] },
    { id: 'o1', name: 'Station', nameEl: 'Σταθμός', group: 'official', state: 'live', gates: [G('arrives', 'pass', 'time'), G('range', 'pass', 'values'), G('licence', 'fail')] },
    { id: 's1', name: 'Bus', nameEl: 'Λεωφορείο', group: 'own', state: 'down', gates: [G('arrives', 'warn', 'time')] },
    { id: 'x1', name: 'Odd', group: 'surprise', state: 'live', gates: [G('licence', 'banana')] }],
  extracts: [{ id: 'e1', name: 'File', nameEl: 'Αρχείο', gates: [G('licence', 'pass'), G('dated', 'pass')] }],
  issues: [{ source: 'o1', name: 'Station', nameEl: 'Σταθμός', gate: Object.assign(G('licence', 'fail'), { note: ['No licence.', 'Χωρίς άδεια.'] }) }],
  builders: [{ id: 'pulse', n: ['Live pulse', 'Ζωντανός παλμός'] }], feeds: [{ id: 'layers', n: ['Live layers', 'Ζωντανά στρώματα'] }, { id: 'bad' }] };
const m = D.build(h);
ok(m.available && m.items.map((x) => x.id).join() === 'o1,s1,m1,x1,e1', 'sources are grouped (official, own, model, context, extracts) and keep the server order inside a group');
ok(m.groups.map((g) => g.id).join() === 'official,own,model,context,extract' && m.groups[1].quiet === 1 && m.groups[1].live === 0 && m.groups[4].saved === 1, 'groups count live, not answering and saved');
ok(m.gates.map((g) => g.id).join() === 'arrives,range,licence,dated', 'gates keep the order of first appearance');
const lic = m.gates[2]; ok(lic.total === 4 && lic.pass === 1 && lic.warn === 1 && lic.fail === 1 && lic.unknown === 1, 'each gate counts its cells; an unknown status stays unknown');
ok(m.totals.checks === 9 && m.totals.pass === 5 && m.totals.warn === 2 && m.totals.fail === 1 && m.totals.unknown === 1 && m.totals.items === 5 && m.totals.quiet === 1, 'totals add up from the cells');
ok(m.items[1].state === 'quiet' && m.items[0].worst === 'fail' && m.items[2].worst === 'warn' && m.items[4].worst === 'pass', 'a source that is down is "quiet"; worst status per source');
ok(m.issues.length === 1 && m.issues[0].gate === 2 && m.issues[0].status === 'fail' && m.issues[0].note[1] === 'Χωρίς άδεια.', 'issues point to their gate and keep the note');
ok(m.builders.length === 1 && m.pages.length === 1, 'builders and pages keep only named entries');
ok(/9 checks of 5 sources at 4 gates: 5 passed, 2 warnings, 1 failed, 1 with no result\. Reported at 05:07 UTC\./.test(m.textRows[0][0]), 'headline with numbers and time');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.items.every((x) => pairOk(x.name)) && m.gates.every((g) => pairOk(g.n) && pairOk(g.kind)), 'every string is an [en, el] pair, no guillemets');
ok(m.textRows.some((r) => /one after the other so they can be watched/.test(r[0])) && m.textRows.some((r) => /not as zero/.test(r[0])), 'the walk-through and the not-answering sources are explained');
// the clock
const a0 = D.at(m, 0), mid = D.at(m, m.gates[2].start + m.step / 2), end = D.at(m, m.duration);
ok(a0.active === -1 && a0.checks === 0 && !a0.result, 'nothing is shown before the first gate');
ok(mid.active === 2 && mid.done === 2 && mid.shown[2] === 2 && mid.shown[3] === 0 && mid.checks === 4 + 2, 'half way through a gate half of its cells are shown');
ok(end.active === -1 && end.done === 4 && end.checks === 9 && end.pass === 5 && end.warn === 2 && end.fail === 1 && end.result, 'at the end every cell is shown and the totals match');
ok(D.at(m, m.resultAt - 1).result === false && m.duration > m.resultAt, 'the result appears after the last gate');
const e = D.build({}); ok(!e.available && pairOk(e.empty) && e.totals.checks === 0, 'honest empty state');
ok(D.timeText('x')[0] === 'time not reported', 'a missing time is said to be missing');
console.log('gates: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
