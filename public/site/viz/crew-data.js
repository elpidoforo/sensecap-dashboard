/*
  crew-data.js: the model for the AI at Work board: what the AI helpers of the site do, step by step, and how they are doing now.
  Pure: no DOM, no clock, no network. Inputs (all optional): the answers of /council/api/status, /council/api/sessions?scope=public
  and /api/helpers.
  Two kinds of content, kept apart:
   - LIVE facts from those answers: is the Council room on, how many sessions are left for this visitor today, how many sessions
     teachers have published, and the state of each background helper.
   - A WALK-THROUGH of one Council session. The steps and their order are written down from council.js ("as written in the site's
     code": WIRED below, checked by the test against that file). No question, no answer and no score is made up: the tiles show
     which fields a seat hands back, never values.
  Seats keep the server's order; nothing is ranked. A helper whose state is not reported is "unknown", never "ok".
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.crewData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // as written in council.js; tests/viz/crew_test.js checks each of these against the source
  const WIRED = { minQuestion: 8, maxQuestion: 300, maxReadings: 48, briefMinutes: 5, seats: 6, publishedCap: 100, seatFields: ['stance', 'score', 'text', 'dataUsed', 'missing'] };
  const PH = { ask: 0, brief: 1400, seats: 3200, chair: 8400, draft: 10800, teacher: 11600, publish: 14200, hold: 15400, end: 19200 };
  const pair = (a, b) => [String(a == null ? '' : a), String(b == null || b === '' ? (a == null ? '' : a) : b)];
  const FIELDS = { stance: ['for, against or unsure', 'υπέρ, κατά ή αβέβαιο'], score: ['a score', 'βαθμός'], text: ['a short argument', 'σύντομο επιχείρημα'], dataUsed: ['the readings it used', 'οι μετρήσεις που χρησιμοποίησε'], missing: ['what data is missing', 'ποια δεδομένα λείπουν'] };
  const HSTATE = { ok: ['working', 'λειτουργεί'], late: ['late', 'καθυστερεί'], error: ['problem', 'πρόβλημα'], off: ['resting', 'σε παύση'], unknown: ['state not reported', 'η κατάσταση δεν αναφέρθηκε'] };
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function agoText(ms, now) { if (typeof ms !== 'number' || !isFinite(ms) || typeof now !== 'number') return null; const m = Math.max(0, Math.round((now - ms) / 60000)); if (m < 1) return ['less than a minute ago', 'πριν από λιγότερο από ένα λεπτό']; if (m < 90) return [m + ' min ago', 'πριν ' + m + ' λεπτά']; const h = Math.round(m / 60); if (h < 48) return [h + ' h ago', 'πριν ' + h + ' ώρες']; const d = Math.round(h / 24); return [d + ' days ago', 'πριν ' + d + ' ημέρες']; }

  function build(input, now) {
    input = input || {}; const c = input.council && typeof input.council === 'object' ? input.council : null, hs = input.helpers && Array.isArray(input.helpers.helpers) ? input.helpers.helpers : null, ss = input.sessions && Array.isArray(input.sessions.sessions) ? input.sessions.sessions : null;
    const seats = (c && Array.isArray(c.seats) ? c.seats : []).filter((s) => s && s.id).map((s, i) => ({ i, id: String(s.id), name: Array.isArray(s.name) ? pair(s.name[0], s.name[1]) : pair(s.id), focus: Array.isArray(s.focus) ? pair(s.focus[0], s.focus[1]) : null,
      // walk-through only: when this seat's tile finishes inside the seats step (the real order changes every time)
      doneAt: PH.seats + 2400 + Math.round(rnd(i + 3) * 2200) }));
    const helpers = (hs || []).filter((h) => h && h.id).map((h, i) => { const state = HSTATE[h.status] ? h.status : 'unknown'; return { i, id: String(h.id), name: pair(h.name, h.nameEl), what: pair(h.what, h.whatEl), kind: String(h.kind || ''), state, stateText: HSTATE[state], detail: h.detail ? pair(h.detail, h.detailEl) : null, last: agoText(h.lastRun, now) }; });
    const council = { known: !!c, on: !!(c && c.enabled), message: c && c.message ? pair(c.message, c.message_el) : null, remaining: c && typeof c.remaining === 'number' ? c.remaining : null, limit: c && typeof c.limit === 'number' ? c.limit : null, label: c && c.label ? String(c.label) : 'AI role-play', note: c && Array.isArray(c.aiNote) ? pair(c.aiNote[0], c.aiNote[1]) : null };
    const published = ss ? { known: true, n: ss.length, capped: ss.length >= WIRED.publishedCap } : { known: false, n: null, capped: false };
    const available = seats.length > 0 || helpers.length > 0;
    const EMPTY = ['The state of the AI helpers could not be loaded.', 'Η κατάσταση των βοηθών ΤΝ δεν φόρτωσε.'];
    if (!available) return { id: 'crew', available: false, empty: EMPTY, seats: [], helpers: [], steps: [], inputs: [], council, published, wired: WIRED, phases: PH, textRows: [EMPTY], ariaLabel: EMPTY, duration: 0 };
    const nS = seats.length;
    const inputs = [
      { id: 'question', name: ['The question', 'Η ερώτηση'], lines: [[WIRED.minQuestion + ' to ' + WIRED.maxQuestion + ' characters', WIRED.minQuestion + ' έως ' + WIRED.maxQuestion + ' χαρακτήρες'], ['cleaned, and shown to the AI as data', 'καθαρίζεται και δίνεται στην ΤΝ ως δεδομένο']] },
      { id: 'brief', name: ['The data brief', 'Το δελτίο δεδομένων'], lines: [['public readings only, at most ' + WIRED.maxReadings, 'μόνο δημόσιες μετρήσεις, έως ' + WIRED.maxReadings], ['one brief is shared for ' + WIRED.briefMinutes + ' minutes', 'ένα δελτίο ισχύει για ' + WIRED.briefMinutes + ' λεπτά']] },
      { id: 'rules', name: ['What never goes in', 'Τι δεν μπαίνει ποτέ'], lines: [['no vehicle position, no device number', 'καμία θέση οχήματος, κανένας αριθμός συσκευής'], ['long decimals are rounded to two', 'τα πολλά δεκαδικά στρογγυλεύονται στα δύο']] },
      { id: 'limits', name: ['Daily limit', 'Ημερήσιο όριο'], lines: [council.limit == null ? ['limit not reported', 'το όριο δεν αναφέρθηκε'] : [council.limit + ' sessions a day for you', council.limit + ' συνεδρίες την ημέρα για εσάς'], council.remaining == null ? ['sessions left: not reported', 'απομένουν: δεν αναφέρθηκε'] : [council.remaining + ' left today', 'απομένουν ' + council.remaining + ' σήμερα']] }];
    const steps = [
      { id: 'ask', at: PH.ask, n: ['Question', 'Ερώτηση'], log: ['a visitor asks; the question is cleaned and counted against the daily limit', 'ένας επισκέπτης ρωτά· η ερώτηση καθαρίζεται και μετρά στο ημερήσιο όριο'] },
      { id: 'brief', at: PH.brief, n: ['Data brief', 'Δελτίο δεδομένων'], log: ['the data brief is built from public readings; every seat gets the same one', 'το δελτίο δεδομένων φτιάχνεται από δημόσιες μετρήσεις· κάθε θέση παίρνει το ίδιο'] },
      { id: 'seats', at: PH.seats, n: ['Seats', 'Θέσεις'], log: [nS + ' AI role-play seats write at the same time; the order they finish in changes every time', nS + ' θέσεις ρόλων ΤΝ γράφουν ταυτόχρονα· η σειρά που τελειώνουν αλλάζει κάθε φορά'] },
      { id: 'chair', at: PH.chair, n: ['Chair', 'Προεδρείο'], log: ['the Chair reads all the seats, scores the options and says what data is missing', 'το Προεδρείο διαβάζει όλες τις θέσεις, βαθμολογεί τις επιλογές και λέει ποια δεδομένα λείπουν'] },
      { id: 'draft', at: PH.draft, n: ['Draft', 'Πρόχειρο'], log: ['the session is saved as a draft: only the person who asked and teachers can open it', 'η συνεδρία αποθηκεύεται ως πρόχειρο: την ανοίγουν μόνο όποιος ρώτησε και οι εκπαιδευτικοί'] },
      { id: 'teacher', at: PH.teacher, n: ['Teacher', 'Εκπαιδευτικός'], log: ['a teacher reads it and publishes or rejects it; the AI decides nothing', 'ένας εκπαιδευτικός τη διαβάζει και τη δημοσιεύει ή την απορρίπτει· η ΤΝ δεν αποφασίζει τίποτα'] },
      { id: 'publish', at: PH.publish, n: ['Published', 'Δημοσιευμένη'], log: ['only published sessions can be read by visitors', 'οι επισκέπτες διαβάζουν μόνο δημοσιευμένες συνεδρίες'] }];
    const okH = helpers.filter((h) => h.state === 'ok').length;
    const pubText = !published.known ? ['published sessions: not reported', 'δημοσιευμένες συνεδρίες: δεν αναφέρθηκαν'] : [(published.capped ? published.n + ' or more' : published.n) + ' published sessions', (published.capped ? published.n + ' ή περισσότερες' : published.n) + ' δημοσιευμένες συνεδρίες'];
    const head = ['The Council room is ' + (!council.known ? 'not reporting' : council.on ? 'on' : 'resting') + '; ' + pubText[0] + '; ' + okH + ' of ' + helpers.length + ' background helpers working.', 'Η αίθουσα συμβουλίου ' + (!council.known ? 'δεν αναφέρει κατάσταση' : council.on ? 'λειτουργεί' : 'ξεκουράζεται') + '· ' + pubText[1] + '· λειτουργούν ' + okH + ' από ' + helpers.length + ' βοηθούς παρασκηνίου.'];
    const rows = [head, ['The steps below are a walk-through of how one session goes, as written in the site\'s code. It is not a session happening now, and no answer is shown.', 'Τα παρακάτω βήματα είναι περιήγηση στο πώς γίνεται μια συνεδρία, όπως είναι γραμμένο στον κώδικα του ιστοτόπου. Δεν είναι συνεδρία που γίνεται τώρα και δεν φαίνεται καμία απάντηση.']];
    steps.forEach((s, k) => rows.push([(k + 1) + '. ' + s.n[0] + ': ' + s.log[0], (k + 1) + '. ' + s.n[1] + ': ' + s.log[1]]));
    seats.forEach((s) => rows.push([s.name[0] + ' seat' + (s.focus ? ': ' + s.focus[0] : ''), 'Θέση ' + s.name[1] + (s.focus ? ': ' + s.focus[1] : '')]));
    helpers.forEach((h) => rows.push([h.name[0] + ': ' + h.stateText[0] + (h.detail ? '. ' + h.detail[0] : ''), h.name[1] + ': ' + h.stateText[1] + (h.detail ? '. ' + h.detail[1] : '')]));
    if (council.note) rows.push(council.note);
    return { id: 'crew', available: true, empty: null, seats, helpers, steps, inputs, council, published, pubText, helpersOk: okH, wired: WIRED, fields: WIRED.seatFields.map((f) => ({ id: f, n: FIELDS[f] })), phases: PH, textRows: rows, ariaLabel: head, duration: PH.end };
  }
  // what is on at run time T
  function at(m, T) {
    const P = m.phases, step = m.steps.reduce((a, s, k) => (T >= s.at ? k : a), 0), f = (a, b) => Math.max(0, Math.min(1, (T - a) / (b - a)));
    return { step, id: m.steps[step] ? m.steps[step].id : null, ask: f(P.ask, P.brief), brief: f(P.brief, P.seats), seat: m.seats.map((s) => f(P.seats, s.doneAt)), seatsDone: m.seats.filter((s) => T >= s.doneAt).length, chair: f(P.chair, P.draft), draft: f(P.draft, P.teacher), teacher: f(P.teacher, P.publish), publish: f(P.publish, P.hold), done: T >= P.hold };
  }
  return { build, at, agoText, WIRED, PH };
});
