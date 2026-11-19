/* Explainer content for the guide only: the page "About the project". Plain data, no logic.
   The id is NOT in the GROUP map of /site/explain.js, so the page shows no animated strip and the browser never loads this file.
   The server reads it (guide-knowledge.js) so that Kleanthis can describe the page in the site's own words. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  SC.EXPLAIN = SC.EXPLAIN || {};
  Object.assign(SC.EXPLAIN, {
    about: {
      lead: ['The project in words: its mission, who takes part, the roles in a team, the five steps and how AI is used.', 'Το έργο με λόγια: η αποστολή του, ποιοι συμμετέχουν, οι ρόλοι μιας ομάδας, τα πέντε βήματα και πώς χρησιμοποιείται η τεχνητή νοημοσύνη.'],
      steps: [
        { h: ['Read the mission', 'Διάβασε την αποστολή'], s: ['The first card says what the project is for: students measure their own city and explain what the data means.', 'Η πρώτη κάρτα λέει γιατί υπάρχει το έργο: οι μαθητές μετρούν τη δική τους πόλη και εξηγούν τι σημαίνουν τα δεδομένα.'] },
        { h: ['Find your role', 'Βρες τον ρόλο σου'], s: ['A team has five roles, from Sensor Engineer to City Storyteller. Read what each one does and pick the one that fits you.', 'Μια ομάδα έχει πέντε ρόλους, από Μηχανικό αισθητήρων ως Αφηγητή της πόλης. Διάβασε τι κάνει ο καθένας και διάλεξε αυτόν που σου ταιριάζει.'] },
        { h: ['Follow the steps', 'Ακολούθησε τα βήματα'], s: ['Place sensors, collect, add the space view, use AI, present. The buttons under the five steps open the tools.', 'Τοποθέτησε αισθητήρες, σύλλεξε, πρόσθεσε τη ματιά από το διάστημα, χρησιμοποίησε την τεχνητή νοημοσύνη, παρουσίασε. Τα κουμπιά κάτω από τα πέντε βήματα ανοίγουν τα εργαλεία.'] },
        { h: ['Keep the rules', 'Κράτα τους κανόνες'], s: ['Quality, privacy, bias and judgment: AI informs, people decide. The last card says what counts as a real measurement.', 'Ποιότητα, ιδιωτικότητα, μεροληψία και κρίση: η τεχνητή νοημοσύνη ενημερώνει, οι άνθρωποι αποφασίζουν. Η τελευταία κάρτα λέει τι μετρά ως πραγματική μέτρηση.'] },
      ],
    },
  });
})();
