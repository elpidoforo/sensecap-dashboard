'use strict';
/* blocks.js: "Build with blocks" for the Build studio.
 *
 * A student stacks up to five blocks (Show, For the last, As a, When it goes above, Compare with). The stack is saved as a small
 * "recipe": a list of choices, never code. This file
 *   - lists what a student may pick (buildOptions: only real schools and measurements the sensors report, never a GPS measurement),
 *   - checks a recipe against those choices and keeps nothing else (validate),
 *   - says the recipe in plain words in English and Greek (sentence), which is what a teacher reads,
 *   - reads the school averages (gather) and draws the page (render): plain HTML and SVG, no script at all.
 * Nothing a student writes is ever run. The only free text is the title and a short alert message, both escaped and checked by the
 * same "keep it private" rules as every other text in the studio (studio.js passes `unsafe` in).
 *
 * The page is drawn again each time it is opened, so an approved tool shows today's numbers, not the numbers of the day it was approved.
 * Data comes only through the studio's public, read-only data object (the same one the assistant uses): school averages of one measurement,
 * no GPS, no vehicle positions, nothing finer than a school.
 */
const { SCHOOLS } = require('./cities');

const HOURS = [1, 3, 6, 12, 24, 72, 168];
const CHARTS = ['line', 'bars', 'number', 'table'];
const COLOURS = { red: '#ff6b5b', orange: '#f2a56b', green: '#4cc38a', blue: '#5aa9ee' };
const MAX_ALERTS = 3;
const SAY_MAX = 60;
const TITLE_MAX = 80;
const GPS_IDS = new Set(['4197', '4198']);
const TZ = 'Asia/Nicosia';

const SCHOOL_EL = { larnaca: 'PASCAL Λάρνακα', lefkosia: 'PASCAL Λευκωσία', limassol: 'PASCAL Λεμεσός', paphos: 'Διεθνές Σχολείο Πάφου' };
const MEAS_EL = { 4097: 'Θερμοκρασία αέρα', 4098: 'Υγρασία αέρα', 4099: 'Ένταση φωτός', 4100: 'CO₂', 4101: 'Ατμοσφαιρική πίεση' };
const COLOUR_WORD = { red: ['red', 'κόκκινο'], orange: ['orange', 'πορτοκαλί'], green: ['green', 'πράσινο'], blue: ['blue', 'μπλε'] };
const CHART_WORD = { line: ['line chart', 'ως γραμμικό γράφημα'], bars: ['bar chart', 'ως ραβδογράφημα'], number: ['big number', 'ως ένα μεγάλο νούμερο'], table: ['small table', 'ως έναν μικρό πίνακα'] };

class BlockError extends Error {
  constructor(message, code) { super(message); this.code = code || 'blocks'; }
}
const bad = (message, code) => { throw new BlockError(message, code); };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

function measEl(mid, name) {
  if (MEAS_EL[mid]) return MEAS_EL[mid];
  if (/pm\s?2\.?5/i.test(name)) return 'PM2.5 (σωματίδια)';
  if (/pm\s?10/i.test(name)) return 'PM10 (σωματίδια)';
  return name;
}

/* ---------- what a student may pick ---------- */

// devices: the studio's public device list ({ eui, group, measurements }), names: { mid: [name, unit] }.
function buildOptions(devices, names) {
  const nm = names || {};
  const schools = SCHOOLS.map((s) => ({ id: s.id, name: s.key, el: SCHOOL_EL[s.id] || s.el, sensors: 0 }));
  const meas = new Map();
  for (const d of devices || []) {
    const sc = schools.find((s) => SCHOOLS.find((x) => x.id === s.id).key === d.group);
    if (!sc) continue;
    sc.sensors += 1;
    for (const m of (d.measurements || []).map(String)) {
      if (GPS_IDS.has(m)) continue;
      if (!meas.has(m)) {
        const n = nm[m] || ['Measurement ' + m, ''];
        meas.set(m, { id: m, name: String(n[0]), el: measEl(m, String(n[0])), unit: String(n[1] || ''), schools: new Set() });
      }
      meas.get(m).schools.add(sc.id);
    }
  }
  const measurements = [...meas.values()].sort((a, b) => Number(a.id) - Number(b.id)).map((m) => ({ ...m, schools: [...m.schools] }));
  return { schools: schools.filter((s) => s.sensors > 0), measurements, hours: HOURS.slice(), charts: CHARTS.slice(), colours: Object.keys(COLOURS), maxAlerts: MAX_ALERTS, sayMax: SAY_MAX, titleMax: TITLE_MAX };
}

