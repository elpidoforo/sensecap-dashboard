/*
  Depth line data (pure, tested by tests/viz/depthline_test.js). Built from the answer of /api/stack/seabed-profiles:
  `features` = profiles with `name`, `start` and `points` [{km, lat, lng, elevation (metres, negative below the sea surface),
  interpolated}]. ONE profile at a time. Every number is computed here, never in the drawing code.
    - x is the point's own `km` along the line from its start (the sheet says each line starts offshore, so the text never
      says "from the beach"); y is the point's own elevation. Nothing is smoothed and nothing is filled in between points.
    - A point with no elevation (null or not a number) is 'missing': no dot, no depth, a gap in the line.
    - A point the sheet marks `interpolated` keeps that mark (drawn hollow, its line dashed, said in its sentence).
    - The depth scale is fitted to the shown profile's OWN deepest point. Profiles are never put on one picture and no
      string compares one profile with another or calls deep water better or worse.
  model = { id, title, available, empty|null, profile (id), choices:[{id,name}], profiles:{<id>:view}, strings:{...pairs},
            legend:[[en,el]], note|null, honesty|null, source|null, asOf|null, ...view of the chosen profile }
  view  = { profileName, startName|null, hasPoints, points:[point], axis:{ x:{max, ticks:[{v,t,text}], label},
            y:{top, bottom, step, tSurface, ticks:[{v,t,text}], label} }, counts:{points, withValue, interpolated, missing, text},
            ariaLabel, textRows }
  point = { km, elevation|null, depth|null (metres below the surface = -elevation), missing, interpolated (bool),
            tx (0..1 along x), ty (0..1 from the top of the y axis, null when missing), kmText:[en,el], text:[en,el]|null
            (the depth as printed), label:[en,el] (full sentence) }
  select(model, profileId) -> the same model with another profile's view on top (used by the widget's set({profile})).
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.depthlineData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const TITLE = ['Seabed profile along one line', 'Προφίλ βυθού κατά μήκος μιας γραμμής'];
  const EMPTY = ['No seabed profiles are available right now.', 'Δεν υπάρχουν διαθέσιμα προφίλ βυθού αυτή τη στιγμή.'];
  const NO_POINTS = ['This profile has no points in the answer.', 'Αυτό το προφίλ δεν έχει σημεία στην απάντηση.'];
  // Greek spellings of the place names the sheet uses (names only; an unknown name is shown as the sheet gives it)
  const PLACES = { larnaka: 'Λάρνακα', larnaca: 'Λάρνακα', limassol: 'Λεμεσός', lemesos: 'Λεμεσός', paphos: 'Πάφος', pafos: 'Πάφος',
    'off finikoudes': 'Ανοιχτά των Φοινικούδων', 'off molos': 'Ανοιχτά του Μόλου', 'off paphos harbour': 'Ανοιχτά του λιμανιού της Πάφου' };
  const S = {
    yAxis: ['metres below the sea surface', 'μέτρα κάτω από την επιφάνεια της θάλασσας'],
    xAxis: ['km along the line, from its start', 'χλμ. κατά μήκος της γραμμής, από την αρχή της'],
    surface: ['sea surface', 'επιφάνεια θάλασσας'],
    startsAt: ['line starts', 'αρχή γραμμής'],
    choose: ['Profile', 'Προφίλ'],
    missing: ['no reported value', 'χωρίς αναφερόμενη τιμή'],
    keySolid: ['grid value', 'τιμή πλέγματος'],
    keyHollow: ['marked interpolated', 'σημειωμένη ως παρεμβολή'],
    hint: ['Move the pointer along the line, or use the left and right arrow keys, to read one point.', 'Μετακίνησε τον δείκτη κατά μήκος της γραμμής, ή χρησιμοποίησε τα βέλη αριστερά και δεξιά, για να διαβάσεις ένα σημείο.'],
    oneProfile: ['One profile at a time. The profiles are not drawn together.', 'Ένα προφίλ κάθε φορά. Τα προφίλ δεν σχεδιάζονται μαζί.'],
  };
  const L_SOLID = ['Filled dot and solid line: a grid value not marked as interpolated.', 'Γεμάτη κουκκίδα και συνεχής γραμμή: τιμή πλέγματος που δεν σημειώνεται ως παρεμβολή.'];
  const L_HOLLOW = ['Hollow dot and dashed line: a value the model marks as interpolated.', 'Κενή κουκκίδα και διακεκομμένη γραμμή: τιμή που το μοντέλο σημειώνει ως παρεμβολή.'];
  const L_GAP = ['A gap in the line: no reported value at that point. Nothing is filled in.', 'Κενό στη γραμμή: δεν υπάρχει αναφερόμενη τιμή σε εκείνο το σημείο. Τίποτα δεν συμπληρώνεται.'];
  const L_SCALE = ['The depth scale fits this profile\'s own points and is stretched upwards: depth is in metres, distance in kilometres.',
    'Η κλίμακα βάθους προσαρμόζεται στα σημεία αυτού του προφίλ και είναι μεγεθυμένη κατακόρυφα: το βάθος είναι σε μέτρα, η απόσταση σε χιλιόμετρα.'];
  const L_MODEL = ['Estimates from a gridded seabed model, for learning. They are not soundings and not for navigation.',
    'Εκτιμήσεις από πλεγματικό μοντέλο βυθού, για μάθηση. Δεν είναι βυθομετρήσεις και δεν είναι για ναυσιπλοΐα.'];

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null ? [String(p[0]), String(p[1])] : [String(fb), String(fb)]);
  const clean = (p) => [p[0].replace(/[«»]/g, '"'), p[1].replace(/[«»]/g, '"')];
  const dec = (v, n) => { const s = v.toFixed(n); return [s, s.replace('.', ',')]; };
  const kmNum = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? dec(Math.round(v), 0) : dec(v, 1));
  const place = (v, fb) => {
    if (Array.isArray(v)) return clean(pair(v, fb));
    const s = v == null || String(v).trim() === '' ? String(fb) : String(v).trim();
    return clean([s, PLACES[s.toLowerCase()] || s]);
  };
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9Ͱ-Ͽ]+/g, '-').replace(/^-+|-+$/g, '');
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    return +([1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw - 1e-12)).toFixed(10);
  }
  const digitsOf = (step) => { let d = 0; while (d < 6 && Math.abs(step * Math.pow(10, d) - Math.round(step * Math.pow(10, d))) > 1e-6) d++; return d; };

  function emptyModel(why) {
    const e = why || EMPTY;
    return { id: 'depthline', title: TITLE, available: false, empty: e, profile: null, profileName: null, startName: null, choices: [], profiles: {}, strings: S, legend: [],
      note: null, honesty: null, source: null, asOf: null, hasPoints: false, points: [],
      axis: { x: { max: 1, ticks: [], label: S.xAxis }, y: { top: 0, bottom: 1, step: null, tSurface: 0, ticks: [], label: S.yAxis } },
      counts: { points: 0, withValue: 0, interpolated: 0, missing: 0, text: null }, ariaLabel: e, textRows: [e] };
  }

  function profileView(f, id, tail) {
    const name = place(f.name, id), start = f.start != null && String(f.start).trim() !== '' ? place(f.start, '') : null;
    const raw = (Array.isArray(f.points) ? f.points : []).filter((p) => p && typeof p === 'object' && isNum(p.km) && p.km >= 0).slice().sort((a, b) => a.km - b.km);
    if (!raw.length) {
      const row = [name[0] + ': ' + NO_POINTS[0], name[1] + ': ' + NO_POINTS[1]];
      return { profileName: name, startName: start, hasPoints: false, points: [],
        axis: { x: { max: 1, ticks: [], label: S.xAxis }, y: { top: 0, bottom: 1, step: null, tSurface: 0, ticks: [], label: S.yAxis } },
        counts: { points: 0, withValue: 0, interpolated: 0, missing: 0, text: null }, ariaLabel: row, textRows: [row].concat(tail) };
    }
    // x axis: zero to the last point's km
    const kmMax = raw[raw.length - 1].km > 0 ? raw[raw.length - 1].km : 1, xStep = niceStep(kmMax / 6), xd = digitsOf(xStep), xTicks = [];
    for (let v = 0; v <= kmMax + 1e-9; v = +(v + xStep).toFixed(10)) xTicks.push({ v, t: v / kmMax, text: v === 0 ? ['0', '0'] : dec(v, xd) });
    // y axis: the sea surface at 0, down to a round number at or below this profile's own lowest value
    const vals = raw.map((p) => p.elevation).filter(isNum);
    const dMax = vals.length ? Math.max(0, -Math.min.apply(null, vals)) : 0, hMax = vals.length ? Math.max(0, Math.max.apply(null, vals)) : 0;
    let step = null, top = 0, bottom = 1; const yTicks = [];
    if (dMax + hMax > 0) {
      step = niceStep((dMax + hMax) / 5);
      bottom = +(step * Math.ceil(dMax / step - 1e-9)).toFixed(10); top = +(step * Math.ceil(hMax / step - 1e-9)).toFixed(10);
      if (bottom + top === 0) bottom = step;
      const yd = digitsOf(step);
      for (let v = top; v >= -bottom - 1e-9; v = +(v - step).toFixed(10)) yTicks.push({ v, t: (top - v) / (top + bottom), text: Math.abs(v) < 1e-12 ? ['0', '0'] : (v < 0 ? dec(-v, yd) : dec(v, yd).map((s) => '+' + s)) });
    } else if (vals.length) yTicks.push({ v: 0, t: 0, text: ['0', '0'] });
    const points = raw.map((p) => {
      const has = isNum(p.elevation), e = has ? p.elevation : null, interpolated = p.interpolated === true, k = kmNum(p.km);
      const kmText = [k[0] + ' km', k[1] + ' χλμ.'];
      const d = has ? dec(Math.abs(e), 1) : null, text = has ? [(e > 0 ? '+' : '') + d[0] + ' m', (e > 0 ? '+' : '') + d[1] + ' μ.'] : null;
      const how = interpolated ? ['marked as interpolated in the model', 'σημειωμένη ως παρεμβολή στο μοντέλο'] : ['grid value, not marked as interpolated', 'τιμή πλέγματος, χωρίς σήμανση παρεμβολής'];
      const what = !has ? null : (e > 0 ? ['ground ' + d[0] + ' m above the sea surface', 'έδαφος ' + d[1] + ' μ. πάνω από την επιφάνεια της θάλασσας']
        : ['seabed ' + d[0] + ' m below the sea surface', 'βυθός ' + d[1] + ' μ. κάτω από την επιφάνεια της θάλασσας']);
      const lead = [name[0] + ', ' + kmText[0] + ' along the line: ', name[1] + ', ' + kmText[1] + ' κατά μήκος της γραμμής: '];
      return { km: p.km, elevation: e, depth: has ? -e : null, missing: !has, interpolated, tx: Math.max(0, Math.min(1, p.km / kmMax)), ty: has ? (top - e) / (top + bottom) : null, kmText, text,
        label: has ? [lead[0] + what[0] + ' (' + how[0] + ')', lead[1] + what[1] + ' (' + how[1] + ')'] : [lead[0] + S.missing[0], lead[1] + S.missing[1]] };
    });
    const withValue = points.filter((p) => !p.missing).length, missing = points.length - withValue, interp = points.filter((p) => !p.missing && p.interpolated).length;
    const count = [(points.length === 1 ? '1 point' : points.length + ' points') + ' on this line: ' + interp + ' marked as interpolated, ' + missing + ' without a value.',
      (points.length === 1 ? '1 σημείο' : points.length + ' σημεία') + ' σε αυτή τη γραμμή: ' + interp + ' με σήμανση παρεμβολής, ' + missing + ' χωρίς τιμή.'];
    const where = start ? [' (' + S.startsAt[0] + ': ' + start[0] + ')', ' (' + S.startsAt[1] + ': ' + start[1] + ')'] : ['', ''];
    const head = [name[0] + where[0] + ': seabed profile, one model value per point, in metres below the sea surface.',
      name[1] + where[1] + ': προφίλ βυθού, μία τιμή μοντέλου ανά σημείο, σε μέτρα κάτω από την επιφάνεια της θάλασσας.'];
    const rows = points.map((p) => (p.missing ? [p.kmText[0] + ': ' + S.missing[0], p.kmText[1] + ': ' + S.missing[1]]
      : [p.kmText[0] + ': ' + p.text[0] + (p.interpolated ? ' (interpolated)' : ''), p.kmText[1] + ': ' + p.text[1] + (p.interpolated ? ' (παρεμβολή)' : '')]));
    const ariaLabel = [name[0] + where[0] + ': line chart of the seabed along one line, from its start outwards. ' + count[0] + ' ' + L_MODEL[0],
      name[1] + where[1] + ': γράφημα γραμμής του βυθού κατά μήκος μιας γραμμής, από την αρχή της προς τα ανοιχτά. ' + count[1] + ' ' + L_MODEL[1]];
    return { profileName: name, startName: start, hasPoints: true, points,
      axis: { x: { max: kmMax, ticks: xTicks, label: S.xAxis }, y: { top, bottom, step, tSurface: top / (top + bottom), ticks: yTicks, label: S.yAxis } },
      counts: { points: points.length, withValue, interpolated: interp, missing, text: count }, ariaLabel, textRows: [head].concat(rows, [count], tail) };
  }

  function select(model, id) {
    const v = model && model.profiles && Object.prototype.hasOwnProperty.call(model.profiles, id) ? model.profiles[id] : null;
    return v ? Object.assign({}, model, v, { profile: String(id) }) : model;
  }

  function build(ans, opts) {
    opts = opts || {};
    if (!ans || ans.available === false || !Array.isArray(ans.features)) return emptyModel();
    const feats = ans.features.filter((f) => f && typeof f === 'object');
    if (!feats.length) return emptyModel();
    const note = ans.note ? clean(pair(ans.note, '')) : null, honesty = ans.honesty ? clean(pair(ans.honesty, '')) : null, source = ans.source ? clean(pair(ans.source, '')) : null;
    const anyGap = feats.some((f) => Array.isArray(f.points) && f.points.some((p) => p && isNum(p.km) && !isNum(p.elevation)));
    const legend = [L_SOLID, L_HOLLOW].concat(anyGap ? [L_GAP] : [], [L_SCALE, S.oneProfile, L_MODEL]);
    const tail = legend.slice();
    if (note) tail.push(note);
    if (honesty) tail.push(honesty);
    if (source) tail.push(['Source: ' + source[0], 'Πηγή: ' + source[1]]);
    const profiles = {}, choices = [], used = new Set();
    feats.forEach((f, i) => {
      const nm = Array.isArray(f.name) ? f.name[0] : f.name;
      let id = String(f.id != null && f.id !== '' ? f.id : (slug(nm == null ? '' : nm) || 'profile-' + (i + 1))); while (used.has(id)) id += '-' + (i + 1); used.add(id);
      profiles[id] = profileView(f, id, tail); choices.push({ id, name: profiles[id].profileName });
    });
    const want = opts.profile != null && used.has(String(opts.profile)) ? String(opts.profile) : choices[0].id;
    const base = { id: 'depthline', title: TITLE, available: true, empty: null, profile: want, choices, profiles, strings: S, legend, note, honesty, source, asOf: ans.retrieved || ans.period || null };
    return select(base, want);
  }

  const api = { build, select, emptyModel, EMPTY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.depthlineData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
