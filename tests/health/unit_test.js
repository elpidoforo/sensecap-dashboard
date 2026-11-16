'use strict';
/* data-health.js: the checks themselves, on made-up sources and readings. No network, no server.
   Run: node tests/health/unit_test.js */
const { createDataHealth } = require('../../data-health');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const NOW = Date.parse('2026-11-16T12:00:00Z');
const H = createDataHealth({ layers: null, root: require('path').join(__dirname, '..', '..'), now: () => NOW });
const { gatesFor, isoMs } = H._t;
const gate = (gs, id) => gs.find((g) => g.id === id);
const src = (over) => ({ id: 's', name: 'S', layer: 'official', update: { every: 'PT10M' }, quality: { stale_after: 'PT1H' }, licence: { id: 'CC-BY-4.0', attribution: 'Someone', checked_on: '2026-10-01' }, variables: [{ id: 'temperature' }], ...over });
const row = (over) => ({ source: 's', variable: 'temperature', value: 21, unit: '°C', ageMin: 4, env: 'outdoor', city: 'larnaka', ...over });
const card = (over) => ({ id: 's', state: 'live', lastAt: NOW - 5 * 60000, ...over });
// a reading layers.js threw away as it read the source, which is where the impossible values end up
const drop = (why, over) => ({ source: 's', why, variable: 'temperature', value: 21, city: 'larnaka', ...over });

ok(isoMs('PT10M') === 600000 && isoMs('PT1H') === 3600000 && isoMs('P1D') === 86400000 && isoMs('') === null && isoMs('PT0M') === null, 'how often a source promises to send is read from its duration');

// timing
let g = gatesFor(src(), card(), [row()], [], NOW);
ok(gate(g, 'arrives').status === 'pass' && /5 minutes ago/.test(gate(g, 'arrives').note[0]), 'a source that just sent passes the timing check');
g = gatesFor(src(), card({ lastAt: NOW - 90 * 60000 }), [row()], [], NOW);
ok(gate(g, 'arrives').status === 'warn', 'a source past the age its own file allows gets a warning');
g = gatesFor(src(), card({ lastAt: NOW - 6 * 3600000 }), [row()], [], NOW);
ok(gate(g, 'arrives').status === 'fail', 'a source long past that age fails');
g = gatesFor(src(), card({ state: 'down', lastAt: null }), [], [], NOW);
ok(gate(g, 'arrives').status === 'warn' && /Nothing has arrived/.test(gate(g, 'arrives').note[0]), 'a source that has sent nothing yet is a warning, not a failure, and says so');