/* ---------- checking a recipe ---------- */

// unsafeText() in school.js misses a phone number written with spaces or dashes, and these texts are short, so look for 7 or more digits in a row (separators allowed) too.
const phoneLike = (s) => /\d(?:[\s().-]?\d){6,}/.test(String(s));
const cleanSay = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

// Returns a new, clean recipe or throws BlockError. `unsafe(text)` (optional) returns a message when a text should stay private.
function validate(input, options, unsafe) {
  if (!isObj(input)) bad('Send the blocks as an object.', 'shape');
  const show = isObj(input.show) ? input.show : {};
  const meas = options.measurements.find((m) => m.id === String(show.measurement));
  if (!meas) bad('Pick what to show.', 'measurement');
  const school = options.schools.find((s) => s.id === String(show.school));
  if (!school) bad('Pick a school.', 'school');
  if (!meas.schools.includes(school.id)) bad('That school has no sensor for ' + meas.name + '.', 'nosensor');
  const hours = Number(input.last);
  if (!HOURS.includes(hours)) bad('Pick how far back to look.', 'last');
  const as = String(input.as);
  if (!CHARTS.includes(as)) bad('Pick how to show it.', 'as');
  const alerts = [];
  const list = input.alerts == null ? [] : input.alerts;
  if (!Array.isArray(list)) bad('Alerts must be a list.', 'alerts');
  if (list.length > MAX_ALERTS) bad('At most ' + MAX_ALERTS + ' alert blocks.', 'alerts');
  for (const a of list) {
    if (!isObj(a)) bad('An alert block is not right.', 'alerts');
    const when = a.when === 'below' ? 'below' : a.when === 'above' ? 'above' : null;
    if (!when) bad('An alert needs above or below.', 'alert_when');
    const value = typeof a.value === 'number' ? a.value : typeof a.value === 'string' && a.value.trim() !== '' ? Number(a.value) : NaN;
    if (!Number.isFinite(value) || Math.abs(value) > 1e7) bad('An alert needs a number.', 'alert_value');
    const colour = String(a.colour);
    if (!COLOURS[colour]) bad('Pick a colour for the alert.', 'alert_colour');
    const say = cleanSay(a.say);
    if ([...say].length > SAY_MAX) bad('The alert message can have at most ' + SAY_MAX + ' characters.', 'alert_say');
    if (say && phoneLike(say)) bad('The alert message has something that should stay private. Phone numbers are not allowed here.', 'alert_private');
    if (say && unsafe) { const m = unsafe(say); if (m) bad('The alert message has something that should stay private. ' + String(m).replace('in chat', 'here'), 'alert_private'); }
    alerts.push({ when, value: Math.round(value * 1000) / 1000, colour, say });
  }
  let compare = null;
  if (input.compare != null) {
    if (!isObj(input.compare)) bad('Pick a school to compare with.', 'compare');
    const other = options.schools.find((s) => s.id === String(input.compare.school));
    if (!other) bad('Pick a school to compare with.', 'compare');
    if (other.id === school.id) bad('Compare with a different school.', 'compare');
    if (!meas.schools.includes(other.id)) bad('That school has no sensor for ' + meas.name + '.', 'nosensor');
    compare = { school: other.id };
  }
  return { v: 1, show: { measurement: meas.id, school: school.id }, last: hours, as, alerts, compare };
}

/* ---------- plain words ---------- */

