// Runs every widget test (tests/viz/*_test.js) and records the results in public/site/data/checks.json for the "Check run" board.
// Run from the repo root: node tools/record-checks.js   (no dependencies). The file says when and at which commit it was recorded.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), dir = path.join(root, 'tests/viz');
const files = fs.readdirSync(dir).filter((f) => /_test\.js$/.test(f)).sort();
const runs = files.map((f) => {
  const r = cp.spawnSync(process.execPath, [path.join(dir, f)], { cwd: root, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || ''), m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  const failed = (out.match(/^FAIL: .*$/gm) || []).map((l) => l.replace(/^FAIL: /, '').slice(0, 160));
  return { id: f.replace(/_test\.js$/, ''), file: 'tests/viz/' + f, passed: m ? Number(m[1]) : null, failed: m ? Number(m[2]) : null, exit: r.status, failures: failed };
});
let commit = null; try { commit = cp.execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch (e) { commit = null; }
const data = { id: 'checks', recorded: new Date().toISOString(), commit, scope: ['The widget tests in tests/viz. Other tests of the site (pages in a real browser, the guide, the server) are not part of this file.', 'Οι έλεγχοι των γραφικών στο tests/viz. Άλλοι έλεγχοι του ιστοτόπου (σελίδες σε πραγματικό φυλλομετρητή, ο οδηγός, ο διακομιστής) δεν είναι σε αυτό το αρχείο.'], runs };
fs.writeFileSync(path.join(root, 'public/site/data/checks.json'), JSON.stringify(data, null, 1));
const tot = runs.reduce((a, r) => a + (r.passed || 0), 0), bad = runs.reduce((a, r) => a + (r.failed || 0), 0);
console.log(runs.length + ' test files, ' + tot + ' checks passed, ' + bad + ' failed, ' + runs.filter((r) => r.passed == null).length + ' without a result line');
