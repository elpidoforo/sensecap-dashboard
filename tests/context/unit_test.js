'use strict';
/* Context layers (context.js): the three reviewed files, the checks that stop a wrong file, and the rules of the research handoff of
   13 November 2026 (tickets T04 to T07). Run: node tests/context/unit_test.js   (no network, no server) */
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { createContext, cohort } = require('../../context.js');
const { createLayers } = require('../../layers.js');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// a copy of context/ in a temp folder, with one file changed by fn(json) -> json; fixManifest: also write the new hash (a "reviewed" change)
function altered(id, fn, fixManifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-'));
  for (const f of fs.readdirSync(path.join(ROOT, 'context'))) fs.copyFileSync(path.join(ROOT, 'context', f), path.join(dir, f));
  const file = path.join(dir, id + '.json');
  const out = Buffer.from(JSON.stringify(fn(JSON.parse(fs.readFileSync(file, 'utf8')))));
  fs.writeFileSync(file, out);
  if (fixManifest) { const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); m[id].sha256 = sha(out); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m)); }
  const logs = []; return { ctx: createContext({ root: ROOT, dir, log: (m) => logs.push(m) }), logs };
}

(async () => {
  const C = createContext({ root: ROOT });
  /* ---- bathing water (T05) ---- */
  const B = C.view('bathing-water-history', { base: 2004 });
  ok(B.available && B.season === 2025 && B.sites_in_season === 123 && new Set(B.sites.map((s) => s.id)).size === 123, 'bathing: 2025 has 123 unique sites');
  ok(B.site_years === 2468, 'bathing: all 2468 Cyprus site-years are kept (' + B.site_years + ')');
  ok(B.sites.every((s) => s.lat > 34 && s.lat < 36 && s.name), 'bathing: every 2025 site has a name and a place');
  const c = B.comparison;
  ok(c.available && c.shared === 95 && c.base_only === 5 && c.comparison_only === 28 && c.base_sites === 100 && c.comparison_sites === 123, 'bathing: 2004 and 2025 share 95 sites, 5 only in 2004, 28 only in 2025');
  const tr = (from, to) => (c.transitions.find((t) => t.from === from && t.to === to) || {}).sites;
  ok(tr('1 - Excellent', '1 - Excellent') === 77 && tr('0 - Not classified', '1 - Excellent') === 9 && tr('4 - Poor', '1 - Excellent') === 5 && tr('3 - Good or Sufficient', '1 - Excellent') === 4, 'bathing: the transitions are 77, 9, 5 and 4, with full labels');
  ok(c.transitions.reduce((s, t) => s + t.sites, 0) === c.shared, 'bathing: the transitions add up to the shared sites');
  ok(c.ordinal_score === null && c.improved_count === null, 'bathing: no score and no "improved" count is worked out');
  let c2 = C.view('bathing-water-history', { base: 2021 }).comparison;
  ok(c2.shared === 120 && c2.base_only === 0 && c2.comparison_only === 3, 'bathing: 2021 and 2025 share 120 sites, 3 new');
  c2 = C.view('bathing-water-history', { base: 2024 }).comparison;
  ok(c2.shared === 123 && c2.transitions.length === 2, 'bathing: 2024 and 2025 share all 123');
  c2 = C.view('bathing-water-history', { base: 1999 }).comparison;
  ok(c2.available === false && c2.missing[0] === 1999 && c2.shared === undefined, 'bathing: a season that is not in the release is unavailable, not zero');
  ok(!cohort({ 2025: { a: '1 - Excellent' } }, 2026, 2025).available, 'bathing: 2026 cannot be made from a release that ends in 2025');
  const old = C.view('bathing-water-history', { season: 2004 });
  ok(old.season === 2004 && old.sites_in_season === 100 && old.sites.filter((s) => s.lat == null).length === 5, 'bathing: an old season lists its own sites; the 5 that are not in the 2025 list have no assumed place');
  ok(old.counts.some((k) => k.label === '3 - Good or Sufficient') && !old.counts.some((k) => k.label === '3 - Sufficient'), 'bathing: the older "Good or Sufficient" label stays its own label');
  let a = altered('bathing-water-history', (j) => { j.seasons[2025][j.sites[0].id] = '5 - Brilliant'; return j; }, true);
  ok(!a.ctx.view('bathing-water-history').available && /unknown quality label/.test(a.logs.join(' ')), 'bathing: an unknown label stops the layer');
  a = altered('bathing-water-history', (j) => { j.sites.push({ ...j.sites[0] }); return j; }, true);
  ok(!a.ctx.view('bathing-water-history').available, 'bathing: a site listed twice stops the layer');
  a = altered('bathing-water-history', (j) => { j.seasons[2025][j.sites[0].id] = '4 - Poor'; return j; }, false);
  ok(!a.ctx.view('bathing-water-history').available && !a.ctx.probe('bathing-water-history').ok && /hash changed/.test(a.logs.join(' ')), 'bathing: a file that is not the reviewed one is not shown');
  ok(a.ctx.view('waste-generation-national').available, 'one bad file does not take the others down');
  const csvB = C.csv('bathing-water-history');
  ok(csvB.split('\n').length === 2468 + 3 && csvB.includes('CC BY 4.0') && csvB.includes(B.identity.artifact_sha256), 'bathing: the table has every site-year, the credit and the file identity');

  /* ---- national waste (T06) ---- */
  const W = C.view('waste-generation-national');
  ok(W.rows.length === 2 && W.rows[0].year === 2023 && W.rows[0].thousand_tonnes === 633.29 && W.rows[1].year === 2024 && W.rows[1].thousand_tonnes === 669.06, 'waste: 633.29 and 669.06 thousand tonnes for 2023 and 2024');
  ok(W.rows[0].provisional === false && W.rows[1].provisional === true && W.rows[0].tonnes === 633290 && W.rows[1].tonnes === 669060, 'waste: 2024 is provisional, and tonnes are thousand tonnes times 1000');
  ok(W.schools.length === 4 && W.schools.every((s) => s.local_value === null && s.context === 'national' && s.artifact_sha256 === W.identity.artifact_sha256) && W.schools.some((s) => s.school === 'paphos-international'), 'waste: four school rows point to one national number and hold no local value');
  ok(W.scope === 'national' && W.complete_series === false && /CYSTAT is not responsible/.test(W.transformation), 'waste: national scope, two selected years, and the conversion is disclosed');
  ok(W.identity.artifact_sha256 === '6d3118d0b5244a52a400ce83f52eec9c615651a96e112fb6e8f239b8a9b685ce', 'waste: the file is the research artifact, byte for byte');
  ok(!/recycl/i.test(JSON.stringify(W)), 'waste: the unresolved recycling figures are left out');
  a = altered('waste-generation-national', (j) => { j.rows[1].raw_value = 700; return j; }, true);
  ok(!a.ctx.view('waste-generation-national').available, 'waste: a value that no longer matches its tonnes stops the layer');
  a = altered('waste-generation-national', (j) => { j.rows[0].indicator_label = 'Total waste recycled'; return j; }, true);
  ok(!a.ctx.view('waste-generation-national').available, 'waste: a relabelled indicator stops the layer');
  a = altered('waste-generation-national', (j) => { j.rows[1].missing = true; return j; }, true);
  ok(!a.ctx.view('waste-generation-national').available, 'waste: a missing selected value stops the layer');
  a = altered('waste-generation-national', (j) => { j.rows[0].raw_unit = 'Tonnes'; return j; }, true);
  ok(!a.ctx.view('waste-generation-national').available, 'waste: an unknown unit stops the layer');

  /* ---- solar scenarios (T07) ---- */
  const S = C.view('pv-solar-scenarios');
  ok(S.cities.length === 4 && S.cities.map((x) => x.city).join() === 'larnaka,lefkosia,limassol,paphos', 'solar: four city rows');
  ok(S.cities[0].annual_kwh === 1668.2 && S.cities[1].annual_kwh === 1630.96 && S.cities[2].annual_kwh === 1713.67 && S.cities[3].annual_kwh === 1708.72, 'solar: the four annual values of the research replay');
  ok(S.cities.every((x) => x.monthly_kwh.length === 12 && Math.abs(x.monthly_kwh.reduce((s, v) => s + v, 0) - x.annual_kwh) <= 0.07), 'solar: twelve months that add up to the year');
  ok(S.reference_years.join() === '2005,2023' && S.model === 'PVGIS 5.3' && S.scenario.peak_power_kwp === 1 && S.scenario.tilt_degrees === 30, 'solar: labelled as a 2005 to 2023 model of one stated scenario');
  ok(S.cities.every((x) => /^[0-9a-f]{64}$/.test(x.request_id) && /^[0-9a-f]{64}$/.test(x.result_id)), 'solar: request and result identities are kept');
  ok(!/rank|roof_yield|cost|payback/i.test(JSON.stringify(S)), 'solar: no ranking, roof or money fields');
  a = altered('pv-solar-scenarios', (j) => { const p = j.find((x) => x.city === 'paphos'); p.status = 'unavailable'; p.result = null; return j; }, true);
  let S2 = a.ctx.view('pv-solar-scenarios');
  ok(S2.available && S2.cities.length === 4 && S2.cities[3].status === 'unavailable' && S2.cities[3].annual_kwh === null && S2.cities[3].monthly_kwh === null, 'solar: a failed city keeps its row and is null, not zero');
  ok(/paphos,unavailable,,/.test(a.ctx.csv('pv-solar-scenarios')), 'solar: the table keeps the failed city as empty cells');
  a = altered('pv-solar-scenarios', (j) => { j[0].result.monthly_energy[0].value += 5; return j; }, true);
  ok(!a.ctx.view('pv-solar-scenarios').available, 'solar: months that do not add up stop the layer');
  a = altered('pv-solar-scenarios', (j) => { j[0].result.provider_inputs.mounting_system.fixed.slope.value = 35; return j; }, true);
  ok(!a.ctx.view('pv-solar-scenarios').available, 'solar: another scenario than the reviewed one stops the layer');
  a = altered('pv-solar-scenarios', (j) => { j[0].result.annual_energy.unit = 'MWh/y'; return j; }, true);
  ok(!a.ctx.view('pv-solar-scenarios').available, 'solar: an unknown unit stops the layer');
  a = altered('pv-solar-scenarios', (j) => j.slice(0, 3), true);
  ok(!a.ctx.view('pv-solar-scenarios').available, 'solar: a missing city row stops the layer');

  /* ---- in the register (T04): a period, not a freshness; never evidence for the brain ---- */
  const data = { deviceList: async () => [], devices: async () => [], latest: async () => ({}), names: () => ({}), cydom: async () => ({ points: [] }), metar: async () => ({ points: [] }), weather: async () => ({ points: [] }), air: async () => ({ points: [] }), sea: async () => ({ points: [] }), eea: () => null };
  const L = createLayers({ root: ROOT, data, context: C, pulse: false, log: () => {} });
  const view = await L._t.registerView(4000);
  for (const id of C.ids) {
    const l = view.layers.find((x) => x.id === id);
    ok(l && l.state === 'live' && l.lastAt === null && Array.isArray(l.period) && l.period.length === 2 && l.context === true && l.reads === false && l.group === 'context', id + ': live with a period, no "last reading", and not read by the brain');
  }
  const ev = await L._t.evidenceFor('larnaka', C.ids);
  ok(ev.rows.length === 0, 'the brain gets no evidence from the context layers');
  const L2 = createLayers({ root: ROOT, data, pulse: false, log: () => {} });
  const v2 = await L2._t.registerView(4000);
  ok(C.ids.every((id) => { const l = v2.layers.find((x) => x.id === id); return l.state === 'down' && !l.ok; }), 'a source file without its reader stays visibly not connected');
  ok(C.view('nope') && !C.has('nope'), 'an unknown id is not a context layer');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
