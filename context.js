'use strict';
/* Context layers: yearly and modelled background that helps explain the measurements, read from small files kept in context/.
 *
 *   bathing-water-history       the yearly quality label of every Cyprus bathing site, 2004 to 2025 (EEA, CC BY 4.0)
 *   waste-generation-national   municipal waste generated in Cyprus in 2023 and 2024 (CYSTAT)
 *   pv-solar-scenarios          what a standard 1 kWp solar panel would make in a year in each city (PVGIS 5.3, a model)
 *
 * These came out of the research handoff of 13 November 2026 (tickets T04 to T07). Rules that the code keeps:
 *   - Each file is a reviewed, frozen release. context/manifest.json holds its SHA-256; a file that does not match, or that breaks one of the
 *     checks below, is NOT shown (the layer says "not available"). The server never fetches a newer one by itself.
 *   - A context layer has a PERIOD (a season, a year, a reference climate), not a freshness. The time the server read the file is never
 *     shown as the time of the data.
 *   - Nothing here is evidence for the master brain: labels, national totals and modelled energy are never compared with measurements
 *     (the three source files say x_reads: false).
 *   - Bathing water: full reported labels, no score, no "improved" count, no safety badge; a missing season is unavailable, not zero.
 *   - Waste: one national number. The four school rows point to it and hold no local value.
 *   - Solar: a model for a generic city point, never a school roof, never a ranking. A city whose calculation failed is null, not zero.
 *
 * createContext({ root, log }) -> { ids, has(id), probe(id), view(id, query), csv(id) }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IDS = ['bathing-water-history', 'waste-generation-national', 'pv-solar-scenarios'];
const BATHING_LABELS = ['0 - Not classified', '1 - Excellent', '2 - Good', '3 - Good or Sufficient', '3 - Sufficient', '4 - Poor'];   // the full labels as reported; "3 - Good or Sufficient" is the older scheme and stays its own label
const CITIES = ['larnaka', 'lefkosia', 'limassol', 'paphos'];
const SCHOOLS = [['pascal-larnaka', 'PASCAL Larnaka'], ['pascal-lefkosia', 'PASCAL Lefkosia'], ['pascal-limassol', 'PASCAL Limassol'], ['paphos-international', 'International School of Paphos']];   // the slugs of school.js
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const need = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ---------- the checks: a file that fails one is not shown ---------- */
function checkBathing(j) {
  need(j && j.schema === 'smartcities.context.bathing/1', 'not a bathing-water file');
  need(Array.isArray(j.sites) && j.sites.length > 0, 'no sites');
  need(new Set(j.sites.map((s) => s.id)).size === j.sites.length, 'a site appears twice in the inventory');
  for (const s of j.sites) need(typeof s.id === 'string' && typeof s.name === 'string' && isFinite(s.lat) && isFinite(s.lng) && s.lat > 34 && s.lat < 36 && s.lng > 32 && s.lng < 35, 'a site without a name or a place in Cyprus: ' + (s && s.id));
  const years = Object.keys(j.seasons || {}).map(Number).sort((a, b) => a - b);
  need(years.length > 0 && years.every((y) => Number.isInteger(y) && y > 1989 && y < 2100), 'seasons must be whole years');
  let rows = 0;
  for (const y of years) for (const [id, label] of Object.entries(j.seasons[y])) { rows++; need(BATHING_LABELS.includes(label), `unknown quality label "${label}" (${id}, ${y})`); }
  need(years.includes(j.inventory_season), 'the inventory season is not among the seasons');
  const inv = j.seasons[j.inventory_season];
  need(j.sites.every((s) => inv[s.id]) && Object.keys(inv).length === j.sites.length, 'the inventory and its season do not list the same sites');
  return { years, rows };
}
function checkWaste(j) {
  need(j && j.schema === 'national-waste-context/1' && Array.isArray(j.rows) && j.rows.length > 0, 'not a national waste file');
  need(/^national/.test(String(j.scope)), 'the scope must be national');
  for (const r of j.rows) {
    need(Number.isInteger(r.year) && r.indicator_label === 'Total waste generated' && r.indicator_code === '0', 'a row is not "Total waste generated"');
    need(r.missing === false && isFinite(r.raw_value) && r.raw_value > 0 && r.raw_unit === 'Thousand tonnes', `the value of ${r.year} is missing or in an unknown unit`);
    need(Math.abs(Number(r.value_tonnes_decimal) - r.raw_value * 1000) < 0.5, `tonnes do not match thousand tonnes for ${r.year}`);
    need(r.provisional_status === 'provisional' || r.provisional_status === 'not_marked_provisional', `unknown provisional state for ${r.year}`);
    need(r.requires_value_review === false, `the value of ${r.year} is waiting for review`);
  }
  need(new Set(j.rows.map((r) => r.year)).size === j.rows.length, 'a year appears twice');
  return { years: j.rows.map((r) => r.year).sort((a, b) => a - b) };
}
function checkSolar(j) {
  need(Array.isArray(j) && j.length === 4 && CITIES.every((c) => j.some((x) => x.city === c)), 'the four cities must each have a row');
  for (const c of j) {
    if (c.status !== 'available') { need(c.result == null, `${c.city}: a failed calculation must have no result`); continue; }
    const r = c.result;
    need(r && r.kind === 'annual_climatology' && r.normalizer === 'pvgis53-fixed-annual-v1', `${c.city}: not a PVGIS 5.3 fixed annual result`);
    need(r.annual_energy && r.annual_energy.unit === 'kWh/y' && isFinite(r.annual_energy.value) && r.annual_energy.value >= 0, `${c.city}: annual energy must be in kWh/y`);
    need(Array.isArray(r.monthly_energy) && r.monthly_energy.length === 12 && new Set(r.monthly_energy.map((m) => m.month)).size === 12 && r.monthly_energy.every((m) => m.month >= 1 && m.month <= 12 && m.unit === 'kWh/mo' && isFinite(m.value) && m.value >= 0), `${c.city}: twelve monthly values in kWh/mo are needed`);
    need(Math.abs(r.monthly_energy.reduce((s, m) => s + m.value, 0) - r.annual_energy.value) <= 0.07, `${c.city}: the months do not add up to the year`);
    need(Array.isArray(r.reference_years) && r.reference_years[0] === 2005 && r.reference_years[1] === 2023, `${c.city}: the reference years must be 2005 to 2023`);
    const p = r.provider_inputs || {}, fx = ((p.mounting_system || {}).fixed) || {};
    need((p.pv_module || {}).peak_power === 1 && (p.pv_module || {}).system_loss === 14 && (p.pv_module || {}).technology === 'c-Si' && (fx.slope || {}).value === 30 && (fx.azimuth || {}).value === 0 && (p.meteo_data || {}).radiation_db === 'PVGIS-SARAH3', `${c.city}: the scenario is not the reviewed one (1 kWp, 14 % loss, 30 degrees, facing south)`);
    need(/^[0-9a-f]{64}$/.test(r.request_id) && /^[0-9a-f]{64}$/.test(r.result_id) && /^[0-9a-f]{64}$/.test(r.source_sha256), `${c.city}: the identities are missing`);
  }
  return {};
}

