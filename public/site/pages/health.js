/*
  Data health (#/health): where every number comes from and what the checks found. Reads GET /api/health (data-health.js).
  Two faces of the same report:
    - the flow drawing: one lane per source, dots travelling into the "passed" pool or the "left out" pool. Thickness is readings,
      speed and brightness are how fresh the source is. With reduced motion the dots stand still.
    - the written report: the four stages, what to look at first, and every source with its checks, which is the version a screen
      reader and a careful reader get. The drawing adds nothing that is not written below it.
  The checks only report: a reading that fails is left out of the tools and the reason is named. Nothing is corrected here.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  const isEl = () => SC.lang === 'el';
  const L = (p) => (Array.isArray(p) ? (isEl() ? p[1] || p[0] : p[0]) : p || '');
  const nf = (n) => Number(n || 0).toLocaleString(isEl() ? 'el-GR' : 'en-GB');
  const ICON = { pass: '✓', warn: '!', fail: '✗' };
  const WORD = { pass: ['passed', 'πέρασε'], warn: ['warning', 'προειδοποίηση'], fail: ['failed', 'απέτυχε'] };
  const KINDW = { time: ['timing', 'χρονισμός'], values: ['values', 'τιμές'], meta: ['paperwork', 'τεκμηρίωση'], cross: ['checked against another source', 'διασταύρωση'] };
  const GROUP = { own: ['ours', 'δικά μας'], official: ['official', 'επίσημη'], model: ['model', 'μοντέλο'], context: ['context', 'πλαίσιο'] };
  const STATE = { live: ['sending now', 'στέλνει τώρα'], late: ['late', 'καθυστερεί'], down: ['quiet', 'σιωπηλή'] };
  const ago = (ms) => (ms == null ? '' : ms < 90000 ? T('just now', 'μόλις τώρα') : ms < 3600000 ? T(Math.round(ms / 60000) + ' min ago', 'πριν ' + Math.round(ms / 60000) + ' λ.') : T(Math.round(ms / 3600000) + ' h ago', 'πριν ' + Math.round(ms / 3600000) + ' ώ.'));

  SC.register('health', {
    title: ['Data health', 'Υγεία δεδομένων'],
    render(root) {
      SC.css('/site/pages/health.css');
      let alive = true, raf = 0, timer = 0, D = null, open = null;
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const stage = h('div', { class: 'hl-stage' }), body = h('div', { class: 'hl-body' });
      const canvas = h('canvas', { class: 'hl-c', role: 'img', 'aria-label': T('Readings travelling from each source into the tools, or into the readings that were left out', 'Μετρήσεις που ταξιδεύουν από κάθε πηγή στα εργαλεία, ή στις μετρήσεις που έμειναν εκτός') });
      root.replaceChildren(h('div', { class: 'hl' },
        SC.head({ title: T('Data health', 'Υγεία δεδομένων'), lede: T('Every number on Athena travels the same path: a source sends it, a builder shapes it, checks look at it, and a tool reads it. The checks only report. A reading that fails is left out and the reason is named here.', 'Κάθε αριθμός στην Athena κάνει την ίδια διαδρομή: μια πηγή τον στέλνει, μια κατασκευή τον διαμορφώνει, έλεγχοι τον κοιτούν και ένα εργαλείο τον διαβάζει. Οι έλεγχοι μόνο αναφέρουν. Μια μέτρηση που αποτυγχάνει μένει εκτός και ο λόγος φαίνεται εδώ.') }),
        h('div', { class: 'hl-card hl-flow' }, canvas, h('p', { class: 'hl-leg' },
          h('span', null, h('b', null, T('Thickness', 'Πάχος')), ' ', T('= readings now', '= μετρήσεις τώρα')),
          h('span', null, h('b', null, T('Speed', 'Ταχύτητα')), ' ', T('= how fresh the source is', '= πόσο φρέσκια είναι η πηγή')),
          h('span', { class: 'y' }, h('b', null, T('Amber', 'Κεχριμπαρένιο')), ' ', T('= arrived in the last few minutes', '= έφτασε τα τελευταία λεπτά')),
          h('span', { class: 'r' }, h('b', null, T('Red', 'Κόκκινο')), ' ', T('= failed a check, left out', '= απέτυχε σε έλεγχο, έμεινε εκτός')))),
        stage, body));

      /* ---------- the written report ---------- */
      const chip = (st, text) => h('span', { class: 'hl-chip ' + st }, ICON[st] + ' ' + text);
      function drawStage() {
        if (!D) { stage.replaceChildren(h('p', { class: 'hl-note' }, T('Working out the report…', 'Υπολογισμός της αναφοράς…'))); return; }
        const s = D.stages, step = (n, label, sub) => h('div', { class: 'hl-st' }, h('b', null, nf(n)), h('span', null, label), h('small', null, sub));
        stage.replaceChildren(h('div', { class: 'hl-steps' },
          step(s.sources, T('sources', 'πηγές'), T('where data comes from', 'από πού έρχονται τα δεδομένα')), h('i', { 'aria-hidden': 'true' }, '→'),
          step(s.builders, T('builders', 'κατασκευές'), (D.builders || []).map((b) => L(b.n)).slice(0, 3).join(', ') + '…'), h('i', { 'aria-hidden': 'true' }, '→'),
          step(s.checks, T('checks', 'έλεγχοι'), T(nf(D.totals.checked) + ' values looked at', nf(D.totals.checked) + ' τιμές ελέγχθηκαν')), h('i', { 'aria-hidden': 'true' }, '→'),
          step(s.feeds, T('tools read them', 'εργαλεία τα διαβάζουν'), (D.feeds || []).map((f) => L(f.n)).slice(0, 3).join(', ') + '…')),
          h('p', { class: 'hl-tot' }, chip('pass', T(D.totals.pass + ' passed', D.totals.pass + ' πέρασαν')), chip('warn', T(D.totals.warn + (D.totals.warn === 1 ? ' warning' : ' warnings'), D.totals.warn + ' προειδοποιήσεις')), chip('fail', T(D.totals.fail + ' failed', D.totals.fail + ' απέτυχαν')),
            h('small', null, T('Checked ' + SC.dateTime(D.at) + '. Worked out again every minute.', 'Έλεγχος ' + SC.dateTime(D.at) + '. Υπολογίζεται ξανά κάθε λεπτό.'))));
      }
      const itemList = (g, cap) => (g.items && g.items.length ? h('ul', { class: 'hl-items' }, g.items.slice(0, cap).map((i) => h('li', null, h('code', null, i.id), ' ', L(i.why))), g.failed > Math.min(cap, g.items.length) ? h('li', { class: 'hl-more' }, T('and ' + (g.failed - Math.min(cap, g.items.length)) + ' more', 'και ' + (g.failed - Math.min(cap, g.items.length)) + ' ακόμη')) : null) : null);
      function sourceCard(s) {
        const isOpen = open === s.id;
        const head = h('button', { type: 'button', class: 'hl-hd', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { open = isOpen ? null : s.id; drawBody(); } },
          chip(s.sum.status, ''), h('span', { class: 'hl-nm' }, h('b', null, isEl() ? s.nameEl : s.name), h('code', null, s.id)),
          h('span', { class: 'hl-meta' }, [L(GROUP[s.group] || [s.group, s.group]), s.state && STATE[s.state] ? L(STATE[s.state]) : null, s.lastAt ? ago(D.at - s.lastAt) : null,
            T(s.gates.length + ' checks', s.gates.length + ' έλεγχοι'), s.sum.fail ? T(s.sum.fail + ' failed', s.sum.fail + ' απέτυχαν') : null, s.sum.warn ? T(s.sum.warn + (s.sum.warn === 1 ? ' warning' : ' warnings'), s.sum.warn + ' προειδ.') : null].filter(Boolean).join(' · ')),
          h('i', { 'aria-hidden': 'true' }, isOpen ? '−' : '+'));
        if (!isOpen) return h('article', { class: 'hl-src ' + s.sum.status }, head);
        const lic = s.licence || {};
        return h('article', { class: 'hl-src ' + s.sum.status + ' open' }, head, h('div', { class: 'hl-open' },
          h('div', { class: 'hl-cols' },
            h('div', null, h('h4', null, T('Where it comes from', 'Από πού έρχεται')), h('p', null, s.publisher || T('Not recorded', 'Δεν έχει καταγραφεί')),
              h('p', { class: 'hl-sub' }, lic.id ? (lic.url ? h('a', { href: lic.url, target: '_blank', rel: 'noopener' }, lic.id) : lic.id) : T('no licence recorded', 'χωρίς καταγεγραμμένη άδεια'), lic.checkedOn ? ' · ' + T('checked ' + lic.checkedOn, 'ελέγχθηκε ' + lic.checkedOn) : ''),
              lic.attribution ? h('p', { class: 'hl-sub' }, lic.attribution) : null),
            h('div', null, h('h4', null, T('How often it promises to send', 'Πόσο συχνά υπόσχεται να στέλνει')), h('p', null, s.everyMs ? T('every ' + Math.round(s.everyMs / 60000) + ' minutes', 'κάθε ' + Math.round(s.everyMs / 60000) + ' λεπτά') : T('not stated', 'δεν δηλώνεται')),
              h('h4', null, T('What it holds now', 'Τι περιέχει τώρα')), h('p', null, T(nf(s.holds.readings) + ' readings · ' + s.holds.cities + ' cities · ' + s.holds.variables + ' measurements', nf(s.holds.readings) + ' μετρήσεις · ' + s.holds.cities + ' πόλεις · ' + s.holds.variables + ' μετρήσιμα')),
              s.holds.dropped ? h('p', { class: 'hl-sub' }, T(nf(s.holds.dropped) + ' readings left out' + (s.holds.droppedCut ? ', and more than Athena lists here' : ''), nf(s.holds.dropped) + ' μετρήσεις έμειναν εκτός' + (s.holds.droppedCut ? ', και περισσότερες από όσες γράφει εδώ η Athena' : ''))) : null),
            h('div', null, h('h4', null, T('Kind of source', 'Είδος πηγής')), h('p', null, s.kind ? L(s.kind) : T('not stated', 'δεν δηλώνεται')), s.holds.sensors ? h('p', { class: 'hl-sub' }, T(s.holds.sensors + ' sensors', s.holds.sensors + ' αισθητήρες')) : null)),
          h('div', { class: 'hl-tw' }, h('table', null,
            h('thead', null, h('tr', null, h('th', null, ''), h('th', null, T('Check', 'Έλεγχος')), h('th', { class: 'n' }, T('Looked at', 'Ελέγχθηκαν')), h('th', { class: 'n' }, T('Failed', 'Απέτυχαν')))),
            h('tbody', null, s.gates.map((g) => h('tr', { class: g.status }, h('td', null, h('span', { class: 'hl-tick ' + g.status, title: L(WORD[g.status]) }, ICON[g.status])),
              h('td', null, h('b', null, L(g.n)), h('small', null, L(KINDW[g.kind] || [g.kind, g.kind])), g.note ? h('p', { class: 'hl-nt' }, L(g.note)) : null, g.status !== 'pass' ? itemList(g, 4) : null),
              h('td', { class: 'n' }, nf(g.checked)), h('td', { class: 'n' }, g.failed ? h('b', null, nf(g.failed)) : '0')))))),
          h('p', { class: 'hl-note' }, L(D.note))));
      }
      function drawBody() {
        if (!D) { body.replaceChildren(); return; }
        const bad = D.issues || [];
        body.replaceChildren(
          h('div', { class: 'hl-card' }, h('h2', null, T('Look at these first', 'Δες πρώτα αυτά')),
            bad.length ? h('div', null, bad.map((i) => h('div', { class: 'hl-iss ' + i.gate.status },
              h('p', { class: 'hl-ih' }, chip(i.gate.status, L(WORD[i.gate.status])), ' ', h('code', null, i.source), ' · ', L(i.gate.n)),
              i.gate.note ? h('p', { class: 'hl-nt' }, L(i.gate.note)) : null, itemList(i.gate, 2),
              h('button', { type: 'button', class: 'hl-go', onclick: () => { open = i.source; drawBody(); const el = document.getElementById('hl-' + i.source); if (el) el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); } }, T('All checks for this source ↓', 'Όλοι οι έλεγχοι αυτής της πηγής ↓')))))
              : h('p', { class: 'hl-note' }, T('Every check passed.', 'Όλοι οι έλεγχοι πέρασαν.'))),
          h('div', { class: 'hl-card' }, h('h2', null, T('Every source, and what was checked', 'Κάθε πηγή, και τι ελέγχθηκε')),
            h('p', { class: 'hl-note' }, T(D.sources.length + ' sources that are switched on · press one to open it', D.sources.length + ' πηγές σε λειτουργία · πάτησε μία για να ανοίξει')),
            h('div', { class: 'hl-list' }, D.sources.map((s) => { const card = sourceCard(s); card.id = 'hl-' + s.id; return card; }))),
          (D.extracts && D.extracts.length ? h('div', { class: 'hl-card' },
            h('h2', null, T('The frozen extracts behind the investigations', 'Τα παγωμένα αποσπάσματα πίσω από τις διερευνήσεις')),
            h('p', { class: 'hl-note' }, T(D.extracts.length + ' dated copies of published files. They do not arrive by themselves, so they are checked for who published them, under what licence, when they were taken, and whether the copy kept beside them still matches.',
              D.extracts.length + ' χρονολογημένα αντίγραφα δημοσιευμένων αρχείων. Δεν φτάνουν μόνα τους, άρα ελέγχεται ποιος τα δημοσίευσε, με ποια άδεια, πότε πάρθηκαν και αν ταιριάζει ακόμη το αντίγραφο που φυλάσσεται δίπλα τους.')),
            h('div', { class: 'hl-list' }, D.extracts.map((x) => h('article', { class: 'hl-ext ' + x.sum.status },
              h('header', { class: 'hl-hd' }, chip(x.sum.status, ''),
                h('span', { class: 'hl-nm' }, h('b', null, isEl() ? x.nameEl : x.name), h('code', null, x.id)),
                h('span', { class: 'hl-meta' }, [x.publisher, x.licence].filter(Boolean).join(' · '))),
              h('ul', { class: 'hl-xg' }, x.gates.map((g) => h('li', { class: g.status },
                h('span', { class: 'hl-tick ' + g.status, title: L(WORD[g.status]) }, ICON[g.status]),
                h('b', null, L(g.n)), g.note ? h('p', null, L(g.note)) : null)))))))
            : null),
          h('div', { class: 'hl-card' }, h('h2', null, T('For the class', 'Για την τάξη')),
            h('ul', { class: 'hl-cls' },
              h('li', null, T('Which of our sources is least reliable this week, and why?', 'Ποια πηγή μας είναι η λιγότερο αξιόπιστη αυτή την εβδομάδα, και γιατί;')),
              h('li', null, T('Pick a failed check and explain what could have caused it.', 'Διάλεξε έναν έλεγχο που απέτυχε και εξήγησε τι μπορεί να τον προκάλεσε.')),
              h('li', null, T('If a source is quiet today, which tools should we not trust?', 'Αν μια πηγή είναι σιωπηλή σήμερα, ποια εργαλεία δεν πρέπει να εμπιστευτούμε;')),
              h('li', null, T('Take one investigation: who published its file, and could you download it yourself and get the same numbers?', 'Πάρε μία διερεύνηση: ποιος δημοσίευσε το αρχείο της, και θα μπορούσες να το κατεβάσεις μόνος σου και να βγάλεις τους ίδιους αριθμούς;')))));
      }

      /* ---------- the flow drawing ---------- */
      const sprite = (rgb) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.16, 'rgba(' + rgb + ',.95)'); g.addColorStop(0.45, 'rgba(' + rgb + ',.25)'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; };
      const SP = { g: sprite('94,224,168'), y: sprite('247,196,107'), r: sprite('242,85,122') };
      let lanes = [], dots = [], W = 0, H = 0;
      function layout() {
        const dpr = Math.min(2, window.devicePixelRatio || 1), cw = canvas.clientWidth || 900;
        const F = D ? D.flow.lanes.slice(0, 10) : [];
        const narrow = cw < 680;
        H = Math.max(260, 70 + F.length * (narrow ? 30 : 36) + 60);
        W = cw; canvas.width = Math.round(cw * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px';
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const maxRate = Math.max(1, ...F.map((l) => l.rate));
        const lx = narrow ? Math.min(150, cw * 0.34) : Math.min(260, cw * 0.3);
        lanes = F.map((l, i) => ({ ...l, y: 56 + i * ((H - 110) / Math.max(1, F.length - 1)), w: 3 + (l.rate / maxRate) * (narrow ? 9 : 14), lx, share: l.rate ? Math.min(1, l.left / l.rate) : 0 }));
        dots = [];
        lanes.forEach((l, i) => { const n = Math.max(3, Math.round(4 + (l.rate / maxRate) * 16));
          for (let k = 0; k < n; k++) dots.push({ l: i, p: Math.random(), bad: Math.random() < l.share, sp: (0.0018 + 0.0030 * l.fresh) * (0.75 + Math.random() * 0.5) }); });
      }
      function paint() {
        raf = 0;
        if (!alive || !D) return;
        const ctx = canvas.getContext('2d'), px = Math.max(W * 0.62, (lanes[0] ? lanes[0].lx : 200) + 120), gy = H * 0.30, ry = H * 0.80, narrow = W < 680;
        ctx.clearRect(0, 0, W, H);
        const label = (t, x, y, size, colour, align, weight) => { ctx.font = (weight || 600) + ' ' + size + 'px Inter, "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = colour; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); };
        const pool = (y, rgb, big, small) => { const gr = ctx.createRadialGradient(px, y, 3, px, y, 90); gr.addColorStop(0, 'rgba(' + rgb + ',.45)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, y, 90, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(' + rgb + ',.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, y, 36, 0, 7); ctx.stroke();
          label(big, px, y - 5, 15, '#fff', 'center', 800); label(small, px, y + 13, 11.5, '#b8cde6', 'center', 500); };
        label(T('SOURCES', 'ΠΗΓΕΣ'), 2, 24, 11, '#64788f', 'left', 800);
        if (D.flow.quiet) label(T(D.flow.quiet + (D.flow.quiet === 1 ? ' source sent nothing to check' : ' sources sent nothing to check'), D.flow.quiet + (D.flow.quiet === 1 ? ' πηγή δεν έστειλε τίποτα για έλεγχο' : ' πηγές δεν έστειλαν τίποτα για έλεγχο')), 2, H - 10, 11, '#F7C46B', 'left', 600);
        label(T('CHECKED', 'ΕΛΕΓΜΕΝΑ'), px, 24, 11, '#64788f', 'center', 800);
        if (!narrow) label(T('WHERE IT GOES', 'ΠΟΥ ΠΑΕΙ'), Math.min(W - 4, px + 110), 24, 11, '#64788f', 'left', 800);
        pool(gy, '94,224,168', nf(D.flow.passed), T('passed', 'πέρασαν'));
        pool(ry, '242,85,122', nf(D.flow.left), T('left out', 'εκτός'));
        lanes.forEach((l) => {
          const quiet = l.fresh < 0.3;
          ctx.fillStyle = quiet ? 'rgba(125,211,252,.18)' : 'rgba(125,211,252,.32)';
          ctx.fillRect(l.lx - 12, l.y - l.w / 2, 12, l.w);
          label(isEl() ? l.nameEl : l.name, l.lx - 18, l.y - (narrow ? 0 : 6), narrow ? 11.5 : 13, quiet ? '#7f93ad' : '#e6eef8', 'right', 700);
          if (!narrow) label(l.id + ' · ' + T(l.rate + ' now', l.rate + ' τώρα') + (quiet ? ' · ' + T('quiet', 'σιωπηλή') : ''), l.lx - 18, l.y + 9, 10.5, quiet ? '#F7C46B' : '#8ea2bb', 'right', 500);
          [[gy, '94,224,168', 0.12], [ry, '242,85,122', 0.1]].forEach(([ey, rgb, a], k) => {
            if (k === 1 && !l.share) return;
            ctx.strokeStyle = 'rgba(' + rgb + ',' + a + ')'; ctx.lineWidth = k ? 1.5 : Math.max(1.5, l.w * 0.5);
            ctx.beginPath(); ctx.moveTo(l.lx, l.y); const mx = (l.lx + px) / 2; ctx.bezierCurveTo(mx, l.y, mx, ey, px - 36, ey); ctx.stroke(); });
        });
        dots.forEach((d) => {
          const l = lanes[d.l]; if (!l) return;
          if (!reduced) { d.p += d.sp; if (d.p > 1) { d.p -= 1; d.bad = Math.random() < l.share; } }
          const ey = d.bad ? ry : gy, mx = (l.lx + px) / 2, t = d.p, u = 1 - t;
          const x = u * u * u * l.lx + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * (px - 36);
          const y = u * u * u * l.y + 3 * u * u * t * l.y + 3 * u * t * t * ey + t * t * t * ey;
          const s = d.bad ? SP.r : l.fresh > 0.85 ? SP.y : SP.g, size = (d.bad ? 15 : 11 + l.w * 0.6) * (0.6 + 0.4 * Math.sin(t * 3.14));
          ctx.globalAlpha = l.fresh < 0.3 ? 0.45 : 1; ctx.drawImage(s, x - size / 2, y - size / 2, size, size); ctx.globalAlpha = 1;
        });
        if (!narrow) {
          const tools = (D.flow.feeds || []).slice(0, 6), tx = Math.min(W - 6, px + 110);
          tools.forEach((f, i) => { const y = gy - 52 + i * 21;
            ctx.strokeStyle = 'rgba(94,224,168,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 36, gy); ctx.lineTo(tx - 8, y); ctx.stroke();
            label('●', tx - 7, y, 8, '#5EE0A8'); label(L(f.n), tx + 3, y, 12, '#dbe8f3', 'left', 600); });
          (D.flow.out || []).slice(0, 4).forEach((o, i) => { const y = ry - 24 + i * 21;
            ctx.strokeStyle = 'rgba(242,85,122,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 36, ry); ctx.lineTo(tx - 8, y); ctx.stroke();
            label('●', tx - 7, y, 8, '#F2557A'); label(L(o.n) + ' · ' + o.count, tx + 3, y, 12, '#dbe8f3', 'left', 600); });
        }
        if (!reduced && !document.hidden) raf = requestAnimationFrame(paint);
      }
      const redraw = () => { if (!raf) raf = requestAnimationFrame(paint); };
      const onResize = () => { if (!D) return; layout(); redraw(); };
      window.addEventListener('resize', onResize);

      let busy = false;
      function load() {
        if (busy) return;              // a slow report must not pile up behind itself
        busy = true;
        SC.api('/api/health').then((r) => {
          busy = false;
          if (!alive) return;
          D = r; drawStage(); drawBody(); layout(); redraw();
          canvas.setAttribute('aria-label', T('Readings from ' + D.flow.lanes.length + ' sources: ' + nf(D.flow.passed) + ' passed the checks, ' + nf(D.flow.left) + ' were left out. The same numbers are written below.',
            'Μετρήσεις από ' + D.flow.lanes.length + ' πηγές: ' + nf(D.flow.passed) + ' πέρασαν τους ελέγχους, ' + nf(D.flow.left) + ' έμειναν εκτός. Οι ίδιοι αριθμοί είναι γραμμένοι παρακάτω.'));
          document.body.dataset.health = String(D.sources.length);
        }).catch((e) => {
          busy = false;
          if (!alive) return;
          const msg = h('p', { class: 'hl-warn' }, D ? T('This report could not be worked out again just now, so it is the one from ' + SC.time(D.at) + '. It is tried again in two minutes.', 'Η αναφορά δεν ξαναϋπολογίστηκε τώρα, άρα είναι αυτή των ' + SC.time(D.at) + '. Θα ξαναδοκιμάσει σε δύο λεπτά.')
            : T('The report could not be worked out right now. It is tried again in two minutes.', 'Η αναφορά δεν μπόρεσε να υπολογιστεί τώρα. Θα ξαναδοκιμάσει σε δύο λεπτά.'));
          if (D) { const old = stage.querySelector('.hl-warn'); if (old) old.remove(); stage.prepend(msg); } else stage.replaceChildren(msg);
        });
      }
      load();
      timer = setInterval(() => { if (alive && !document.hidden) load(); }, 120000);
      document.addEventListener('visibilitychange', redraw);
      return () => { alive = false; delete document.body.dataset.health; clearInterval(timer); if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', redraw); };
    },
  });
})();
