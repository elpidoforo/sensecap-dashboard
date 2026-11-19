/* The project's knowledge base: what Smart Cities is, who takes part, what students do and why. Plain data, no logic.
   ONE file, read in two places, so the page and the assistant can never say different things:
     - the page "About the project" (public/site/pages/about.js) shows it;
     - the server (guide-knowledge.js) reads it in an empty sandbox and gives it to Kleanthis as what he knows about the project.
   Source: the project's own presentation "Cyprus, The Living Smart-City Classroom" (12 slides) by the project leader.
   What is NOT here, on purpose: the example numbers, forecast scores, news headlines and quotes drawn on the slides. Those are
   pictures of what a result could look like, not results. A real reading is only ever shown by the site, with its time and source.
   Every entry is [English, Greek]. Greek is informal singular. To change what the project says about itself, change it here. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  SC.PROJECT = {
    source: ['From the project presentation "Cyprus, The Living Smart-City Classroom".', 'Από την παρουσίαση του έργου «Cyprus, The Living Smart-City Classroom».'],
    name: ['Smart Cities (AI Sustainable Cities)', 'Έξυπνες Πόλεις (AI Sustainable Cities)'],
    platform: ['This website is the project\'s data platform. Its name is Kleanthis, and Kleanthis is also the name of its AI guide.', 'Αυτός ο ιστότοπος είναι η πλατφόρμα δεδομένων του έργου. Λέγεται Κλεάνθης, και Κλεάνθης λέγεται και ο οδηγός του με τεχνητή νοημοσύνη.'],
    mission: {
      title: ['Creating a smarter Cyprus, starting from education', 'Μια πιο έξυπνη Κύπρος, με αφετηρία την εκπαίδευση'],
      tag: ['Four schools. Four cities. One data mission.', 'Τέσσερα σχολεία. Τέσσερις πόλεις. Μία αποστολή δεδομένων.'],
      motto: ['Cyprus, measured by students. Improved through learning.', 'Η Κύπρος, μετρημένη από μαθητές. Καλύτερη μέσα από τη μάθηση.'],
      what: ['Students in four cities collect real environmental data from their own streets, add what satellites see from space, use AI to look for patterns, and explain what it means for a cleaner, healthier city.',
        'Μαθητές σε τέσσερις πόλεις συλλέγουν πραγματικά περιβαλλοντικά δεδομένα από τους δρόμους τους, προσθέτουν όσα βλέπουν οι δορυφόροι από το διάστημα, ψάχνουν μοτίβα με την τεχνητή νοημοσύνη και εξηγούν τι σημαίνουν για μια πιο καθαρή και υγιή πόλη.'],
      why: ['Every city becomes a learning lab: the place where you live is the thing you study, with real data instead of textbook examples.',
        'Κάθε πόλη γίνεται εργαστήρι μάθησης: ο τόπος όπου ζεις είναι αυτό που μελετάς, με πραγματικά δεδομένα αντί για παραδείγματα βιβλίου.'],
    },
    schools: [
      { name: ['PASCAL English School Larnaka', 'PASCAL English School Λάρνακα'], city: ['Larnaka', 'Λάρνακα'] },
      { name: ['PASCAL English School Lefkosia', 'PASCAL English School Λευκωσία'], city: ['Lefkosia (Nicosia)', 'Λευκωσία'] },
      { name: ['PASCAL English School Limassol', 'PASCAL English School Λεμεσός'], city: ['Limassol', 'Λεμεσός'] },
      { name: ['International School of Paphos', 'International School of Paphos'], city: ['Paphos', 'Πάφος'] },
    ],
    people: [
      ['Each school forms a team of at least five upper-school students.', 'Κάθε σχολείο σχηματίζει μια ομάδα από τουλάχιστον πέντε μαθητές των μεγάλων τάξεων.'],
      ['Lower-school students take part as junior explorers.', 'Οι μικρότεροι μαθητές συμμετέχουν ως μικροί εξερευνητές.'],
      ['In each school a STEAM coordinator leads the work locally, with the school\'s leadership.', 'Σε κάθε σχολείο ένας συντονιστής STEAM καθοδηγεί τη δουλειά, μαζί με τη διεύθυνση του σχολείου.'],
      ['The project leader is Elpidoforos Anastasiou. The four schools are equal partners: they form one student data network across the island.', 'Υπεύθυνος του έργου είναι ο Ελπιδοφόρος Αναστασίου. Τα τέσσερα σχολεία είναι ισότιμοι συνεργάτες: σχηματίζουν ένα μαθητικό δίκτυο δεδομένων σε όλο το νησί.'],
    ],
    roles: [
      { icon: 'sensor', name: ['Sensor Engineer', 'Μηχανικός αισθητήρων'], does: ['Sets up the sensors and checks that they measure correctly.', 'Στήνει τους αισθητήρες και ελέγχει ότι μετρούν σωστά.'] },
      { icon: 'db', name: ['Data Scientist', 'Επιστήμονας δεδομένων'], does: ['Collects, organises and analyses the data.', 'Συλλέγει, οργανώνει και αναλύει τα δεδομένα.'] },
      { icon: 'sparkle', name: ['AI Analyst', 'Αναλυτής τεχνητής νοημοσύνης'], does: ['Uses AI to find patterns, and checks whether they hold.', 'Χρησιμοποιεί την τεχνητή νοημοσύνη για να βρει μοτίβα και ελέγχει αν ισχύουν.'] },
      { icon: 'globe', name: ['Satellite Observer', 'Παρατηρητής δορυφόρων'], does: ['Watches the Earth from space with satellite data.', 'Παρατηρεί τη Γη από το διάστημα με δορυφορικά δεδομένα.'] },
      { icon: 'flag', name: ['City Storyteller', 'Αφηγητής της πόλης'], does: ['Turns the findings into a story that people understand and act on.', 'Κάνει τα ευρήματα μια ιστορία που οι άνθρωποι καταλαβαίνουν και τους κινεί να δράσουν.'] },
    ],
    steps: [
      { name: ['Measure real routes', 'Μέτρησε πραγματικές διαδρομές'], does: ['Sensors on school buses and cars measure temperature, humidity and air-quality indicators along the routes they drive. Every journey becomes a science experiment.', 'Αισθητήρες σε σχολικά λεωφορεία και αυτοκίνητα μετρούν θερμοκρασία, υγρασία και δείκτες ποιότητας αέρα στις διαδρομές τους. Κάθε διαδρομή γίνεται ένα πείραμα.'] },
      { name: ['Map city patterns', 'Χαρτογράφησε τα μοτίβα της πόλης'], does: ['The measurements become maps that show how the city really behaves. Satellite data adds the view from above to the view from the street.', 'Οι μετρήσεις γίνονται χάρτες που δείχνουν πώς συμπεριφέρεται πραγματικά η πόλη. Τα δορυφορικά δεδομένα προσθέτουν την εικόνα από ψηλά στην εικόνα από τον δρόμο.'] },
      { name: ['Model with AI', 'Φτιάξε μοντέλο με την τεχνητή νοημοσύνη'], does: ['AI helps to find trends, compare areas and estimate what may happen next. Students test those estimates against what is measured later.', 'Η τεχνητή νοημοσύνη βοηθά να βρεις τάσεις, να συγκρίνεις περιοχές και να εκτιμήσεις τι μπορεί να ακολουθήσει. Οι μαθητές ελέγχουν αυτές τις εκτιμήσεις με όσα μετρηθούν αργότερα.'] },
      { name: ['Explain sustainability', 'Εξήγησε τη βιωσιμότητα'], does: ['Students turn what they found into ideas for a cleaner, healthier, greener city, and present them.', 'Οι μαθητές κάνουν όσα βρήκαν ιδέες για μια πιο καθαρή, υγιή και πράσινη πόλη και τις παρουσιάζουν.'] },
    ],
    responsible: {
      motto: ['AI informs. People decide.', 'Η τεχνητή νοημοσύνη ενημερώνει. Οι άνθρωποι αποφασίζουν.'],
      rules: [
        { name: ['Quality', 'Ποιότητα'], does: ['Use reliable data and check a model before you trust it.', 'Χρησιμοποίησε αξιόπιστα δεδομένα και έλεγξε ένα μοντέλο πριν το εμπιστευτείς.'] },
        { name: ['Privacy', 'Ιδιωτικότητα'], does: ['Protect people and sensitive data.', 'Προστάτεψε τους ανθρώπους και τα ευαίσθητα δεδομένα.'] },
        { name: ['Bias', 'Μεροληψία'], does: ['Look for results that are unfair or leave someone out.', 'Ψάξε για αποτελέσματα που είναι άδικα ή αφήνουν κάποιον έξω.'] },
        { name: ['Judgment', 'Κρίση'], does: ['A person makes the final call, not the machine.', 'Την τελική απόφαση την παίρνει άνθρωπος, όχι η μηχανή.'] },
      ],
    },
    goals: [
      { name: ['IB and final-year projects', 'Εργασίες IB και τελευταίας τάξης'], does: ['The project gives a real challenge, real data, real tools and a real audience: a strong base for an IB or final-year project and for a university application.', 'Το έργο δίνει πραγματική πρόκληση, πραγματικά δεδομένα, πραγματικά εργαλεία και πραγματικό κοινό: γερή βάση για μια εργασία IB ή τελευταίας τάξης και για μια αίτηση σε πανεπιστήμιο.'] },
      { name: ['Students present to their city', 'Οι μαθητές παρουσιάζουν στην πόλη τους'], does: ['The aim is to invite each municipality, so that student teams present their measurements, maps and questions to the mayor and local leaders. Schools become partners of their city.', 'Στόχος είναι να προσκληθεί κάθε δήμος, ώστε οι ομάδες των μαθητών να παρουσιάσουν τις μετρήσεις, τους χάρτες και τις ερωτήσεις τους στον δήμαρχο και στους τοπικούς φορείς. Τα σχολεία γίνονται συνεργάτες της πόλης τους.'] },
      { name: ['Learning becomes public value', 'Η μάθηση γίνεται δημόσιο όφελος'], does: ['What the project hopes for: cleaner air, lower energy use, healthier communities and a greener future. These are aims, not results yet.', 'Αυτά που ελπίζει το έργο: καθαρότερος αέρας, λιγότερη κατανάλωση ενέργειας, πιο υγιείς κοινότητες και πιο πράσινο μέλλον. Είναι στόχοι, όχι ακόμη αποτελέσματα.'] },
    ],
    launch: {
      when: ['The project began in October, with school visits by the project leader.', 'Το έργο ξεκίνησε τον Οκτώβριο, με επισκέψεις του υπεύθυνου του έργου στα σχολεία.'],
      steps: [
        ['Confirm the participating schools', 'Επιβεβαίωση των σχολείων που συμμετέχουν'],
        ['Nominate the STEAM coordinators', 'Ορισμός των συντονιστών STEAM'],
        ['Select the student teams', 'Επιλογή των μαθητικών ομάδων'],
        ['Prepare the sensor routes', 'Προετοιμασία των διαδρομών των αισθητήρων'],
        ['Launch with the school visits', 'Έναρξη με τις επισκέψεις στα σχολεία'],
      ],
    },
    honest: [
      ['The pictures in the presentation show example numbers. They are not measurements.', 'Οι εικόνες της παρουσίασης δείχνουν παραδείγματα αριθμών. Δεν είναι μετρήσεις.'],
      ['A real reading is only what this site shows, with its unit, its time and where it came from.', 'Πραγματική μέτρηση είναι μόνο ό,τι δείχνει αυτός ο ιστότοπος, με τη μονάδα, την ώρα και την πηγή του.'],
      ['Two things that change together are not proof that one causes the other. That is for you to test.', 'Δύο πράγματα που αλλάζουν μαζί δεν αποδεικνύουν ότι το ένα προκαλεί το άλλο. Αυτό το ελέγχεις εσύ.'],
      ['The schools and the cities are not ranked. They work on one shared picture of the island.', 'Τα σχολεία και οι πόλεις δεν κατατάσσονται. Δουλεύουν πάνω σε μια κοινή εικόνα του νησιού.'],
    ],
  };
})();