// the readings. The impossible ones never become rows: layers.js throws them away as it reads the source and
// hands the reason over, so these checks are fed what was thrown away, not what survived.
g = gatesFor(src(), card(), [row()], [], NOW, [drop('range', { value: 91 }), drop('range', { value: -40, city: 'paphos' })]);
ok(gate(g, 'range').status === 'fail' && gate(g, 'range').failed === 2 && gate(g, 'range').checked === 3, 'readings thrown away for being impossible are counted, together with the ones that were kept');
ok(/outside the possible range/.test(gate(g, 'range').items[0].why[0]) && /paphos/.test(gate(g, 'range').items[1].id), 'each impossible value says where it came from and why');
ok(/91 °C/.test(gate(g, 'range').items[0].why[0]) && /-30 °C to 55 °C/.test(gate(g, 'range').items[0].why[0]) && /έως/.test(gate(g, 'range').items[0].why[1]), 'an impossible value and the range it broke both carry their unit, in both languages');
g = gatesFor(src(), card(), [row()], [], NOW, [drop('range', { value: 55.04, t: Date.parse('2026-11-16T09:32:00Z') })]);
ok(/55.04/.test(gate(g, 'range').items[0].why[0]) && /09:32/.test(gate(g, 'range').items[0].why[0]), 'a value just past the edge keeps the digits that show it, and says when it was read');
g = gatesFor(src(), card(), [row(), row()], [], NOW, []);
ok(gate(g, 'range').status === 'pass' && gate(g, 'range').checked === 2 && gate(g, 'range').failed === 0, 'a source that threw nothing away passes, and still says how many readings it looked at');
// the unit check only counts what was really compared: the units the source file writes down, and readings that carried their own unit
g = gatesFor(src(), card(), [row()], [], NOW, [drop('unit')], 3);
ok(gate(g, 'units').status === 'fail' && /vocabulary says °C/.test(gate(g, 'units').items[0].why[0]), 'a reading in the wrong unit fails and names the unit the vocabulary asks for');
g = gatesFor(src({ variables: [{ id: 'temperature', unit: 'Cel' }] }), card(), [row()], [], NOW, []);
ok(gate(g, 'units').status === 'pass' && gate(g, 'units').checked === 1, 'a source file that writes the unit the vocabulary asks for passes, counting the declaration it compared');
g = gatesFor(src({ variables: [{ id: 'temperature', unit: 'ug/m3' }] }), card(), [row()], [], NOW, []);
ok(gate(g, 'units').status === 'fail' && /source file says ug\/m3/.test(gate(g, 'units').items[0].why[0]), 'a source file that writes the wrong unit fails and names both units');
g = gatesFor(src({ variables: [{ id: 'temperature' }] }), card(), [row(), row(), row()], [], NOW, []);
ok(!gate(g, 'units'), 'a source that sends no unit of its own is not told its units match: nothing was compared');
g = gatesFor(src({ variables: [{ id: 'temperature' }] }), card(), [row()], [], NOW, [], 4);
ok(gate(g, 'units').status === 'pass' && gate(g, 'units').checked === 4 && /carried their own unit/.test(gate(g, 'units').note[0]), 'readings that did carry a unit are counted, and the note says what was compared');
g = gatesFor(src(), card(), [row()], [], NOW, [drop('future')]);
ok(gate(g, 'future').status === 'fail' && /clock/.test(gate(g, 'future').items[0].why[0]), 'a reading stamped in the future fails and points at the clock');
g = gatesFor(src(), card(), [row()], [], NOW, []);
ok(gate(g, 'future').status === 'pass', 'a source with no readings thrown away for their time passes the clock check');
g = gatesFor(src(), card(), [], [], NOW, []);
ok(!gate(g, 'range') && !gate(g, 'future'), 'a source with nothing to look at is not given a reading check to pass');

// indoors or outdoors, only for our own sensors, and read from the source file rather than the readings
g = gatesFor(src({ layer: 'own' }), card(), [row()], [], NOW, []);
ok(gate(g, 'env').status === 'fail' && /indoors or outdoors/.test(gate(g, 'env').note[0]), 'one of our sensors whose file does not say indoors or outdoors fails');
g = gatesFor(src({ layer: 'own', representativeness: { environment: 'outdoor' } }), card(), [row()], [], NOW, []);
ok(gate(g, 'env').status === 'pass' && /outdoor/.test(gate(g, 'env').note[0]), 'a sensor whose file records where it stands passes, and the page says which');
g = gatesFor(src({ layer: 'official' }), card(), [row()], [], NOW, []);
ok(!gate(g, 'env'), 'the indoor check is only asked of our own sensors');