const durationWord = (h, lang) => {
  if (lang === 'el') return h === 1 ? 'την τελευταία ώρα' : h < 72 ? `τις τελευταίες ${h} ώρες` : `τις τελευταίες ${h / 24} ημέρες`;
  return h === 1 ? 'the last hour' : h < 72 ? `the last ${h} hours` : `the last ${h / 24} days`;
};
const numWord = (n) => String(Math.round(n * 1000) / 1000);

// "Air temperature" in the middle of a sentence is "air temperature". Names that start with an acronym or a digit (CO2, PM2.5) stay as they are.
const midSentence = (name) => (/^[A-ZΑ-ΩΆ-Ώ][a-zα-ωά-ώ]/.test(String(name)) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

function sentence(recipe, options, lang) {
  const el = lang === 'el';
  const meas = options.measurements.find((m) => m.id === recipe.show.measurement);
  const sch = (id) => options.schools.find((s) => s.id === id);
  const sname = (id) => { const s = sch(id); return s ? (el ? s.el : s.name) : id; };
  const unit = meas && meas.unit ? ' ' + meas.unit : '';
  const parts = [];
  parts.push(el
    ? `Δείξε ${meas ? midSentence(meas.el) : recipe.show.measurement} στο ${sname(recipe.show.school)} για ${durationWord(recipe.last, 'el')} ${CHART_WORD[recipe.as][1]}.`
    : `Show ${meas ? midSentence(meas.name) : recipe.show.measurement} at ${sname(recipe.show.school)} for ${durationWord(recipe.last, 'en')} as a ${CHART_WORD[recipe.as][0]}.`);
  for (const a of recipe.alerts) {
    const col = COLOUR_WORD[a.colour][el ? 1 : 0];
    if (el) parts.push(`Όταν ${a.when === 'above' ? 'ανέβει πάνω από' : 'πέσει κάτω από'} ${numWord(a.value)}${unit}, χρωμάτισέ το ${col}${a.say ? ` και γράψε «${a.say}»` : ''}.`);
    else parts.push(`When it ${a.when === 'above' ? 'goes above' : 'drops below'} ${numWord(a.value)}${unit}, colour it ${col}${a.say ? ` and say “${a.say}”` : ''}.`);
  }
  if (recipe.compare) parts.push(el ? `Σύγκρινε με το ${sname(recipe.compare.school)}.` : `Compare with ${sname(recipe.compare.school)}.`);
  return parts.join(' ');
}

function defaultTitle(recipe, options, lang) {
  const el = lang === 'el';
  const meas = options.measurements.find((m) => m.id === recipe.show.measurement);
  const sch = options.schools.find((s) => s.id === recipe.show.school);
  const m = meas ? (el ? meas.el : meas.name) : '';
  const s = sch ? (el ? sch.el : sch.name) : '';
  return (el ? `${m} στο ${s}` : `${m} at ${s}`).slice(0, TITLE_MAX);
}

/* ---------- reading the numbers ---------- */

const RAW_TTL = 60000;
const RAW_MAX = 200;
const rawCache = new Map();   // "eui|mid|days" -> { at, p } (p is the promise, so parallel callers share one request)
function rawSeries(data, eui, mid, days, now) {
  const k = `${eui}|${mid}|${days}`;
  const hit = rawCache.get(k);
  if (hit && now - hit.at < RAW_TTL) return hit.p;
  const p = Promise.resolve().then(() => data.series(eui, mid, days)).then((pts) => (Array.isArray(pts) ? pts : [])).catch(() => { rawCache.delete(k); return []; });
  rawCache.set(k, { at: now, p });
  while (rawCache.size > RAW_MAX) rawCache.delete(rawCache.keys().next().value);
  return p;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(null), ms).unref())]);

// Buckets: about 48 for a line, 24 for bars and tables, never narrower than 5 minutes.
function bucketPlan(hours, as) {
  const want = as === 'line' ? 48 : 24;
  const width = Math.max(5 * 60000, Math.round((hours * 3600000) / want / 60000) * 60000);
  return { width, count: Math.max(1, Math.floor((hours * 3600000) / width)) };
}

