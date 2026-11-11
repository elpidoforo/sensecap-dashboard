/* League: an optional, schools-only ranking made from data collected (sensors online, approved tools, finished plans). Never people.
   Off by default; a teacher switches it on in Settings.
   API: GET /app/api/league -> { enabled:false } or { enabled:true, basis, schools:[{ school, points, parts:[{ label, value }] }] }. */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const errText = (e) => (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');
  const COLORS = ['var(--nm-c1)', 'var(--nm-c2)', 'var(--nm-c3)', 'var(--nm-c4)', 'var(--nm-c5)'];

  // What a part of the score counts, in words. Matched on the label the server sends; an unknown part just shows its own label.
  const KNOWN = [
    { re: /sensor/i, el: 'Αισθητήρες σε λειτουργία',
      en: 'Sensors that sent a reading recently. More sensors online means more to learn from.',
      gr: 'Αισθητήρες που έστειλαν πρόσφατα μέτρηση. Περισσότεροι αισθητήρες σε λειτουργία σημαίνουν περισσότερα να μάθουμε.' },
    { re: /tool/i, el: 'Εγκεκριμένα εργαλεία',
      en: 'Tools built by student teams that a teacher checked and approved.',
      gr: 'Εργαλεία που έφτιαξαν ομάδες μαθητών και τα έλεγξε και ενέκρινε ένας εκπαιδευτικός.' },
    { re: /plan/i, el: 'Ολοκληρωμένα σχέδια',
      en: 'Team plans (a question, sensors and data) that the team has finished.',
      gr: 'Σχέδια ομάδων (ερώτηση, αισθητήρες και δεδομένα) που η ομάδα έχει ολοκληρώσει.' },
  ];
  const known = (label) => KNOWN.find((k) => k.re.test(label || ''));
  const partName = (label) => { const k = known(label); return SC.lang === 'el' && k ? k.el : label; };
  const partHelp = (label) => { const k = known(label); return k ? t(k.en, k.gr) : ''; };

  function clean(d) {
    if (!d || typeof d !== 'object') throw new Error(t('The league service sent an answer this page cannot read.', 'Η υπηρεσία του πρωταθλήματος έστειλε απάντηση που η σελίδα δεν μπορεί να διαβάσει.'));
    if (!d.enabled) return { enabled: false };
    const schools = (Array.isArray(d.schools) ? d.schools : []).map((s) => ({
      school: String((s && s.school) || ''), points: Number(s && s.points) || 0,
      parts: (Array.isArray(s && s.parts) ? s.parts : []).map((p) => ({ label: String((p && p.label) || ''), value: Number(p && p.value) || 0 })).filter((p) => p.label),
    })).filter((s) => s.school);
    schools.sort((a, b) => b.points - a.points || a.school.localeCompare(b.school));
    let rank = 0;
    schools.forEach((s, i) => { if (i === 0 || s.points !== schools[i - 1].points) rank = i + 1; s.rank = rank; });
    return { enabled: true, basis: typeof d.basis === 'string' && d.basis.length > 12 ? d.basis : '', schools };
  }

  const sentence = (s) => {
    if (!s.points) return t('No points yet.', 'Δεν υπάρχουν ακόμη πόντοι.');
    const bits = s.parts.filter((p) => p.value > 0).map((p) => p.value + t(' for ', ' από ') + partName(p.label).toLowerCase());
    return bits.length ? t(s.points + ' points: ' + bits.join(', ') + '.', s.points + ' πόντοι: ' + bits.join(', ') + '.') : t(s.points + ' points.', s.points + ' πόντοι.');
  };

  function safeguarding() {
    return el('section', { class: 'nm-card lg-safe', 'aria-labelledby': 'lg-safe-h' },
      el('div', { class: 'lg-safe-h' }, el('span', { class: 'nm-icon-tile' }, SC.icon('shield')), el('h2', { class: 'card-h', id: 'lg-safe-h' }, t('A note on safeguarding', 'Σημείωση για την προστασία'))),
      el('p', null, t('This league ranks schools, never students or teachers. It only adds up data that sensors and approved work have produced. It shows no names, no photos and no scores for individual people.',
        'Αυτό το πρωτάθλημα κατατάσσει σχολεία, ποτέ μαθητές ή εκπαιδευτικούς. Προσθέτει μόνο δεδομένα που παρήγαγαν οι αισθητήρες και η εγκεκριμένη δουλειά. Δεν δείχνει ονόματα, φωτογραφίες ή βαθμούς μεμονωμένων ανθρώπων.')),
      el('p', null, t('It is a way to be proud of what a school has collected, not a contest between children. A school lower down the list usually has fewer sensors, not worse students. A teacher can switch the league off at any time.',
        'Είναι ένας τρόπος να νιώθει υπερηφάνεια ένα σχολείο για ό,τι έχει συλλέξει, όχι αγώνας ανάμεσα σε παιδιά. Ένα σχολείο χαμηλότερα στη λίστα έχει συνήθως λιγότερους αισθητήρες, όχι χειρότερους μαθητές. Ένας εκπαιδευτικός μπορεί να απενεργοποιήσει το πρωτάθλημα οποιαδήποτε στιγμή.')));
  }

  function offCard(isTeacher) {
    const pt = (icon, h, p) => el('div', { class: 'lg-pt' }, el('span', { class: 'nm-icon-tile' }, SC.icon(icon)), el('b', null, h), el('p', null, p));
    return el('div', { class: 'lg' },
      el('section', { class: 'nm-card nm-card--glow lg-off', 'aria-live': 'polite' },
        el('span', { class: 'lg-trophy', 'aria-hidden': 'true' }, SC.icon('trophy')),
        el('h2', null, t('The league is switched off.', 'Το πρωτάθλημα είναι απενεργοποιημένο.')),
        el('p', { class: 'lg-lead' }, t('Teachers can switch it on in Settings.', 'Οι εκπαιδευτικοί μπορούν να το ενεργοποιήσουν στις Ρυθμίσεις.')),
        isTeacher ? el('a', { class: 'nm-btn nm-btn--primary', href: '#/settings/league' }, SC.icon('gear', 18), t('Open Settings', 'Άνοιγμα Ρυθμίσεων')) : null),
      el('div', { class: 'cols-3' },
        pt('users', t('Schools only', 'Μόνο σχολεία'), t('If it is switched on, it ranks schools. Never students, never teachers.', 'Αν ενεργοποιηθεί, κατατάσσει σχολεία. Ποτέ μαθητές, ποτέ εκπαιδευτικούς.')),
        pt('sensor', t('Based on data collected', 'Με βάση τα δεδομένα που συλλέγονται'), t('Points come from sensors online, tools a teacher approved and plans that are done.', 'Οι πόντοι προέρχονται από αισθητήρες σε λειτουργία, εργαλεία που ενέκρινε ένας εκπαιδευτικός και σχέδια που ολοκληρώθηκαν.')),
        pt('shield', t('Always optional', 'Πάντα προαιρετικό'), t('It is off until a teacher decides the class would enjoy it, and can be switched off again.', 'Είναι κλειστό μέχρι να αποφασίσει ένας εκπαιδευτικός ότι θα αρέσει στην τάξη, και μπορεί να κλείσει ξανά.'))),
      safeguarding());
  }

  function ranking(d, isTeacher) {
    const max = Math.max(1, ...d.schools.map((s) => s.points));
    // the parts that exist anywhere, in the order they first appear, so a part keeps the same colour on every school
    const labels = [];
    d.schools.forEach((s) => s.parts.forEach((p) => { if (!labels.includes(p.label)) labels.push(p.label); }));
    const colour = (label) => COLORS[labels.indexOf(label) % COLORS.length];

    const rows = d.schools.map((s) => {
      const total = s.parts.reduce((a, p) => a + Math.max(0, p.value), 0);
      const fill = (s.points / max) * 100;
      const bar = el('div', { class: 'lg-bar', role: 'img', 'aria-label': s.school + ': ' + sentence(s) },
        s.points > 0 && total > 0 ? el('div', { class: 'lg-fill', style: { width: Math.max(3, fill) + '%' } }, s.parts.filter((p) => p.value > 0).map((p) => el('i', { style: { flex: String(p.value) + ' 1 0', background: colour(p.label) } }))) : null);
      return el('li', { class: 'nm-card lg-row' + (s.rank === 1 && s.points > 0 ? ' first' : '') },
        el('span', { class: 'lg-rank', 'aria-label': t('Rank ' + s.rank, 'Θέση ' + s.rank) }, String(s.rank)),
        el('div', { class: 'lg-mid' },
          el('h3', null, s.school),
          bar,
          el('ul', { class: 'lg-parts' }, s.parts.map((p) => el('li', null, el('i', { style: { background: colour(p.label) }, 'aria-hidden': 'true' }), el('span', null, partName(p.label)), el('b', null, String(p.value))))),
          el('p', { class: 'lg-say' }, sentence(s))),
        el('div', { class: 'lg-pts' }, el('b', null, String(s.points)), el('span', null, s.points === 1 ? t('point', 'πόντος') : t('points', 'πόντοι'))));
    });

    const how = el('section', { class: 'nm-card lg-how', 'aria-labelledby': 'lg-how-h' },
      el('p', { class: 'card-eye' }, t('How to read it', 'Πώς διαβάζεται')),
      el('h2', { class: 'card-h', id: 'lg-how-h' }, t('How points are made', 'Πώς φτιάχνονται οι πόντοι')),
      el('p', { class: 'card-sub' }, d.basis || t('A school’s points add up from a few parts. Each part counts something the school has collected or finished.', 'Οι πόντοι ενός σχολείου προκύπτουν από λίγα μέρη. Κάθε μέρος μετρά κάτι που το σχολείο έχει συλλέξει ή ολοκληρώσει.')),
      labels.length ? el('ul', { class: 'lg-legend' }, labels.map((l) => el('li', null, el('i', { style: { background: colour(l) }, 'aria-hidden': 'true' }), el('div', null, el('b', null, partName(l)), partHelp(l) ? el('p', null, partHelp(l)) : null)))) : null,
      el('p', { class: 'muted lg-fine' }, t('The coloured bar shows how much of a school’s points come from each part. The longest bar is the school with the most points.', 'Η έγχρωμη μπάρα δείχνει πόσο από τους πόντους ενός σχολείου προέρχεται από κάθε μέρος. Η μεγαλύτερη μπάρα είναι του σχολείου με τους περισσότερους πόντους.')),
      isTeacher ? el('a', { class: 'pill-link', href: '#/settings/league' }, SC.icon('gear', 16), t('League settings', 'Ρυθμίσεις πρωταθλήματος')) : null);

    return el('div', { class: 'lg' },
      el('div', { class: 'cols-main lg-main' },
        el('div', { class: 'lg-left' }, el('ol', { class: 'lg-list' }, rows),
          el('p', { class: 'muted lg-fine' }, t('Schools only. No student or teacher is named or scored here.', 'Μόνο σχολεία. Κανένας μαθητής ή εκπαιδευτικός δεν κατονομάζεται ούτε βαθμολογείται εδώ.'))),
        el('div', { class: 'lg-right' }, how, safeguarding())));
  }

  SC.register('league', {
    title: ['League', 'Πρωτάθλημα'],
    render(root, ctx) {
      SC.css('/site/pages/league.css');
      const head = SC.head({
        title: t('League', 'Πρωτάθλημα'),
        lede: t('A friendly look at how much data each school has collected. It ranks schools, never people, and it is off unless a teacher switches it on.', 'Μια φιλική ματιά στο πόσα δεδομένα έχει συλλέξει κάθε σχολείο. Κατατάσσει σχολεία, ποτέ ανθρώπους, και είναι κλειστό αν δεν το ανοίξει ένας εκπαιδευτικός.'),
        help: ['The league adds up points for each school from data collected: sensors that are online, tools a teacher approved and plans teams have finished. It never ranks or names students or teachers. A teacher switches it on or off in Settings.',
          'Το πρωτάθλημα προσθέτει πόντους για κάθε σχολείο από τα δεδομένα που συλλέγονται: αισθητήρες σε λειτουργία, εργαλεία που ενέκρινε ένας εκπαιδευτικός και σχέδια που ολοκλήρωσαν οι ομάδες. Δεν κατατάσσει και δεν κατονομάζει μαθητές ή εκπαιδευτικούς. Ένας εκπαιδευτικός το ανοίγει ή το κλείνει στις Ρυθμίσεις.'],
        tags: [{ text: t('Optional', 'Προαιρετικό'), cls: 'arch' }],
      });
      root.append(head);
      let alive = true, timer = 0, last = '';
      SC.cached('/api/config', 300000).then((c) => { if (c && c.demo && alive) { const ph = head.querySelector('.page-head'); ph.insertBefore(el('span', { class: 't demo' }, t('Demo data', 'Δεδομένα επίδειξης')), ph.querySelector('.lede')); }; }).catch(() => {});
      const host = el('div');
      root.append(host);
      const isTeacher = () => Boolean((ctx.me || SC.me) && ['teacher', 'admin'].includes((ctx.me || SC.me).role));

      const draw = (d) => {
        if (!d.enabled) return host.replaceChildren(offCard(isTeacher()));
        if (!d.schools.length) {
          return host.replaceChildren(el('div', { class: 'lg' }, el('div', { class: 'empty' }, t('The league is on, but no school has any points yet. Points appear when sensors send readings and teams finish approved work.', 'Το πρωτάθλημα είναι ενεργό, αλλά κανένα σχολείο δεν έχει ακόμη πόντους. Οι πόντοι εμφανίζονται όταν οι αισθητήρες στέλνουν μετρήσεις και οι ομάδες ολοκληρώνουν εγκεκριμένη δουλειά.')), safeguarding()));
        }
        host.replaceChildren(ranking(d, isTeacher()));
      };
      async function load(first) {
        try {
          const d = clean(await SC.api('/app/api/league'));
          if (!alive) return;
          const sig = JSON.stringify(d);
          if (first || sig !== last) { last = sig; draw(d); }
        } catch (e) {
          if (!alive) return;
          if (first || !last) {
            last = '';
            host.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('The league could not be loaded. ', 'Το πρωτάθλημα δεν φορτώθηκε. ') + errText(e)),
              el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: () => { host.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'))); load(true); } }, t('Try again', 'Δοκιμάστε ξανά'))));
          }
        }
      }
      host.append(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      load(true);
      timer = setInterval(() => { if (!document.hidden) load(false); }, 60000);
      return () => { alive = false; clearInterval(timer); };
    },
  });
})();