// agreeing with another source
const rivers = [{ variable: 'temperature', unit: '°C', sources: ['s', 'other'], cities: { larnaka: { state: 'differ', spread: 5.5, tolerance: 2, sources: ['s', 'other'] }, paphos: { state: 'agree', spread: 0.4, tolerance: 2, sources: ['s', 'other'] }, lefkosia: { state: 'unknown' } } }];
g = gatesFor(src(), card(), [row()], rivers, NOW);
ok(gate(g, 'agrees').status === 'warn' && gate(g, 'agrees').checked === 2 && gate(g, 'agrees').failed === 1, 'a disagreement with another source is a warning, counted only where both sources had a reading');
ok(/not a mistake by itself/.test(gate(g, 'agrees').note[0]), 'the disagreement says that two instruments can both be right');
const elsewhere = [{ variable: 'temperature', unit: '°C', sources: ['s', 'other'], cities: { limassol: { state: 'differ', spread: 5.5, tolerance: 2, sources: ['other', 'third'] } } }];
g = gatesFor(src(), card(), [row()], elsewhere, NOW);
ok(!gate(g, 'agrees'), 'a source is never told it differs in a city it did not report from');
g = gatesFor(src({ id: 'alone' }), card(), [row()], rivers, NOW);
ok(!gate(g, 'agrees'), 'a source nothing else measures is not asked to agree with anything');

// the paperwork
g = gatesFor(src({ licence: { id: 'unknown' } }), card(), [], [], NOW);
ok(gate(g, 'licence').status === 'fail' && /must not be used in published work/.test(gate(g, 'licence').note[0]), 'an outside source with no licence fails');
g = gatesFor(src({ layer: 'own', licence: { id: 'unknown' } }), card(), [], [], NOW);
ok(gate(g, 'licence').status === 'warn' && /our own sensors/.test(gate(g, 'licence').note[0]), 'our own sensors need no outside licence, but who owns the readings should be written down');
ok(!gate(g, 'licence_age'), 'our own sensors are not asked when their licence was last checked');
g = gatesFor(src({ licence: { id: 'CC-BY-4.0', checked_on: '2026-10-01' } }), card(), [], [], NOW);
ok(gate(g, 'licence').status === 'warn' && /credit line/.test(gate(g, 'licence').note[0]), 'a licence with no credit line is a warning');
g = gatesFor(src({ licence: { id: 'CC-BY-4.0', attribution: 'X', checked_on: '2024-01-01' } }), card(), [], [], NOW);
ok(gate(g, 'licence_age').status === 'warn', 'a licence nobody has checked for over a year is a warning');
g = gatesFor(src({ licence: { id: 'CC-BY-4.0', attribution: 'X', checked_on: '2026-09-01' } }), card(), [], [], NOW);
ok(gate(g, 'licence_age').status === 'pass', 'a licence checked within the year passes');
g = gatesFor(src({ licence: { id: 'CC-BY-4.0', attribution: 'X', checked_on: '2027-06-01' } }), card(), [], [], NOW);
ok(gate(g, 'licence_age').status === 'warn', 'a check date in the future is not a check');
g = gatesFor(src({ licence: { id: 'CC-BY-4.0', attribution: 'X' } }), card(), [], [], NOW);
ok(gate(g, 'licence_age').status === 'warn' && /Nobody has written down/.test(gate(g, 'licence_age').note[0]), 'a licence with no check date is a warning that says so');
g = gatesFor(src({ variables: [{ id: 'temperature' }, { id: 'unicorns' }] }), card(), [], [], NOW);
ok(gate(g, 'vocabulary').status === 'fail' && gate(g, 'vocabulary').items[0].id === 'unicorns', 'a measurement that is not in the vocabulary fails, and is named');

// every check is bilingual and says what it looked at
g = gatesFor(src({ layer: 'own' }), card(), [row()], rivers, NOW, [drop('range', { value: 999 }), drop('future')]);
ok(g.every((x) => Array.isArray(x.n) && x.n.length === 2 && x.n[0] && x.n[1] && x.n[0] !== x.n[1]), 'every check has an English and a Greek name');
ok(g.every((x) => (!x.note || (x.note[0] && x.note[1])) && x.items.every((i) => i.why[0] && i.why[1])), 'every note and reason is written in both languages');
ok(g.every((x) => ['pass', 'warn', 'fail'].includes(x.status) && x.checked >= x.failed), 'a check never reports more failures than the values it looked at');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
