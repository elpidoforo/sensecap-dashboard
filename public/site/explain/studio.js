/* Explainer content: the Build studio. Plain data, no logic. */
(function () {
  'use strict';
  window.SC = window.SC || {};
  SC.EXPLAIN = SC.EXPLAIN || {};
  Object.assign(SC.EXPLAIN, {
    studio: {
      lead: ['Notice something, check what exists, shape one clear question, build a draft and share it with your school.', 'Πρόσεξε κάτι, δες τι υπάρχει ήδη, διαμόρφωσε ένα καθαρό ερώτημα, φτιάξε ένα προσχέδιο και μοιράσου το με το σχολείο σου.'],
      steps: [
        { scene: 'notice', h: ['Notice', 'Πρόσεξε'], s: ['Start with something you saw at school or on the bus.', 'Ξεκίνα από κάτι που είδες στο σχολείο ή στο λεωφορείο.'],
          c: ['A good tool starts with a question you really have, like whether the bus air is worse than the air outside.', 'Ένα καλό εργαλείο ξεκινά από μια πραγματική απορία, όπως αν ο αέρας στο λεωφορείο είναι χειρότερος από τον αέρα έξω.'] },
        { scene: 'search', h: ['Look around', 'Ψάξε'], s: ['The guide checks our data, tools other schools made and the sensor guides.', 'Ο οδηγός κοιτάζει τα δεδομένα μας, τα εργαλεία άλλων σχολείων και τους οδηγούς αισθητήρων.'],
          c: ['So you do not start from zero: the guide shows which data exists and what others already built.', 'Ώστε να μην ξεκινάς από το μηδέν: ο οδηγός δείχνει ποια δεδομένα υπάρχουν και τι έχουν ήδη φτιάξει άλλοι.'] },
        { scene: 'shape', h: ['Shape it', 'Διαμόρφωσέ το'], s: ['One question, the right data, and who it is for.', 'Ένα ερώτημα, τα σωστά δεδομένα και για ποιον είναι.'],
          c: ['Answer the guide’s questions. It writes a short brief that you can check.', 'Απάντησε στις ερωτήσεις του οδηγού. Γράφει μια σύντομη σύνοψη για να την ελέγξεις.'] },
        { scene: 'build', h: ['Build', 'Φτιάξε'], s: ['A draft appears. Ask for changes in plain words.', 'Εμφανίζεται ένα προσχέδιο. Ζήτα αλλαγές με απλά λόγια.'],
          c: ['You press Build a draft. The draft runs in a safe box with no internet.', 'Πατάς «Φτιάξτε ένα προσχέδιο». Το προσχέδιο τρέχει σε ασφαλές κουτί χωρίς internet.'] },
        { scene: 'share', h: ['Share', 'Μοιράσου'], s: ['A teacher approves it. Then it joins the gallery.', 'Ένας εκπαιδευτικός το εγκρίνει. Μετά μπαίνει στη συλλογή.'],
          c: ['You press Send to teacher. Anyone can open an approved tool, no sign-in.', 'Πατάς «Αποστολή στον εκπαιδευτικό». Οποιοσδήποτε μπορεί να ανοίξει ένα εγκεκριμένο εργαλείο, χωρίς σύνδεση.'] },
      ],
    },
  });
})();