function bucketize(points, from, to, width) {
  const m = new Map();
  for (const p of points) {
    if (!(p.t >= from && p.t <= to)) continue;
    const i = Math.min(Math.floor((p.t - from) / width), Math.max(0, Math.ceil((to - from) / width) - 1));   // a reading exactly at the end goes in the last bucket
    const b = m.get(i) || { sum: 0, n: 0, last: 0 };
    b.sum += p.v; b.n += 1; b.last = Math.max(b.last, p.t);
    m.set(i, b);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([i, b]) => ({ t: from + i * width + width / 2, v: b.sum / b.n, n: b.n, last: b.last }));
}

async function schoolSeries(data, options, schoolId, mid, hours, as, now) {
  const school = options.schools.find((s) => s.id === schoolId);
  const meas = options.measurements.find((m) => m.id === mid);
  const out = { school: schoolId, mid, unit: meas ? meas.unit : '', sensors: 0, points: [], width: 0, from: now - hours * 3600000, to: now, latest: null, stats: null, error: null };
  const plan = bucketPlan(hours, as);
  out.width = plan.width;
  const key = SCHOOLS.find((s) => s.id === schoolId).key;
  let devices;
  try { devices = (await withTimeout(Promise.resolve().then(() => data.devices()), 8000)) || []; } catch (e) { devices = null; }
  if (!devices) { out.error = 'devices'; return out; }
  const mine = devices.filter((d) => d.group === key && (d.measurements || []).map(String).includes(String(mid))).slice(0, 12);
  out.sensors = mine.length;
  if (!school || !mine.length) return out;
  const days = Math.min(30, Math.max(1, Math.ceil(hours / 24)));
  const lists = await withTimeout(Promise.all(mine.map((d) => rawSeries(data, d.eui, mid, days, now))), 10000);
  if (!lists) { out.error = 'slow'; return out; }
  const pts = [];
  for (const l of lists) for (const p of l) {
    const t = typeof p.t === 'number' ? p.t : Date.parse(p.t), v = Number(p.v);
    if (Number.isFinite(t) && Number.isFinite(v)) pts.push({ t, v });
  }
  out.points = bucketize(pts, out.from, out.to, plan.width);
  if (out.points.length) {
    const vals = out.points.map((p) => p.v);
    const last = out.points[out.points.length - 1];
    out.latest = { t: last.last, v: last.v };
    out.stats = { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length };
  }
  return out;
}

// data: the studio's public data object. Never throws: a problem becomes `error` on the result and the page says so.
async function gather(recipe, options, data, now) {
  const t = now || Date.now();
  const main = await schoolSeries(data, options, recipe.show.school, recipe.show.measurement, recipe.last, recipe.as, t);
  const other = recipe.compare ? await schoolSeries(data, options, recipe.compare.school, recipe.show.measurement, recipe.last, recipe.as, t) : null;
  return { main, other, at: t };
}

/* ---------- drawing the page ---------- */

