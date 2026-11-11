/*
  Schools and teams: the four schools, the teams each one has, and the sensor a team carries.
    #/schools                    school cards, search, filters, team cards and a team profile (Overview | Data | Projects)
    #/schools?school=<slug>      opens with that school selected (the live map links here); ?team=<id> opens that team
  Sources (all public, no sign-in): /app/api/schools/public (school, team name, the sensor EUI a team carries)
    /app/api/announcements (teacher posts, author is only "Teacher, <school>") /api/config /api/devices /api/latest /api/series
    /studio/api/projects?scope=gallery (approved projects only, matched to a team by team name and school).
  Honest by design: nothing here is invented. The API has no topics, team sizes or focus questions, so none are shown.
  A team without a linked sensor says so. A team without an approved project says so and points to the Build studio.
  Privacy: no student names or photos anywhere (the studio "author" field is never read). No position of any vehicle
  is shown on this page, only counts. The note at the top says how positions are treated on the map.
  The school API does not say which vehicles belong to a school, so a vehicle belongs to a school when its group name
  contains one of that school's place names (the same rule the server uses: "larnaka,larnaca" and so on).
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/schools.css');

  const HOUR = 3600000, FRESH = 3 * HOUR;
  const enc = encodeURIComponent;
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const plural = (n, en, el1) => T(n + ' ' + (n === 1 ? en[0] : en[1]), n + ' ' + (n === 1 ? el1[0] : el1[1]));

  /* ---------- the four schools: colour, district, and the words that match a vehicle's group name ---------- */
  const KNOWN = {
    'pascal-larnaka': { key: 'larnaka', d: 'larnaca', col: '#4C8BEA', words: ['larnaka', 'larnaca', 'λάρνακ'], dist: ['Larnaka district', 'Επαρχία Λάρνακας'], name: ['PASCAL Larnaka', 'PASCAL Λάρνακα'], short: ['Larnaka', 'Λάρνακα'] },
    'pascal-lefkosia': { key: 'lefkosia', d: 'nicosia', col: '#E07F3F', words: ['lefkosia', 'nicosia', 'λευκωσ'], dist: ['Lefkosia district', 'Επαρχία Λευκωσίας'], name: ['PASCAL Lefkosia', 'PASCAL Λευκωσία'], short: ['Lefkosia', 'Λευκωσία'] },
    'pascal-limassol': { key: 'limassol', d: 'limassol', col: '#59d98e', words: ['limassol', 'lemesos', 'λεμεσ'], dist: ['Limassol district', 'Επαρχία Λεμεσού'], name: ['PASCAL Limassol', 'PASCAL Λεμεσός'], short: ['Limassol', 'Λεμεσός'] },
    'paphos-international': { key: 'paphos', d: 'paphos', col: '#8f7bff', words: ['paphos', 'pafos', 'πάφ', 'παφ'], dist: ['Paphos district', 'Επαρχία Πάφου'], name: ['International School of Paphos', 'Διεθνές Σχολείο Πάφου'], short: ['Paphos', 'Πάφος'] },
  };
  const SPARE = ['#F2B24C', '#4CCBEA', '#C4B8FF', '#9BD88F'];
  const STOP = new Set(['pascal', 'school', 'international', 'the', 'of', 'high', 'primary', 'college']);
  const GREEK_NAMES = { 'Air temperature': 'Θερμοκρασία αέρα', 'Air humidity': 'Υγρασία αέρα', 'Light intensity': 'Ένταση φωτός', 'CO2': 'CO2', 'Barometric pressure': 'Ατμοσφαιρική πίεση' };

  /* ---------- the page ---------- */
  SC.register('schools', {
    title: ['Schools and teams', 'Σχολεία και ομάδες'],
    async render(root, ctx) {
      const D = { cfg: null, schools: [], devices: [], latest: {}, ann: [], devErr: null, at: 0 };
      const S = { filter: 'all', q: '', fresh: false, sort: 'school', sel: null, tab: 'overview', gallery: null, galleryErr: null, galleryLoading: false, seen: false };
      let timer = 0, dead = false, headEl = null;
      const A = {};   // the parts of the page that are redrawn

      const pageHead = (extra) => SC.head(Object.assign({
        title: T('Schools and the teams behind the data', 'Τα σχολεία και οι ομάδες πίσω από τα δεδομένα'),
        lede: T('Four schools put sensors on buses and cars. Open a team to see which sensor it carries and what it reads. Teams are shown by name only, never by student.',
          'Τέσσερα σχολεία βάζουν αισθητήρες σε λεωφορεία και αυτοκίνητα. Ανοίξτε μια ομάδα για να δείτε ποιον αισθητήρα φέρει και τι μετρά. Οι ομάδες εμφανίζονται μόνο με το όνομά τους, ποτέ με μαθητές.'),
        help: [
          'Each card is one school. Press a school or a name in the filter to see only its teams. Search looks in team and school names. A team profile has three tabs: Overview (what its sensor reads now), Data (a 24 hour chart and the latest readings) and Projects (pages the team built in the Build studio and a teacher approved). Nothing on this page names a student.',
          'Κάθε κάρτα είναι ένα σχολείο. Πατήστε ένα σχολείο ή ένα όνομα στο φίλτρο για να δείτε μόνο τις ομάδες του. Η αναζήτηση ψάχνει σε ονόματα ομάδων και σχολείων. Το προφίλ μιας ομάδας έχει τρεις καρτέλες: Επισκόπηση (τι μετρά τώρα ο αισθητήρας της), Δεδομένα (γράφημα 24 ωρών και οι τελευταίες μετρήσεις) και Έργα (σελίδες που έφτιαξε η ομάδα στο Στούντιο και ενέκρινε ένας εκπαιδευτικός). Τίποτα σε αυτή τη σελίδα δεν κατονομάζει μαθητή.',
        ],
      }, extra || {}));
      headEl = pageHead();
      root.append(headEl);
      const body = el('div', { class: 'sx' });
      root.append(body);

      /* ---------- data ---------- */
      const nameOf = (m) => {
        const n = D.cfg && D.cfg.names && D.cfg.names[m];
        return n ? (SC.lang === 'el' && GREEK_NAMES[n[0]]) || n[0] : T('Measurement ', 'Μέτρηση ') + m;
      };
      const unitOf = (m) => (D.cfg && D.cfg.names && D.cfg.names[m] ? D.cfg.names[m][1] : '');
      const gpsIds = () => (D.cfg && Array.isArray(D.cfg.gps) ? D.cfg.gps.map(String) : ['4197', '4198']);
      const hours = () => (D.cfg && D.cfg.posDelayMin ? Math.max(1, Math.round(D.cfg.posDelayMin / 60)) : 2);
      const gridKm = () => (D.cfg && D.cfg.posGrid ? Math.max(1, Math.round(D.cfg.posGrid * 111)) : 1);

      function decorate(raw, i) {
        const k = KNOWN[raw.slug];
        const words = k ? k.words : String(raw.short || raw.name || '').toLowerCase().split(/[^a-zα-ωά-ώ]+/i).filter((w) => w.length > 3 && !STOP.has(w));
        return {
          slug: raw.slug, id: raw.slug, lat: raw.lat, lng: raw.lng, key: k ? k.key : String(raw.slug).split('-')[0],
          name: k ? T(k.name[0], k.name[1]) : raw.name, short: k ? T(k.short[0], k.short[1]) : raw.short || raw.name, apiShort: raw.short || raw.name, apiName: raw.name,
          dist: k ? T(k.dist[0], k.dist[1]) : '', d: k ? k.d : null, col: k ? k.col : SPARE[i % SPARE.length], words,
          teams: (raw.teams || []).map((t) => ({ id: t.id, name: t.name, eui: t.device_eui || null, school: raw.slug })),
        };
      }
      const schoolOf = (slug) => D.schools.find((s) => s.slug === slug);
      function schoolOfDevice(d) {
        const g = String(d.group || d.name || '').toLowerCase();
        return D.schools.find((s) => s.words.some((w) => g.includes(w)));
      }
      const deviceOf = (eui) => (eui ? D.devices.find((d) => d.eui === eui) || null : null);
      const isVehicle = (d) => d.measurements && gpsIds().some((g) => d.measurements.map(String).includes(g));
      const mids = (d) => (d.measurements || []).map(String).filter((m) => !gpsIds().includes(m));
      function status(d) {
        if (!d) return null;
        const l = D.latest[d.eui] || {};
        let t = d.lastSeen ? Date.parse(d.lastSeen) : NaN;
        Object.keys(l).forEach((m) => { const x = Date.parse(l[m] && l[m].t); if (isFinite(x) && (!isFinite(t) || x > t)) t = x; });
        const age = isFinite(t) ? Date.now() - t : Infinity;
        const st = !d.online ? 'off' : age > FRESH ? 'stale' : 'ok';
        return { st, t: isFinite(t) ? t : null, age };
      }
      const badge = (st) => (st === 'ok' ? el('span', { class: 'nm-badge nm-badge--ok' }, el('span', { class: 'dot' }), T('Data fresh', 'Πρόσφατα δεδομένα'))
        : st === 'stale' ? el('span', { class: 'nm-badge nm-badge--warn' }, el('span', { class: 'dot warn' }), T('Old data', 'Παλιά δεδομένα'))
          : el('span', { class: 'nm-badge nm-badge--bad' }, el('span', { class: 'dot bad' }), T('Offline', 'Εκτός λειτουργίας')));
      const reads = (d, n) => mids(d).filter((m) => D.latest[d.eui] && D.latest[d.eui][m] && fin(Number(D.latest[d.eui][m].v))).slice(0, n || 3);
      const val = (d, m) => { const r = D.latest[d.eui][m]; return SC.num(Number(r.v), Math.abs(Number(r.v)) >= 100 ? 0 : 1) + (unitOf(m) ? ' ' + unitOf(m) : ''); };

      // all teams, flattened, with the school and device they belong to
      function allTeams() {
        const out = [];
        D.schools.forEach((s) => s.teams.forEach((t) => out.push({ t, s, d: deviceOf(t.eui) })));
        return out;
      }
      function visibleTeams() {
        const q = S.q.trim().toLowerCase();
        let list = allTeams().filter(({ t, s, d }) => {
          if (S.filter !== 'all' && s.slug !== S.filter) return false;
          if (q && !(t.name.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.apiName.toLowerCase().includes(q) || s.short.toLowerCase().includes(q))) return false;
          if (S.fresh) { const st = d && status(d); if (!st || st.st !== 'ok') return false; }
          return true;
        });
        if (S.sort === 'name') list = list.slice().sort((a, b) => a.t.name.localeCompare(b.t.name));
        return list;
      }

      async function load() {
        const [cfg, sch, dev, lat, ann] = await Promise.allSettled([
          SC.cached('/api/config', 60000), SC.api('/app/api/schools/public'), SC.api('/api/devices'), SC.api('/api/latest'), SC.api('/app/api/announcements'),
        ]);
        if (sch.status === 'rejected') throw sch.reason;
        D.cfg = cfg.status === 'fulfilled' ? cfg.value : D.cfg;
        D.schools = (sch.value.schools || []).map(decorate);
        D.devErr = null;
        if (dev.status === 'fulfilled' && lat.status === 'fulfilled') { D.devices = Array.isArray(dev.value) ? dev.value : dev.value.devices || []; D.latest = lat.value || {}; }
        else { D.devErr = (dev.status === 'rejected' ? dev.reason : lat.reason).message; }
        D.ann = ann.status === 'fulfilled' ? (ann.value.items || []).slice(0, 5) : [];
        D.at = Date.now();
      }

      /* ---------- small pieces ---------- */
      const icon = (n, s) => SC.icon(n, s);
      function islandSvg(s) {
        const box = el('div', { class: 'sx-map' });
        if (typeof ISLAND === 'undefined') return box;
        const sv = SC.svgEl;
        const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
        const svg = sv('svg', { viewBox: '0 0 ' + ISLAND.W + ' ' + ISLAND.H, role: 'img', 'aria-label': T('Map of Cyprus with ' + s.name + ' marked', 'Χάρτης της Κύπρου με σημειωμένο το σχολείο ' + s.name) });
        Object.keys(ISLAND.districts).forEach((n) => svg.append(sv('path', { d: ISLAND.districts[n], fill: s.d === n ? rgba(s.col, 0.62) : 'rgba(76,203,234,.10)', stroke: 'rgba(143,227,247,.2)', 'stroke-width': 0.4 })));
        D.schools.forEach((o) => {
          if (o === s || !fin(o.lat) || !fin(o.lng)) return;
          const q = ISLAND.project(o.lng, o.lat);
          svg.append(sv('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 15, fill: 'rgba(255,255,255,.45)' }));
        });
        if (fin(s.lat) && fin(s.lng)) {
          const p = ISLAND.project(s.lng, s.lat), cx = p[0].toFixed(1), cy = p[1].toFixed(1);
          svg.append(sv('circle', { cx, cy, r: 58, fill: s.col, opacity: 0.3 }), sv('circle', { cx, cy, r: 26, fill: s.col, stroke: '#fff', 'stroke-width': 9 }));
        }
        box.append(svg);
        return box;
      }
      const when = (t) => (t == null ? T('no reading yet', 'καμία μέτρηση ακόμα') : SC.ago(t));
      const keepFocus = (fn) => {
        const a = document.activeElement, k = a && a.dataset && a.dataset.k;
        fn();
        if (k) { const n = body.querySelector('[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]'); if (n) n.focus({ preventScroll: true }); }
      };

      /* ---------- announcements ---------- */
      function drawAnnouncements() {
        A.ann.replaceChildren();
        if (!D.ann.length) { A.ann.hidden = true; return; }
        A.ann.hidden = false;
        A.ann.append(el('div', { class: 'sx-ann-h' }, icon('bell', 18), el('b', null, T('Announcements from teachers', 'Ανακοινώσεις από εκπαιδευτικούς'))),
          el('ul', null, D.ann.slice(0, 3).map((a) => el('li', null, el('span', { class: 'sx-ann-t' }, a.text),
            el('small', null, [a.by, a.at ? SC.ago(a.at) : ''].filter(Boolean).join(' · '))))));
      }

      /* ---------- school cards ---------- */
      function drawSchools() {
        A.schools.replaceChildren();
        D.schools.forEach((s) => {
          const devs = D.devices.filter((d) => schoolOfDevice(d) === s);
          const on = devs.filter((d) => { const st = status(d); return st && st.st !== 'off'; }).length;
          const veh = devs.filter(isVehicle).length;
          const live = devs.some((d) => { const st = status(d); return st && st.st === 'ok'; });
          const sel = S.filter === s.slug;
          const dim = S.filter !== 'all' && !sel;
          const pick = el('button', { type: 'button', class: 'sx-pick', 'data-k': 'sch-' + s.slug, 'aria-pressed': sel ? 'true' : 'false',
            'aria-label': T('Show the teams of ' + s.name, 'Εμφάνιση των ομάδων του σχολείου ' + s.name), onclick: () => { setFilter(sel ? 'all' : s.slug); } },
            plural(s.teams.length, ['team', 'teams'], ['ομάδα', 'ομάδες']), icon('arrow', 16));
          A.schools.append(el('article', { class: 'nm-card nm-lift sx-sch' + (sel ? ' is-sel' : '') + (dim ? ' dim' : ''), style: { '--sc': s.col } },
            el('div', { class: 'sx-sch-top' },
              el('span', { class: 'sx-eb' }, el('i'), s.dist || T('School', 'Σχολείο')),
              D.devErr ? el('span', { class: 'sx-live off' }, T('No live data', 'Χωρίς ζωντανά δεδομένα'))
                : devs.length ? el('span', { class: 'sx-live' + (live ? '' : ' off') }, el('span', { class: 'dot' + (live ? '' : ' off') }), live ? T('Live', 'Ζωντανά') : T('No recent data', 'Χωρίς πρόσφατα δεδομένα')) : el('span', { class: 'sx-live off' }, T('No sensors found', 'Δεν βρέθηκαν αισθητήρες'))),
            el('h3', null, s.name), islandSvg(s),
            el('dl', { class: 'sx-stats' },
              el('div', null, el('dt', null, T('Teams', 'Ομάδες')), el('dd', null, String(s.teams.length))),
              el('div', null, el('dt', null, T('Sensors online', 'Αισθητήρες σε λειτουργία')), el('dd', null, D.devErr ? '–' : String(on), D.devErr ? null : el('small', null, ' ' + T('of ' + devs.length, 'από ' + devs.length)))),
              el('div', null, el('dt', null, T('Vehicles with sensors', 'Οχήματα με αισθητήρες')), el('dd', null, D.devErr ? '–' : String(veh)))),
            el('div', { class: 'sx-foot' }, pick)));
        });
      }

      /* ---------- filters ---------- */
      function drawPills() {
        const n = allTeams().length;
        A.pills.replaceChildren(el('button', { type: 'button', class: S.filter === 'all' ? 'on' : '', 'data-k': 'pill-all', 'aria-pressed': S.filter === 'all' ? 'true' : 'false', onclick: () => setFilter('all') }, T('All', 'Όλα'), el('em', null, String(n))),
          D.schools.map((s) => el('button', { type: 'button', class: S.filter === s.slug ? 'on' : '', 'data-k': 'pill-' + s.slug, 'aria-pressed': S.filter === s.slug ? 'true' : 'false', onclick: () => setFilter(s.slug) }, s.short, el('em', null, String(s.teams.length)))));
        const withData = allTeams().filter(({ d }) => { const st = d && status(d); return st && st.st === 'ok'; }).length;
        A.badge.replaceChildren();
        if (n && !D.devErr) A.badge.append(el('span', { class: 'nm-badge nm-badge--info sx-count' }, el('span', { class: 'dot' }), T(withData + ' of ' + n + ' teams with fresh data', withData + ' από ' + n + ' ομάδες με πρόσφατα δεδομένα')));
      }
      function setFilter(f) {
        S.filter = f;
        keepFocus(() => { drawPills(); drawSchools(); drawTeams(true); });
      }

      /* ---------- team cards ---------- */
      function teamCard({ t, s, d }) {
        const st = status(d);
        const sel = S.sel === t.id;
        const open = el('button', { type: 'button', class: 'sx-open', 'data-k': 'team-' + t.id, 'aria-pressed': sel ? 'true' : 'false', 'aria-label': T('Open the profile of team ' + t.name, 'Άνοιγμα του προφίλ της ομάδας ' + t.name), onclick: () => selectTeam(t.id, true) }, t.name);
        const ic = d ? (/bus|λεωφ/i.test(d.name) ? 'bus' : isVehicle(d) ? 'route' : 'sensor') : 'users';
        let device;
        if (!t.eui) device = el('p', { class: 'sx-none' }, T('No sensor linked yet', 'Δεν έχει συνδεθεί ακόμα αισθητήρας'));
        else if (D.devErr) device = el('p', { class: 'sx-none' }, T('Live readings are not available right now', 'Οι ζωντανές μετρήσεις δεν είναι διαθέσιμες αυτή τη στιγμή'));
        else if (!d) device = el('p', { class: 'sx-none' }, T('Its sensor is not in the live data right now', 'Ο αισθητήρας της δεν υπάρχει αυτή τη στιγμή στα ζωντανά δεδομένα'));
        else {
          const rs = reads(d, 3);
          device = el('div', { class: 'sx-dev' },
            el('div', { class: 'sx-dev-n' }, icon(isVehicle(d) ? 'route' : 'sensor', 15), el('span', null, d.name)),
            rs.length ? el('ul', { class: 'sx-reads' }, rs.map((m) => el('li', { title: nameOf(m) }, el('b', null, val(d, m)), el('small', null, nameOf(m))))) : el('p', { class: 'sx-none' }, T('No reading yet', 'Καμία μέτρηση ακόμα')));
        }
        return el('article', { class: 'nm-card nm-lift sx-team' + (sel ? ' nm-card--selected' : ''), style: { '--sc': s.col } },
          el('div', { class: 'sx-team-hd' }, el('span', { class: 'sx-emb' }, icon(ic, 22)),
            el('div', null, el('h4', null, open), el('div', { class: 'sx-where' }, el('i'), s.short))),
          device,
          el('div', { class: 'sx-team-ft' },
            el('span', null, el('i', { class: 'dot' + (!st ? ' off' : st.st === 'ok' ? '' : st.st === 'stale' ? ' warn' : ' bad') }),
              !t.eui ? T('Waiting for a sensor', 'Αναμονή για αισθητήρα') : st ? T('Last reading ', 'Τελευταία μέτρηση ') + when(st.t) : T('No data', 'Χωρίς δεδομένα'))));
      }
      function drawTeams(select) {
        const list = visibleTeams();
        A.teams.replaceChildren();
        const total = allTeams().length;
        const sch = S.filter === 'all' ? null : schoolOf(S.filter);
        A.count.textContent = !total ? T('No teams yet', 'Δεν υπάρχουν ακόμα ομάδες')
          : S.filter === 'all' && !S.q && !S.fresh ? T('Showing all ' + plural(total, ['team', 'teams'], ['ομάδα', 'ομάδες']).replace(/^\d+ /, '') + ' · sorted by ' + (S.sort === 'name' ? 'team name' : 'school'), 'Εμφάνιση όλων των ' + total + ' ομάδων · ταξινόμηση ανά ' + (S.sort === 'name' ? 'όνομα ομάδας' : 'σχολείο'))
            : T('Showing ' + plural(list.length, ['team', 'teams'], ['ομάδα', 'ομάδες']) + (sch ? ' at ' + sch.name : ''), 'Εμφάνιση ' + plural(list.length, ['ομάδας', 'ομάδων'], ['ομάδας', 'ομάδων']).replace(/^(\d+) .*/, '$1') + ' ομάδων' + (sch ? ' · ' + sch.name : ''));
        A.sortBox.hidden = total < 2;
        if (!total) {
          A.teams.className = 'sx-teams empty-wrap';
          A.teams.append(el('div', { class: 'empty' }, el('b', null, T('No teams yet.', 'Δεν υπάρχουν ακόμα ομάδες.')), el('br'),
            T('A teacher creates a team in the student app and links one sensor to it. Until then you can look at all vehicles.', 'Ένας εκπαιδευτικός δημιουργεί μια ομάδα στην εφαρμογή των μαθητών και τη συνδέει με έναν αισθητήρα. Μέχρι τότε μπορείτε να δείτε όλα τα οχήματα.'),
            el('div', { style: { marginTop: '12px' } }, el('a', { class: 'pill-link', href: '#/vehicles' }, T('See the vehicles', 'Δείτε τα οχήματα')))));
          drawDetail();
          return;
        }
        if (!list.length) {
          A.teams.className = 'sx-teams empty-wrap';
          A.teams.append(el('div', { class: 'empty' }, S.filter !== 'all' && !S.q && !S.fresh && sch ? T(sch.name + ' has no teams yet.', 'Το σχολείο ' + sch.name + ' δεν έχει ακόμα ομάδες.') : T('No team matches. Clear the search or pick another school.', 'Καμία ομάδα δεν ταιριάζει. Καθαρίστε την αναζήτηση ή διαλέξτε άλλο σχολείο.'),
            el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: clearFilters }, T('Clear filters', 'Καθαρισμός φίλτρων')))));
          drawDetail();
          return;
        }
        A.teams.className = 'sx-teams';
        list.forEach((x) => A.teams.append(teamCard(x)));
        if (select && !list.some((x) => x.t.id === S.sel)) selectTeam(list[0].t.id, false);
        else if (S.sel == null) selectTeam(list[0].t.id, false);
        else drawDetail();
      }
      function clearFilters() {
        S.filter = 'all'; S.q = ''; S.fresh = false; A.q.value = ''; A.freshCb.checked = false;
        keepFocus(() => { drawPills(); drawSchools(); drawTeams(true); });
      }
      function selectTeam(id, user) {
        S.sel = id;
        keepFocus(() => { drawTeams(false); });
        if (user && A.detail && window.innerWidth < 980) A.detail.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      }

      /* ---------- the team profile ---------- */
      const TABS = [['overview', 'Overview', 'Επισκόπηση'], ['data', 'Data', 'Δεδομένα'], ['projects', 'Projects', 'Έργα']];
      function drawDetail() {
        const x = allTeams().find((y) => y.t.id === S.sel);
        A.detail.replaceChildren();
        if (!x || !visibleTeams().some((y) => y.t.id === S.sel)) {
          A.detail.style.setProperty('--sc', '#4C8BEA');
          A.detail.append(el('div', { class: 'sx-pad' }, el('div', { class: 'empty' }, T('Pick a team to see its profile.', 'Διαλέξτε μια ομάδα για να δείτε το προφίλ της.'))));
          return;
        }
        const { t, s, d } = x;
        const st = status(d);
        A.detail.style.setProperty('--sc', s.col);
        const tabs = el('div', { class: 'sx-tabs', role: 'tablist', 'aria-label': T('Team profile', 'Προφίλ ομάδας') },
          TABS.map(([id, en, elg]) => el('button', { type: 'button', class: 'nm-tab' + (S.tab === id ? ' on' : ''), role: 'tab', id: 'sx-tab-' + id, 'aria-selected': S.tab === id ? 'true' : 'false', 'aria-controls': 'sx-pane', tabindex: S.tab === id ? '0' : '-1', 'data-k': 'tab-' + id,
            onclick: () => { S.tab = id; keepFocus(drawDetail); },
            onkeydown: (e) => {
              const i = TABS.findIndex((z) => z[0] === S.tab);
              const n = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
              if (n >= 0) { e.preventDefault(); S.tab = TABS[n][0]; keepFocus(drawDetail); const b = A.detail.querySelector('#sx-tab-' + S.tab); if (b) b.focus(); }
            } }, T(en, elg))));
        const pane = el('div', { class: 'sx-pane', id: 'sx-pane', role: 'tabpanel', 'aria-labelledby': 'sx-tab-' + S.tab, tabindex: '0' });
        A.detail.append(
          el('div', { class: 'sx-det-head' },
            el('span', { class: 'sx-emb lg' }, el('span', null, icon(d ? (isVehicle(d) ? 'route' : 'sensor') : 'users', 34))),
            el('div', { class: 'sx-det-t' }, el('div', { class: 'sx-eb2' }, T('Team profile', 'Προφίλ ομάδας')), el('h2', null, t.name),
              el('div', { class: 'sx-sub' }, s.name + (d ? ' · ' + T('carries ', 'φέρει ') + d.name : ''))),
            el('div', { class: 'sx-badges' }, d ? badge(st.st) : null, D.cfg && D.cfg.demo ? el('span', { class: 't demo' }, T('Demo data', 'Δοκιμαστικά δεδομένα')) : null)),
          el('div', { class: 'sx-det-tabs' }, tabs), el('div', { class: 'sx-det-body' }, pane));
        if (S.tab === 'overview') drawOverview(pane, x);
        else if (S.tab === 'data') drawData(pane, x);
        else drawProjects(pane, x);
      }
      function noSensor(pane, x) {
        const { t, d } = x;
        pane.append(el('div', { class: 'empty' }, !t.eui ? T('This team has no sensor linked yet. A teacher links one to the team in the student app, and its readings appear here.', 'Αυτή η ομάδα δεν έχει ακόμα συνδεδεμένο αισθητήρα. Ένας εκπαιδευτικός τον συνδέει με την ομάδα στην εφαρμογή των μαθητών και οι μετρήσεις του εμφανίζονται εδώ.')
          : D.devErr ? T('Live readings could not be loaded. ', 'Οι ζωντανές μετρήσεις δεν φορτώθηκαν. ') + D.devErr
            : d ? '' : T('The sensor of this team is not in the live data right now. It may be switched off or renamed.', 'Ο αισθητήρας αυτής της ομάδας δεν υπάρχει αυτή τη στιγμή στα ζωντανά δεδομένα. Μπορεί να είναι σβηστός ή να άλλαξε όνομα.'),
        D.devErr ? el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: refresh }, T('Try again', 'Δοκιμάστε ξανά'))) : null));
      }
      function drawOverview(pane, x) {
        const { d } = x;
        if (!d || D.devErr) return noSensor(pane, x);
        const st = status(d);
        const rs = reads(d, 4);
        if (st.st !== 'ok') pane.append(el('div', { class: 'nm-callout nm-callout--warn' }, st.st === 'off' ? T('This sensor is offline. ', 'Αυτός ο αισθητήρας είναι εκτός λειτουργίας. ') : T('The newest reading is old. ', 'Η πιο πρόσφατη μέτρηση είναι παλιά. '), st.t ? T('Last reading ', 'Τελευταία μέτρηση ') + SC.ago(st.t) + '.' : T('No reading yet.', 'Καμία μέτρηση ακόμα.')));
        if (rs.length) pane.append(el('div', { class: 'sx-mini' }, rs.map((m) => el('div', null, el('div', { class: 'kpi-label' }, nameOf(m)), el('div', { class: 'n' }, SC.num(Number(D.latest[d.eui][m].v), Math.abs(Number(D.latest[d.eui][m].v)) >= 100 ? 0 : 1), el('small', null, ' ' + unitOf(m)))))));
        else pane.append(el('div', { class: 'empty' }, T('No reading yet from this sensor.', 'Καμία μέτρηση ακόμα από αυτόν τον αισθητήρα.')));
        pane.append(el('div', null, el('div', { class: 'sx-eb2', style: { marginBottom: '6px' } }, T('Sensor this team looks after', 'Ο αισθητήρας που φροντίζει η ομάδα')),
          el('ul', { class: 'sx-list' }, el('li', null, el('span', { class: 'sx-ic' }, icon(isVehicle(d) ? 'route' : 'sensor', 22)),
            el('div', null, el('span', { class: 't1' }, d.name), el('small', null, isVehicle(d)
              ? T('Vehicle sensor. On the map its position is shown about ' + hours() + ' hours late and rounded to about ' + gridKm() + ' km.', 'Αισθητήρας οχήματος. Στον χάρτη η θέση του εμφανίζεται με καθυστέρηση περίπου ' + hours() + ' ωρών και στρογγυλοποιημένη στο ' + gridKm() + ' χλμ.')
              : T('Fixed sensor', 'Σταθερός αισθητήρας'))),
            el('span', { class: 'sp' }), badge(st.st)))));
        pane.append(el('div', { class: 'sx-links' }, el('a', { class: 'pill-link', href: '#/vehicles/' + enc(d.eui) }, T('Open its full history', 'Άνοιγμα του πλήρους ιστορικού')),
          el('a', { class: 'pill-link', href: '#/map?eui=' + enc(d.eui) }, T('Show it on the map', 'Εμφάνιση στον χάρτη'))));
      }
      let chartMid = null;
      function drawData(pane, x) {
        const { d } = x;
        if (!d || D.devErr) return noSensor(pane, x);
        const ms = mids(d);
        if (!ms.length) { pane.append(el('div', { class: 'empty' }, T('This sensor reports no measurements yet.', 'Αυτός ο αισθητήρας δεν αναφέρει ακόμα μετρήσεις.'))); return; }
        if (!chartMid || !ms.includes(chartMid)) chartMid = ms.includes('4097') ? '4097' : ms[0];
        const box = el('div', { class: 'sx-chart' });
        const sel = el('select', { class: 'nm-input sx-sel', 'aria-label': T('Reading to chart', 'Μέτρηση για το γράφημα'), onchange: (e) => { chartMid = e.target.value; load24(); } },
          ms.map((m) => el('option', { value: m, selected: m === chartMid }, nameOf(m) + (unitOf(m) ? ' (' + unitOf(m) + ')' : ''))));
        pane.append(el('div', { class: 'sx-chartbox' }, el('div', { class: 'sx-ch-h' }, el('div', null, el('div', { class: 'sx-eb2' }, T('Last 24 hours', 'Τελευταίες 24 ώρες')), el('div', { class: 'muted sx-ch-s' }, d.name)), sel), box));
        async function load24() {
          const mid = chartMid, eui = d.eui;
          box.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
          try {
            const rows = await SC.cached('/api/series?eui=' + enc(eui) + '&mid=' + enc(mid) + '&days=1', 120000);
            if (dead || !box.isConnected || chartMid !== mid) return;
            const pts = (Array.isArray(rows) ? rows : []).map((r) => ({ t: Date.parse(r.t), v: Number(r.v) })).filter((p) => isFinite(p.t) && isFinite(p.v));
            SCChart.line(box, [{ name: nameOf(mid), color: '#E07F3F', area: true, pts }], { unit: unitOf(mid), dec: 1, h: 220, label: nameOf(mid) + ', ' + d.name + ', ' + T('last 24 hours', 'τελευταίες 24 ώρες'), empty: T('No readings saved for the last 24 hours yet.', 'Δεν έχουν αποθηκευτεί ακόμα μετρήσεις για τις τελευταίες 24 ώρες.') });
          } catch (e) {
            if (dead || !box.isConnected) return;
            box.replaceChildren(el('div', { class: 'err', role: 'alert' }, T('The chart could not be loaded. ', 'Το γράφημα δεν φορτώθηκε. ') + e.message), el('div', { style: { marginTop: '10px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: load24 }, T('Try again', 'Δοκιμάστε ξανά'))));
          }
        }
        load24();
        const st = status(d);
        const rows = ms.filter((m) => D.latest[d.eui] && D.latest[d.eui][m]);
        pane.append(el('div', { class: 'sx-eb2' }, T('Latest readings from this team’s sensor', 'Τελευταίες μετρήσεις από τον αισθητήρα της ομάδας')),
          rows.length ? el('div', { class: 'nm-table-wrap' }, el('table', { class: 'nm-table' }, el('thead', null, el('tr', null, ['Reading', 'Value', 'Last', 'Status'].map((h, i) => el('th', null, T(h, ['Μέτρηση', 'Τιμή', 'Πότε', 'Κατάσταση'][i]))))),
            el('tbody', null, rows.map((m) => { const r = D.latest[d.eui][m]; const tt = Date.parse(r.t); return el('tr', null, el('td', null, nameOf(m)), el('td', null, el('b', { class: 'sx-v' }, val(d, m))), el('td', { class: 'muted' }, isFinite(tt) ? SC.ago(tt) : '–'), el('td', null, badge(st.st))); }))))
            : el('div', { class: 'empty' }, T('No reading yet from this sensor.', 'Καμία μέτρηση ακόμα από αυτόν τον αισθητήρα.')),
          el('div', { class: 'sx-links' }, el('a', { class: 'pill-link', href: '#/vehicles/' + enc(d.eui) }, T('Open its full history and CSV', 'Πλήρες ιστορικό και CSV'))));
      }
      async function loadGallery(force) {
        if (S.galleryLoading) return;
        if (S.gallery && !force) return;
        S.galleryLoading = true; S.galleryErr = null;
        try { const j = await SC.api('/studio/api/projects?scope=gallery'); S.gallery = j.projects || []; }
        catch (e) { S.galleryErr = e.message; }
        S.galleryLoading = false;
        if (!dead && S.tab === 'projects') keepFocus(drawDetail);
      }
      function drawProjects(pane, x) {
        const { t, s } = x;
        if (S.galleryErr) {
          pane.append(el('div', { class: 'err', role: 'alert' }, T('The projects could not be loaded. ', 'Τα έργα δεν φορτώθηκαν. ') + S.galleryErr), el('div', null, el('button', { class: 'nm-btn', type: 'button', onclick: () => { S.galleryErr = null; loadGallery(true); drawDetail(); } }, T('Try again', 'Δοκιμάστε ξανά'))));
          return;
        }
        if (!S.gallery) { pane.append(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); loadGallery(); return; }
        // approved projects only; matched by team name and school (the API labels the school with its short name)
        const mine = S.gallery.filter((p) => p.team === t.name && (p.school === s.apiShort || p.school === s.apiName)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (!mine.length) {
          pane.append(el('div', { class: 'empty' }, el('b', null, T('No approved project from this team yet.', 'Δεν υπάρχει ακόμα εγκεκριμένο έργο από αυτή την ομάδα.')), el('br'),
            T('Teams build pages in the Build studio. A teacher approves a project before it goes public.', 'Οι ομάδες φτιάχνουν σελίδες στο Στούντιο. Ένας εκπαιδευτικός εγκρίνει ένα έργο πριν γίνει δημόσιο.')),
            el('div', null, el('a', { class: 'nm-btn nm-btn--primary', href: '#/studio' }, T('Open the Build studio', 'Άνοιγμα του Στούντιο'))));
          return;
        }
        pane.append(el('div', { class: 'sx-eb2' }, plural(mine.length, ['approved project', 'approved projects'], ['εγκεκριμένο έργο', 'εγκεκριμένα έργα'])),
          mine.map((p) => el('div', { class: 'sx-pj' }, el('span', { class: 'sx-pj-i' }, icon('file', 24)),
            el('div', { class: 'sx-pj-b' }, el('b', null, p.title), p.idea ? el('div', { class: 'muted sx-pj-s' }, p.idea) : null, el('div', { class: 'muted sx-pj-s' }, T('Updated ', 'Ενημερώθηκε ') + (p.updatedAt ? SC.ago(p.updatedAt) : '–'))),
            el('span', { class: 'sp' }), el('a', { class: 'pill-link', href: '/studio/p/' + enc(p.id), target: '_blank', rel: 'noopener' }, T('Open', 'Άνοιγμα'), icon('external', 14)))),
          el('div', { class: 'nm-callout nm-callout--info' }, T('Teams can have several projects. Start one in the Build studio. A teacher approves it before it goes public.', 'Οι ομάδες μπορούν να έχουν πολλά έργα. Ξεκινήστε ένα στο Στούντιο. Ένας εκπαιδευτικός το εγκρίνει πριν γίνει δημόσιο.')));
      }

      /* ---------- build the page ---------- */
      function fresh() {
        const ts = D.devices.map((d) => status(d)).filter(Boolean).map((s) => s.t).filter(Boolean);
        const t = ts.length ? Math.max(...ts) : null;
        return !D.devices.length || D.devErr ? { text: T('No live data', 'Χωρίς ζωντανά δεδομένα'), cls: 'none' }
          : t && Date.now() - t < FRESH ? { text: T('Live · ' + SC.ago(t), 'Ζωντανά · ' + SC.ago(t)), cls: '' } : { text: t ? T('Last reading ' + SC.ago(t), 'Τελευταία μέτρηση ' + SC.ago(t)) : T('No reading yet', 'Καμία μέτρηση ακόμα'), cls: 'stale' };
      }
      function setHead() {
        const f = fresh();
        const nh = pageHead({ fresh: f.text, tags: D.cfg && D.cfg.demo ? [{ cls: 'demo', text: T('Demo data', 'Δοκιμαστικά δεδομένα') }] : [] });
        const pill = nh.querySelector('.fresh-pill');
        if (pill && f.cls) pill.classList.add(f.cls);
        headEl.replaceWith(nh);
        headEl = nh;
      }
      function build() {
        setHead();
        body.replaceChildren();
        if (!D.schools.length) { body.append(el('div', { class: 'empty' }, T('No schools are set up yet.', 'Δεν έχουν ρυθμιστεί ακόμα σχολεία.'))); return; }
        A.ann = el('section', { class: 'nm-callout nm-callout--info sx-ann', 'aria-label': T('Announcements', 'Ανακοινώσεις'), hidden: true });
        A.q = el('input', { type: 'search', class: 'nm-input sx-q', placeholder: T('Search teams or schools…', 'Αναζήτηση ομάδων ή σχολείων…'), 'aria-label': T('Search teams and schools', 'Αναζήτηση ομάδων και σχολείων'), autocomplete: 'off',
          oninput: (e) => { S.q = e.target.value; keepFocus(() => drawTeams(true)); } });
        A.freshCb = el('input', { type: 'checkbox', onchange: (e) => { S.fresh = e.target.checked; keepFocus(() => drawTeams(true)); } });
        A.pills = el('div', { class: 'nm-pillbar sx-pills', role: 'group', 'aria-label': T('Filter by school', 'Φίλτρο ανά σχολείο') });
        A.badge = el('span', { class: 'sx-badge' });
        A.schools = el('section', { class: 'sx-schools', 'aria-label': T('Schools', 'Σχολεία') });
        A.count = el('p', { class: 'sx-count-t', 'aria-live': 'polite' });
        A.sortBox = el('label', { class: 'sx-sort' }, el('span', null, T('Sort', 'Ταξινόμηση')),
          el('select', { class: 'nm-input sx-sel', onchange: (e) => { S.sort = e.target.value; keepFocus(() => drawTeams(false)); } },
            el('option', { value: 'school' }, T('School', 'Σχολείο')), el('option', { value: 'name' }, T('Team name', 'Όνομα ομάδας'))));
        A.teams = el('div', { class: 'sx-teams' });
        A.detail = el('aside', { class: 'nm-card sx-detail', 'aria-label': T('Team profile', 'Προφίλ ομάδας') });
        A.warn = el('div', { class: 'sx-warn' });
        const hrs = hours(), km = gridKm();
        body.append(A.ann, A.warn,
          el('div', { class: 'sx-searchbar' }, el('label', { class: 'sx-field' }, icon('search', 20), A.q)),
          el('div', { class: 'sx-filters' }, A.pills, el('label', { class: 'sx-fresh' }, A.freshCb, T('Fresh data only', 'Μόνο πρόσφατα δεδομένα')), A.badge),
          el('div', { class: 'nm-callout nm-callout--info sx-safe' }, icon('lock', 22), el('span', null, el('b', null, T('Protecting students.', 'Προστασία των μαθητών.')), ' ',
            T('This site shows no student names or photos. Vehicle positions are shown about ' + hrs + ' hours late and rounded to about ' + km + ' km. Teachers see exact positions.',
              'Αυτός ο ιστότοπος δεν εμφανίζει ονόματα ή φωτογραφίες μαθητών. Οι θέσεις των οχημάτων εμφανίζονται με καθυστέρηση περίπου ' + hrs + ' ωρών και στρογγυλοποιημένες στο ' + km + ' χλμ. Οι εκπαιδευτικοί βλέπουν τις ακριβείς θέσεις.'))),
          A.schools,
          el('div', { class: 'sx-sec' }, el('div', null, el('div', { class: 'sx-eb2 cu' }, T('Teams', 'Ομάδες')), el('h2', null, T('Each team, and the sensor it carries.', 'Κάθε ομάδα και ο αισθητήρας που φέρει.')), A.count), A.sortBox),
          el('div', { class: 'sx-split' }, A.teams, A.detail));
        drawWarn();
        drawAnnouncements();
        drawPills();
        drawSchools();
        // ?school=<slug or place> and ?team=<id> from the route
        const qs = ctx.query.get('school'), qt = ctx.query.get('team');
        if (qs && !S.seen) { const f = String(qs).toLowerCase(); const m = D.schools.find((s) => s.slug === f || s.key === f || s.words.some((w) => w === f)); if (m) { S.filter = m.slug; drawPills(); drawSchools(); } }
        if (qt && !S.seen) { const m = allTeams().find((x) => String(x.t.id) === String(qt)); if (m) { S.sel = m.t.id; if (S.filter !== 'all' && S.filter !== m.s.slug) { S.filter = 'all'; drawPills(); drawSchools(); } } }
        S.seen = true;
        drawTeams(true);
      }
      function drawWarn() {
        A.warn.replaceChildren();
        if (D.devErr) A.warn.append(el('div', { class: 'err', role: 'alert' }, T('Live readings could not be loaded, so sensors and readings are left out. ', 'Οι ζωντανές μετρήσεις δεν φορτώθηκαν, γι’ αυτό λείπουν οι αισθητήρες και οι μετρήσεις. ') + D.devErr + ' ',
          el('button', { class: 'nm-btn', type: 'button', onclick: refresh }, T('Try again', 'Δοκιμάστε ξανά'))));
      }
      function fail(e) {
        body.replaceChildren(el('div', { class: 'err', role: 'alert' }, T('The schools could not be loaded. ', 'Τα σχολεία δεν φορτώθηκαν. ') + (e && e.message ? e.message : '')),
          el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: boot }, T('Try again', 'Δοκιμάστε ξανά'))));
      }
      async function boot() {
        body.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try { await load(); } catch (e) { if (!dead) fail(e); return; }
        if (dead) return;
        build();
        schedule();
      }
      // a quiet refresh: new readings, same selection, same search, same tab
      async function refresh() {
        const prev = D.devErr;
        try { await load(); } catch (e) { return; }
        if (dead || !A.schools || !A.schools.isConnected) return;
        keepFocus(() => {
          const f = fresh(); const pill = headEl.querySelector('.fresh-pill');
          if (pill) { pill.lastChild.textContent = f.text; pill.classList.remove('stale', 'none'); if (f.cls) pill.classList.add(f.cls); }
          drawWarn(); drawAnnouncements(); drawPills(); drawSchools(); drawTeams(false);
        });
        void prev;
      }
      function schedule() { clearInterval(timer); timer = setInterval(() => { if (!document.hidden) refresh(); }, 60000); }

      await boot();
      return () => { dead = true; clearInterval(timer); };
    },
  });
})();
