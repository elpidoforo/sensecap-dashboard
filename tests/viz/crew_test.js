// AI at Work board: the model. Run: node tests/viz/crew_test.js
'use strict';
const path = require('path'), fs = require('fs');
const D = require(path.join(__dirname, '../../public/site/viz/crew-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
const NOW = Date.UTC(2026, 10, 24, 6, 0);
// made-up answers (Demo data, only for the test)
const council = { enabled: false, message: 'Resting.', message_el: 'Σε παύση.', remaining: 2, limit: 3, label: 'AI role-play', aiNote: ['A teacher checks.', 'Ελέγχει εκπαιδευτικός.'], seats: [{ id: 'a', name: ['Air', 'Αέρας'], focus: ['Dust', 'Σκόνη'] }, { id: 'b', name: ['Bus', 'Λεωφορείο'] }, { nope: 1 }] };
const helpers = { helpers: [{ id: 'h1', name: 'Saver', nameEl: 'Αποθήκευση', what: 'Saves.', whatEl: 'Αποθηκεύει.', kind: 'saver', status: 'ok', lastRun: NOW - 5 * 60000, detail: 'Fine.', detailEl: 'Καλά.' }, { id: 'h2', name: 'Other', what: 'x', status: 'banana' }, { id: 'h3', name: 'Off', what: 'y', status: 'off' }] };
const m = D.build({ council, helpers, sessions: { sessions: [{}, {}] } }, NOW);
ok(m.available && m.seats.map((s) => s.id).join() === 'a,b' && m.seats[1].focus === null, 'seats keep the server order; an entry without an id is dropped');
ok(m.council.known && m.council.on === false && m.council.remaining === 2 && m.council.limit === 3, 'the state of the Council room is the reported one');
ok(m.helpers[0].state === 'ok' && m.helpers[1].state === 'unknown' && m.helpers[2].state === 'off' && m.helpersOk === 1, 'an unreported helper state is unknown, never ok');
ok(m.helpers[0].last[0] === '5 min ago' && m.helpers[1].last === null, 'last run as an age; missing stays missing');
ok(m.published.known && m.published.n === 2 && !m.published.capped && /2 published sessions/.test(m.pubText[0]), 'published sessions are counted from the list');
const cap = D.build({ council, sessions: { sessions: new Array(100).fill({}) } }, NOW); ok(cap.published.capped && /100 or more/.test(cap.pubText[0]), 'a full list is "100 or more", not "100"');
const noS = D.build({ council }, NOW); ok(!noS.published.known && noS.published.n === null && /not reported/.test(noS.pubText[0]), 'no list: the count is not reported, not zero');
ok(m.steps.map((s) => s.id).join() === 'ask,brief,seats,chair,draft,teacher,publish' && m.steps.every((s, k) => !k || s.at > m.steps[k - 1].at), 'the steps are in the order of the code');
ok(m.inputs.length === 4 && /2 left today/.test(m.inputs[3].lines[1][0]) && /8 to 300 characters/.test(m.inputs[0].lines[0][0]), 'the input cards carry the limits');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.steps.every((s) => pairOk(s.n) && pairOk(s.log)) && m.inputs.every((c) => pairOk(c.name) && c.lines.every(pairOk)) && m.fields.every((f) => pairOk(f.n)), 'every string is an [en, el] pair, no guillemets');
ok(m.textRows.some((r) => /walk-through/.test(r[0]) && /not a session happening now/.test(r[0])), 'the walk-through is labelled as one');
// the clock
const P = m.phases, a0 = D.at(m, 0), mid = D.at(m, P.seats + 100), ch = D.at(m, P.chair + 10), end = D.at(m, m.duration);
ok(a0.id === 'ask' && a0.seatsDone === 0 && !a0.done, 'the run starts with the question');
ok(mid.id === 'seats' && mid.seat.every((v) => v > 0 && v < 1) && mid.chair === 0, 'all seats work at the same time');
ok(m.seats.every((s) => s.doneAt > P.seats && s.doneAt <= P.chair) && ch.seatsDone === m.seats.length && ch.id === 'chair', 'every seat has finished before the Chair starts');
ok(end.done && end.publish === 1 && end.teacher === 1, 'the run ends published');
const e = D.build({}, NOW); ok(!e.available && pairOk(e.empty), 'honest empty state');
const hOnly = D.build({ helpers }, NOW); ok(hOnly.available && !hOnly.council.known && /not reporting/.test(hOnly.ariaLabel[0]), 'helpers alone still give a board; the Council room is said not to report');
// "as written in the site's code": every wired fact is checked against council.js
let src = null; try { src = fs.readFileSync(path.join(__dirname, '../../council.js'), 'utf8'); } catch (err) { console.log('note: council.js not found, source checks skipped'); }
if (src) { const W = D.WIRED;
  ok(new RegExp('MAX_QUESTION = ' + W.maxQuestion + ', MIN_QUESTION = ' + W.minQuestion + '\\b').test(src), 'question length limits match council.js');
  ok(new RegExp('MAX_READINGS = ' + W.maxReadings + '\\b').test(src), 'the reading cap matches council.js');
  ok(new RegExp('BRIEF_TTL = ' + (W.briefMinutes * 60000) + '\\b').test(src), 'the brief life matches council.js');
  ok((src.match(/^\s*\{ id: '[a-z]+', name: \[/gm) || []).length === W.seats, 'the number of seats matches council.js');
  ok(/Promise\.all\(SEATS\.map/.test(src), 'the seats really run at the same time');
  ok(W.seatFields.every((f) => new RegExp("type: 'seat'[^\\n]*\\b" + f + ': out\\.' + f).test(src)), 'the fields a seat hands back match council.js');
  ok(new RegExp("status = 'published'[^\\n]*LIMIT " + W.publishedCap + '\\b').test(src), 'the published list cap matches council.js');
  ok(/A new session is a DRAFT/.test(src) && /rounded to two/.test(src) && /No vehicle, no EUI, no coordinate reaches a prompt/.test(src), 'draft, rounding and no-position rules are stated in council.js');
  ok(src.indexOf('await getBrief()') < src.indexOf('Promise.all(SEATS.map') && src.indexOf('Promise.all(SEATS.map') < src.indexOf('await runChair('), 'brief, then seats, then Chair: the order in council.js');
}
console.log('crew: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