const fmtNum = (v, lang) => {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : 2;
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-GB', { maximumFractionDigits: d, useGrouping: a >= 10000 }).format(r);
};
const timeFmt = {};
function fmtClock(ms, lang, withDay) {
  const k = lang + (withDay ? 'd' : 't');
  if (!timeFmt[k]) timeFmt[k] = new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', withDay ? { timeZone: TZ, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false } : { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return timeFmt[k].format(new Date(ms));
}
function fmtDay(ms, lang) {
  const k = lang + 'x';
  if (!timeFmt[k]) timeFmt[k] = new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric' });
  return timeFmt[k].format(new Date(ms));
}
const durText = (ms, lang) => {
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  if (lang === 'el') return h ? (m ? `${h} ώρ. ${m} λεπ.` : `${h} ώρ.`) : `${m} λεπ.`;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
function yScale(values, zero) {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (zero) lo = Math.min(lo, 0);
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  if (!zero || lo < 0) lo -= pad;
  hi += pad;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}

const hit = (a, v) => (a.when === 'above' ? v > a.value : v < a.value);
// The first alert (in the order the student stacked them) that the value breaks.
const firing = (alerts, v) => alerts.find((a) => hit(a, v)) || null;

function chartSvg(recipe, res, lang, label) {
  const W = 480, H = 280, L = 50, R = 14, T = 14, B = 34, pw = W - L - R, ph = H - T - B;   // a small picture on purpose: a phone scales it down, and the labels stay readable
  const main = res.main, other = res.other;
  const vals = main.points.map((p) => p.v).concat(other ? other.points.map((p) => p.v) : [], recipe.alerts.map((a) => a.value));
  const ys = yScale(vals, recipe.as === 'bars');
  const t0 = main.from, t1 = main.to;
  const X = (t) => L + ((t - t0) / (t1 - t0)) * pw;
  const Y = (v) => T + (1 - (v - ys.lo) / (ys.hi - ys.lo)) * ph;
  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const g = [];
  for (const tv of ys.ticks) g.push(`<line class="grid" x1="${L}" y1="${f1(Y(tv))}" x2="${W - R}" y2="${f1(Y(tv))}"/><text class="ax" x="${L - 7}" y="${f1(Y(tv) + 4.5)}" text-anchor="end">${esc(fmtNum(tv, lang))}</text>`);
  const days = (t1 - t0) > 26 * 3600000;
  for (let i = 0; i <= 4; i++) {
    const tt = t0 + ((t1 - t0) * i) / 4;
    g.push(`<text class="ax" x="${f1(X(tt))}" y="${H - 10}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${esc(days ? fmtDay(tt, lang) : fmtClock(tt, lang))}</text>`);
  }
  for (const a of recipe.alerts) {
    g.push(`<line class="thr c-${a.colour}" x1="${L}" y1="${f1(Y(a.value))}" x2="${W - R}" y2="${f1(Y(a.value))}"/><text class="thl c-${a.colour}" x="${W - R - 4}" y="${f1(Y(a.value) - 5)}" text-anchor="end">${esc(fmtNum(a.value, lang))}${main.unit ? ' ' + esc(main.unit) : ''}</text>`);
  }
  if (recipe.as === 'bars') {
    const bw = Math.max(2, (main.width / (t1 - t0)) * pw - 2);
    for (const p of main.points) {
      const f = firing(recipe.alerts, p.v);
      const y0 = Y(Math.max(0, ys.lo)), y = Y(p.v);
      g.push(`<rect class="bar${f ? ' c-' + f.colour : ''}" x="${f1(X(p.t) - bw / 2)}" y="${f1(Math.min(y, y0))}" width="${f1(bw)}" height="${f1(Math.max(1, Math.abs(y0 - y)))}" rx="2"/>`);
    }
  } else {
    const path = (pts, width) => {
      let d = '', prev = null;
      for (const p of pts) {
        d += (prev && p.t - prev.t <= width * 3.5 ? 'L' : 'M') + f1(X(p.t)) + ' ' + f1(Y(p.v));
        prev = p;
      }
      return d;
    };
    if (other && other.points.length) g.push(`<path class="ln2" d="${path(other.points, other.width)}"/>`);
    if (main.points.length) g.push(`<path class="ln" d="${path(main.points, main.width)}"/>`);
    const last = main.points[main.points.length - 1];
    if (last) { const f = firing(recipe.alerts, last.v); g.push(`<circle class="dot${f ? ' c-' + f.colour : ''}" cx="${f1(X(last.t))}" cy="${f1(Y(last.v))}" r="5"/>`); }
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g.join('')}</svg>`;
}

const STYLE = `
:root{color-scheme:dark;--bg:#0c1626;--panel:#15263d;--line:#2a4161;--ink:#fff;--text:#d9e3ef;--mute:#9fb2ca;--copper:#f2a56b}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:22px 18px 28px}
h1{margin:0 0 2px;font-size:26px;line-height:1.2;color:var(--ink)}
.sub{margin:0 0 14px;color:var(--mute);font-size:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px 14px 10px;margin:0 0 14px}
.alert{margin:0 0 12px;padding:10px 14px;border-radius:12px;border:1px solid;font-weight:600}
.alert small{display:block;font-weight:400;margin-top:2px;opacity:.9}
.alert.c-red{color:#ffb3a9;background:rgba(255,107,91,.14);border-color:rgba(255,107,91,.55)}
.alert.c-orange{color:#ffd2ae;background:rgba(242,165,107,.14);border-color:rgba(242,165,107,.55)}
.alert.c-green{color:#a8ecc8;background:rgba(76,195,138,.14);border-color:rgba(76,195,138,.55)}
.alert.c-blue{color:#b5d6f7;background:rgba(90,169,238,.14);border-color:rgba(90,169,238,.55)}
svg{display:block;width:100%;max-width:640px;height:auto;margin:0 auto}
svg .grid{stroke:rgba(255,255,255,.1);stroke-width:1}svg .ax{fill:#a9bbd0;font-size:13px}
svg .ln{fill:none;stroke:var(--copper);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round}
svg .ln2{fill:none;stroke:#9fb2ca;stroke-width:2;stroke-dasharray:2 4;stroke-linecap:round}
svg .bar{fill:var(--copper)}svg .dot{fill:var(--copper);stroke:var(--bg);stroke-width:2}
svg .thr{stroke-width:1.5;stroke-dasharray:5 4}svg .thl{font-size:12.5px;font-weight:600}
svg .c-red{stroke:#ff6b5b;fill:#ff6b5b}svg .c-orange{stroke:#f2a56b;fill:#f2a56b}svg .c-green{stroke:#4cc38a;fill:#4cc38a}svg .c-blue{stroke:#5aa9ee;fill:#5aa9ee}
svg .thl.c-red,svg .thl.c-orange,svg .thl.c-green,svg .thl.c-blue{stroke:none}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin:4px 0 6px;color:var(--mute);font-size:13px}
.legend i{display:inline-block;width:16px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px;background:var(--copper)}
.legend i.o{background:#9fb2ca}
.big{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:2px 0 6px}
.big b{font-size:56px;line-height:1.05;color:var(--ink);font-weight:700;letter-spacing:-1px}
.big span{font-size:18px;color:var(--text)}
.big.c-red b{color:#ff8b7d}.big.c-orange b{color:#f7bd8e}.big.c-green b{color:#7fdcab}.big.c-blue b{color:#8cc4f5}
.stats{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 6px;color:var(--mute);font-size:14px}.stats b{color:var(--text)}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.two .card{margin:0}.two h2{margin:0 0 4px;font-size:15px;color:var(--mute);font-weight:600}
details{margin:0 0 14px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:12px;padding:8px 12px}
summary{cursor:pointer;font-weight:600;color:var(--text)}summary:focus-visible{outline:2px solid var(--copper);outline-offset:3px;border-radius:4px}
table{width:100%;border-collapse:collapse;margin:8px 0 4px;font-size:14px}
th,td{padding:5px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08)}th{color:var(--mute);font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tr.f td{font-weight:700}
.empty{padding:22px 8px;text-align:center;color:var(--mute)}.empty b{display:block;color:var(--text);font-size:17px;margin-bottom:4px}
.note{margin:6px 0 0;color:var(--mute);font-size:13px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

function tableHtml(recipe, res, lang, withDay) {
  const T = (en, el) => (lang === 'el' ? el : en);
  const main = res.main, other = res.other;
  const sname = (r) => (r.name || '');
  const rows = [];
  const t2v = new Map((other ? other.points : []).map((p) => [Math.round((p.t - other.from) / other.width), p.v]));
  const pts = main.points.slice().reverse();
  for (const p of pts) {
    const f = firing(recipe.alerts, p.v);
    const ov = other ? t2v.get(Math.round((p.t - main.from) / main.width)) : undefined;
    rows.push(`<tr${f ? ' class="f"' : ''}><td>${esc(fmtClock(p.t, lang, withDay))}</td><td class="n">${esc(fmtNum(p.v, lang))}</td>${other ? `<td class="n">${ov == null ? '–' : esc(fmtNum(ov, lang))}</td>` : ''}</tr>`);
  }
  const unit = main.unit ? ` (${esc(main.unit)})` : '';
  return `<table><thead><tr><th>${esc(T('Time', 'Ώρα'))}</th><th class="n">${esc(sname(main) + unit)}</th>${other ? `<th class="n">${esc(sname(other) + unit)}</th>` : ''}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// recipe: a clean recipe, res: the result of gather(), opts: { lang, title }. Returns a complete HTML page.
function render(recipe, options, res, opts) {
  const lang = opts && opts.lang === 'el' ? 'el' : 'en';
  const T = (en, el) => (lang === 'el' ? el : en);
  const meas = options.measurements.find((m) => m.id === recipe.show.measurement) || { name: recipe.show.measurement, el: recipe.show.measurement, unit: '' };
  const sch = (id) => options.schools.find((s) => s.id === id);
  const mName = lang === 'el' ? meas.el : meas.name;
  const sName = (id) => { const s = sch(id); return s ? (lang === 'el' ? s.el : s.name) : id; };
  res.main.name = sName(recipe.show.school);
  if (res.other) res.other.name = sName(recipe.compare.school);
  const title = String((opts && opts.title) || defaultTitle(recipe, options, lang)).slice(0, TITLE_MAX);
  const main = res.main;
  const unit = meas.unit ? ' ' + meas.unit : '';
  const span = durationWord(recipe.last, lang);
  const parts = [];
  const sub = [];
  sub.push(lang === 'el' ? `Για ${span}` : `For ${span}`);
  sub.push(main.sensors ? T(main.sensors === 1 ? 'one sensor at the school' : `average of ${main.sensors} sensors at the school`, main.sensors === 1 ? 'ένας αισθητήρας του σχολείου' : `μέσος όρος ${main.sensors} αισθητήρων του σχολείου`) : T('no sensors found', 'δεν βρέθηκαν αισθητήρες'));
  sub.push(T('drawn ', 'σχεδιάστηκε ') + fmtClock(res.at, lang));
  parts.push(`<h1>${esc(title)}</h1><p class="sub">${esc(sub.join(' · '))}</p>`);

  const latest = main.latest;
  const stale = latest && res.at - latest.t > Math.max(3 * 3600000, recipe.last * 3600000 * 0.25);
  const empty = !main.points.length;

  if (!empty) {
    const f = latest ? firing(recipe.alerts, latest.v) : null;
    if (f) parts.push(`<div class="alert c-${f.colour}" role="status">${esc(f.say || (f.when === 'above' ? T('Above ', 'Πάνω από ') : T('Below ', 'Κάτω από ')) + fmtNum(f.value, lang) + unit)}<small>${esc(T('Now ', 'Τώρα ') + fmtNum(latest.v, lang) + unit + (f.say ? ' · ' + (f.when === 'above' ? T('above ', 'πάνω από ') : T('below ', 'κάτω από ')) + fmtNum(f.value, lang) + unit : ''))}</small></div>`);
    for (const a of recipe.alerts) {
      const n = main.points.filter((p) => hit(a, p.v)).length;
      if (n && recipe.as !== 'table') parts.push(`<p class="note">${esc((a.when === 'above' ? T('Above ', 'Πάνω από ') : T('Below ', 'Κάτω από ')) + fmtNum(a.value, lang) + unit + T(' for about ', ' για περίπου ') + durText(n * main.width, lang) + T(' in this window.', ' σε αυτό το διάστημα.'))}</p>`);
    }
  }

  if (empty) {
    parts.push(`<div class="card"><div class="empty"><b>${esc(main.error ? T('The numbers could not be loaded right now.', 'Οι μετρήσεις δεν φορτώθηκαν αυτή τη στιγμή.') : T('No readings in this time window.', 'Καμία μέτρηση σε αυτό το διάστημα.'))}</b>${esc(main.error ? T('Open the tool again in a few minutes.', 'Άνοιξε ξανά το εργαλείο σε λίγα λεπτά.') : T('The sensors may be switched off, out of range or not sending. Try again later.', 'Οι αισθητήρες μπορεί να είναι κλειστοί, εκτός εμβέλειας ή να μην στέλνουν. Δοκίμασε ξανά αργότερα.'))}</div></div>`);
  } else if (recipe.as === 'number') {
    const one = (r, head) => {
      const fv = r.latest ? firing(recipe.alerts, r.latest.v) : null;
      return `<div class="card">${head ? `<h2>${esc(head)}</h2>` : ''}${r.latest ? `<div class="big${fv ? ' c-' + fv.colour : ''}"><b>${esc(fmtNum(r.latest.v, lang))}</b><span>${esc(meas.unit)}</span></div><div class="stats"><span>${esc(T('lowest', 'χαμηλότερο'))} <b>${esc(fmtNum(r.stats.min, lang))}</b></span><span>${esc(T('average', 'μέσος όρος'))} <b>${esc(fmtNum(r.stats.avg, lang))}</b></span><span>${esc(T('highest', 'υψηλότερο'))} <b>${esc(fmtNum(r.stats.max, lang))}</b></span></div><p class="note">${esc(T('Latest reading ', 'Τελευταία μέτρηση ') + fmtClock(r.latest.t, lang, res.at - r.latest.t > 20 * 3600000))}</p>` : `<div class="empty"><b>${esc(T('No readings', 'Καμία μέτρηση'))}</b></div>`}</div>`;
    };
    if (res.other) parts.push(`<div class="two">${one(main, main.name)}${one(res.other, res.other.name)}</div>`);
    else parts.push(one(main, ''));
  } else if (recipe.as === 'table') {
    parts.push(`<div class="card">${tableHtml(recipe, res, lang, recipe.last > 24)}</div>`);
  } else {
    const label = `${mName}, ${main.name}, ${span}`;
    parts.push(`<div class="card">${chartSvg(recipe, res, lang, label)}<div class="legend"><span><i></i>${esc(main.name)}</span>${res.other ? `<span><i class="o"></i>${esc(res.other.name)}</span>` : ''}${meas.unit ? `<span>${esc(meas.unit)}</span>` : ''}</div></div>`);
    parts.push(`<details><summary>${esc(T('Show the numbers', 'Δείξε τους αριθμούς'))}</summary>${tableHtml(recipe, res, lang, recipe.last > 24)}</details>`);
  }
  if (stale) parts.push(`<p class="note">${esc(T('The newest reading is old (', 'Η τελευταία μέτρηση είναι παλιά ('))}${esc(fmtClock(latest.t, lang, true))}${esc(T('): the sensors may be offline.', '): οι αισθητήρες μπορεί να είναι εκτός σύνδεσης.'))}</p>`);
  if (res.other && res.other.error && !res.other.points.length) parts.push(`<p class="note">${esc(T('No numbers could be read for ', 'Δεν διαβάστηκαν μετρήσεις για το ') + res.other.name + '.')}</p>`);
  parts.push(`<p class="note">${esc(T('Numbers are averages of low-cost school sensors, so use them as a good guide, not a lab result. Made with blocks.', 'Οι αριθμοί είναι μέσοι όροι από αισθητήρες χαμηλού κόστους των σχολείων, γι’ αυτό δες τους ως καλή ένδειξη, όχι ως εργαστηριακό αποτέλεσμα. Φτιάχτηκε με μπλοκ.'))}</p>`);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${parts.join('')}</main></body></html>`;
}

module.exports = { phoneLike, buildOptions, validate, sentence, defaultTitle, gather, render, BlockError, HOURS, CHARTS, COLOURS, MAX_ALERTS, SAY_MAX, TITLE_MAX, _t: { bucketPlan, bucketize, yScale, niceStep, fmtNum, firing, cleanSay, rawCache } };
