// Check run board: the model. Run: node tests/viz/checkrun_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/checkrun-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
// made-up record (Demo data, only for the test)
const rec = { recorded: '2026-11-23T21:30:00Z', commit: 'abc1234', scope: ['Only widget tests.', 'Μόνο έλεγχοι γραφικών.'], runs: [
  { id: 'alpha', file: 'tests/viz/alpha_test.js', passed: 10, failed: 0 }, { id: 'beta', passed: 7, failed: 3, failures: ['one', 'two', 'three'] }, { id: 'gamma', passed: null, failed: null }, { id: 'delta', passed: 0, failed: 0 } ] };
const m = D.build(rec);
ok(m.available && m.files.map((f) => f.id).join() === 'alpha,beta,gamma,delta', 'files keep the recorded order');
ok(m.files[0].state === 'passed' && m.files[1].state === 'failed' && m.files[2].state === 'unknown' && m.files[2].total === 0, 'a file with no result is unknown, never passed');
ok(m.totals.files === 4 && m.totals.checks === 20 && m.totals.passed === 17 && m.totals.failed === 3 && m.totals.unknown === 1 && m.totals.filesClean === 2, 'totals');
ok(m.files[0].first === 0 && m.files[1].first === 10 && m.files[2].first === 20 && m.files[3].first === 20, 'each file knows where its checks start');
ok(m.totals.pct === 85 && D.pct(1977, 1978, false) === 99.9 && D.pct(1978, 1978, true) === 100 && D.pct(1978, 1978, false) === 99.9 && D.pct(0, 0, true) === null, 'the percentage never rounds up to 100; 100 only when nothing failed and nothing is unknown');
ok(/17 of 20 checks passed in 4 test files; 3 failed; 1 files gave no result\. Recorded on 23 November 2026, 21:30 UTC, at version abc1234\./.test(m.textRows[0][0]), 'the headline says when and at which version it was recorded');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && pairOk(m.when) && m.files.every((f) => pairOk(f.line)), 'every string is an [en, el] pair');
ok(m.textRows.some((r) => /not a run in your browser/.test(r[0]) && /not that the data is right/.test(r[0])) && m.textRows[m.textRows.length - 1][0] === 'Only widget tests.', 'the limits of what a passing check means are said in words');
ok(m.files[1].failures.length === 3 && /7 of 10 checks passed, 3 failed/.test(m.files[1].line[0]), 'failures are kept and named');
const e = D.build({ runs: [] }); ok(!e.available && pairOk(e.empty) && e.totals.pct === null, 'honest empty state');
ok(D.dateText('nonsense')[0] === 'date not recorded', 'a bad date is said to be missing');
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/checks.json')); } catch (err) { console.log('note: public/site/data/checks.json not found, real-file checks skipped'); }
if (real) { const r = D.build(real); ok(r.available && r.totals.files === real.runs.length && r.totals.checks === real.runs.reduce((a, x) => a + (x.passed || 0) + (x.failed || 0), 0), 'the real record adds up'); ok(pairOk(real.scope) && typeof real.recorded === 'string', 'the real record carries its scope and its time'); }
console.log('checkrun: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
