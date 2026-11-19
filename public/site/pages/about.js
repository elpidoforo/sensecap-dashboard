/*
  About the project: the mission, who takes part, the five student roles, the four steps, the rules for using AI and where the
  work leads. Route: #/about.
  Nothing is written here: every sentence comes from /site/project.js (SC.PROJECT), the same file the server gives to Kleanthis,
  so the page and the assistant say the same thing. No data is fetched and there are no numbers that could go stale.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/about.css');
  const L = (p) => (Array.isArray(p) ? T(p[0], p[1]) : '');

  let loading = null;
  function load() {
    if (SC.PROJECT) return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise((done) => {
      const s = document.createElement('script');
      s.src = '/site/project.js';
      s.onload = () => done(Boolean(SC.PROJECT));
      s.onerror = () => { s.remove(); loading = null; done(false); };
      document.head.append(s);
    });
    return loading;
  }

  const section = (id, title, lede, body) => h('section', { class: 'nm-card ab-sec', 'aria-labelledby': 'ab-' + id },
    h('h2', { id: 'ab-' + id }, title), lede ? h('p', { class: 'ab-lede' }, lede) : null, body);
  const go = (page, label) => h('a', { class: 'nm-btn', href: '#/' + page }, label);

  SC.register('about', {
    title: ['About the project', 'Σχετικά με το έργο'],
    async render(root) {
      root.classList.add('ab');
      root.append(SC.head({
        title: T('About the project', 'Σχετικά με το έργο'),
        lede: T('What Smart Cities is, who takes part, what you do in it and why it matters.', 'Τι είναι οι Έξυπνες Πόλεις, ποιοι συμμετέχουν, τι κάνεις εσύ και γιατί έχει σημασία.'),
        help: ['This page is the project in words: the mission, the four schools, the five roles in a team, the four steps from measuring to explaining, and the rules for using AI. Kleanthis, the guide, knows the same text, so you can ask him about any of it.',
          'Αυτή η σελίδα είναι το έργο με λόγια: η αποστολή, τα τέσσερα σχολεία, οι πέντε ρόλοι μιας ομάδας, τα τέσσερα βήματα από τη μέτρηση ως την εξήγηση και οι κανόνες για τη χρήση της τεχνητής νοημοσύνης. Ο Κλεάνθης, ο οδηγός, γνωρίζει το ίδιο κείμενο, οπότε μπορείς να τον ρωτήσεις για οτιδήποτε από αυτά.'],
      }));
      if (!(await load())) {
        root.append(h('div', { class: 'nm-card ab-sec', role: 'alert' }, h('p', null, T('The project text could not be loaded. Check your connection and open the page again.', 'Το κείμενο του έργου δεν φορτώθηκε. Έλεγξε τη σύνδεσή σου και άνοιξε ξανά τη σελίδα.'))));
        return;
      }
      const P = SC.PROJECT, M = P.mission;

      root.append(h('section', { class: 'nm-card ab-hero', 'aria-labelledby': 'ab-mission' },
        h('p', { class: 'ab-kicker' }, T('The mission', 'Η αποστολή')),
        h('h2', { id: 'ab-mission' }, L(M.title)),
        h('p', { class: 'ab-tag' }, L(M.tag)),
        h('p', { class: 'ab-what' }, L(M.what)),
        h('p', { class: 'ab-what' }, L(M.why)),
        h('p', { class: 'ab-motto' }, L(M.motto))));

      root.append(section('who', T('Four schools, one network', 'Τέσσερα σχολεία, ένα δίκτυο'), null, h('div', null,
        h('ul', { class: 'ab-schools' }, P.schools.map((s) => h('li', null, h('b', null, L(s.city)), h('span', null, L(s.name))))),
        h('ul', { class: 'ab-list' }, P.people.map((p) => h('li', null, L(p)))),
        h('p', { class: 'ab-act' }, go('schools', T('See the schools and teams', 'Δες τα σχολεία και τις ομάδες'))))));

      root.append(section('roles', T('Five roles in every team', 'Πέντε ρόλοι σε κάθε ομάδα'),
        T('A team needs all five. Which one sounds like you?', 'Μια ομάδα χρειάζεται και τους πέντε. Ποιος σου ταιριάζει;'),
        h('ul', { class: 'ab-roles' }, P.roles.map((r) => h('li', null,
          h('span', { class: 'nm-icon-tile ab-ic' }, SC.icon(r.icon, 22)), h('b', null, L(r.name)), h('span', null, L(r.does)))))));

      root.append(section('steps', T('From a bus ride to an idea for the city', 'Από μια διαδρομή λεωφορείου σε μια ιδέα για την πόλη'),
        T('The four steps, in order. Each one has tools on this site.', 'Τα τέσσερα βήματα, με τη σειρά. Το καθένα έχει εργαλεία σε αυτόν τον ιστότοπο.'),
        h('div', null,
          h('ol', { class: 'ab-steps' }, P.steps.map((s) => h('li', null, h('b', null, L(s.name)), h('span', null, L(s.does))))),
          h('p', { class: 'ab-act' },
            go('layers', T('See the data', 'Δες τα δεδομένα')), go('explore', T('Analyse it', 'Ανάλυσέ τα')),
            go('forecast', T('Test a prediction', 'Έλεγξε μια πρόβλεψη')), go('start', T('Start a project', 'Ξεκίνα ένα έργο'))))));

      root.append(section('ai', T('How we use AI', 'Πώς χρησιμοποιούμε την τεχνητή νοημοσύνη'), L(P.responsible.motto),
        h('ul', { class: 'ab-rules' }, P.responsible.rules.map((r) => h('li', null, h('b', null, L(r.name)), h('span', null, L(r.does)))))));

      root.append(section('goals', T('Where this leads', 'Πού οδηγεί αυτό'), null,
        h('ul', { class: 'ab-goals' }, P.goals.map((g) => h('li', null, h('b', null, L(g.name)), h('span', null, L(g.does)))))));

      root.append(section('launch', T('How the project started', 'Πώς ξεκίνησε το έργο'), L(P.launch.when),
        h('ol', { class: 'ab-launch' }, P.launch.steps.map((s) => h('li', null, L(s))))));

      root.append(section('honest', T('What to keep in mind', 'Τι να έχεις στον νου σου'), null, h('div', null,
        h('ul', { class: 'ab-list' }, P.honest.map((p) => h('li', null, L(p)))),
        h('p', { class: 'ab-src' }, L(P.platform) + ' ' + L(P.source)))));
    },
  });
})();