// The 2004 to 2025 comparison, for sites that exist in both seasons only. No score and no "improved" count are ever worked out.
function cohort(seasons, base, comp) {
  const a = seasons[base], b = seasons[comp];
  if (!a || !b) return { base, comparison: comp, available: false, missing: [!a ? base : null, !b ? comp : null].filter((x) => x != null) };
  const idsA = Object.keys(a), idsB = new Set(Object.keys(b));
  const shared = idsA.filter((id) => idsB.has(id));
  const t = new Map();
  for (const id of shared) { const k = a[id] + '\u0000' + b[id]; t.set(k, (t.get(k) || 0) + 1); }
  return {
    base, comparison: comp, available: true, base_sites: idsA.length, comparison_sites: idsB.size, shared: shared.length, base_only: idsA.length - shared.length, comparison_only: idsB.size - shared.length,
    transitions: [...t].map(([k, n]) => { const [from, to] = k.split('\u0000'); return { from, to, sites: n }; }).sort((x, y) => y.sites - x.sites || x.from.localeCompare(y.from) || x.to.localeCompare(y.to)),
    ordinal_score: null, improved_count: null,
  };
}

function createContext(opts = {}) {
  const root = opts.root || __dirname, dir = opts.dir || path.join(root, 'context');
  const log = opts.log || (() => {});
  const store = new Map();   // id -> { ok, error?, sha256, data, info }
  function load(id) {
    let entry = { ok: false, error: 'no such file', sha256: null };
    try {
      const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))[id];
      need(man && man.file === id + '.json' && /^[0-9a-f]{64}$/.test(man.sha256), 'not in the manifest');
      const buf = fs.readFileSync(path.join(dir, man.file));
      const got = sha256(buf);
      need(got === man.sha256, 'the file is not the reviewed one (its hash changed)');
      const data = JSON.parse(buf.toString('utf8'));
      const info = id === 'bathing-water-history' ? checkBathing(data) : id === 'waste-generation-national' ? checkWaste(data) : checkSolar(data);
      entry = { ok: true, sha256: got, bytes: buf.length, data, info };
    } catch (e) { entry = { ok: false, error: String((e && e.message) || e).slice(0, 200), sha256: null }; log(`Context ${id}: not shown: ${entry.error}`); }
    store.set(id, entry);
    return entry;
  }
  const get = (id) => store.get(id) || load(id);
  for (const id of IDS) { const e = load(id); if (e.ok) log(`Context ${id}: reviewed file read (${e.bytes} bytes, ${e.sha256.slice(0, 12)})`); }

  // For the Layers register: is it there, how much, and WHICH PERIOD it is about. "at" stays null: a context layer has no freshness.
  function probe(id) {
    const e = get(id);
    if (!e.ok) return { ok: false, n: 0, at: null, note: 'the reviewed file could not be read, so nothing is shown', noteEl: 'το ελεγμένο αρχείο δεν διαβάστηκε, γι’ αυτό δεν εμφανίζεται τίποτα' };
    if (id === 'bathing-water-history') { const y = e.info.years; return { ok: true, n: e.data.sites.length, at: null, period: [`seasons ${y[0]} to ${y[y.length - 1]}`, `περίοδοι ${y[0]} έως ${y[y.length - 1]}`], note: `${e.data.sites.length} bathing sites in ${e.data.inventory_season}`, noteEl: `${e.data.sites.length} σημεία κολύμβησης το ${e.data.inventory_season}` }; }
    if (id === 'waste-generation-national') { const y = e.info.years; return { ok: true, n: y.length, at: null, period: [`years ${y.join(' and ')}`, `έτη ${y.join(' και ')}`], note: 'one national number per year', noteEl: 'ένας εθνικός αριθμός ανά έτος' }; }
    const n = e.data.filter((c) => c.status === 'available').length;
    return { ok: n > 0, n, at: null, period: ['average year of 2005 to 2023', 'μέσο έτος 2005 έως 2023'], note: `${n} of 4 city scenarios`, noteEl: `${n} από 4 σενάρια πόλεων` };
  }

  function view(id, q = {}) {
    const e = get(id);
    if (!e.ok) return { id, available: false, reason: 'The reviewed file could not be read, so nothing is shown.' };
    const identity = { artifact_sha256: e.sha256, bytes: e.bytes };
    if (id === 'bathing-water-history') {
      const d = e.data, years = e.info.years, latest = d.inventory_season;
      const season = years.includes(Number(q.season)) ? Number(q.season) : latest;
      const baseAsked = q.base == null || q.base === '' ? years[0] : Number(q.base);
      const counts = {};
      for (const label of Object.values(d.seasons[season])) counts[label] = (counts[label] || 0) + 1;
      const known = new Map(d.sites.map((s) => [s.id, s]));
      return {
        id, available: true, kind: 'bathing', identity, release: d.source_release, published: d.source_published, attribution: d.attribution, transformation: d.transformation,
        seasons: years, season, site_years: e.info.rows, sites_in_season: Object.keys(d.seasons[season]).length,
        counts: BATHING_LABELS.filter((l) => counts[l]).map((l) => ({ label: l, sites: counts[l] })),
        // places are those of the latest inventory; a site of an earlier season that is not in it has no place here (its old place is not assumed)
        sites: Object.entries(d.seasons[season]).map(([sid, label]) => { const s = known.get(sid); return { id: sid, label, name: s ? s.name : null, lat: s ? s.lat : null, lng: s ? s.lng : null }; }).sort((a, b) => a.id.localeCompare(b.id)),
        places_from_season: latest,
        comparison: Number.isInteger(baseAsked) ? cohort(d.seasons, baseAsked, latest) : { base: null, comparison: latest, available: false, missing: [] },
      };
    }
    if (id === 'waste-generation-national') {
      const d = e.data;
      return {
        id, available: true, kind: 'waste', identity, attribution: d.rights_attribution, transformation: d.transformation, source_url: d.source_url, provider_updated: d.provider_updated, scope: 'national', complete_series: false,
        rows: d.rows.slice().sort((a, b) => a.year - b.year).map((r) => ({ year: r.year, thousand_tonnes: r.raw_value, tonnes: Number(r.value_tonnes_decimal), provisional: r.provisional_status === 'provisional', period_start: r.period_start, period_end_exclusive: r.period_end_exclusive })),
        // one national context, referenced by the four schools: no school has a local value, and the national number is never repeated as four
        schools: SCHOOLS.map(([slug, name]) => ({ school: slug, name, local_value: null, context: 'national', artifact_sha256: e.sha256 })),
      };
    }
    const d = e.data, first = (d.find((c) => c.status === 'available') || {}).result || {};
    return {
      id, available: true, kind: 'solar', identity, attribution: 'PVGIS, European Commission Joint Research Centre', model: 'PVGIS 5.3', reference_years: first.reference_years || null,
      scenario: { peak_power_kwp: 1, system_loss_percent: 14, tilt_degrees: 30, facing: 'south', module: 'crystalline silicon', mounting: 'free-standing', radiation_data: 'PVGIS-SARAH3' },
      cities: CITIES.map((c) => { const x = d.find((r) => r.city === c); const r = x && x.status === 'available' ? x.result : null; return { city: c, status: r ? 'available' : 'unavailable', annual_kwh: r ? r.annual_energy.value : null, monthly_kwh: r ? r.monthly_energy.slice().sort((a, b) => a.month - b.month).map((m) => m.value) : null, point: r ? { lat: r.provider_inputs.location.latitude, lng: r.provider_inputs.location.longitude } : null, request_id: r ? r.request_id : null, result_id: r ? r.result_id : null }; }),
    };
  }

  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : /^[=+\-@]/.test(s) ? "'" + s : s; };
  function csv(id) {
    const v = view(id);
    if (!v.available) return null;
    const rows = [];
    if (v.kind === 'bathing') {
      const d = get(id).data;
      rows.push(['site_id', 'site_name', 'season', 'quality_label_as_reported', 'source_release', 'artifact_sha256']);
      for (const y of v.seasons) for (const [sid, label] of Object.entries(d.seasons[y]).sort((a, b) => a[0].localeCompare(b[0]))) { const s = d.sites.find((x) => x.id === sid); rows.push([sid, s ? s.name : '', y, label, v.release, v.identity.artifact_sha256]); }
    } else if (v.kind === 'waste') {
      rows.push(['year', 'thousand_tonnes', 'tonnes', 'provisional', 'scope', 'artifact_sha256']);
      for (const r of v.rows) rows.push([r.year, r.thousand_tonnes, r.tonnes, r.provisional ? 'provisional' : 'not marked provisional', 'national', v.identity.artifact_sha256]);
    } else {
      rows.push(['city', 'status', 'annual_kwh_per_kwp', ...Array.from({ length: 12 }, (_, i) => 'month_' + (i + 1) + '_kwh'), 'model', 'reference_years', 'result_id']);
      for (const c of v.cities) rows.push([c.city, c.status, c.annual_kwh, ...(c.monthly_kwh || Array(12).fill(null)), v.model, (v.reference_years || []).join('-'), c.result_id]);
    }
    return '# ' + v.attribution + (v.transformation ? ' | ' + v.transformation : '') + '\n' + rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
  }

  return { ids: IDS.slice(), has: (id) => IDS.includes(id), probe, view, csv, reload: () => IDS.forEach(load), _t: { checkBathing, checkWaste, checkSolar, cohort, load, store } };
}

module.exports = { createContext, cohort, checkBathing, checkWaste, checkSolar, IDS, BATHING_LABELS };
