'use strict';
/* Data health (the page #/health): where every number comes from, and what the checks found.
 *
 * GET /api/health   200 { at, every, stages, totals, sources: [...], issues: [...], flow: {...}, builders: [...], feeds: [...] }
 *   stages  { sources, builders, checks, feeds }   the four steps a reading passes through
 *   totals  { pass, warn, fail, checked }          checks, and how many values they looked at
 *   sources [{ id, name, nameEl, group, kind, state, everyMs, lastAt, licence, holds, gates, sum }]
 *     gates [{ id, n: [en, el], kind, status: pass|warn|fail, checked, failed, note: [en, el], items: [{ id, why: [en, el] }] }]
 *   issues  the failed and warned gates, worst first, for "look at these first"
 *   flow    the drawing: readings now, how many passed and how many were left out, one lane per source, and why readings were left out
 *
 * The checks only report. A reading that fails is left out of the tools and the reason is named here; nothing is corrected by itself,
 * and no number is changed. Everything is read from what the site already knows:
 *   - the source files in sources/ (publisher, licence, how often it promises to send, which measurements it carries)
 *   - vocab/variables.json (the possible range and the unit of each measurement)
 *   - the live pulse (layers.js): the newest readings per city, their age, their unit, indoors or outdoors, and whether sources agree
 * The report is worked out at most once a minute and kept in memory; nothing is written to disk.
 *
 * createDataHealth({ layers, root, now, log }) -> { handle(req, res, url), report(), _t }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { unitText: layerUnit } = require('./layers');

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const CACHE_MS = 60000;
const DROP_GATES = new Set(['range', 'units', 'future']);   // the checks whose failures are readings that were left out
const LICENCE_DAYS = 365;           // a licence checked longer ago than this earns a warning
const FUTURE_SLACK = 3 * MIN;       // a clock a few minutes fast is not a reading from the future
const MAX_ITEMS = 8;                // examples kept per failed check

// The frozen extracts behind the investigations (#/fieldwork). They are not feeds: each one is a dated copy of a published file,
// kept in fieldwork/ and served as it is. So they are checked for what a copy can be checked for — who published it, under what
// licence, when it was taken, and whether the copy kept beside it still matches the fingerprint recorded when it was made.
const EXTRACT_GATE = {
  licence: ['Licence and publisher recorded', 'Η άδεια και ο εκδότης είναι καταγεγραμμένοι'],
  credit: ['Credit line recorded in both languages', 'Η αναφορά πηγής υπάρχει και στις δύο γλώσσες'],
  method: ['Method written down in both languages', 'Η μέθοδος είναι γραμμένη και στις δύο γλώσσες'],
  dated: ['Says when it was taken', 'Δηλώνει πότε πάρθηκε'],
  fingerprint: ['Still matches the file it was made from', 'Ταιριάζει ακόμη με το αρχείο από το οποίο φτιάχτηκε'],
};

// what Athena builds from what arrives; shown as the second stage
const BUILDERS = [
  { id: 'pulse', n: ['Live pulse', 'Ζωντανός παλμός'], d: ['Reads every source every 10 minutes and keeps the newest reading per city', 'Διαβάζει κάθε πηγή κάθε 10 λεπτά και κρατά την πιο πρόσφατη μέτρηση ανά πόλη'] },
  { id: 'day', n: ['The saved day', 'Η αποθηκευμένη μέρα'], d: ['Keeps 24 hours of readings so a day can be replayed', 'Κρατά 24 ώρες μετρήσεων ώστε να παίζει ξανά μια μέρα'] },
  { id: 'hourly', n: ['Hourly averages', 'Ωριαίοι μέσοι όροι'], d: ['Averages the readings of each hour, per city', 'Βγάζει τον μέσο όρο κάθε ώρας, ανά πόλη'] },
  { id: 'compare', n: ['Source comparison', 'Σύγκριση πηγών'], d: ['Puts the sources of one measurement side by side and says whether they agree', 'Βάζει δίπλα δίπλα τις πηγές μιας μέτρησης και λέει αν συμφωνούν'] },
  { id: 'forecast', n: ['Next hours', 'Επόμενες ώρες'], d: ['Simple rules tested on the saved day', 'Απλοί κανόνες δοκιμασμένοι στην αποθηκευμένη μέρα'] },
  { id: 'city', n: ['City centres', 'Κέντρα πόλεων'], d: ['Buildings and streets of the four centres from OpenStreetMap', 'Κτίρια και δρόμοι των τεσσάρων κέντρων από το OpenStreetMap'] },
];
// the tools that read the feeds; shown as the fourth stage and on the right of the drawing
const FEEDS = [
  { id: 'layers', n: ['Live layers', 'Ζωντανά στρώματα'] }, { id: 'replay', n: ['Replay the day', 'Επανάληψη της μέρας'] },
  { id: 'compare', n: ['Versus', 'Αντιπαράθεση'] }, { id: 'workshop', n: ['Workshop', 'Εργαστήρι'] },
  { id: 'forecast', n: ['Next-hour forecast', 'Πρόβλεψη επόμενης ώρας'] }, { id: 'city', n: ['City in 3D', 'Πόλη σε 3D'] },
  { id: 'toolkit', n: ['Toolkit', 'Εργαλειοθήκη'] },
];
// quality.kind in sources/_schema.json: what sort of instrument or working-out the numbers come from
const SOURCE_KIND = {
  'reference-station': ['Reference station', 'Σταθμός αναφοράς'],
  'calibrated-network': ['Calibrated network', 'Βαθμονομημένο δίκτυο'],
  'low-cost-sensor': ['Low-cost sensor', 'Αισθητήρας χαμηλού κόστους'],
  'crowd-sourced': ['Sent in by people', 'Από το κοινό'],
  model: ['Model', 'Μοντέλο'],
  reanalysis: ['Reanalysis', 'Επανανάλυση'],
  satellite: ['Satellite', 'Δορυφόρος'],
  survey: ['Survey', 'Έρευνα'],
  statistics: ['Statistics', 'Στατιστικά'],
  map: ['Map', 'Χάρτης'],
  unknown: ['Not stated', 'Δεν δηλώνεται'],
};
// representativeness.environment: where a sensor of ours actually stands
const ENV = { indoor: ['indoors', 'μέσα'], outdoor: ['outdoors', 'έξω'], vehicle: ['on a vehicle', 'πάνω σε όχημα'], mixed: ['some indoors, some outdoors', 'άλλοι μέσα, άλλοι έξω'], 'not-applicable': ['not a place measurement', 'δεν αφορά σημείο'] };
const GATE = {
  arrives: ['Arrives as often as it promises', 'Φτάνει όσο συχνά υπόσχεται'],
  range: ['Values are possible', 'Οι τιμές είναι δυνατές'],
  units: ['Units match the vocabulary', 'Οι μονάδες ταιριάζουν με το λεξιλόγιο'],
  future: ['No reading from the future', 'Καμία μέτρηση από το μέλλον'],
  env: ['Indoors or outdoors is recorded', 'Καταγράφεται αν είναι μέσα ή έξω'],
  agrees: ['Agrees with another source', 'Συμφωνεί με άλλη πηγή'],
  licence: ['Licence recorded and credited', 'Η άδεια είναι καταγεγραμμένη και αναφέρεται'],
  licence_age: ['Licence checked recently', 'Η άδεια ελέγχθηκε πρόσφατα'],
  vocabulary: ['Measurements are in the vocabulary', 'Οι μετρήσεις υπάρχουν στο λεξιλόγιο'],
};
const KIND = { time: ['timing', 'χρονισμός'], values: ['values', 'τιμές'], meta: ['paperwork', 'τεκμηρίωση'], cross: ['checked against another source', 'διασταύρωση'] };
const STATE_WORD = { live: ['sending now', 'στέλνει τώρα'], late: ['late', 'καθυστερεί'], down: ['quiet', 'σιωπηλή'], candidate: ['not switched on yet', 'δεν έχει ενεργοποιηθεί'], planned: ['planned', 'σχεδιασμένη'], retired: ['retired', 'αποσύρθηκε'] };

const isoMs = (s) => {   // "PT10M", "P1D" -> milliseconds
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s || ''));
  if (!m) return null;
  const v = (Number(m[1] || 0) * DAY) + (Number(m[2] || 0) * HOUR) + (Number(m[3] || 0) * MIN) + (Number(m[4] || 0) * 1000);
  return v > 0 ? v : null;
};
const r1 = (v) => Math.round(v * 10) / 10;
// Near a bound one decimal can read as "1000.0 is outside 0 to 1000", so a value that close keeps enough digits to show the difference.
const rr = (v, range) => {
  const near = Array.isArray(range) && range.some((b2) => Math.abs(v - b2) < 0.05);
  return near ? String(Number(v.toFixed(3))) : String(r1(v));
};
const worst = (a, b) => (a === 'fail' || b === 'fail' ? 'fail' : a === 'warn' || b === 'warn' ? 'warn' : 'pass');

function createDataHealth(o) {
  const layers = o.layers || null;
  const root = o.root || __dirname;
  const now = o.now || Date.now;
  const log = o.log || (() => {});
  let vocab = {};   // replaced on every report by the one the register just read, so a change to vocab/variables.json needs no restart
  try { vocab = JSON.parse(fs.readFileSync(path.join(root, 'vocab', 'variables.json'), 'utf8')); } catch (e) { log('Data health: the vocabulary could not be read: ' + e.message); }
  // the same table the pages use (layers.js), so a check never disagrees with what is shown
  const unitText = (u) => (Array.isArray(u) ? u : [u]).map((x) => layerUnit(x)).filter(Boolean);
  const unitOk = (rowUnit, u) => { const want = unitText(u); return !want.length || !rowUnit || want.some((w) => String(w).toLowerCase() === String(rowUnit).toLowerCase()); };
  let cache = null;

  // The investigations' frozen extracts: one report line each, with the checks a dated copy can honestly be given.
  function extractsReport() {
    const dir = path.join(root, 'fieldwork');
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !/-source\./.test(f)).sort(); }
    catch (e) { return { items: [], totals: { pass: 0, warn: 0, fail: 0 } }; }
    const items = names.map((file) => {
      const id = file.slice(0, -5);
      let d = null;
      try { d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch (e) { d = null; }
      const gates = [];
      const add = (gid, status, note) => gates.push({ id: gid, n: EXTRACT_GATE[gid], kind: 'meta', status, checked: 1, failed: status === 'pass' ? 0 : 1, note, items: [] });
      if (!d) {
        add('licence', 'fail', ['This extract could not be read, so nothing about it can be checked.', 'Αυτό το απόσπασμα δεν διαβάστηκε, άρα δεν μπορεί να ελεγχθεί τίποτα για αυτό.']);
        return { id, name: id, nameEl: id, rows: 0, gates, sum: { status: 'fail' } };
      }
      const pub = d.attribution || '', lic = d.licence || '';
      add('licence', lic ? 'pass' : 'fail',
        lic ? [lic, lic] : ['No licence is recorded for this extract, so it must not be used in published work.', 'Δεν έχει καταγραφεί άδεια για αυτό το απόσπασμα, άρα δεν πρέπει να χρησιμοποιηθεί σε δημοσιευμένη εργασία.']);
      add('credit', pub && d.attributionEl ? 'pass' : pub ? 'warn' : 'fail',
        pub && d.attributionEl ? [pub, d.attributionEl]
          : pub ? ['The credit line is recorded in English only, so the Greek page cannot show it.', 'Η αναφορά πηγής υπάρχει μόνο στα αγγλικά, άρα η ελληνική σελίδα δεν μπορεί να τη δείξει.']
            : ['No credit line is recorded, so the publisher cannot be named on the page.', 'Δεν έχει καταγραφεί αναφορά πηγής, άρα ο εκδότης δεν μπορεί να αναφερθεί στη σελίδα.']);
      add('method', d.method && d.methodEl ? 'pass' : 'warn',
        d.method && d.methodEl ? ['Recorded in English and Greek.', 'Καταγεγραμμένη στα αγγλικά και στα ελληνικά.']
          : d.method ? ['The method is written in English only.', 'Η μέθοδος είναι γραμμένη μόνο στα αγγλικά.']
            : ['No method is written down, so a pupil cannot tell how these numbers were made.', 'Δεν έχει γραφτεί μέθοδος, άρα ένας μαθητής δεν μπορεί να ξέρει πώς φτιάχτηκαν αυτοί οι αριθμοί.']);
      const when = d.referenceDate || d.retrievedAt;
      add('dated', when ? 'pass' : 'warn',
        when ? [`Taken ${String(d.retrievedAt || '').slice(0, 10) || String(d.referenceDate).slice(0, 10)}${d.referenceDate ? `, covering ${d.referenceDate}` : ''}.`,
          `Πάρθηκε ${String(d.retrievedAt || '').slice(0, 10) || String(d.referenceDate).slice(0, 10)}${d.referenceDate ? `, για ${d.referenceDate}` : ''}.`]
          : ['Neither the date it was taken nor the period it covers is recorded.', 'Δεν έχει καταγραφεί ούτε πότε πάρθηκε ούτε ποια περίοδο καλύπτει.']);
      // the fingerprint: only a copy kept here can be checked from this computer
      const sha = d.sourceSha256 || null;
      let kept = null;
      try { kept = fs.readdirSync(dir).find((f) => f.startsWith(id + '-source.')) || null; } catch (e) { kept = null; }
      if (sha && kept) {
        let have = null;
        try { have = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, kept))).digest('hex'); } catch (e) { have = null; }
        add('fingerprint', have === sha ? 'pass' : 'warn',
          have === sha ? [`The copy kept here (${kept}) still matches the fingerprint recorded when this extract was made.`, `Το αντίγραφο που φυλάσσεται εδώ (${kept}) ταιριάζει ακόμη με το αποτύπωμα που καταγράφηκε όταν φτιάχτηκε το απόσπασμα.`]
            : [`The copy kept here (${kept}) does not match the recorded fingerprint. Either the fingerprint belongs to the original download rather than this copy, or the copy has changed since.`,
              `Το αντίγραφο εδώ (${kept}) δεν ταιριάζει με το καταγεγραμμένο αποτύπωμα. Είτε το αποτύπωμα αφορά το αρχικό αρχείο που κατέβηκε, είτε το αντίγραφο έχει αλλάξει.`]);
      } else if (sha) {
        add('fingerprint', 'warn', ['A fingerprint of the original file is recorded, but the file itself is not kept here, so it cannot be checked from this computer.', 'Έχει καταγραφεί αποτύπωμα του αρχικού αρχείου, αλλά το αρχείο δεν φυλάσσεται εδώ, άρα δεν μπορεί να ελεγχθεί από αυτόν τον υπολογιστή.']);
      } else {
        add('fingerprint', 'warn', ['No fingerprint of the original file is recorded, so nobody can tell whether these numbers still match it.', 'Δεν έχει καταγραφεί αποτύπωμα του αρχικού αρχείου, άρα κανείς δεν μπορεί να πει αν οι αριθμοί ταιριάζουν ακόμη με αυτό.']);
      }
      const rows = Array.isArray(d.series) ? d.series.reduce((a, x) => a + ((x && x.values && x.values.length) || (x && x.points && x.points.length) || 0), 0) : 0;
      const sum = { status: gates.some((g) => g.status === 'fail') ? 'fail' : gates.some((g) => g.status === 'warn') ? 'warn' : 'pass' };
      return { id, name: d.title || id, nameEl: d.titleEl || d.title || id, publisher: pub || null, licence: lic || null,
        sourceUrl: d.sourceUrl || null, licenceUrl: d.licenceUrl || null, rows, gates, sum };
    });
    const totals = items.reduce((a, it) => { it.gates.forEach((g) => { a[g.status]++; }); return a; }, { pass: 0, warn: 0, fail: 0 });
    return { items, totals };
  }

  // One source: the checks that can be made from what it declares, plus the live readings it sent.
  function gatesFor(src, card, rows, rivers, t, dropped, unitsSeen) {
    const drops = dropped || [];
    const of = (why) => drops.filter((d) => d.why === why);
    const gates = [], vars = (src.variables || []).map((v) => v.id);
    const add = (id, kind, status, checked, failed, note, items) => gates.push({ id, n: GATE[id], kind, status, checked, failed, note: note || null, items: items || [] });

    // 1. does it arrive as often as it says it does
    const every = isoMs(src.update && src.update.every), stale = isoMs(src.quality && src.quality.stale_after);
    const bar = stale || (every ? every * 3 : null);
    if (card && card.lastAt && bar) {
      const age = t - card.lastAt, late = age > bar;
      add('arrives', 'time', late ? (age > bar * 4 ? 'fail' : 'warn') : 'pass', 1, late ? 1 : 0,
        late ? [`Last reading ${Math.round(age / MIN)} minutes ago; it says it sends every ${Math.round((every || bar) / MIN)} minutes.`,
          `Τελευταία μέτρηση πριν ${Math.round(age / MIN)} λεπτά· λέει ότι στέλνει κάθε ${Math.round((every || bar) / MIN)} λεπτά.`]
          : [`Last reading ${Math.round(age / MIN)} minutes ago.`, `Τελευταία μέτρηση πριν ${Math.round(age / MIN)} λεπτά.`]);
    } else if (card && (card.state === 'down' || card.state === 'late') && bar) {
      add('arrives', 'time', 'warn', 1, 1, ['Nothing has arrived from this source since the site last started, so there is no reading to check.', 'Δεν έχει έρθει τίποτα από αυτή την πηγή από την τελευταία εκκίνηση του ιστότοπου, άρα δεν υπάρχει μέτρηση για έλεγχο.']);
    }

    // 2-4. the readings themselves. A reading that is impossible, in the wrong unit or stamped in the future never becomes a row:
    // layers.js throws it away as it reads the source, and says so here. Checked = the readings kept plus the ones thrown away.
    const seen = rows.length;
    const at = (d) => (d.t ? ` (${new Date(d.t).toISOString().slice(11, 16)} UTC)` : '');
    const un = (variable) => { const u = unitText((vocab[variable] || {}).unit); return u.length ? ' ' + u[0] : ''; };
    const kinds = [
      ['range', 'values', (d) => { const v = vocab[d.variable] || {}; const u = un(d.variable), has = Array.isArray(v.range);
        const rEn = has ? `${v.range[0]}${u} to ${v.range[1]}${u}` : 'the range for this measurement';
        const rEl = has ? `${v.range[0]}${u} έως ${v.range[1]}${u}` : 'το εύρος αυτής της μέτρησης';
        const val = d.value == null ? 'A value' : rr(d.value, v.range) + u;
        const valEl = d.value == null ? 'Μια τιμή' : rr(d.value, v.range) + u;
        return [`${val}${at(d)} is outside the possible range ${rEn}, so it was left out.`, `${valEl}${at(d)}: εκτός του δυνατού εύρους ${rEl}, άρα έμεινε εκτός.`]; }],
      ['future', 'time', (d) => ['Stamped later than the clock allows' + at(d) + '; the sensor clock may be wrong, so it was left out.', 'Σφραγίδα αργότερα από όσο επιτρέπει το ρολόι' + at(d) + '· το ρολόι του αισθητήρα μπορεί να είναι λάθος, άρα έμεινε εκτός.']],
    ];
    kinds.forEach(([why, kind, reason]) => {
      const list = of(why), checked = seen + list.length;
      if (!checked) return;
      add(why, kind, list.length ? 'fail' : 'pass', checked, list.length, null,
        list.slice(0, MAX_ITEMS).map((d) => ({ id: d.city + ' · ' + d.variable, why: reason(d) })));
    });
    // units: only what was really compared. Most sources do not send a unit at all, and their readings are stored in the unit the
    // vocabulary asks for, so there is nothing to compare; what can be compared is the unit the source file itself declares.
    const declared = (src.variables || []).filter((v) => v.unit && vocab[v.id] && vocab[v.id].unit);
    const wrong = declared.filter((v) => String(v.unit).toLowerCase() !== String(vocab[v.id].unit).toLowerCase());
    const unitDrops = of('unit'), compared = declared.length + (unitsSeen || 0);
    if (compared) {
      const bad = wrong.length + unitDrops.length;
      add('units', 'meta', bad ? 'fail' : 'pass', compared, bad,
        [`${declared.length} units written in the source file` + (unitsSeen ? ` and ${unitsSeen} readings that carried their own unit` : '') + ' were compared with the vocabulary. Readings that arrive without a unit are stored in the unit the vocabulary asks for.',
          `${declared.length} μονάδες γραμμένες στο αρχείο της πηγής` + (unitsSeen ? ` και ${unitsSeen} μετρήσεις που είχαν δική τους μονάδα` : '') + ' συγκρίθηκαν με το λεξιλόγιο. Όσες φτάνουν χωρίς μονάδα αποθηκεύονται στη μονάδα που ζητά το λεξιλόγιο.'],
        wrong.map((v) => ({ id: v.id, why: [`The source file says ${v.unit}; the vocabulary says ${vocab[v.id].unit}.`, `Το αρχείο της πηγής λέει ${v.unit}· το λεξιλόγιο λέει ${vocab[v.id].unit}.`] }))
          .concat(unitDrops.slice(0, MAX_ITEMS).map((d) => ({ id: d.city + ' · ' + d.variable, why: [`Sent in another unit; the vocabulary says ${unitText((vocab[d.variable] || {}).unit).join(' or ') || 'something else'}, so it was left out.`, `Στάλθηκε σε άλλη μονάδα· το λεξιλόγιο λέει ${unitText((vocab[d.variable] || {}).unit).join(' ή ') || 'κάτι άλλο'}, άρα έμεινε εκτός.`] })))
          .slice(0, MAX_ITEMS));
    }
    // a sensor of ours must say where it stands: readings taken indoors are never compared with outdoor air
    if (src.layer === 'own') {
      const env = (src.representativeness && src.representativeness.environment) || null;
      add('env', 'meta', env ? 'pass' : 'fail', 1, env ? 0 : 1,
        env ? [`Recorded as ${ENV[env] ? ENV[env][0] : env}.`, `Καταγεγραμμένο ως ${ENV[env] ? ENV[env][1] : env}.`]
          : ['The source file does not say whether these sensors stand indoors or outdoors, so Athena cannot stop their readings being compared with outdoor air.', 'Το αρχείο της πηγής δεν λέει αν αυτοί οι αισθητήρες είναι μέσα ή έξω, άρα η Athena δεν μπορεί να εμποδίσει τη σύγκρισή τους με τον αέρα έξω.']);
    }

    // 5. does it agree with the other sources of the same measurement, where there is another source
    const mine = rivers.filter((rv) => rv.sources.includes(src.id));
    if (mine.length) {
      let checked = 0, differ = [];
      mine.forEach((rv) => Object.keys(rv.cities || {}).forEach((c) => {
        const st = rv.cities[c]; if (!st || st.state === 'unknown' || !(st.sources || []).includes(src.id)) return;
        checked++;
        const u = (Array.isArray(rv.unit) ? rv.unit[0] : rv.unit) ? ' ' + (Array.isArray(rv.unit) ? rv.unit[0] : rv.unit) : '';
        if (st.state === 'differ') differ.push({ id: c + ' · ' + rv.variable, why: [`The sources are ${r1(st.spread)}${u} apart, more than the ${r1(st.tolerance)}${u} allowed for this measurement.`, `Οι πηγές απέχουν ${r1(st.spread)}${u}, πάνω από το επιτρεπτό ${r1(st.tolerance)}${u} για αυτή τη μέτρηση.`] });
      }));
      if (checked) add('agrees', 'cross', differ.length ? 'warn' : 'pass', checked, differ.length,
        differ.length ? ['A difference is not a mistake by itself: two instruments in different places can both be right.', 'Η διαφορά δεν είναι από μόνη της λάθος: δύο όργανα σε διαφορετικά σημεία μπορεί να έχουν και τα δύο δίκιο.'] : null, differ.slice(0, MAX_ITEMS));
    }

    // 6-8. the paperwork a school has to be able to show
    const lic = src.licence || {};
    const ours = src.layer === 'own';
    const noLic = !lic.id || lic.id === 'unknown', noCredit = !lic.attribution && !noLic;
    add('licence', 'meta', noLic ? (ours ? 'warn' : 'fail') : noCredit ? 'warn' : 'pass', 1, noLic || noCredit ? 1 : 0,
      noLic ? (ours ? ['These are our own sensors, so no outside licence is needed, but the schools should still write down who owns the readings and who may reuse them.', 'Είναι οι δικοί μας αισθητήρες, άρα δεν χρειάζεται εξωτερική άδεια, αλλά τα σχολεία πρέπει να γράψουν ποιος έχει τα δεδομένα και ποιος μπορεί να τα χρησιμοποιήσει.']
        : ['No licence is recorded, so this source must not be used in published work.', 'Δεν έχει καταγραφεί άδεια, άρα αυτή η πηγή δεν πρέπει να χρησιμοποιηθεί σε δημοσιευμένη εργασία.'])
        : noCredit ? ['No credit line is recorded for this licence.', 'Δεν έχει καταγραφεί γραμμή αναφοράς για αυτή την άδεια.']
          : [`${lic.id}${lic.attribution ? ' · ' + lic.attribution : ''}`, `${lic.id}${lic.attribution ? ' · ' + lic.attribution : ''}`]);
    const checkedOn = lic.checked_on ? Date.parse(lic.checked_on + 'T12:00:00Z') : null;
    if (!noLic && !ours) {
      const old = !checkedOn || checkedOn > t + DAY || t - checkedOn > LICENCE_DAYS * DAY;
      add('licence_age', 'meta', old ? 'warn' : 'pass', 1, old ? 1 : 0,
        !lic.checked_on ? ['Nobody has written down when the licence was last checked.', 'Κανείς δεν έχει σημειώσει πότε ελέγχθηκε τελευταία φορά η άδεια.']
          : !checkedOn ? [`The check date "${lic.checked_on}" cannot be read as a date.`, `Η ημερομηνία ελέγχου "${lic.checked_on}" δεν διαβάζεται ως ημερομηνία.`]
            : checkedOn > t + DAY ? [`The check date ${lic.checked_on} is in the future, so nobody has checked it yet.`, `Η ημερομηνία ελέγχου ${lic.checked_on} είναι στο μέλλον, άρα κανείς δεν την έχει ελέγξει ακόμη.`]
              : old ? [`Last checked ${lic.checked_on}, over a year ago; licences change, so it should be read again.`, `Τελευταίος έλεγχος ${lic.checked_on}, πάνω από έναν χρόνο πριν· οι άδειες αλλάζουν, άρα πρέπει να ξαναδιαβαστεί.`]
                : [`Last checked ${lic.checked_on}.`, `Τελευταίος έλεγχος ${lic.checked_on}.`]);
    }
    const unknownVars = vars.filter((v) => !vocab[v]);
    if (vars.length) add('vocabulary', 'meta', unknownVars.length ? 'fail' : 'pass', vars.length, unknownVars.length, null,
      unknownVars.map((v) => ({ id: v, why: ['This measurement is not in vocab/variables.json, so its unit and range are unknown.', 'Αυτή η μέτρηση δεν υπάρχει στο vocab/variables.json, άρα μονάδα και εύρος είναι άγνωστα.'] })));
    return gates;
  }

  async function build() {
    const t = now();
    if (!layers || !layers._t || !layers._t.liveView) throw new Error('The layers are not ready.');
    const live = await layers._t.liveView();
    const reg = layers._t.loadRegister(root, () => {});
    if (reg.vocab && Object.keys(reg.vocab).length) vocab = reg.vocab;
    const byId = new Map((reg.layers || []).map((e) => [e.src.id, e.src]));   // loadRegister gives { layers: [{ src, warnings }], problems, places }
    const cards = new Map((live.layers || []).map((l) => [l.id, l]));
    const rowsBySource = new Map();
    Object.keys(live.cities || {}).forEach((city) => (live.cities[city].rows || []).forEach((r) => {
      if (!rowsBySource.has(r.source)) rowsBySource.set(r.source, []);
      rowsBySource.get(r.source).push({ ...r, city });
    }));
    const rivers = live.riversAll || live.rivers || [];
    const dropBySource = new Map();
    (live.dropped || []).forEach((d) => { if (!dropBySource.has(d.source)) dropBySource.set(d.source, []); dropBySource.get(d.source).push(d); });

    const sources = [...byId.values()].filter((s) => s.status === 'active').map((src) => {
      const card = cards.get(src.id) || null, rows = rowsBySource.get(src.id) || [];
      const drops = dropBySource.get(src.id) || [], cut = (live.dropFull || []).includes(src.id);
      const gates = gatesFor(src, card, rows, rivers, t, drops, (live.unitsSeen || {})[src.id] || 0);
      const sum = gates.reduce((a, g) => ({ status: worst(a.status, g.status), fail: a.fail + (g.status === 'fail' ? 1 : 0), warn: a.warn + (g.status === 'warn' ? 1 : 0) }), { status: 'pass', fail: 0, warn: 0 });
      const fresh = card && card.lastAt ? Math.max(0, Math.min(1, 1 - (t - card.lastAt) / (isoMs(src.quality && src.quality.stale_after) || 2 * HOUR))) : 0;
      return {
        id: src.id, name: src.name, nameEl: (src.i18n && src.i18n.el && src.i18n.el.name) || src.name,
        group: src.layer, kind: SOURCE_KIND[(src.quality && src.quality.kind) || ''] || null, publisher: (src.publisher && src.publisher.name) || null,
        state: card ? card.state : 'down', lastAt: card ? card.lastAt : null, everyMs: isoMs(src.update && src.update.every),
        licence: { id: (src.licence && src.licence.id) || null, attribution: (src.licence && src.licence.attribution) || null, url: (src.licence && src.licence.url) || null, checkedOn: (src.licence && src.licence.checked_on) || null },
        holds: { variables: (src.variables || []).length, readings: rows.length, dropped: drops.length, droppedCut: cut, cities: new Set(rows.map((r) => r.city)).size, sensors: card && card.sensors ? card.sensors : null },
        fresh: Number(fresh.toFixed(2)), gates, sum,
      };
    }).sort((a, b) => (a.sum.status === b.sum.status ? a.name.localeCompare(b.name) : a.sum.status === 'fail' ? -1 : b.sum.status === 'fail' ? 1 : a.sum.status === 'warn' ? -1 : 1));

    // "values looked at" is the readings themselves (kept plus thrown away), counted once, not once per check
    const extracts = extractsReport();
    const totals = sources.reduce((a, s) => {
      s.gates.forEach((g) => { a[g.status]++; });
      a.checked += s.holds.readings + s.holds.dropped; a.failedValues += s.holds.dropped;
      return a;
    }, { pass: 0, warn: 0, fail: 0, checked: 0, failedValues: 0 });
    totals.pass += extracts.totals.pass; totals.warn += extracts.totals.warn; totals.fail += extracts.totals.fail;

    const issues = sources.flatMap((s) => s.gates.filter((g) => g.status !== 'pass').map((g) => ({ source: s.id, name: s.name, nameEl: s.nameEl, gate: g })))
      .sort((a, b) => (a.gate.status === b.gate.status ? 0 : a.gate.status === 'fail' ? -1 : 1)).slice(0, 12);

    // the drawing: a lane per source that sent something, and why readings were left out
    const reasons = new Map();
    sources.forEach((s) => s.gates.forEach((g) => {
      if (g.status === 'pass' || !g.failed || !DROP_GATES.has(g.id)) return;   // only checks that throw a reading away, so the reasons add up to the number left out
      const key = g.id, cur = reasons.get(key) || { id: key, n: GATE[key], count: 0 };
      cur.count += g.failed; reasons.set(key, cur);
    }));
    const leftOut = sources.reduce((a, s) => a + s.holds.dropped, 0);   // one reading counted once, whichever check threw it away
    const readings = sources.reduce((a, s) => a + s.holds.readings + s.holds.dropped, 0);
    const flow = {
      readings, left: leftOut, passed: Math.max(0, readings - leftOut),
      quiet: sources.filter((s) => !s.holds.readings && !s.holds.dropped).length,   // sent nothing at all: a late source that did send is not quiet
      lanes: sources.filter((s) => s.holds.readings || s.holds.dropped || s.state === 'live' || s.state === 'late').map((s) => ({
        id: s.id, name: s.name, nameEl: s.nameEl, group: s.group, rate: s.holds.readings + s.holds.dropped, fresh: s.fresh, state: s.state,
        left: s.holds.dropped,
      })).sort((a, b) => b.rate - a.rate),
      out: [...reasons.values()].sort((a, b) => b.count - a.count),
      feeds: FEEDS,
    };
    return {
      at: t, every: CACHE_MS,
      stages: { sources: sources.length, extracts: extracts.items.length, builders: BUILDERS.length, checks: totals.pass + totals.warn + totals.fail, feeds: FEEDS.length },
      extracts: extracts.items,
      totals, sources, issues, flow, builders: BUILDERS, feeds: FEEDS,
      note: ['The checks only report. A reading that fails is left out of the tools and the reason is shown; no number is corrected by itself.', 'Οι έλεγχοι μόνο αναφέρουν. Μια μέτρηση που αποτυγχάνει μένει εκτός των εργαλείων και ο λόγος φαίνεται· κανένας αριθμός δεν διορθώνεται από μόνος του.'],
    };
  }

  let pending = null, failedAt = 0, lastError = null;
  async function report() {
    const t = now();
    if (cache && t - cache.at < CACHE_MS) return cache;
    if (lastError && t - failedAt < CACHE_MS) { if (cache) return cache; throw lastError; }   // do not retry at every request
    if (!pending) pending = build().then((r) => { cache = r; lastError = null; return r; })
      .catch((e) => { failedAt = now(); lastError = e; if (cache) return cache; throw e; })
      .finally(() => { pending = null; });
    return pending;
  }
  async function handle(req, res, url) {
    if (url.pathname !== '/api/health' || req.method !== 'GET') return false;
    try {
      const r = await report();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r));
    } catch (e) {
      log('Data health: ' + ((e && e.message) || e));
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'The data health report could not be worked out right now.' }));
    }
    return true;
  }
  return { handle, report, _t: { gatesFor, isoMs, build, extractsReport, BUILDERS, FEEDS, GATE, KIND } };
}

module.exports = { createDataHealth, BUILDERS, FEEDS, GATE, KIND };
