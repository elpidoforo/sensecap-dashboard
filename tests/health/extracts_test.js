'use strict';
/* The checks on the frozen extracts behind the investigations (#/fieldwork), as #/health reports them.
   Made-up extracts in a temporary folder, then the real ones in fieldwork/. No network, no server.
   Run: node tests/health/extracts_test.js */
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { createDataHealth } = require('../../data-health');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const ROOT = path.join(__dirname, '..', '..');
const gate = (x, id) => x.gates.find((g) => g.id === id);

// a temporary site with one extract in it
function withExtract(name, data, sourceFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-'));
  fs.mkdirSync(path.join(dir, 'fieldwork'));
  fs.writeFileSync(path.join(dir, 'fieldwork', name + '.json'), typeof data === 'string' ? data : JSON.stringify(data));
  if (sourceFile) fs.writeFileSync(path.join(dir, 'fieldwork', name + '-source.csv'), sourceFile);
  const H = createDataHealth({ layers: null, root: dir, log: () => {} });
  return H._t.extractsReport().items[0];
}
const full = (over) => ({
  title: 'Reservoir storage', titleEl: 'Αποθήκευση νερού', licence: 'CC BY 4.0',
  attribution: 'Water Development Department', attributionEl: 'Τμήμα Αναπτύξεως Υδάτων',
  method: 'Readings as published.', methodEl: 'Οι μετρήσεις όπως δημοσιεύτηκαν.',
  referenceDate: '2022-08-15', retrievedAt: '2026-11-16', ...over,
});
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// everything written down
let x = withExtract('reservoir', full({ sourceSha256: sha('a,b\n1,2\n') }), 'a,b\n1,2\n');
ok(x.sum.status === 'pass' && x.gates.length === 5, 'an extract with licence, credit, method, date and a matching copy passes every check');
ok(/still matches/.test(gate(x, 'fingerprint').note[0]) && gate(x, 'fingerprint').note[1], 'the fingerprint check names the file it compared, in both languages');
ok(x.name === 'Reservoir storage' && x.nameEl === 'Αποθήκευση νερού', 'the extract is named in both languages');

// the copy kept beside it no longer matches what was recorded
x = withExtract('reservoir', full({ sourceSha256: sha('a,b\n1,2\n') }), 'a,b\n9,9\n');
ok(gate(x, 'fingerprint').status === 'warn' && /does not match/.test(gate(x, 'fingerprint').note[0]), 'a copy that does not match the recorded fingerprint is a warning');
ok(/original download/.test(gate(x, 'fingerprint').note[0]), 'and the warning says the fingerprint may belong to the original download instead');

// a fingerprint with nothing here to compare it against
x = withExtract('reservoir', full({ sourceSha256: sha('x') }));
ok(gate(x, 'fingerprint').status === 'warn' && /not kept here/.test(gate(x, 'fingerprint').note[0]), 'a fingerprint with no file kept here says it cannot be checked from this computer');

// no fingerprint at all
x = withExtract('reservoir', full());
ok(gate(x, 'fingerprint').status === 'warn' && /No fingerprint/.test(gate(x, 'fingerprint').note[0]), 'an extract with no fingerprint says nobody can tell whether the numbers still match');

// the paperwork a school has to be able to show
x = withExtract('reservoir', full({ licence: null }));
ok(gate(x, 'licence').status === 'fail' && /published work/.test(gate(x, 'licence').note[0]) && x.sum.status === 'fail', 'an extract with no licence fails, and the extract fails with it');
x = withExtract('reservoir', full({ attributionEl: null }));
ok(gate(x, 'credit').status === 'warn' && /English only/.test(gate(x, 'credit').note[0]), 'a credit line in English only is a warning that says the Greek page cannot show it');
x = withExtract('reservoir', full({ attribution: null, attributionEl: null }));
ok(gate(x, 'credit').status === 'fail', 'no credit line at all is a failure');
x = withExtract('reservoir', full({ methodEl: null }));
ok(gate(x, 'method').status === 'warn' && /English only/.test(gate(x, 'method').note[0]), 'a method in English only is a warning');
x = withExtract('reservoir', full({ method: null, methodEl: null }));
ok(gate(x, 'method').status === 'warn' && /how these numbers were made/.test(gate(x, 'method').note[0]), 'no method says a pupil cannot tell how the numbers were made');
x = withExtract('reservoir', full({ referenceDate: null, retrievedAt: null }));
ok(gate(x, 'dated').status === 'warn', 'an undated extract is a warning');

// a file that cannot be read at all
x = withExtract('broken', '{ not json');
ok(x.sum.status === 'fail' && gate(x, 'licence').status === 'fail' && /could not be read/.test(gate(x, 'licence').note[0]), 'an extract that cannot be read is reported, not skipped');

// every check is written in both languages
[full(), full({ licence: null }), full({ method: null, methodEl: null })].forEach((d, i) => {
  const it = withExtract('reservoir', d);
  ok(it.gates.every((g) => g.n[0] && g.n[1] && g.n[0] !== g.n[1] && (!g.note || (g.note[0] && g.note[1]))), 'case ' + i + ': every check and reason is written in English and Greek');
});

// the real extracts that ship with the site
const H = createDataHealth({ layers: null, root: ROOT, log: () => {} });
const real = H._t.extractsReport();
ok(real.items.length === 13, 'all thirteen investigations are reported (' + real.items.length + ')');
ok(real.items.every((it) => gate(it, 'licence').status === 'pass'), 'every investigation that ships has a licence recorded');
ok(real.items.every((it) => it.gates.length === 5 && it.name && it.nameEl), 'every investigation is checked five ways and named in both languages');
ok(real.items.some((it) => gate(it, 'fingerprint').status === 'pass'), 'at least one investigation still matches the file it was made from');
ok(real.totals.pass + real.totals.warn + real.totals.fail === real.items.length * 5, 'the totals count every check once');

// a site with no investigations at all does not break the report
const bare = createDataHealth({ layers: null, root: fs.mkdtempSync(path.join(os.tmpdir(), 'hx0-')), log: () => {} })._t.extractsReport();
ok(bare.items.length === 0 && bare.totals.pass === 0, 'a site with no extracts reports none, and does not fail');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
